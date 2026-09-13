import type { AgentUsage } from "@getpaseo/protocol/agent-types";
import {
  formatMetric,
  normalizeStreamEvent,
  normalizeTimelineItem,
  usageMetrics,
  type PulseBlock,
  type PulseMetrics,
  type StreamEvent,
  type TimelineSourceItem,
} from "./model";

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
  readonly pulsePhase?: 0 | 1 | 2;
}

export class TimelineStore {
  readonly #label: string;
  readonly #blocks = new Map<string, PulseBlock>();
  readonly #toolStarted = new Map<string, number>();
  readonly #toolEnded = new Map<string, number>();
  readonly #toolDurations = new Map<string, number>();
  readonly #toolIds = new Set<string>();
  readonly #turnStarted = new Map<string, number>();
  readonly #turnEnded = new Map<string, number>();
  readonly #turnDurations = new Map<string, number>();
  readonly #turnText = new Map<string, number>();
  #buffered: TimelineLiveEvent[] = [];
  #reported: PulseMetrics = {};
  #epoch: string | undefined;
  #activeTurnId: string | undefined;
  #bootstrapping = false;
  #gap = false;
  #sequenceHighWater: number | undefined;
  #nextOrder = 1;

  constructor(label: string) {
    this.#label = label;
  }

  beginBootstrap(): void {
    this.#bootstrapping = true;
  }

  ingestPage(page: TimelinePage): void {
    if (this.#epoch !== page.epoch || page.reset) this.#resetTimeline(page.epoch);
    this.#gap ||= page.gap;
    for (const entry of page.entries) this.#ingestEntry(entry);
  }

  ingestLive(event: TimelineLiveEvent): void {
    if (this.#epoch && event.epoch && event.epoch !== this.#epoch) return;
    if (this.#bootstrapping) {
      this.#buffered.push(event);
      return;
    }
    this.#applyLive(event);
  }

  finishBootstrap(): void {
    this.#bootstrapping = false;
    const buffered = this.#buffered;
    this.#buffered = [];
    for (const event of buffered.sort((left, right) => (left.seq ?? 0) - (right.seq ?? 0))) {
      if (!event.epoch || !this.#epoch || event.epoch === this.#epoch) this.#applyLive(event);
    }
  }

  replaceEpoch(epoch: string): void {
    this.#buffered = [];
    this.#resetTimeline(epoch);
    this.#bootstrapping = true;
  }

  markIncomplete(): void {
    this.#gap = true;
  }

  updateAgent(agent: TimelineAgentState): void {
    this.#activeTurnId = agent.activeTurn?.turnId;
    if (agent.activeTurn?.startedAt) {
      const startedAt = Date.parse(agent.activeTurn.startedAt);
      if (Number.isFinite(startedAt)) this.#turnStarted.set(agent.activeTurn.turnId, startedAt);
    }
    this.#reported = agent.lastUsage ? usageMetrics(agent.lastUsage) : {};
  }

  snapshot(): TimelineSnapshot {
    const blocks = [...this.#blocks.values()].sort((left, right) => left.order - right.order);
    const metrics = { ...this.#reported, ...this.#observedMetrics() };
    const activeBlock = this.#activeTurnId
      ? blocks.findLast((entry) => entry.turnId === this.#activeTurnId)
      : undefined;
    const lastBlock = blocks.at(-1);
    const tokenTotal = (metrics.inputTokens?.value ?? 0) + (metrics.outputTokens?.value ?? 0);
    const suffix = this.#activeTurnId
      ? (activeBlock?.kind ?? "busy")
      : (lastBlock?.kind ?? (tokenTotal > 0 ? `${tokenTotal} tok` : undefined));
    return {
      ...(this.#epoch ? { epoch: this.#epoch } : {}),
      busy: this.#activeTurnId !== undefined,
      gap: this.#gap,
      blocks,
      metrics,
      label: suffix ? `${this.#label} · ${suffix}` : this.#label,
    };
  }

  #resetTimeline(epoch: string): void {
    this.#epoch = epoch;
    this.#blocks.clear();
    this.#toolStarted.clear();
    this.#toolEnded.clear();
    this.#toolDurations.clear();
    this.#toolIds.clear();
    this.#turnStarted.clear();
    this.#turnEnded.clear();
    this.#turnDurations.clear();
    this.#turnText.clear();
    this.#gap = false;
    this.#sequenceHighWater = undefined;
    this.#nextOrder = 1;
  }

  #ingestEntry(entry: TimelineEntry): void {
    this.#sequenceHighWater = Math.max(this.#sequenceHighWater ?? entry.seqEnd, entry.seqEnd);
    this.#nextOrder = Math.max(this.#nextOrder, entry.seqEnd + 1);
    this.#observeItem(entry.item, entry.turnId, entry.timestamp);
    const block = normalizeTimelineItem({
      item: entry.item,
      provider: entry.provider,
      order: entry.seqEnd,
      timestamp: entry.timestamp,
      ...(entry.turnId ? { turnId: entry.turnId } : {}),
    });
    if (block) this.#setBlock(block);
  }

  #applyLive(input: TimelineLiveEvent): void {
    if (input.seq !== undefined) {
      if (this.#sequenceHighWater !== undefined && input.seq <= this.#sequenceHighWater) return;
      this.#sequenceHighWater = input.seq;
    }
    if (!this.#epoch && input.epoch) this.#epoch = input.epoch;
    const order = input.seq ?? this.#nextOrder;
    this.#nextOrder = Math.max(this.#nextOrder, order + 1);
    const event = input.event;
    switch (event.type) {
      case "turn_started":
        this.#activeTurnId = event.turnId;
        if (event.turnId) this.#turnStarted.set(event.turnId, input.timestamp);
        break;
      case "turn_completed":
      case "turn_failed":
      case "turn_canceled":
        this.#completeTurn(event.turnId, input.timestamp);
        if (event.type === "turn_completed" && event.usage) {
          this.#reported = { ...this.#reported, ...usageMetrics(event.usage) };
        }
        break;
      case "timeline":
        this.#observeItem(event.item, event.turnId, input.timestamp);
        break;
      case "thread_started":
      case "permission_requested":
      case "permission_resolved":
      case "attention_required":
        break;
    }
    const block = normalizeStreamEvent({ event, order, timestamp: input.timestamp });
    if (block) this.#setBlock(block);
  }

  #observeItem(item: TimelineSourceItem, turnId: string | undefined, timestamp: number): void {
    if (turnId) {
      const started = this.#turnStarted.get(turnId);
      if (started === undefined || timestamp < started) this.#turnStarted.set(turnId, timestamp);
      const ended = this.#turnEnded.get(turnId);
      if (ended === undefined || timestamp > ended) this.#turnEnded.set(turnId, timestamp);
      if (item.type === "assistant_message") {
        this.#turnText.set(turnId, (this.#turnText.get(turnId) ?? 0) + item.text.length);
      }
      this.#recordTurnMetrics(turnId);
    }
    if (item.type !== "tool_call") return;
    this.#toolIds.add(item.callId);
    if (item.status === "running") {
      const started = this.#toolStarted.get(item.callId);
      if (started === undefined || timestamp < started) this.#toolStarted.set(item.callId, timestamp);
    } else {
      const ended = this.#toolEnded.get(item.callId);
      if (ended === undefined || timestamp > ended) this.#toolEnded.set(item.callId, timestamp);
    }
    const started = this.#toolStarted.get(item.callId);
    const ended = this.#toolEnded.get(item.callId);
    if (started !== undefined && ended !== undefined) this.#toolDurations.set(item.callId, Math.max(0, ended - started));
  }

  #completeTurn(turnId: string | undefined, timestamp: number): void {
    if (turnId) {
      const ended = this.#turnEnded.get(turnId);
      if (ended === undefined || timestamp > ended) this.#turnEnded.set(turnId, timestamp);
      this.#recordTurnMetrics(turnId);
    }
    if (!turnId || this.#activeTurnId === turnId) this.#activeTurnId = undefined;
  }

  #recordTurnMetrics(turnId: string): void {
    const started = this.#turnStarted.get(turnId);
    const ended = this.#turnEnded.get(turnId);
    if (started === undefined || ended === undefined || ended <= started) return;
    this.#turnDurations.set(turnId, ended - started);
  }

  #observedMetrics(): PulseMetrics {
    const chatDuration = [...this.#turnDurations.values()].reduce((total, value) => total + value, 0);
    const toolTotal = [...this.#toolDurations.values()].reduce((total, value) => total + value, 0);
    const characters = [...this.#turnText.values()].reduce((total, value) => total + value, 0);
    return {
      ...(chatDuration > 0 ? { chatDurationMs: { value: chatDuration, approximate: true } } : {}),
      ...(this.#toolIds.size > 0 ? { toolCount: { value: this.#toolIds.size, ...(this.#gap ? { approximate: true } : {}) } } : {}),
      ...(toolTotal > 0 ? { toolTotalDurationMs: { value: toolTotal, approximate: true }, toolAverageDurationMs: { value: toolTotal / this.#toolDurations.size, approximate: true } } : {}),
      ...(characters > 0 && chatDuration > 0 ? { textRateCharsPerSecond: { value: (characters * 1_000) / chatDuration, approximate: true } } : {}),
    };
  }

  #setBlock(block: PulseBlock): void {
    const current = this.#blocks.get(block.id);
    if (!current || block.order >= current.order) this.#blocks.set(block.id, block);
  }
}
