import type { PulseBlock, PulseMetrics, TimelineSourceItem } from "./model";
import type { TimelineEntry } from "./store";
import { accountingItem, HistoryFacts, itemIdentity, type AccountingItem } from "./history-facts";

type LiveFact = { kind: "start" | "end"; turnId: string; timestamp: number }
  | { kind: "item"; item: AccountingItem; turnId: string | undefined; timestamp: number; identity: string };

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
  readonly #timedText = new Map<string, number>();
  readonly #history = new HistoryFacts();
  readonly #live = new Map<string, LiveFact>();
  readonly #liveTurns = new Map<string, string>();
  readonly #historyTurns = new Set<string>();
  readonly #historyTools = new Set<string>();
  readonly #historyTurnByOrder = new Map<number, string>();
  #replaying = false;

  #chatDuration = 0;
  #toolTotal = 0;
  #characters = 0;
  #latestTurnId: string | undefined;

  #considerLatest(turnId: string): void {
    if (!this.#latestTurnId || (this.#turnStarted.get(turnId) ?? -Infinity) >= (this.#turnStarted.get(this.#latestTurnId) ?? -Infinity)) this.#latestTurnId = turnId;
  }

  reset(): void {
    this.#history.reset(); this.#live.clear(); this.#liveTurns.clear();
    this.#resetDerived();
  }

  #resetDerived(): void {
    this.#historyTurns.clear(); this.#historyTools.clear(); this.#historyTurnByOrder.clear();
    this.#chatDuration = this.#toolTotal = this.#characters = 0;
    this.#latestTurnId = undefined;
    this.#toolStarted.clear();
    this.#toolEnded.clear();
    this.#toolDurations.clear();
    this.#toolIds.clear();
    this.#turnStarted.clear();
    this.#turnEnded.clear();
    this.#turnDurations.clear();
    this.#turnText.clear();
    this.#timedText.clear();
    this.#textItems.clear();
  }

  startTurn(turnId: string | undefined, timestamp: number): void {
    if (turnId && !this.#replaying) {
      const key = `start:${turnId}`, previous = this.#live.get(key);
      this.#live.set(key, { kind: "start", turnId, timestamp: Math.min(timestamp, previous?.timestamp ?? timestamp) });
    }
    if (turnId) { this.#turnStarted.set(turnId, Math.min(timestamp, this.#turnStarted.get(turnId) ?? timestamp)); this.#considerLatest(turnId); this.#recordTurnMetrics(turnId); }
  }

  observeItem(item: TimelineSourceItem, turnId: string | undefined, timestamp: number, identity?: string): void {
    const fact = accountingItem(item);
    const key = identity ?? `unsequenced:${turnId ?? ""}:${timestamp}:${fact.type === "assistant_message" ? fact.length : fact.type}`;
    if (!this.#replaying) {
      const id = itemIdentity(fact, key);
      if (turnId) {
        this.#liveTurns.set(id, turnId);
        // Keep observed boundaries even if coalescing later removes the first
        // chunk identity. Retaining every superseded chunk would grow forever.
        const startKey = `start:${turnId}`, endKey = `end:${turnId}`;
        this.#live.set(startKey, { kind: "start", turnId, timestamp: Math.min(timestamp, this.#live.get(startKey)?.timestamp ?? timestamp) });
        this.#live.set(endKey, { kind: "end", turnId, timestamp: Math.max(timestamp, this.#live.get(endKey)?.timestamp ?? timestamp) });
      }
      const ledgerKey = fact.type === "tool_call" ? `${id}:${fact.status}` : id;
      const previous = this.#live.get(ledgerKey);
      // Keep both tool status endpoints, without retaining every running update.
      this.#live.set(ledgerKey, { kind: "item", item: fact, turnId, timestamp: fact.type === "tool_call" ? Math.min(timestamp, previous?.timestamp ?? timestamp) : timestamp, identity: key });
    }
    this.#observeFact(fact, turnId, timestamp, key);
  }

  #observeFact(item: AccountingItem, turnId: string | undefined, timestamp: number, identity: string): void {
    if (turnId) {
      const started = this.#turnStarted.get(turnId);
      if (started === undefined || timestamp < started) this.#turnStarted.set(turnId, timestamp);
      this.#considerLatest(turnId);
      const ended = this.#turnEnded.get(turnId);
      if (ended === undefined || timestamp > ended) this.#turnEnded.set(turnId, timestamp);
      if (item.type === "assistant_message") {
        const key = itemIdentity(item, identity);
        const previous = this.#textItems.get(key);
        const delta = item.length - (previous?.length ?? 0);
        this.#turnText.set(turnId, (this.#turnText.get(turnId) ?? 0) + delta);
        this.#textItems.set(key, { turnId, length: item.length });
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
      if (ended < started) {
        this.#toolTotal -= this.#toolDurations.get(item.callId) ?? 0;
        this.#toolDurations.delete(item.callId); return;
      }
      const duration = ended - started;
      this.#toolTotal += duration - (this.#toolDurations.get(item.callId) ?? 0);
      this.#toolDurations.set(item.callId, duration);
    }
  }

  forgetText(block: PulseBlock): void {
    if (block.kind !== "text") return;
    for (const key of [`message:${block.id.slice(5)}`, `seq:${block.order}`]) {
      this.#live.delete(key);
      const item = this.#textItems.get(key);
      if (!item) continue;
      this.#textItems.delete(key);
      if (this.#timedText.has(item.turnId)) {
        this.#characters -= item.length;
        this.#timedText.set(item.turnId, Math.max(0, this.#timedText.get(item.turnId)! - item.length));
      }
      this.#turnText.set(item.turnId, Math.max(0, (this.#turnText.get(item.turnId) ?? 0) - item.length));
    }
  }

  completeTurn(turnId: string | undefined, timestamp: number): void {
    if (!turnId) return;
    if (!this.#replaying) {
      const key = `end:${turnId}`, previous = this.#live.get(key);
      this.#live.set(key, { kind: "end", turnId, timestamp: Math.max(timestamp, previous?.timestamp ?? timestamp) });
    }
    const ended = this.#turnEnded.get(turnId);
    if (ended === undefined || timestamp > ended) this.#turnEnded.set(turnId, timestamp);
    this.#recordTurnMetrics(turnId);
  }

  observeHistory(entries: readonly TimelineEntry[]): void {
    this.#history.observe(entries);
    const rows = this.#history.derive(this.#liveTurns);
    this.#resetDerived();
    this.#replaying = true;
    try {
      for (const row of rows) {
        if (row.item.type === "tool_call") {
          this.#toolIds.add(row.item.callId); this.#historyTools.add(row.item.callId);
        }
        if (!row.temporal) continue;
        if (row.turnId) { this.#historyTurns.add(row.turnId); this.#historyTurnByOrder.set(row.seqEnd, row.turnId); }
        this.#observeFact(row.item, row.turnId, row.timestamp, `seq:${row.seqEnd}`);
      }
      // Live start/end facts survive remounts, coalesced refetches and history
      // rebuilds. Shared identities alias synthetic user spans to their live turn.
      for (const fact of this.#live.values()) {
        if (fact.kind === "item") this.#observeFact(fact.item, fact.turnId, fact.timestamp, fact.identity);
        else if (fact.kind === "start") this.startTurn(fact.turnId, fact.timestamp);
        else this.completeTurn(fact.turnId, fact.timestamp);
      }
    } finally { this.#replaying = false; }
  }

  historyDerived(activeTurnId?: string): readonly string[] {
    const ids: string[] = [];
    if (this.#historyTurns.size) {
      ids.push("chat", "text-rate");
      if (this.#historyTurns.has(activeTurnId ?? this.#latestTurnId ?? "")) ids.push("turn");
    }
    if (this.#historyTools.size) ids.push("tool-count", "tool-total", "tool-average");
    return ids;
  }

  retain(blocks: Iterable<PulseBlock>, activeTurnId: string | undefined): boolean {
    const retainedText = new Set<string>();
    const toolIds = new Set<string>();
    const turnIds = new Set<string>();
    if (activeTurnId) turnIds.add(activeTurnId);
    for (const block of blocks) {
      if (block.turnId) turnIds.add(block.turnId);
      const inferred = this.#historyTurnByOrder.get(block.order);
      if (inferred) turnIds.add(inferred);
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
    const pruned = [
      pruneSet(this.#toolIds, toolIds),
      pruneMap(this.#toolStarted, toolIds),
      pruneMap(this.#toolEnded, toolIds),
      pruneMap(this.#toolDurations, toolIds),
      pruneMap(this.#turnStarted, turnIds),
      pruneMap(this.#turnEnded, turnIds),
      pruneMap(this.#turnDurations, turnIds),
      pruneMap(this.#turnText, turnIds),
    ].some(Boolean);
    pruneSet(this.#historyTurns, turnIds); pruneSet(this.#historyTools, toolIds);
    for (const [key, fact] of this.#live) {
      if (fact.kind !== "item") { if (!turnIds.has(fact.turnId)) this.#live.delete(key); }
      else if (fact.item.type === "tool_call" ? !toolIds.has(fact.item.callId) : fact.item.type === "assistant_message" ? !retainedText.has(itemIdentity(fact.item, fact.identity)) : !retainedText.has(fact.identity)) this.#live.delete(key);
    }
    for (const [key, turnId] of this.#liveTurns) {
      const retained = key.startsWith("tool:") ? toolIds.has(key.slice(5)) : retainedText.has(key);
      if (!turnIds.has(turnId) || !retained) this.#liveTurns.delete(key);
    }
    this.#chatDuration = [...this.#turnDurations.values()].reduce((a, b) => a + b, 0);
    this.#toolTotal = [...this.#toolDurations.values()].reduce((a, b) => a + b, 0);
    this.#timedText.clear(); this.#characters = 0;
    for (const turnId of this.#turnDurations.keys()) {
      const count = this.#turnText.get(turnId) ?? 0;
      this.#timedText.set(turnId, count); this.#characters += count;
    }
    this.#latestTurnId = undefined;
    for (const turnId of this.#turnStarted.keys()) this.#considerLatest(turnId);
    return pruned;
  }

  latestTurn(activeTurnId: string | undefined, now: number): { turnDurationMs?: number } {
    const id = activeTurnId ?? this.#latestTurnId;
    const start = id ? this.#turnStarted.get(id) : undefined;
    const end = id === activeTurnId ? now : id ? this.#turnEnded.get(id) : undefined;
    return start !== undefined && end !== undefined && (id === activeTurnId || end > start) ? { turnDurationMs: Math.max(0, end - start) } : {};
  }

  metrics(gap: boolean, activeTurnId?: string, now = Date.now()): PulseMetrics {
    const start = activeTurnId ? this.#turnStarted.get(activeTurnId) : undefined;
    const chatDuration = this.#chatDuration + (activeTurnId && start !== undefined ? Math.max(0, now - start) - (this.#turnDurations.get(activeTurnId) ?? 0) : 0);
    const toolTotal = this.#toolTotal;
    const characters = this.#characters + (activeTurnId && start !== undefined && now > start && !this.#timedText.has(activeTurnId) ? this.#turnText.get(activeTurnId) ?? 0 : 0);
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
    const duration = ended - started;
    this.#chatDuration += duration - (this.#turnDurations.get(turnId) ?? 0);
    this.#turnDurations.set(turnId, duration);
    const characters = this.#turnText.get(turnId) ?? 0;
    this.#characters += characters - (this.#timedText.get(turnId) ?? 0);
    this.#timedText.set(turnId, characters);
  }
}
