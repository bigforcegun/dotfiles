import type { PulseBlock, PulseMetrics, TimelineSourceItem } from "./model";

export interface AccountingSizes {
  readonly toolIds: number;
  readonly toolStarted: number;
  readonly toolEnded: number;
  readonly toolDurations: number;
  readonly turnStarted: number;
  readonly turnEnded: number;
  readonly turnDurations: number;
  readonly turnText: number;
}

function pruneMap<Value>(values: Map<string, Value>, retained: ReadonlySet<string>): boolean {
  let pruned = false;
  for (const key of values.keys()) {
    if (!retained.has(key)) {
      values.delete(key);
      pruned = true;
    }
  }
  return pruned;
}

function pruneSet(values: Set<string>, retained: ReadonlySet<string>): boolean {
  let pruned = false;
  for (const key of values) {
    if (!retained.has(key)) {
      values.delete(key);
      pruned = true;
    }
  }
  return pruned;
}

export class TimelineAccounting {
  readonly #toolStarted = new Map<string, number>();
  readonly #toolEnded = new Map<string, number>();
  readonly #toolDurations = new Map<string, number>();
  readonly #toolIds = new Set<string>();
  readonly #turnStarted = new Map<string, number>();
  readonly #turnEnded = new Map<string, number>();
  readonly #turnDurations = new Map<string, number>();
  readonly #textItems = new Map<string, { turnId: string; length: number }>();
  readonly #turnText = new Map<string, number>();

  reset(): void {
    this.#toolStarted.clear();
    this.#toolEnded.clear();
    this.#toolDurations.clear();
    this.#toolIds.clear();
    this.#turnStarted.clear();
    this.#turnEnded.clear();
    this.#turnDurations.clear();
    this.#turnText.clear();
    this.#textItems.clear();
  }

  startTurn(turnId: string | undefined, timestamp: number, identity?: string): void {
    if (turnId) this.#turnStarted.set(turnId, Math.min(timestamp, this.#turnStarted.get(turnId) ?? timestamp));
  }

  observeItem(item: TimelineSourceItem, turnId: string | undefined, timestamp: number, identity?: string): void {
    if (turnId) {
      const started = this.#turnStarted.get(turnId);
      if (started === undefined || timestamp < started) this.#turnStarted.set(turnId, timestamp);
      const ended = this.#turnEnded.get(turnId);
      if (ended === undefined || timestamp > ended) this.#turnEnded.set(turnId, timestamp);
      if (item.type === "assistant_message") {
        const key = item.messageId ? `message:${item.messageId}` : identity ?? JSON.stringify([turnId, timestamp, item]);
        const previous = this.#textItems.get(key);
        this.#turnText.set(turnId, (this.#turnText.get(turnId) ?? 0) + item.text.length - (previous?.length ?? 0));
        this.#textItems.set(key, { turnId, length: item.text.length });
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
      if (ended === undefined || timestamp < ended) this.#toolEnded.set(item.callId, timestamp);
    }
    const started = this.#toolStarted.get(item.callId);
    const ended = this.#toolEnded.get(item.callId);
    if (started !== undefined && ended !== undefined) {
      this.#toolDurations.set(item.callId, Math.max(0, ended - started));
    }
  }

  completeTurn(turnId: string | undefined, timestamp: number): void {
    if (!turnId) return;
    const ended = this.#turnEnded.get(turnId);
    if (ended === undefined || timestamp > ended) this.#turnEnded.set(turnId, timestamp);
    this.#recordTurnMetrics(turnId);
  }

  retain(blocks: Iterable<PulseBlock>, activeTurnId: string | undefined): boolean {
    const retainedText = new Set<string>();
    const toolIds = new Set<string>();
    const turnIds = new Set<string>();
    if (activeTurnId) turnIds.add(activeTurnId);
    for (const block of blocks) {
      if (block.turnId) turnIds.add(block.turnId);
      retainedText.add(`seq:${block.order}`);
      if (block.id.startsWith("text:")) retainedText.add(`message:${block.id.slice(5)}`);
      if (block.metadata?.type === "tool" && block.id.startsWith("tool:")) {
        toolIds.add(block.id.slice("tool:".length));
      }
    }
    for (const [key, item] of this.#textItems) if (!turnIds.has(item.turnId) || ((key.startsWith("seq:") || key.startsWith("message:")) && !retainedText.has(key))) {
      this.#textItems.delete(key);
      if (turnIds.has(item.turnId)) this.#turnText.set(item.turnId, Math.max(0, (this.#turnText.get(item.turnId) ?? 0) - item.length));
    }
    return [
      pruneSet(this.#toolIds, toolIds),
      pruneMap(this.#toolStarted, toolIds),
      pruneMap(this.#toolEnded, toolIds),
      pruneMap(this.#toolDurations, toolIds),
      pruneMap(this.#turnStarted, turnIds),
      pruneMap(this.#turnEnded, turnIds),
      pruneMap(this.#turnDurations, turnIds),
      pruneMap(this.#turnText, turnIds),
    ].some(Boolean);
  }

  latestTurn(activeTurnId: string | undefined, now: number): { turnDurationMs?: number } {
    const id = activeTurnId ?? [...this.#turnStarted.keys()].sort((a, b) => this.#turnStarted.get(b)! - this.#turnStarted.get(a)!)[0];
    const start = id ? this.#turnStarted.get(id) : undefined;
    const end = id === activeTurnId ? now : id ? this.#turnEnded.get(id) : undefined;
    return start !== undefined && end !== undefined ? { turnDurationMs: Math.max(0, end - start) } : {};
  }

  metrics(gap: boolean, activeTurnId?: string, now = Date.now()): PulseMetrics {
    const durations = new Map(this.#turnDurations);
    const start = activeTurnId ? this.#turnStarted.get(activeTurnId) : undefined;
    if (activeTurnId && start !== undefined) durations.set(activeTurnId, Math.max(0, now - start));
    const chatDuration = [...durations.values()].reduce((total, value) => total + value, 0);
    const toolTotal = [...this.#toolDurations.values()].reduce((total, value) => total + value, 0);
    const characters = [...this.#turnText.values()].reduce((total, value) => total + value, 0);
    return {
      ...(chatDuration > 0 ? { chatDurationMs: { value: chatDuration, approximate: true } } : {}),
      ...(this.#toolIds.size > 0 ? { toolCount: { value: this.#toolIds.size, ...(gap ? { approximate: true } : {}) } } : {}),
      ...(toolTotal > 0 ? { toolTotalDurationMs: { value: toolTotal, approximate: true }, toolAverageDurationMs: { value: toolTotal / this.#toolDurations.size, approximate: true } } : {}),
      ...(characters > 0 && chatDuration > 0 ? { textRateCharsPerSecond: { value: (characters * 1_000) / chatDuration, approximate: true } } : {}),
    };
  }

  sizes(): AccountingSizes {
    return {
      toolIds: this.#toolIds.size,
      toolStarted: this.#toolStarted.size,
      toolEnded: this.#toolEnded.size,
      toolDurations: this.#toolDurations.size,
      turnStarted: this.#turnStarted.size,
      turnEnded: this.#turnEnded.size,
      turnDurations: this.#turnDurations.size,
      turnText: this.#turnText.size,
    };
  }

  #recordTurnMetrics(turnId: string): void {
    const started = this.#turnStarted.get(turnId);
    const ended = this.#turnEnded.get(turnId);
    if (started === undefined || ended === undefined || ended <= started) return;
    this.#turnDurations.set(turnId, ended - started);
  }
}
