// Per-agent store: paged history bootstrap, epoch-aware buffering of live
// events, a ticker that runs only while the agent is busy, and leak-free
// teardown. Every commit is guarded by the epoch generation it was issued for.
import { createAbandonment } from "./abandon.ts";
import { PULSE_PHASES } from "./pulse-segments.ts";
import { createDeadlineKeeper } from "./deadline.ts";
import { HISTORY_LIMIT, loadHistoryPages, type HistoryFetch } from "./history.ts";
import { PULSE_IDLE_LABEL, renderPulseLabel } from "./label.ts";
import { derivePulseMetrics, type PulseMetrics } from "./metrics.ts";
import { initialPulseState, reducePulse, type PulseInput, type PulseModelState } from "./model.ts";
import { normalizeAgentSnapshot, normalizeTimelineEvent } from "./normalize.ts";

/** The original TUI advances the active block every 450 ms (tui.js:1026). */
export const PULSE_TICK_MS = 450;
/** The daemon answered timeline pages in ~3s under load and 7s at the tail; a
 *  request slower than this is treated as failed rather than waited on forever. */
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_LOAD_ATTEMPTS = 3;
/** Live rows are buffered only until history lands; the queue is never unbounded. */
export const MAX_BUFFERED_INPUTS = 256;

export interface PulselineAgentHandle {
  readonly status: string | null;
  readonly activeTurn: { turnId: string; startedAt: string | null } | null;
  readonly lastUsage: unknown;
  subscribe(handler: (update: unknown) => void): () => void;
  readonly timeline: {
    refetch(options?: unknown): Promise<unknown>;
    subscribe(handler: (event: unknown) => void): (() => void) & { ready?: Promise<void> };
  };
}

export interface PulseView {
  readonly state: PulseModelState;
  readonly metrics: PulseMetrics;
  readonly label: string;
  /** Active-tail pulse phase; 0 whenever the agent is not busy. */
  readonly phase: number;
}

export interface PulseStore {
  getView(): PulseView;
  /** Resolves when the in-flight history load has finished; for teardown tests. */
  whenIdle(): Promise<void>;
  subscribe(listener: () => void): () => void;
  stop(): void;
}

export interface PulseStoreOptions {
  agentId: string;
  handle: PulselineAgentHandle;
  now?: () => number;
  schedule?: (callback: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
  historyLimit?: number;
  tickMs?: number;
  /** A page request that outlives this deadline counts as a failed attempt. */
  requestTimeoutMs?: number;
}

interface BufferedInput {
  readonly input: PulseInput;
  readonly epoch: string | undefined;
  readonly atMs: number;
}

function inputTime(input: PulseInput): number {
  if (input.type === "live") return Date.parse(input.entry.timestamp);
  if (input.type === "turn") return Date.parse(input.at);
  return 0;
}

export function createPulseStore(options: PulseStoreOptions): PulseStore {
  const now = options.now ?? (() => Date.now());
  const schedule = options.schedule ?? ((callback, ms) => setInterval(callback, ms));
  const cancel = options.cancel ?? ((handle) => clearInterval(handle as never));
  const listeners = new Set<() => void>();
  let buffered: BufferedInput[] = [];
  let bufferOverflowed = false;

  let state = initialPulseState;
  let view: PulseView | null = null;
  let timer: unknown = null;
  let phase = 0;
  /** Every armed request deadline, so unmount can cancel them all at once. */
  const deadlines = createDeadlineKeeper(schedule, cancel);
  let stopped = false;
  let loading = false;
  let queued = false;
  let inFlight: Promise<void> = Promise.resolve();
  let readinessWait: Promise<unknown> = Promise.resolve();
  /** Settles our own readiness wait when the store stops. */
  const abandonment = createAbandonment();
  /** Bumped by every replacement; a page issued for an older value is dropped. */
  let generation = 0;

  function notify(): void {
    view = null;
    for (const listener of [...listeners]) listener();
  }

  function advancePhase(): void {
    // Only three phases exist; the pulse cycles 0 -> 1 -> 2 -> 0.
    phase = (phase + 1) % PULSE_PHASES;
    notify();
  }

  function syncTicker(): void {
    if (state.busy && !stopped && timer === null) {
      timer = schedule(advancePhase, options.tickMs ?? PULSE_TICK_MS);
      return;
    }
    if ((!state.busy || stopped) && timer !== null) {
      cancel(timer);
      timer = null;
      // An idle pulse resets instead of freezing mid-beat.
      phase = 0;
    }
  }

  function withDeadline<Value>(work: Promise<Value>): Promise<Value> {
    return deadlines.run(work, options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS);
  }

  function commit(input: PulseInput): void {
    const next = reducePulse(state, input);
    if (next === state) return;
    state = next;
    syncTicker();
    notify();
  }

  function flushBuffer(): void {
    const replay = [...buffered].sort((left, right) => left.atMs - right.atMs);
    buffered = [];
    for (const item of replay) commit(item.input);
    if (bufferOverflowed) {
      bufferOverflowed = false;
      commit({ type: "incomplete" });
    }
  }

  function dispatch(input: PulseInput | null): void {
    if (stopped || !input) return;
    if ((input.type === "live" || input.type === "turn") && !state.historyLoaded) {
      buffered.push({ input, epoch: input.epoch, atMs: inputTime(input) });
      if (buffered.length > MAX_BUFFERED_INPUTS) {
        buffered.splice(0, buffered.length - MAX_BUFFERED_INPUTS);
        bufferOverflowed = true;
      }
      return;
    }
    if (input.type === "replacement") {
      generation += 1;
      // Anything buffered for the replaced epoch describes a history that no
      // longer exists; only events already stamped with the new epoch survive.
      buffered = buffered.filter((item) => item.epoch === input.epoch);
    }
    commit(input);
    if (state.needsRefetch) void loadHistory();
  }

  const fetchPage: HistoryFetch = (request) => options.handle.timeline.refetch(request);

  async function loadHistory(): Promise<void> {
    if (stopped) return;
    if (loading) {
      queued = true;
      return;
    }
    loading = true;
    try {
      let attempts = 0;
      let committed = false;
      while (!stopped && attempts < MAX_LOAD_ATTEMPTS) {
        queued = false;
        attempts += 1;
        const issuedFor = generation;
        const page = await withDeadline(
          loadHistoryPages(fetchPage, {
            ...(options.historyLimit === undefined ? {} : { limit: options.historyLimit }),
            shouldContinue: () => !stopped && generation === issuedFor,
          }),
        ).catch(() => null);
        if (stopped) return;
        if (!page) continue; // transient failure: retry within the bound
        // A page issued before a replacement, or answered for the epoch we just
        // left, must never be committed on top of the current one.
        if (generation !== issuedFor) continue;
        if (state.epoch !== null && page.history.epoch !== state.epoch) continue;
        commit(page.history);
        const refreshed = normalizeAgentSnapshot(page.agent);
        if (refreshed) commit(refreshed);
        flushBuffer();
        committed = true;
        if (!queued && !state.needsRefetch) break;
      }
      if (!committed && !stopped && !state.historyLoaded) {
        // Bounded retry is over. Say the history is incomplete instead of leaving
        // the model unloaded with a buffer that can never drain.
        commit({
          type: "history",
          epoch: state.epoch ?? "unknown",
          entries: [],
          gap: true,
          failed: true,
        });
        flushBuffer();
      }
    } finally {
      loading = false;
    }
  }

  const subscription = options.handle.timeline.subscribe((event) => {
    dispatch(normalizeTimelineEvent(event));
  });
  const unsubscribeAgent = options.handle.subscribe((update) => {
    dispatch(normalizeAgentSnapshot(update));
  });

  dispatch(
    normalizeAgentSnapshot({
      status: options.handle.status,
      activeTurn: options.handle.activeTurn,
      lastUsage: options.handle.lastUsage,
    }),
  );
  // `ready` acknowledges live demand, but it never settles while the session is
  // disconnected: the sender returns null and syncTimelines bails without
  // resolving (packages/client/src/daemon-client.ts:1082,
  // packages/client/src/connection/index.ts:92-98). Gating history on it hangs the
  // pill forever, so fetch first and use readiness as a single catch-up refresh.
  inFlight = loadHistory();
  let refreshedOnReady = false;
  if (subscription.ready) {
    readinessWait = abandonment
      .race(subscription.ready)
      .then(() => {
        // Only catch up when demand was acknowledged after the page had already
        // landed; a load still in flight is covered by that same acknowledgement.
        if (stopped || refreshedOnReady || !state.historyLoaded) return undefined;
        refreshedOnReady = true;
        inFlight = loadHistory();
        return inFlight;
      })
      .catch(() => undefined);
  }

  return {
    whenIdle() {
      return Promise.allSettled([inFlight, readinessWait]).then(() => undefined);
    },
    getView() {
      if (!view) {
        const metrics = derivePulseMetrics(state, now());
        view = { state, metrics, phase, label: renderPulseLabel(state, { phase }) };
      }
      return view;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    stop() {
      if (stopped) return;
      stopped = true;
      subscription();
      unsubscribeAgent();
      if (timer !== null) {
        cancel(timer);
        timer = null;
      }
      deadlines.clear();
      abandonment.abandon();
      phase = 0;
      buffered = [];
      listeners.clear();
    },
  };
}

export { HISTORY_LIMIT, PULSE_IDLE_LABEL };
