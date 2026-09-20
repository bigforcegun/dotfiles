import type { PaseoAgentTimelineEvent } from "@getpaseo/client";
import { createAbandonment } from "./abandon";
import type { TimelineSourceItem } from "./model";
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
export const MAX_HISTORY_PAGES = 8;

export function createTimelineController(
  source: RegistryTimelineSource,
  store: TimelineStore,
  onChange: () => void,
): TimelineController {
  let generation = 0;
  let stopped = false;
  const abandonment = createAbandonment();
  store.beginBootstrap();

  const finish = (token: number) => {
    if (stopped || token !== generation) return;
    store.finishBootstrap();
    onChange();
  };

  const request = (
    options: { readonly direction: "tail" | "before"; readonly cursor?: TimelineCursor },
    token: number,
    pageNumber = 1,
  ): void => {
    if (stopped || token !== generation) return;
    abandonment.race(source.refetch({ ...options, limit: TIMELINE_PAGE_LIMIT, projection: "canonical" }), {
      value(page) {
        if (stopped || token !== generation) return;
        if (page.error) {
          store.markIncomplete();
          onChange();
          finish(token);
          return;
        }
        const capped = page.hasOlder && !page.gap && (!page.startCursor || pageNumber >= MAX_HISTORY_PAGES);
        store.ingestPage({
          epoch: page.epoch,
          reset: page.reset,
          gap: page.gap,
          hasOlder: page.hasOlder,
          startCursor: page.startCursor,
          entries: page.entries.map((entry) => ({ ...entry, timestamp: Date.parse(entry.timestamp) })),
        });
        if (capped) store.markIncomplete();
        onChange();
        if (page.hasOlder && page.startCursor && !page.gap && !capped) {
          request({ direction: "before", cursor: page.startCursor }, token, pageNumber + 1);
          return;
        }
        finish(token);
      },
      error() {
        if (stopped || token !== generation) return;
        store.markIncomplete();
        onChange();
        finish(token);
      },
    });
  };

  const subscription = source.subscribe((input) => {
    if (stopped) return;
    if (!("timestamp" in input)) {
      generation += 1;
      store.replaceEpoch(input.event.epoch);
      onChange();
      void request({ direction: "tail" }, generation);
      return;
    }
    store.ingestLive({
      event: input.event,
      timestamp: Date.parse(input.timestamp),
      ...(input.seq === undefined ? {} : { seq: input.seq }),
      ...(input.epoch ? { epoch: input.epoch } : {}),
    });
    onChange();
  });
  const initialGeneration = generation;

  abandonment.race(subscription.ready, {
    value: () => request({ direction: "tail" }, initialGeneration),
    error: () => finish(initialGeneration),
  });

  return {
    updateAgent(agent) {
      if (stopped) return;
      store.updateAgent(agent);
      onChange();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      generation += 1;
      abandonment.abandon();
      subscription();
    },
    pendingWaits: abandonment.pendingCount,
  };
}
