import type { TimelineEntry } from "./store";
import type { TimelineSourceItem } from "./model";
import { MAX_RETAINED_BLOCKS } from "./store-bounds";

export type AccountingItem =
  | { type: "assistant_message"; length: number; messageId?: string }
  | { type: "tool_call"; callId: string; status: string }
  | { type: "user_message" | "other" };
export function accountingItem(item: TimelineSourceItem): AccountingItem {
  if (item.type === "assistant_message") return { type: item.type, length: item.text.length, ...(item.messageId ? { messageId: item.messageId } : {}) };
  if (item.type === "tool_call") return { type: item.type, callId: item.callId, status: item.status };
  return { type: item.type === "user_message" ? item.type : "other" };
}
export function itemIdentity(item: AccountingItem, identity: string): string {
  return item.type === "tool_call" ? `tool:${item.callId}` : item.type === "assistant_message" && item.messageId ? `message:${item.messageId}` : identity;
}
interface HistoryFact { seqStart: number; seqEnd: number; timestamp: number; turnId?: string; item: AccountingItem }
export interface DerivedFact extends HistoryFact { temporal: boolean }

/** Minimal scalar facts only: no transcript, commands, paths, errors or tool output.
 * Four facts per retained block allow status pairs plus invisible user boundaries.
 * Reconciliation/sorting happens per page, never on a live event or clock tick. */
export class HistoryFacts {
  readonly #rows = new Map<number, HistoryFact>();
  reset(): void { this.#rows.clear(); }
  observe(entries: readonly TimelineEntry[]): void {
    for (const entry of entries) {
      const item = accountingItem(entry.item);
      this.#rows.set(entry.seqEnd, { seqStart: entry.seqStart, seqEnd: entry.seqEnd, timestamp: entry.timestamp, item, ...(entry.turnId ? { turnId: entry.turnId } : {}) });
    }
    // Canonical/refetched text can cover multiple earlier live/raw chunks.
    const ordered = [...this.#rows.values()].sort((a, b) => a.seqEnd - b.seqEnd);
    for (let i = ordered.length - 1; i >= 0; i--) {
      const row = ordered[i]!;
      if (row.seqStart === row.seqEnd || row.item.type === "tool_call") continue;
      for (let j = i - 1; j >= 0 && ordered[j]!.seqEnd >= row.seqStart; j--) this.#rows.delete(ordered[j]!.seqEnd);
    }
    const excess = this.#rows.size - MAX_RETAINED_BLOCKS * 4;
    if (excess > 0) for (const row of ordered.filter(row => this.#rows.has(row.seqEnd)).slice(0, excess)) this.#rows.delete(row.seqEnd);
  }

  derive(liveTurns: ReadonlyMap<string, string>): readonly DerivedFact[] {
    const ordered = [...this.#rows.values()].sort((a, b) => a.seqEnd - b.seqEnd);
    const groups = new Map<string, HistoryFact[]>(), membership = new Map<number, string>();
    const aliases = new Map<string, string>();
    let boundary: string | undefined;
    for (const row of ordered) {
      if (row.item.type === "user_message") boundary = `history:user:${row.seqStart}`;
      const group = row.turnId ?? boundary;
      if (!group) continue;
      membership.set(row.seqEnd, group);
      const rows = groups.get(group) ?? []; rows.push(row); groups.set(group, rows);
      if (boundary && row.turnId && !aliases.has(boundary)) aliases.set(boundary, row.turnId);
      const live = liveTurns.get(itemIdentity(row.item, `seq:${row.seqEnd}`));
      if (live) { aliases.set(group, live); if (boundary) aliases.set(boundary, live); }
    }
    const reliable = (rows: readonly HistoryFact[], liveAnchor = false) => {
      if (!rows.length || rows.some(row => !Number.isFinite(row.timestamp) || row.timestamp < 0)) return false;
      // A singleton can anchor later live observations, but supplies no duration
      // on its own. Multiple equal timestamps are an unusable history clock.
      if (rows.length === 1) return liveAnchor;
      let first = Infinity, last = -Infinity;
      for (const row of rows) { first = Math.min(first, row.timestamp); last = Math.max(last, row.timestamp); }
      // Import bursts are not work durations. Do not reject backwards part-start
      // timestamps: real OpenCode history has many of them within a user span.
      return last > first && (rows.length < 8 || last - first >= Math.max(1000, (rows.length - 1) * 5));
    };
    const liveIds = new Set(liveTurns.values());
    const globalReliable = reliable(ordered, ordered.some(row => row.turnId ? liveIds.has(row.turnId) : liveTurns.has(itemIdentity(row.item, `seq:${row.seqEnd}`))));
    const resolvedGroups = new Map<string, HistoryFact[]>();
    for (const [id, rows] of groups) {
      const resolved = aliases.get(id) ?? id;
      resolvedGroups.set(resolved, [...(resolvedGroups.get(resolved) ?? []), ...rows]);
    }
    const reliableGroups = new Set([...resolvedGroups].filter(([id, rows]) => reliable(rows, liveIds.has(id))).map(([id]) => id));
    return ordered.map(row => {
      const group = membership.get(row.seqEnd), turnId = group ? aliases.get(group) ?? group : undefined;
      const temporal = globalReliable && Number.isFinite(row.timestamp) && row.timestamp >= 0 && (!turnId || reliableGroups.has(turnId));
      const { turnId: _native, ...fact } = row;
      return { ...fact, ...(temporal && turnId && reliableGroups.has(turnId) ? { turnId } : {}), temporal };
    });
  }
}
