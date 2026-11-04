import type { AgentUsage } from "@getpaseo/protocol/agent-types";
import {
  normalizeStreamEvent,
  normalizeTimelineItem,
  usageMetrics,
  type PulseBlock,
  type PulseMetrics,
  type StreamEvent,
  type TimelineSourceItem,
} from "./model";
import { TurnOutputRates, type OutputRate } from "./output-rate";
import { TimelineAccounting } from "./store-accounting";
import { MAX_BUFFERED_LIVE_EVENTS, setBoundedBlock } from "./store-bounds";

export { MAX_BUFFERED_LIVE_EVENTS, MAX_RETAINED_BLOCKS } from "./store-bounds";

export interface TimelineEntry {
  readonly provider: string;
  readonly item: TimelineSourceItem;
  readonly turnId?: string | undefined;
  readonly timestamp: number;
  readonly seqStart: number;
  readonly seqEnd: number;
}

export interface TimelineCursor {
  readonly epoch: string;
  readonly seq: number;
}

export interface TimelinePage {
  readonly epoch: string;
  readonly reset: boolean;
  readonly gap: boolean;
  readonly hasOlder: boolean;
  readonly startCursor: TimelineCursor | null;
  readonly entries: readonly TimelineEntry[];
}

export interface TimelineLiveEvent {
  readonly event: StreamEvent;
  readonly timestamp: number;
  readonly seq?: number;
  readonly epoch?: string;
}

export interface TimelineAgentState {
  readonly provider: string;
  readonly activeTurn?: { readonly turnId: string; readonly startedAt: string | null } | null | undefined;
  readonly lastUsage?: AgentUsage | undefined;
}

export interface TimelineSnapshot {
  readonly epoch?: string;
  readonly busy: boolean;
  readonly gap: boolean;
  readonly blocks: readonly PulseBlock[];
  readonly metrics: PulseMetrics;
  readonly label: string;
  readonly historyLoaded?: boolean;
  readonly historyFailed?: boolean;
  readonly turnDurationMs?: number;
  readonly outputRate?: OutputRate;
  readonly pulsePhase?: 0 | 1 | 2;
}

export class TimelineStore {
  readonly #label: string;
  readonly #blocks = new Map<string, PulseBlock>();
  readonly #accounting = new TimelineAccounting();
  #buffered: TimelineLiveEvent[] = [];
  #bufferTruncated = false;
  #reported: PulseMetrics = {};
  #epoch: string | undefined;
  #activeTurnId: string | undefined;
  #lastUsageKey: string | undefined;
  #activeStartedAt: number | undefined;
  #bootstrapping = false;
  #historyLoaded = false;
  #historyFailed = false;
  #gap = false;
  #sequenceHighWater: number | undefined;
  #nextOrder = 1;
  #sortedBlocks: readonly PulseBlock[] | undefined;
  #eventsSincePrune = 0;

  constructor(label: string, readonly outputRates = new TurnOutputRates()) { this.#label = label; }

  beginBootstrap(): void { this.#bootstrapping = true; this.#historyLoaded = false; this.#historyFailed = false; }

  failHistory(): void { this.#historyFailed = true; this.#gap = true; }

  ingestPage(page: TimelinePage): void {
    if (this.#epoch !== page.epoch || page.reset) this.#resetTimeline(page.epoch);
    this.#gap ||= page.gap;
    for (const entry of page.entries) this.#ingestEntry(entry);
  }

  ingestLive(event: TimelineLiveEvent): void {
    if (this.#epoch && event.epoch && event.epoch !== this.#epoch) return;
    if (this.#bootstrapping) {
      if (this.#buffered.length === MAX_BUFFERED_LIVE_EVENTS) {
        this.#buffered.shift();
        this.#bufferTruncated = true;
      }
      this.#buffered.push(event);
      return;
    }
    this.#applyLive(event);
  }

  finishBootstrap(): void {
    this.#bootstrapping = false;
    this.#historyLoaded = true;
    const buffered = this.#buffered;
    this.#buffered = [];
    this.#gap ||= this.#bufferTruncated;
    this.#bufferTruncated = false;
    for (const event of buffered.sort((left, right) => (left.seq ?? 0) - (right.seq ?? 0))) {
      if (!event.epoch || !this.#epoch || event.epoch === this.#epoch) this.#applyLive(event);
    }
  }

  replaceEpoch(epoch: string): void {
    this.#buffered = [];
    this.#bufferTruncated = false;
    this.#resetTimeline(epoch);
    this.beginBootstrap();
  }

  markIncomplete(): void { this.#gap = true; }

  updateAgent(agent: TimelineAgentState): void {
    const previousTurnId = this.#activeTurnId;
    this.#activeTurnId = agent.activeTurn?.turnId;
    this.#activeStartedAt = undefined;
    if (agent.activeTurn?.startedAt) {
      const startedAt = Date.parse(agent.activeTurn.startedAt);
      if (Number.isFinite(startedAt)) { this.#activeStartedAt = startedAt; this.#accounting.startTurn(agent.activeTurn.turnId, startedAt); this.outputRates.start(agent.activeTurn.turnId, agent.provider, startedAt, false); }
    }
    // usage_updated is internal to the daemon: the public timeline wire omits it.
    // Read fresh usage through agent catalog snapshots instead; never reattribute stale lastUsage.
    const usage = agent.lastUsage;
    const key = usage ? JSON.stringify([usage.inputTokens, usage.outputTokens, usage.cachedInputTokens,
      usage.contextWindowUsedTokens, usage.totalCostUsd]) : undefined;
    if (this.#activeTurnId && previousTurnId === this.#activeTurnId && key !== this.#lastUsageKey) {
      this.outputRates.usage(this.#activeTurnId, agent.provider, usage, false, Date.now());
    }
    this.#lastUsageKey = key;
    this.#reported = agent.lastUsage ? usageMetrics(agent.lastUsage) : {};
    this.#pruneAccounting();
  }

  snapshot(now = Date.now()): TimelineSnapshot {
    this.#pruneAccounting(true);
    const blocks = this.#sortedBlocks ??= [...this.#blocks.values()].sort((left, right) => left.order - right.order);
    const metrics = { ...this.#reported, ...this.#accounting.metrics(this.#gap, this.#activeTurnId, now) };
    const activeBlock = this.#activeTurnId
      ? blocks.findLast((entry) => entry.turnId === this.#activeTurnId)
      : undefined;
    const lastBlock = blocks.at(-1);
    const tokenTotal = (metrics.inputTokens?.value ?? 0) + (metrics.outputTokens?.value ?? 0);
    const suffix = this.#activeTurnId
      ? (activeBlock?.kind ?? "busy")
      : (lastBlock?.kind ?? (tokenTotal > 0 ? `${tokenTotal} tok` : undefined));
    const outputRate = this.outputRates.rate(this.#activeTurnId, now);
    return {
      ...(outputRate ? { outputRate } : {}),
      ...(this.#epoch ? { epoch: this.#epoch } : {}),
      busy: this.#activeTurnId !== undefined,
      historyLoaded: this.#historyLoaded,
      historyFailed: this.#historyFailed,
      ...this.#accounting.latestTurn(this.#activeTurnId, now),
      gap: this.#gap,
      blocks,
      metrics,
      label: suffix ? `${this.#label} · ${suffix}` : this.#label,
    };
  }

  accountingSizes() {
    this.#pruneAccounting(true);
    return {
      blocks: this.#blocks.size,
      ...this.#accounting.sizes(),
    };
  }

  #resetTimeline(epoch: string): void {
    this.#epoch = epoch;
    this.outputRates.epoch(epoch);
    this.#blocks.clear();
    this.#sortedBlocks = undefined;
    this.#accounting.reset();
    if (this.#activeTurnId && this.#activeStartedAt !== undefined) this.#accounting.startTurn(this.#activeTurnId, this.#activeStartedAt);
    this.#gap = false;
    this.#sequenceHighWater = undefined;
    this.#nextOrder = 1;
  }

  #ingestEntry(entry: TimelineEntry): void {
    this.#sequenceHighWater = Math.max(this.#sequenceHighWater ?? entry.seqEnd, entry.seqEnd);
    this.#nextOrder = Math.max(this.#nextOrder, entry.seqEnd + 1);
    const block = normalizeTimelineItem({
      item: entry.item,
      provider: entry.provider,
      order: entry.seqEnd,
      timestamp: entry.timestamp,
      ...(entry.turnId ? { turnId: entry.turnId } : {}),
    });
    if (block && (this.#blocks.get(block.id)?.order ?? -Infinity) > block.order) return;
    this.#accounting.observeItem(entry.item, entry.turnId, entry.timestamp, `seq:${entry.seqEnd}`);
    if (block) this.#setBlock(block);
    this.#pruneAccounting();
  }

  #applyLive(input: TimelineLiveEvent): void {
    if (input.seq !== undefined) {
      if (this.#sequenceHighWater !== undefined && input.seq <= this.#sequenceHighWater) return;
      this.#sequenceHighWater = input.seq;
    }
    if (!this.#epoch && input.epoch) { this.#epoch = input.epoch; this.outputRates.epoch(input.epoch); }
    const order = input.seq ?? this.#nextOrder;
    this.#nextOrder = Math.max(this.#nextOrder, order + 1);
    const event = input.event;
    switch (event.type) {
      case "turn_started":
        this.#activeTurnId = event.turnId;
        this.#activeStartedAt = input.timestamp;
        this.#accounting.startTurn(event.turnId, input.timestamp);
        this.outputRates.start(event.turnId, event.provider, input.timestamp);
        break;
      case "turn_completed":
      case "turn_failed":
      case "turn_canceled":
        const turnId = event.turnId ?? this.#activeTurnId;
        if (event.type === "turn_completed") this.outputRates.usage(turnId, event.provider, event.usage, true, input.timestamp);
        else this.outputRates.failed(turnId);
        this.#accounting.completeTurn(event.turnId, input.timestamp);
        if (!event.turnId || this.#activeTurnId === event.turnId) this.#activeTurnId = undefined;
        if (event.type === "turn_completed" && event.usage) {
          this.#reported = { ...this.#reported, ...usageMetrics(event.usage) };
        }
        break;
      case "timeline":
        this.#accounting.observeItem(event.item, event.turnId, input.timestamp, `seq:${input.seq ?? order}`);
        break;
      case "thread_started":
      case "permission_requested":
      case "permission_resolved":
      case "attention_required":
        break;
    }
    const block = normalizeStreamEvent({ event, order, timestamp: input.timestamp });
    if (block) this.#setBlock(block);
    this.#pruneAccounting();
  }

  #setBlock(block: PulseBlock): void { this.#sortedBlocks = undefined; if (setBoundedBlock(this.#blocks, block, this.#activeTurnId)) this.#gap = true; }

  #pruneAccounting(force = false): void {
    // Amortize retention scans; transient accounting overhead is at most 128 events.
    if (!force && ++this.#eventsSincePrune < 128) return;
    this.#eventsSincePrune = 0;
    if (this.#accounting.retain(this.#blocks.values(), this.#activeTurnId)) this.#gap = true;
    const ids = new Set([...this.#blocks.values()].flatMap(block => block.turnId ? [block.turnId] : []));
    if (this.#activeTurnId) ids.add(this.#activeTurnId);
    // During bootstrap older retained turns may not have arrived yet.
    if (!this.#bootstrapping) this.outputRates.retain(ids);
  }
}
