import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setImmediate } from "node:timers/promises";
import { createPulselineRuntime, type PulselineRuntime } from "./runtime";
import type { RegistryTimelineEvent, RegistryTimelinePage, RegistryTimelineSource } from "./controller";
import { buildPulseView, statusHeader } from "./pulse-view";

const runtimes: PulselineRuntime[] = [];
beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
afterEach(() => { for (const runtime of runtimes.splice(0)) runtime.dispose(); vi.useRealTimers(); });
const entry = (seq: number) => ({ provider: "opencode", timestamp: new Date(seq * 1000).toISOString(), seqStart: seq, seqEnd: seq, item: { type: "tool_call" as const, callId: String(seq), name: "Read", detail: { type: "read" as const, filePath: "x" }, status: "completed" as const, error: null } });
function history(total = 650) {
  const requests: { direction: string; seq: number | undefined }[] = [];
  let emit!: (event: RegistryTimelineEvent) => void;
  const source: RegistryTimelineSource = {
    subscribe: handler => { emit = handler; return Object.assign(() => {}, { ready: Promise.resolve() }); },
    refetch: async options => {
      requests.push({ direction: options?.direction ?? "tail", seq: options?.cursor?.seq });
      const end = options?.cursor?.seq ?? total + 1, start = Math.max(1, end - 200);
      return { epoch: "e", reset: false, gap: false, hasOlder: start > 1, startCursor: start > 1 ? { epoch: "e", seq: start } : null, error: null, entries: Array.from({ length: end - start }, (_, i) => entry(start + i)) };
    },
  };
  return { source, requests, emit: (event: RegistryTimelineEvent) => emit(event) };
}
function runtime(source: RegistryTimelineSource) {
  const result = createPulselineRuntime({ label: "", agent: { provider: "opencode", activeTurn: null }, schedule: () => () => {}, onSnapshot: () => {}, timeline: () => source });
  runtimes.push(result); return result;
}

it("empty mount loads every page without scroll, publishes provisional progress and yields between pages", async () => {
  const source = history(), view = runtime(source.source); view.subscribe(() => {});
  await setImmediate();
  expect(source.requests).toHaveLength(1); // Older ingest must wait for a new macrotask.
  expect(view.getSnapshot()).toMatchObject({ loadingOlder: true, historyLoaded: true });
  expect(view.getSnapshot().blocks).toHaveLength(200);
  expect(buildPulseView(view.getSnapshot()).metrics.find(line => line.id === "tool-count")?.value).toBe("~200");
  view.updateAgent({ provider: "opencode", lastUsage: { totalCostUsd: .1, contextWindowUsedTokens: 500, contextWindowMaxTokens: 1000 } });
  expect(buildPulseView(view.getSnapshot()).metrics.filter(line => line.value !== "—").every(line => line.value.startsWith("~") && line.hint.includes("provisional"))).toBe(true);
  await vi.runAllTimersAsync();
  expect(source.requests).toHaveLength(4);
  expect(view.getSnapshot().blocks).toHaveLength(650);
  expect(view.getSnapshot()).toMatchObject({ hasOlder: false, loadingOlder: false, gap: false });
  expect(view.getSnapshot().metrics.toolCount).toEqual({ value: 650 });
  expect(buildPulseView(view.getSnapshot()).metrics.find(line => line.id === "cost")?.value).toBe("$0.10");
});

it("opening a closed chat repeatedly preserves final counts and never refetches known older pages", async () => {
  const source = history(), view = runtime(source.source);
  for (let mount = 0; mount < 4; mount++) {
    const unmount = view.subscribe(() => {}); await setImmediate(); await vi.runAllTimersAsync();
    expect(view.getSnapshot().blocks).toHaveLength(650);
    expect(view.getSnapshot().metrics.toolCount).toEqual({ value: 650 });
    expect(source.requests).toHaveLength(4 + mount); // Tail freshness check only on remount.
    expect(source.requests.filter(request => request.direction === "before").map(request => request.seq)).toEqual([451, 251, 51]);
    unmount();
  }
});

it("remount joins unseen newer pages at known seq, then resumes older at the oldest kept cursor", async () => {
  const source = history(), view = runtime(source.source);
  let unmount = view.subscribe(() => {}); await setImmediate();
  expect(view.getSnapshot().blocks).toHaveLength(200);
  unmount();
  source.requests.length = 0;
  const base = source.source.refetch;
  let first = true;
  source.source.refetch = async options => {
    if (first) { first = false; source.requests.push({ direction: "tail", seq: undefined }); return { epoch: "e", reset: false, gap: false, hasOlder: true, startCursor: { epoch: "e", seq: 651 }, error: null, entries: Array.from({ length: 200 }, (_, i) => entry(651 + i)) }; }
    return base(options);
  };
  unmount = view.subscribe(() => {}); await setImmediate(); await vi.runAllTimersAsync();
  expect(source.requests).toEqual([{ direction: "tail", seq: undefined }, { direction: "before", seq: 651 }, { direction: "before", seq: 451 }, { direction: "before", seq: 251 }, { direction: "before", seq: 51 }]);
  expect(view.getSnapshot().blocks).toHaveLength(850);
  expect(view.getSnapshot().metrics.toolCount?.value).toBe(850);
  unmount();
});

it("unmount cancels queued background requests and a partial store resumes without count loss", async () => {
  const source = history(), view = runtime(source.source);
  const unmount = view.subscribe(() => {}); await setImmediate();
  expect(view.getSnapshot().loadingOlder).toBe(true);
  expect(vi.getTimerCount()).toBe(1);
  unmount(); await vi.runAllTimersAsync();
  expect(source.requests).toHaveLength(1);
  expect(view.getSnapshot().loadingOlder).toBe(false);
  view.subscribe(() => {}); await setImmediate(); await vi.runAllTimersAsync();
  expect(view.getSnapshot().blocks).toHaveLength(650);
});

it("unmount during an older request ignores its result and never schedules another page", async () => {
  const source = history(), refetch = source.source.refetch;
  let resolve!: (page: RegistryTimelinePage) => void;
  source.source.refetch = options => options?.direction === "before" ? new Promise(done => { resolve = done; }) : refetch(options);
  const view = runtime(source.source), unmount = view.subscribe(() => {}); await setImmediate();
  await vi.advanceTimersToNextTimerAsync();
  expect(resolve).toBeTypeOf("function");
  unmount(); resolve(await refetch({ direction: "before", cursor: { epoch: "e", seq: 451 } }));
  await vi.runAllTimersAsync();
  expect(source.requests).toHaveLength(2);
  expect(view.getSnapshot().blocks).toHaveLength(200);
});

it("epoch replacement cancels the queued old-epoch page before starting a fresh tail", async () => {
  const source = history(), view = runtime(source.source); view.subscribe(() => {}); await setImmediate();
  expect(view.getSnapshot().loadingOlder).toBe(true);
  source.source.refetch = async options => {
    source.requests.push({ direction: options?.direction ?? "tail", seq: options?.cursor?.seq });
    return { epoch: "new", reset: false, gap: false, hasOlder: false, startCursor: null, error: null, entries: [entry(1)] };
  };
  source.emit({ agentId: "a", event: { type: "replacement", epoch: "new" } });
  await setImmediate(); await vi.runAllTimersAsync();
  expect(source.requests.map(request => request.direction)).toEqual(["tail", "tail"]);
  expect(view.getSnapshot()).toMatchObject({ epoch: "new", loadingOlder: false });
  expect(view.getSnapshot().blocks).toHaveLength(1);
});

it("live status stays responsive while older history is still paging", async () => {
  const source = history(), view = runtime(source.source); view.subscribe(() => {}); await setImmediate();
  expect(view.getSnapshot().loadingOlder).toBe(true);
  source.emit({ agentId: "a", epoch: "e", seq: 651, timestamp: new Date(651000).toISOString(), event: { type: "turn_started", provider: "opencode", turnId: "live" } });
  expect(statusHeader(view.getSnapshot())).toBe("Working");
  source.emit({ agentId: "a", epoch: "e", seq: 652, timestamp: new Date(652000).toISOString(), event: { type: "turn_completed", provider: "opencode", turnId: "live" } });
  expect(statusHeader(view.getSnapshot())).toBe("Idle");
  expect(view.getSnapshot().loadingOlder).toBe(true);
  await vi.runAllTimersAsync();
  expect(view.getSnapshot().loadingOlder).toBe(false);
  expect(view.getSnapshot().metrics.toolCount).toEqual({ value: 650 });
});
