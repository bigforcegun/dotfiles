import { createTimelineController, type RegistryTimelineSource, type TimelineController } from "./controller";
import { TimelineStore, type TimelineAgentState, type TimelineSnapshot } from "./store";

export type ScheduleRefresh = (callback: () => void) => () => void;

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
  const listeners = new Set<() => void>();
  let agent = input.agent;
  let current = cold;
  let fingerprint = JSON.stringify(cold);
  let store: TimelineStore | undefined;
  let active: ActiveRuntime | undefined;
  let disposed = false;
  let pulsePhase: 0 | 1 | 2 = 0;

  const publish = (next: TimelineSnapshot) => {
    const nextFingerprint = JSON.stringify(next);
    if (nextFingerprint === fingerprint) return;
    current = next;
    fingerprint = nextFingerprint;
    input.onSnapshot(next);
    for (const listener of listeners) listener();
  };
  const refresh = (advancePulse = false) => {
    const next = store?.snapshot() ?? cold;
    if (!next.busy) {
      pulsePhase = 0;
      publish(next);
      return;
    }
    if (advancePulse) pulsePhase = pulsePhase === 0 ? 1 : pulsePhase === 1 ? 2 : 0;
    publish({ ...next, pulsePhase });
  };
  const stop = () => {
    const runtime = active;
    if (!runtime) return;
    active = undefined;
    store = undefined;
    runtime.stopTimer();
    runtime.controller.stop();
    publish(cold);
  };
  const start = () => {
    if (disposed || active) return;
    const nextStore = new TimelineStore(input.label);
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
