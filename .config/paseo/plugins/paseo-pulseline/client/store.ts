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
import { TokenTotals } from "./token-totals";
import { TimelineAccounting } from "./store-accounting";
import { MAX_BUFFERED_LIVE_EVENTS, MAX_RETAINED_BLOCKS, blockActivity, removeBoundedBlock, setBoundedBlock } from "./store-bounds";

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
  readonly tokenTotals?: PulseMetrics;
  readonly usageObservedSince?: number;
  readonly usageObservationGaps?: boolean;
  readonly earlierUsageUnobserved?: boolean;
  readonly hasOlder?: boolean;
  readonly loadingOlder?: boolean;
  readonly activeTurnId?: string;
  readonly activityBlock?: PulseBlock | null;
  readonly pulsePhase?: 0 | 1 | 2;
  readonly historyDerivedMetrics?: readonly string[];
}

export class TimelineStore {
  readonly #label: string;
  readonly #blocks = new Map<string, PulseBlock>();
  readonly #accounting = new TimelineAccounting();
  #buffered: TimelineLiveEvent[] = [];
  #bufferTruncated = false;
  #reported: PulseMetrics = {};
  readonly #tokens = new TokenTotals();
  #oldestHistory = Infinity;
  #hasOlder = false;
  #loadingOlder = false;
  #epoch: string | undefined;
  #activeTurnId: string | undefined;
  #lastUsageKey: string | undefined;
  #attributedUsage: AgentUsage = {};
  #observationInterrupted = false;
  readonly #rangeStarts = new Map<string, number>();
  #activeStartedAt: number | undefined;
  #bootstrapping = false;
  #historyLoaded = false;
  #historyFailed = false;
  #gap = false;
  #sequenceHighWater: number | undefined;
  #nextOrder = 1;
  #sortedBlocks: readonly PulseBlock[] | undefined;
  #eventsSincePrune = 0;
  #version = 0;
  #cached: TimelineSnapshot | undefined;
  #cachedAt = 0;
  #liveActive = false;
  readonly #finishedTurns = new Set<string>();

  get version(): number { return this.#version; }
  isFull(): boolean { return this.#blocks.size >= MAX_RETAINED_BLOCKS; }
  #changed(): void { this.#version++; this.#cached = undefined; }

  constructor(label: string, readonly outputRates = new TurnOutputRates()) { this.#label = label; }

  demoteLiveAuthority(): void { this.#liveActive = false; }
  interruptObservation(): void {
    this.demoteLiveAuthority();
    if (this.#tokens.since !== undefined && !this.#observationInterrupted) { this.#observationInterrupted = true; this.#changed(); }
  }
  oldestCursor(): TimelineCursor | null {
    let oldest = Infinity;
    for (const block of this.#blocks.values()) if (block.metadata?.type !== "turn") oldest = Math.min(oldest, this.#rangeStarts.get(block.id) ?? block.order);
    return this.#epoch && Number.isFinite(oldest) ? { epoch: this.#epoch, seq: oldest } : null;
  }
  #rememberUsage(usage: AgentUsage): void {
    this.#attributedUsage = { ...this.#attributedUsage, ...Object.fromEntries(Object.entries(usage).filter(([, value]) => value !== undefined)) };
  }
  #newUsage(usage: AgentUsage | undefined): boolean {
    return !!usage && Object.entries(usage).some(([field, value]) => value !== undefined && value !== this.#attributedUsage[field as keyof AgentUsage]);
  }

  checkpoint(): { epoch: string; sequences: readonly number[]; hasOlder: boolean } | undefined {
    // Turn-terminal blocks exist only in the live stream, never in canonical pages.
    const sequences = [...this.#blocks.values()].filter(block => block.metadata?.type !== "turn").map(block => block.order).sort((a, b) => a - b);
    return this.#epoch && sequences.length ? { epoch: this.#epoch, sequences, hasOlder: this.#hasOlder } : undefined;
  }

  beginBootstrap(): void { this.demoteLiveAuthority(); this.#changed(); this.#bootstrapping = true; this.#historyFailed = false; }

  setOlder(hasOlder: boolean, loading = false): void { if (hasOlder !== this.#hasOlder || loading !== this.#loadingOlder) { this.#hasOlder = hasOlder; this.#loadingOlder = loading; this.#changed(); } }

  failHistory(): void { this.#changed(); this.#historyFailed = true; this.#gap = true; }

  ingestPage(page: TimelinePage): void {
    if (this.#epoch === undefined && !page.reset) { this.#epoch = page.epoch; this.outputRates.epoch(page.epoch); this.#changed(); }
    else if (this.#epoch !== page.epoch || page.reset) this.#resetTimeline(page.epoch);
    this.setOlder(page.hasOlder);
    if (page.gap) this.markIncomplete();
    // A page is reconciliation work, not a live-event path. Build this range index once.
    const candidates = [...this.#blocks.values()].sort((a, b) => a.order - b.order);
    for (const entry of page.entries) this.#ingestEntry(entry, candidates);
    this.#accounting.observeHistory(page.entries);
    this.#pruneAccounting(true);
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
    this.#changed();
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

  markIncomplete(): void { if (!this.#gap) { this.#gap = true; this.#changed(); } }

  updateAgent(agent: TimelineAgentState): void {
    const previousTurnId = this.#activeTurnId;
    const candidate = agent.activeTurn?.turnId;
    // A live start owns busy until its terminal event. Catalog fills unknown turns only.
    if ("activeTurn" in agent && !this.#liveActive && (!candidate || !this.#finishedTurns.has(candidate))) {
      if (candidate !== this.#activeTurnId) {
        this.#activeTurnId = candidate;
        this.#activeStartedAt = undefined;
        this.#changed();
      }
    }
    if (agent.activeTurn?.turnId === this.#activeTurnId && agent.activeTurn?.startedAt) {
      const startedAt = Date.parse(agent.activeTurn.startedAt);
      if (Number.isFinite(startedAt) && (this.#activeStartedAt === undefined || startedAt < this.#activeStartedAt)) {
        this.#activeStartedAt = startedAt;
        this.#accounting.startTurn(this.#activeTurnId, startedAt);
        this.outputRates.start(this.#activeTurnId, agent.provider, startedAt, false);
        this.#changed();
      }
    }
    // usage_updated is internal to the daemon: the public timeline wire omits it.
    // Read fresh usage through agent catalog snapshots instead; never reattribute stale lastUsage.
    const usage = agent.lastUsage;
    const key = usage ? JSON.stringify([usage.inputTokens, usage.outputTokens, usage.cachedInputTokens,
      usage.contextWindowUsedTokens, usage.totalCostUsd]) : undefined;
    if (this.#activeTurnId && previousTurnId === this.#activeTurnId && key !== this.#lastUsageKey && this.#newUsage(usage)) {
      this.outputRates.usage(this.#activeTurnId, agent.provider, usage, false, Date.now());
      this.#tokens.observe(this.#activeTurnId, agent.provider, usage, false, Date.now());
      if (usage) this.#rememberUsage(usage);
      this.#changed();
    }
    this.#lastUsageKey = key;
    // Mid-turn snapshots are partial (often context only): merge field by field so a
    // missing field keeps its last reported value instead of turning into "—".
    if (agent.lastUsage) {
      const updates = usageMetrics(agent.lastUsage);
      if (Object.entries(updates).some(([key, value]) => this.#reported[key as keyof PulseMetrics]?.value !== value?.value)) {
        this.#reported = { ...this.#reported, ...updates };
        this.#changed();
      }
    }
    this.#pruneAccounting();
  }

  snapshot(now?: number): TimelineSnapshot {
    if (this.#cached && (this.#activeTurnId === undefined || now === undefined || now === this.#cachedAt)) return this.#cached;
    now ??= Date.now();
    this.#cachedAt = now;
    const blocks = this.#sortedBlocks ??= [...this.#blocks.values()].sort((left, right) => left.order - right.order);
    const metrics = { ...this.#reported, ...this.#accounting.metrics(this.#gap || this.#hasOlder || this.#loadingOlder, this.#activeTurnId, now) };
    const activeBlock = blockActivity(this.#blocks, this.#activeTurnId);
    const lastBlock = blocks.at(-1);
    const tokenTotal = (metrics.inputTokens?.value ?? 0) + (metrics.outputTokens?.value ?? 0);
    const suffix = this.#activeTurnId
      ? (activeBlock?.kind ?? "busy")
      : (lastBlock?.kind ?? (tokenTotal > 0 ? `${tokenTotal} tok` : undefined));
    const outputRate = this.outputRates.rate(this.#activeTurnId, now);
    return this.#cached = {
      tokenTotals: this.#tokens.metrics(),
      ...(this.#tokens.since !== undefined ? { usageObservedSince: this.#tokens.since } : {}),
      usageObservationGaps: this.#observationInterrupted,
      earlierUsageUnobserved: this.#oldestHistory < (this.#tokens.since ?? Infinity),
      hasOlder: this.#hasOlder, loadingOlder: this.#loadingOlder,
      activityBlock: activeBlock ?? null,
      ...(this.#activeTurnId ? { activeTurnId: this.#activeTurnId } : {}),
      ...(outputRate ? { outputRate } : {}),
      ...(this.#epoch ? { epoch: this.#epoch } : {}),
      busy: this.#activeTurnId !== undefined,
      historyLoaded: this.#historyLoaded,
      historyFailed: this.#historyFailed,
      ...this.#accounting.latestTurn(this.#activeTurnId, now),
      gap: this.#gap || this.#hasOlder,
      blocks,
      metrics,
      historyDerivedMetrics: this.#accounting.historyDerived(this.#activeTurnId),
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
    this.#changed();
    if (this.#epoch !== undefined && this.#epoch !== epoch) {
      this.#liveActive = false;
      this.#activeTurnId = undefined;
      this.#activeStartedAt = undefined;
    }
    this.#reported = {};
    this.#lastUsageKey = undefined;
    this.#attributedUsage = {};
    this.#observationInterrupted = false;
    this.#rangeStarts.clear();
    this.#tokens.reset();
    this.#oldestHistory = Infinity;
    this.#hasOlder = this.#loadingOlder = false;
    this.#historyLoaded = false;
    this.#finishedTurns.clear();
    this.#epoch = epoch;
    this.outputRates.reset(epoch);
    this.#blocks.clear();
    this.#sortedBlocks = undefined;
    this.#accounting.reset();
    if (this.#activeTurnId && this.#activeStartedAt !== undefined) this.#accounting.startTurn(this.#activeTurnId, this.#activeStartedAt);
    this.#gap = false;
    this.#sequenceHighWater = undefined;
    this.#nextOrder = 1;
  }

  #ingestEntry(entry: TimelineEntry, candidates: readonly PulseBlock[]): void {
    this.#oldestHistory = Math.min(this.#oldestHistory, entry.timestamp);
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
    if (block && (block.kind === "text" || block.kind === "reasoning")) {
      let lo = 0, hi = candidates.length;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (candidates[mid]!.order < entry.seqStart) lo = mid + 1; else hi = mid; }
      for (let i = lo; i < candidates.length && candidates[i]!.order <= entry.seqEnd; i++) {
        const old = candidates[i]!;
        if (old.kind !== block.kind || (entry.turnId && old.turnId !== entry.turnId) || this.#blocks.get(old.id) !== old) continue;
        this.#accounting.forgetText(old);
        removeBoundedBlock(this.#blocks, old.id);
        this.#sortedBlocks = undefined;
      }
    }
    this.#changed();
    if (block) { this.#setBlock(block); if (this.#blocks.has(block.id)) this.#rangeStarts.set(block.id, entry.seqStart); }
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
    let terminalTurnId: string | undefined;
    switch (event.type) {
      case "turn_started":
        if (!event.turnId) break;
        if (event.turnId && this.#finishedTurns.has(event.turnId)) break;
        this.#changed();
        this.#liveActive = true;
        this.#tokens.start(input.timestamp);
        this.#activeStartedAt = this.#activeTurnId === event.turnId ? Math.min(this.#activeStartedAt ?? input.timestamp, input.timestamp) : input.timestamp;
        this.#activeTurnId = event.turnId;
        this.#accounting.startTurn(event.turnId, input.timestamp);
        this.outputRates.start(event.turnId, event.provider, input.timestamp);
        break;
      case "turn_completed":
      case "turn_failed":
      case "turn_canceled":
        const turnId = event.turnId ?? this.#activeTurnId;
        terminalTurnId = turnId;
        if (event.type === "turn_completed") {
          this.outputRates.usage(turnId, event.provider, event.usage, true, input.timestamp);
          this.#tokens.observe(turnId, event.provider, event.usage, true, input.timestamp);
          if (event.usage && (!turnId || !this.#finishedTurns.has(turnId))) this.#rememberUsage(event.usage);
        }
        else this.outputRates.failed(turnId);
        this.#changed();
        if (turnId) this.#finishedTurns.add(turnId);
        if (this.#finishedTurns.size > MAX_RETAINED_BLOCKS) this.#finishedTurns.delete(this.#finishedTurns.values().next().value!);
        this.#accounting.completeTurn(turnId, input.timestamp);
        if (!event.turnId || this.#activeTurnId === event.turnId) { this.#activeTurnId = undefined; this.#liveActive = false; }
        if (event.type === "turn_completed" && event.usage) {
          this.#reported = { ...this.#reported, ...usageMetrics(event.usage) };
        }
        break;
      case "timeline":
        this.#changed();
        this.#accounting.observeItem(event.item, event.turnId, input.timestamp, `seq:${input.seq ?? order}`);
        break;
      case "thread_started":
      case "permission_requested":
      case "permission_resolved":
      case "attention_required":
        break;
    }
    const block = normalizeStreamEvent({ event, order, timestamp: input.timestamp });
    if (block) this.#setBlock(terminalTurnId ? { ...block, turnId: terminalTurnId } : block);
    this.#pruneAccounting();
  }

  #setBlock(block: PulseBlock): void { this.#changed(); this.#sortedBlocks = undefined; if (setBoundedBlock(this.#blocks, block, this.#activeTurnId)) this.#gap = true; }

  #pruneAccounting(force = false): void {
    // Amortize retention scans; transient accounting overhead is at most 128 events.
    if (!force && ++this.#eventsSincePrune < 128) return;
    this.#eventsSincePrune = 0;
    if (this.#accounting.retain(this.#blocks.values(), this.#activeTurnId)) { this.#gap = true; this.#changed(); }
    for (const id of this.#rangeStarts.keys()) if (!this.#blocks.has(id)) this.#rangeStarts.delete(id);
    const ids = new Set([...this.#blocks.values()].flatMap(block => block.turnId ? [block.turnId] : []));
    if (this.#activeTurnId) ids.add(this.#activeTurnId);
    // During bootstrap older retained turns may not have arrived yet.
    if (!this.#bootstrapping) this.outputRates.retain(ids);
  }
}
