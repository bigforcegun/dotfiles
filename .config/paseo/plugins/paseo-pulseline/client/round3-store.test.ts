import { expect, it, vi } from "vitest";
import { setImmediate } from "node:timers/promises";
import { TimelineStore } from "./store";
import { createPulselineRuntime } from "./runtime";
import { createTimelineController, type RegistryTimelineEvent, type RegistryTimelinePage, type RegistryTimelineSource } from "./controller";
import { buildComposerPulseLabel, buildPulseView, PULSE_LABEL_WIDTH } from "./pulse-view";
const page: RegistryTimelinePage = { epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, entries: [], error: null };
const entry = (seq: number) => ({ provider: "opencode", timestamp: new Date(seq).toISOString(), seqStart: seq, seqEnd: seq, item: { type: "assistant_message" as const, text: "x" } });

it("A: first epoch adoption preserves catalog usage on the actual store and runtime paths", async () => {
  const agent = { provider: "opencode", lastUsage: { inputTokens: 10, outputTokens: 5, totalCostUsd: .1 } };
  const store = new TimelineStore("");
  const activeTurn = { turnId: "t", startedAt: new Date(1000).toISOString() };
  store.updateAgent({ provider: "opencode", activeTurn });
  store.updateAgent({ ...agent, activeTurn });
  const totals = store.snapshot().tokenTotals;
  store.ingestPage({ ...page, entries: [] });
  expect(store.snapshot().tokenTotals).toEqual(totals);
  expect(store.snapshot().metrics).toMatchObject({ inputTokens: { value: 10 }, outputTokens: { value: 5 }, totalCostUsd: { value: .1 } });
  const runtime = createPulselineRuntime({ agent, label: "", onSnapshot: () => {}, schedule: () => () => {}, timeline: () => ({ subscribe: () => Object.assign(() => {}, { ready: Promise.resolve() }), refetch: async () => page }) });
  const unmount = runtime.subscribe(() => {}); await setImmediate();
  expect(runtime.getSnapshot().metrics.inputTokens?.value).toBe(10);
  unmount(); runtime.dispose();
});

it("B: an identical or subset catalog echo from N-1 cannot be counted into N or change its output TPS", () => {
  const store = new TimelineStore(""); store.ingestPage({ ...page, entries: [] });
  store.ingestLive({ timestamp: 1000, event: { type: "turn_started", provider: "opencode", turnId: "one" } });
  store.ingestLive({ timestamp: 2000, event: { type: "turn_completed", provider: "opencode", turnId: "one", usage: { inputTokens: 10, outputTokens: 5, totalCostUsd: .1 } } });
  store.ingestLive({ timestamp: 3000, event: { type: "turn_started", provider: "opencode", turnId: "two" } });
  const agent = { provider: "opencode", activeTurn: { turnId: "two", startedAt: new Date(3000).toISOString() } };
  store.updateAgent({ ...agent, lastUsage: { inputTokens: 10, outputTokens: 5, totalCostUsd: .1 } });
  store.updateAgent({ ...agent, lastUsage: { outputTokens: 5 } });
  expect(store.snapshot(4000).tokenTotals).toMatchObject({ inputTokens: { value: 10 }, outputTokens: { value: 5 } });
  expect(store.snapshot(4000).outputRate?.turnId).toBe("one");
  store.updateAgent({ ...agent, lastUsage: { inputTokens: 20, outputTokens: 8, totalCostUsd: .2 } });
  expect(store.snapshot(5000).tokenTotals?.outputTokens?.value).toBe(13);
  expect(store.snapshot(5000).outputRate?.turnId).toBe("two");
});

it("C: kept sums explicitly disclose gaps after unmount/remount and reconnect", async () => {
  let emit!: (event: RegistryTimelineEvent) => void;
  const runtime = createPulselineRuntime({ agent: { provider: "opencode", activeTurn: null }, label: "", onSnapshot: () => {}, schedule: () => () => {}, timeline: () => ({ subscribe: handler => { emit = handler; return Object.assign(() => {}, { ready: Promise.resolve() }); }, refetch: async () => page }) });
  let unmount = runtime.subscribe(() => {}); await setImmediate();
  emit({ agentId: "a", epoch: "e", timestamp: new Date(1000).toISOString(), event: { type: "turn_started", provider: "opencode", turnId: "one" } });
  emit({ agentId: "a", epoch: "e", timestamp: new Date(2000).toISOString(), event: { type: "turn_completed", provider: "opencode", turnId: "one", usage: { inputTokens: 10, outputTokens: 5 } } });
  expect(buildPulseView(runtime.getSnapshot()).metrics[0]!.hint).not.toContain("some turns not observed");
  unmount(); unmount = runtime.subscribe(() => {}); await setImmediate();
  expect(buildPulseView(runtime.getSnapshot()).metrics[0]!.hint).toContain("some turns not observed");
  expect(buildPulseView(runtime.getSnapshot()).metrics[0]!.value).toBe("~10");
  emit({ agentId: "a", subscriptionId: "s", event: { type: "subscription_restored" } }); await setImmediate();
  expect(buildPulseView(runtime.getSnapshot()).metrics[0]!.hint).toContain("some turns not observed");
  unmount(); runtime.dispose();
});

it.each([false, true])("G: mismatched/reset before-page resyncs the tail instead of adopting the older page (reset=%s)", async reset => {
  const store = new TimelineStore(""); const requests: string[] = [];
  const responses: RegistryTimelinePage[] = [
    { ...page, hasOlder: true, startCursor: { epoch: "e", seq: 10 }, entries: [entry(10)] },
    { ...page, epoch: reset ? "e" : "new", reset, entries: [entry(1)] },
    { ...page, epoch: reset ? "e" : "new", entries: [entry(100)] },
  ];
  const source: RegistryTimelineSource = { subscribe: () => Object.assign(() => {}, { ready: Promise.resolve() }), refetch: async options => { requests.push(options?.direction ?? "tail"); return responses.shift()!; } };
  const controller = createTimelineController(source, store, () => {}); await vi.waitFor(() => expect(requests).toHaveLength(3), { interval: 1 });
  expect(requests).toEqual(["tail", "before", "tail"]);
  expect(store.snapshot().blocks.map(block => block.order)).toEqual([100]);
  controller.stop();
});

it("H: remount loads older from the oldest retained cursor, not from the newest-known join page", async () => {
  const store = new TimelineStore("");
  store.ingestPage({ ...page, hasOlder: true, entries: [entry(1), entry(100)].map(row => ({ ...row, timestamp: Date.parse(row.timestamp) })) }); store.finishBootstrap();
  const seen: Array<{ direction?: string; cursor?: { seq: number } }> = [];
  const controller = createTimelineController({ subscribe: () => Object.assign(() => {}, { ready: Promise.resolve() }), refetch: async options => {
    seen.push(options ?? {});
    return seen.length === 1 ? { ...page, hasOlder: true, startCursor: { epoch: "e", seq: 100 }, entries: [entry(100), entry(101)] } : { ...page, entries: [entry(0)] };
  } }, store, () => {});
  await vi.waitFor(() => expect(seen).toHaveLength(2), { interval: 1 });
  expect(seen[1]?.cursor?.seq).toBe(1);
  expect(store.snapshot().blocks.some(block => block.order === 0)).toBe(true);
  controller.stop();
});

it("J: actual runtime composer labels keep exactly sixteen cells across loading/idle/busy histories", async () => {
  let emit!: (event: RegistryTimelineEvent) => void;
  const labels: string[] = [];
  const runtime = createPulselineRuntime({ agent: { provider: "opencode" }, label: "", onSnapshot: snapshot => labels.push(buildComposerPulseLabel(snapshot)), schedule: () => () => {}, timeline: () => ({ subscribe: handler => { emit = handler; return Object.assign(() => {}, { ready: Promise.resolve() }); }, refetch: async () => page }) });
  expect(buildComposerPulseLabel(runtime.getSnapshot())).toHaveLength(PULSE_LABEL_WIDTH);
  const unmount = runtime.subscribe(() => {}); await setImmediate();
  emit({ agentId: "a", epoch: "e", seq: 1, timestamp: new Date(1000).toISOString(), event: { type: "turn_started", provider: "opencode", turnId: "t" } });
  for (let seq = 2; seq < 24; seq++) emit({ agentId: "a", epoch: "e", seq, timestamp: new Date(seq * 1000).toISOString(), event: { type: "timeline", provider: "opencode", turnId: "t", item: { type: "reasoning", text: "x" } } });
  emit({ agentId: "a", epoch: "e", seq: 24, timestamp: new Date(24000).toISOString(), event: { type: "turn_completed", provider: "opencode", turnId: "t" } });
  expect(labels.every(label => label.length === PULSE_LABEL_WIDTH)).toBe(true);
  expect(labels[0]?.startsWith("\u2800")).toBe(true);
  unmount(); runtime.dispose();
});


it.each(["error", "subscription_restored"] as const)("C: a %s marks observation gaps without any prior unmount", async type => {
  let emit!: (event: RegistryTimelineEvent) => void;
  const store = new TimelineStore("");
  const controller = createTimelineController({ subscribe: handler => { emit = handler; return Object.assign(() => {}, { ready: Promise.resolve() }); }, refetch: async () => page }, store, () => {});
  await setImmediate();
  store.ingestLive({ timestamp: 1000, event: { type: "turn_started", provider: "opencode", turnId: "t" } });
  store.ingestLive({ timestamp: 2000, event: { type: "turn_completed", provider: "opencode", turnId: "t", usage: { inputTokens: 10 } } });
  expect(store.snapshot().usageObservationGaps).toBe(false);
  emit(type === "error" ? { agentId: "a", event: { type: "error", error: "lost" } } : { agentId: "a", subscriptionId: "s", event: { type: "subscription_restored" } });
  await setImmediate();
  expect(buildPulseView(store.snapshot()).metrics[0]!.hint).toContain("some turns not observed");
  controller.stop();
});
