// Fake agent handle and manual clock. Mirrors the daemon's wire envelopes so the
// store keeps parsing real shapes rather than a convenient invention.
import type { PulseTimelineEntry, PulseUsage } from "./types.ts";

export interface FakeHistoryPage {
  epoch: string;
  entries: PulseTimelineEntry[];
  gap?: boolean;
  hasOlder?: boolean;
  startCursor?: unknown;
  /** Snapshot the daemon attaches to a timeline page. */
  agent?: Record<string, unknown>;
  /** Reject this page instead of answering it. */
  fail?: boolean;
}

export interface FakeAgentState {
  status?: string;
  activeTurn?: { turnId: string; startedAt: string | null } | null;
  lastUsage?: PulseUsage | null;
  history?: FakeHistoryPage[];
  deferHistory?: boolean;
  /** Hold `timeline.subscribe().ready` until `settleReady()` runs. */
  deferReady?: boolean;
  /** Reproduces a disconnected session: `ready` never settles at all. */
  neverReady?: boolean;
  /** Reject every refetch, whatever the page queue says. */
  failEveryRefetch?: boolean;
  /** Never answer a refetch: reproduces a daemon that stops responding. */
  hangRefetch?: boolean;
}

export interface FakeAgentHandle {
  readonly status: string | null;
  readonly activeTurn: { turnId: string; startedAt: string | null } | null;
  readonly lastUsage: PulseUsage | null;
  subscribe(handler: (update: unknown) => void): () => void;
  readonly timeline: {
    refetch(options?: unknown): Promise<unknown>;
    subscribe(handler: (event: unknown) => void): (() => void) & { ready: Promise<void> };
  };
}

export interface FakeAgent {
  handle: FakeAgentHandle;
  refetchCalls(): number;
  lastRefetchOptions(): unknown;
  refetchOptions(): readonly unknown[];
  timelineSubscriptions(): number;
  agentSubscriptions(): number;
  emitTimeline(event: unknown): void;
  emitSnapshot(snapshot: Record<string, unknown>): void;
  /** Resolves a deferred `ready` promise. */
  settleReady(): Promise<void>;
  /** Raw `ready` promises handed to the plugin that never settled. */
  pendingReadyPromises(): number;
  /** Releases a deferred history fetch and drains the store's follow-up work. */
  settleHistory(): Promise<void>;
}

export function createFakeAgent(agentId: string, state: FakeAgentState = {}): FakeAgent {
  const pages = [...(state.history ?? [])];
  const timelineHandlers = new Set<(event: unknown) => void>();
  const agentHandlers = new Set<(update: unknown) => void>();
  let refetchCalls = 0;
  let readyHandedOut = 0;
  const seenOptions: unknown[] = [];
  let lastOptions: unknown;
  let releaseReady: (() => void) | undefined;
  const readyGate = state.neverReady
    ? new Promise<void>(() => {})
    : state.deferReady
    ? new Promise<void>((resolve) => {
        releaseReady = resolve;
      })
    : Promise.resolve();
  let release: (() => void) | undefined;
  const gate = state.deferHistory
    ? new Promise<void>((resolve) => {
        release = resolve;
      })
    : Promise.resolve();

  const handle: FakeAgentHandle = {
    status: state.status ?? "idle",
    activeTurn: state.activeTurn ?? null,
    lastUsage: state.lastUsage ?? null,
    subscribe(handler) {
      agentHandlers.add(handler);
      return () => {
        agentHandlers.delete(handler);
      };
    },
    timeline: {
      async refetch(options) {
        refetchCalls += 1;
        lastOptions = options;
        seenOptions.push(options);
        await gate;
        if (state.hangRefetch) await new Promise<void>(() => {});
        const page = pages.shift() ?? { epoch: "epoch-empty", entries: [] };
        if (state.failEveryRefetch || page.fail) throw new Error("timeline unavailable");
        return {
          agentId,
          epoch: page.epoch,
          entries: page.entries.map((item) => ({
            provider: "fixture",
            item: item.item,
            turnId: item.turnId,
            timestamp: item.timestamp,
            seqStart: item.seq,
            seqEnd: item.seq,
            sourceSeqRanges: [{ startSeq: item.seq, endSeq: item.seq }],
            collapsed: [],
          })),
          gap: page.gap ?? false,
          hasOlder: page.hasOlder ?? false,
          startCursor: page.startCursor ?? null,
          agent: page.agent ?? null,
          hasNewer: false,
          reset: false,
          error: null,
        };
      },
      subscribe(handler) {
        timelineHandlers.add(handler);
        const unsubscribe = () => {
          timelineHandlers.delete(handler);
        };
        if (state.neverReady) readyHandedOut += 1;
        return Object.assign(unsubscribe, { ready: readyGate });
      },
    },
  };

  return {
    handle,
    refetchCalls: () => refetchCalls,
    pendingReadyPromises: () => readyHandedOut,
    lastRefetchOptions: () => lastOptions,
    refetchOptions: () => seenOptions,
    timelineSubscriptions: () => timelineHandlers.size,
    agentSubscriptions: () => agentHandlers.size,
    emitTimeline(event) {
      for (const handler of [...timelineHandlers]) handler(event);
    },
    emitSnapshot(snapshot) {
      for (const handler of [...agentHandlers]) handler({ kind: "upsert", agent: snapshot });
    },
    async settleReady() {
      releaseReady?.();
      await readyGate;
      for (let turn = 0; turn < 4; turn += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    async settleHistory() {
      if (!state.neverReady) releaseReady?.();
      release?.();
      await gate;
      for (let turn = 0; turn < 12; turn += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
  };
}

export interface ManualClock {
  now(): number;
  advance(ms: number): void;
  schedule(callback: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
  pending(): number;
}

export function createManualClock(startMs: number): ManualClock {
  let current = startMs;
  const timers = new Map<number, { callback: () => void; every: number; next: number }>();
  let nextId = 1;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
      for (const [, timer] of [...timers]) {
        while (timer.next <= current) {
          timer.next += timer.every;
          timer.callback();
        }
      }
    },
    schedule(callback, ms) {
      const id = nextId++;
      timers.set(id, { callback, every: ms, next: current + ms });
      return id;
    },
    cancel(handle) {
      timers.delete(handle as number);
    },
    pending: () => timers.size,
  };
}
