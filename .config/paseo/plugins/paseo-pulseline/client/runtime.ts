import { createTimelineController, type RegistryTimelineSource, type TimelineController } from "./controller";
import { TurnOutputRates } from "./output-rate";
import { TimelineStore, type TimelineAgentState, type TimelineSnapshot } from "./store";

export type ScheduleRefresh = (callback: () => void) => () => void;

export const PULSE_INTERVAL_MS = 450;

export interface PulselineRuntimeInput {
  readonly label: string;
  readonly agent: TimelineAgentState;
  readonly timeline: () => RegistryTimelineSource;
  readonly schedule: ScheduleRefresh;
  readonly onSnapshot: (snapshot: TimelineSnapshot) => void;
}

export interface PulselineRuntime {
  getSnapshot(): TimelineSnapshot;
  subscribe(listener: () => void): () => void;
  updateAgent(agent: TimelineAgentState): void;
  isMounted(): boolean;
  dispose(): void;
}

interface ActiveRuntime {
  readonly controller: TimelineController;
  readonly stopTimer: () => void;
}

export function createPulselineRuntime(input: PulselineRuntimeInput): PulselineRuntime {
  const cold: TimelineSnapshot = { busy: false, gap: false, blocks: [], metrics: {}, label: input.label };
  const outputRates = new TurnOutputRates();
  const listeners = new Set<() => void>();
  let agent = input.agent;
  let current = cold;
  let publishedSource: TimelineSnapshot | undefined;
  let publishedPhase: number | undefined;
  let store: TimelineStore | undefined;
  let active: ActiveRuntime | undefined;
  let disposed = false;
  let pulsePhase: 0 | 1 | 2 = 0;

  const notify = (next: TimelineSnapshot) => {
    current = next;
    input.onSnapshot(next);
    for (const listener of listeners) listener();
  };
  const publish = (source: TimelineSnapshot) => {
    const phase = source.busy ? pulsePhase : undefined;
    if (source === publishedSource && phase === publishedPhase) return;
    publishedSource = source;
    publishedPhase = phase;
    notify(phase === undefined ? source : { ...source, pulsePhase });
  };
  const refresh = (advancePulse = false) => {
    // A late tick or controller callback after stop() must not touch the kept store.
    if (!active && store) return;
    if (advancePulse) {
      if (!current.busy) { pulsePhase = 0; return; }
      pulsePhase = pulsePhase === 0 ? 1 : pulsePhase === 1 ? 2 : 0;
    }
    const next = store?.snapshot(advancePulse ? Date.now() : undefined) ?? cold;
    if (!next.busy) pulsePhase = 0;
    publish(next);
  };
  const stop = () => {
    const runtime = active;
    if (!runtime) return;
    active = undefined;
    // Keep the store: live-only facts (tool timings, per-turn rates, usage) cannot be
    // rebuilt from history, so leaving the chat must not forget them. The next mount
    // refetches the tail into this same store, which dedupes by block id.
    runtime.stopTimer();
    runtime.controller.stop();
    store?.interruptObservation();
    pulsePhase = 0;
    if (store) publish({ ...store.snapshot(), busy: false });
  };
  const start = () => {
    if (disposed || active) return;
    const nextStore = store ?? new TimelineStore(input.label, outputRates);
    nextStore.demoteLiveAuthority();
    nextStore.updateAgent(agent);
    store = nextStore;
    const controller = createTimelineController(input.timeline(), nextStore, () => refresh());
    active = { controller, stopTimer: input.schedule(() => refresh(true)) };
    refresh();
  };

  return {
    getSnapshot: () => current,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        if (!listeners.delete(listener)) return;
        if (listeners.size === 0) stop();
      };
    },
    updateAgent(nextAgent) {
      agent = nextAgent;
      active?.controller.updateAgent(nextAgent);
    },
    isMounted: () => active !== undefined,
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      listeners.clear();
    },
  };
}
