import type { PaseoAgentTimelineEvent } from "@getpaseo/client";
import { createAbandonment } from "./abandon";
import type { TimelineSourceItem } from "./model";
import { MAX_RETAINED_BLOCKS } from "./store-bounds";
import type { TimelineAgentState, TimelineCursor, TimelineStore } from "./store";

export interface RegistryTimelineEntry {
  readonly provider: string;
  readonly item: TimelineSourceItem;
  readonly turnId?: string | undefined;
  readonly timestamp: string;
  readonly seqStart: number;
  readonly seqEnd: number;
}

export interface RegistryTimelinePage {
  readonly epoch: string;
  readonly reset: boolean;
  readonly gap: boolean;
  readonly hasOlder: boolean;
  readonly startCursor: TimelineCursor | null;
  readonly entries: readonly RegistryTimelineEntry[];
  readonly error: string | null;
}

export type RegistryTimelineEvent = PaseoAgentTimelineEvent;

interface TimelineSubscription {
  (): void;
  readonly ready: Promise<void>;
}

export interface RegistryTimelineSource {
  subscribe(handler: (event: RegistryTimelineEvent) => void): TimelineSubscription;
  refetch(options?: {
    readonly direction?: "tail" | "before";
    readonly cursor?: TimelineCursor;
    readonly limit?: number;
    readonly projection?: "canonical";
  }): Promise<RegistryTimelinePage>;
}

export interface TimelineController {
  updateAgent(agent: TimelineAgentState): void;
  stop(): void;
  pendingWaits(): number;
}

export const TIMELINE_PAGE_LIMIT = 200;

export function createTimelineController(source: RegistryTimelineSource, store: TimelineStore, onChange: () => void): TimelineController {
  let generation = 0;
  let stopped = false;
  let pageTimer: ReturnType<typeof setTimeout> | undefined;
  let bootstrapping = true;
  let checkpoint = store.checkpoint();
  let joining = checkpoint !== undefined;
  const requested = new Set<string>();
  const abandonment = createAbandonment();
  store.beginBootstrap();
  store.setOlder(store.snapshot().hasOlder ?? false, true);

  const cancelPage = () => { if (pageTimer !== undefined) clearTimeout(pageTimer); pageTimer = undefined; };
  const finishBootstrap = () => { if (bootstrapping) { bootstrapping = false; store.finishBootstrap(); } };
  const finish = (token: number, hasOlder = false) => {
    if (stopped || token !== generation) return;
    joining = false;
    store.setOlder(hasOlder, false); finishBootstrap(); onChange();
  };
  const nextPage = (cursor: TimelineCursor, token: number, fetched: number) => {
    if (stopped || token !== generation) return;
    // One page per macrotask: rendering, input and ring compositor updates can
    // run between page reconciliations, even with an immediately resolved source.
    pageTimer = setTimeout(() => { pageTimer = undefined; request({ direction: "before", cursor }, token, fetched); }, 0);
  };
  const request = (options: { direction: "tail" | "before"; cursor?: TimelineCursor }, token: number, fetched = 0): void => {
    if (stopped || token !== generation) return;
    if (options.cursor) {
      const key = JSON.stringify(options.cursor);
      if (requested.has(key)) { store.markIncomplete(); finish(token); return; }
      requested.add(key);
    }
    store.setOlder(store.snapshot().hasOlder ?? false, true);
    onChange();
    if (stopped || token !== generation) return;
    abandonment.race(source.refetch({ ...options, limit: TIMELINE_PAGE_LIMIT, projection: "canonical" }), {
      value(page) {
        if (stopped || token !== generation) return;
        if (page.error) { store.failHistory(); finish(token, store.snapshot().hasOlder ?? false); return; }
        if (options.direction === "before" && (page.reset || page.epoch !== options.cursor?.epoch)) {
          generation++; cancelPage(); requested.clear(); checkpoint = undefined; joining = false; bootstrapping = true;
          store.interruptObservation(); store.replaceEpoch(page.epoch);
          onChange(); request({ direction: "tail" }, generation); return;
        }
        if (checkpoint && (page.reset || page.epoch !== checkpoint.epoch)) { checkpoint = undefined; joining = false; }
        const reached = joining && checkpoint && page.entries.some(entry => {
          const seqs = checkpoint!.sequences;
          let lo = 0, hi = seqs.length;
          while (lo < hi) { const mid = (lo + hi) >>> 1; if (seqs[mid]! < entry.seqStart) lo = mid + 1; else hi = mid; }
          return lo < seqs.length && seqs[lo]! <= entry.seqEnd;
        });
        const count = fetched + Math.max(1, page.entries.length);
        store.ingestPage({ ...page, entries: page.entries.map(entry => ({ ...entry, timestamp: Date.parse(entry.timestamp) })) });
        // A joined tail's hasOlder describes the server window, not the kept
        // store. Once it intersects known rows, skip those rows entirely and
        // resume only the older side that was incomplete when observation stopped.
        const cursor = reached ? store.oldestCursor() ?? page.startCursor : page.startCursor;
        let hasOlder = page.hasOlder;
        if (reached) { hasOlder &&= checkpoint!.hasOlder; joining = false; }
        const badCursor = hasOlder && (!cursor || requested.has(JSON.stringify(cursor)));
        const joinCapped = joining && count >= MAX_RETAINED_BLOCKS;
        const capped = !joining && page.hasOlder && store.isFull();
        if (badCursor || joinCapped || capped || (joining && !page.hasOlder)) store.markIncomplete();
        const more = hasOlder && !badCursor && !joinCapped && !capped;
        store.setOlder(more, more);
        // Release live buffering after the tail/newer-side join. Background
        // older pages must not delay live status or overflow the live buffer.
        if (!joining || !more) finishBootstrap();
        if (more) {
          onChange(); nextPage(cursor!, token, count); return;
        }
        finish(token);
      },
      error() {
        if (stopped || token !== generation) return;
        store.failHistory(); finish(token, store.snapshot().hasOlder ?? false);
      },
    });
  };
  const subscription = source.subscribe(input => {
    if (stopped) return;
    if (!("timestamp" in input)) {
      generation++; cancelPage(); bootstrapping = true;
      checkpoint = store.checkpoint(); joining = checkpoint !== undefined;
      requested.clear(); store.interruptObservation();
      if (input.event.type === "error") {
        finishBootstrap(); store.demoteLiveAuthority(); store.markIncomplete(); store.setOlder(store.snapshot().hasOlder ?? false); onChange(); return;
      }
      if (input.event.type === "replacement") { store.replaceEpoch(input.event.epoch); checkpoint = undefined; joining = false; }
      else store.beginBootstrap();
      store.setOlder(store.snapshot().hasOlder ?? false, true);
      onChange(); request({ direction: "tail" }, generation); return;
    }
    store.ingestLive({ event: input.event, timestamp: Date.parse(input.timestamp),
      ...(input.seq === undefined ? {} : { seq: input.seq }), ...(input.epoch ? { epoch: input.epoch } : {}) });
    onChange();
  });
  const initialGeneration = generation;
  abandonment.race(subscription.ready, {
    value: () => request({ direction: "tail" }, initialGeneration),
    error: () => { if (stopped || initialGeneration !== generation) return; store.failHistory(); finish(initialGeneration); },
  });
  return {
    updateAgent(agent) { if (!stopped) { store.updateAgent(agent); onChange(); } },
    stop() { if (stopped) return; stopped = true; generation++; cancelPage(); store.setOlder(store.snapshot().hasOlder ?? false); store.interruptObservation(); abandonment.abandon(); subscription(); },
    pendingWaits: abandonment.pendingCount,
  };
}
