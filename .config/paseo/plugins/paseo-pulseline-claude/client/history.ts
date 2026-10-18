// Multi-page history assembly. One epoch, ascending sequence, no duplicates —
// and an explicit gap whenever the window stops short of the conversation.
import { parseHistoryPage } from "./normalize.ts";
import type { PulseInput } from "./model.ts";
import type { PulseTimelineEntry } from "./types.ts";

export const HISTORY_LIMIT = 200;
const MAX_HISTORY_PAGES = 5;

export type HistoryFetch = (options: {
  direction: "tail" | "before";
  projection: "canonical";
  limit: number;
  cursor?: unknown;
}) => Promise<unknown>;

export interface HistoryLoadOptions {
  limit?: number;
  /** Aborts between pages: a superseded epoch must not keep paging. */
  shouldContinue?: () => boolean;
}

export interface HistoryLoadResult {
  readonly history: PulseInput & { type: "history" };
  /** Agent snapshot the daemon attached to the tail page, if any. */
  readonly agent: unknown;
}

function merge(entries: readonly PulseTimelineEntry[]): PulseTimelineEntry[] {
  const bySeq = new Map<number, PulseTimelineEntry>();
  for (const entry of entries) if (!bySeq.has(entry.seq)) bySeq.set(entry.seq, entry);
  return [...bySeq.values()].sort((left, right) => left.seq - right.seq);
}

/**
 * Reads the tail page, then walks older pages with the capacity that is left.
 * Anything unread — the limit, the page cap, a failed page, another epoch, or a
 * trim after merging — marks the result as gapped.
 */
export async function loadHistoryPages(
  fetch: HistoryFetch,
  options: HistoryLoadOptions = {},
): Promise<HistoryLoadResult | null> {
  const limit = options.limit ?? HISTORY_LIMIT;
  const proceed = options.shouldContinue ?? (() => true);
  const first = parseHistoryPage(await fetch({ direction: "tail", projection: "canonical", limit }));
  if (!first) return null;

  const entries: PulseTimelineEntry[] = [...first.entries];
  let gap = first.gap;
  let hasOlder = first.hasOlder;
  let cursor = first.startCursor;
  let pages = 1;

  while (hasOlder && entries.length < limit && pages < MAX_HISTORY_PAGES && proceed()) {
    if (cursor === null || cursor === undefined) {
      gap = true;
      break;
    }
    const remaining = Math.max(1, limit - entries.length);
    pages += 1;
    // A continuation that fails must not discard the tail already in hand.
    const older = await fetch({
      direction: "before",
      projection: "canonical",
      limit: remaining,
      cursor,
    })
      .then(parseHistoryPage)
      .catch(() => null);
    if (!older || older.epoch !== first.epoch) {
      gap = true;
      break;
    }
    if (older.entries.length === 0) {
      hasOlder = false;
      break;
    }
    entries.push(...older.entries);
    gap = gap || older.gap;
    hasOlder = older.hasOlder;
    cursor = older.startCursor;
  }

  const ordered = merge(entries);
  const trimmed = ordered.length > limit ? ordered.slice(ordered.length - limit) : ordered;
  return {
    history: {
      type: "history",
      epoch: first.epoch,
      entries: trimmed,
      gap: gap || hasOlder || trimmed.length < ordered.length,
    },
    agent: first.agent,
  };
}
