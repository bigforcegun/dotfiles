import { afterEach, expect, it, vi } from "vitest";
import { setImmediate } from "node:timers/promises";
import { TimelineStore, type TimelinePage } from "./store";
import { createPulselineRuntime } from "./runtime";
import { createTimelineController, type RegistryTimelineEvent, type RegistryTimelinePage, type RegistryTimelineSource } from "./controller";
import { activePulseBlock, buildPulseView, pulseActivityColor, statusHeader } from "./pulse-view";
import { TokenTotals } from "./token-totals";
const page: RegistryTimelinePage = { epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, entries: [], error: null };
const entry = (seq: number) => ({ provider: "codex", turnId: "old", timestamp: new Date(seq * 1000).toISOString(), seqStart: seq, seqEnd: seq, item: { type: "assistant_message" as const, text: "x" } });
const storePage = (entries: RegistryTimelinePage["entries"], epoch = "e"): TimelinePage => ({ ...page, epoch, entries: entries.map(item => ({ ...item, timestamp: Date.parse(item.timestamp) })) });
afterEach(() => vi.useRealTimers());

it("1/3: a turn ending while unmounted becomes idle immediately and refreshes kept history quietly", async () => {
  let emit!: (event: RegistryTimelineEvent) => void;
  let fetches = 0;
  let resolve!: (value: RegistryTimelinePage) => void;
  const runtime = createPulselineRuntime({ label: "", agent: { provider: "codex", activeTurn: null }, schedule: () => () => {}, onSnapshot: () => {}, timeline: () => ({
    subscribe: handler => { emit = handler; return Object.assign(() => {}, { ready: Promise.resolve() }); },
    refetch: () => ++fetches === 1 ? Promise.resolve(page) : new Promise(done => { resolve = done; }),
  }) });
  let unmount = runtime.subscribe(() => {}); await setImmediate();
  emit({ agentId: "a", epoch: "e", seq: 1, timestamp: new Date(1000).toISOString(), event: { type: "turn_started", provider: "codex", turnId: "t" } });
  emit({ agentId: "a", epoch: "e", seq: 2, timestamp: new Date(2000).toISOString(), event: { type: "timeline", provider: "codex", turnId: "t", item: { type: "assistant_message", text: "kept" } } });
  runtime.updateAgent({ provider: "codex", activeTurn: { turnId: "t", startedAt: new Date(1000).toISOString() }, lastUsage: { inputTokens: 50, outputTokens: 20 } });
  const totals = runtime.getSnapshot().tokenTotals;
  const blocks = runtime.getSnapshot().blocks;
  unmount();
  expect(runtime.getSnapshot()).toMatchObject({ busy: false, historyLoaded: true });
  expect(runtime.getSnapshot().blocks).toBe(blocks);
  runtime.updateAgent({ provider: "codex", activeTurn: null });
  unmount = runtime.subscribe(() => {});
  expect(runtime.getSnapshot()).toMatchObject({ busy: false, historyLoaded: true });
  await setImmediate(); resolve({ ...page, entries: [{ ...entry(2), turnId: "t", item: { type: "assistant_message", text: "kept" } }] });
  await setImmediate();
  expect(runtime.getSnapshot().busy).toBe(false);
  expect(runtime.getSnapshot().tokenTotals).toEqual(totals);
  runtime.updateAgent({ provider: "codex", activeTurn: { turnId: "next", startedAt: new Date(3000).toISOString() } });
  expect(runtime.getSnapshot().busy).toBe(true);
  unmount(); runtime.dispose();
});

it.each(["error", "subscription_restored"] as const)("1: %s demotes live authority for the next catalog snapshot", async type => {
  let emit!: (event: RegistryTimelineEvent) => void;
  const store = new TimelineStore("");
  const controller = createTimelineController({ subscribe: handler => { emit = handler; return Object.assign(() => {}, { ready: Promise.resolve() }); }, refetch: async () => page }, store, () => {});
  await setImmediate();
  emit({ agentId: "a", epoch: "e", seq: 1, timestamp: new Date(1000).toISOString(), event: { type: "turn_started", provider: "codex", turnId: "t" } });
  emit(type === "error" ? { agentId: "a", event: { type: "error", error: "disconnected" } } : { agentId: "a", subscriptionId: "s", event: { type: "subscription_restored" } });
  controller.updateAgent({ provider: "codex", activeTurn: null });
  expect(store.snapshot().busy).toBe(false);
  controller.stop();
});

it("4: clears reported usage on epoch replacement", () => {
  const store = new TimelineStore(""); store.ingestPage(storePage([]));
  store.updateAgent({ provider: "codex", lastUsage: { inputTokens: 50, outputTokens: 60, cachedInputTokens: 20, totalCostUsd: .5 } });
  expect(store.snapshot().metrics.outputTokens?.value).toBe(60);
  store.replaceEpoch("new");
  expect(store.snapshot().metrics).not.toHaveProperty("outputTokens");
  expect(store.snapshot().metrics).not.toHaveProperty("totalCostUsd");
});

it("5/11: cold mount loads all pages; remount stops at a known seq instead of repaging known history", async () => {
  const store = new TimelineStore("");
  let calls = 0;
  const source: RegistryTimelineSource = { subscribe: () => Object.assign(() => {}, { ready: Promise.resolve() }), refetch: async options => {
    calls++;
    return options?.direction === "before" ? { ...page, entries: [entry(1)] } : { ...page, hasOlder: true, startCursor: { epoch: "e", seq: 10 }, entries: [entry(10), entry(11)] };
  } };
  let controller = createTimelineController(source, store, () => {});
  await vi.waitFor(() => expect(calls).toBe(2), { interval: 1 });
  expect(store.snapshot()).toMatchObject({ hasOlder: false, gap: false });
  controller.stop(); controller = createTimelineController(source, store, () => {}); await setImmediate();
  expect(calls).toBe(3); // Tail freshness check only; the older side is already complete.
  controller.stop();
});

it("5: a full kept store still pages across a reconnect hole until the known boundary", async () => {
  const store = new TimelineStore(""); store.ingestPage(storePage(Array.from({ length: 5000 }, (_, index) => entry(index + 1)))); store.finishBootstrap();
  let calls = 0;
  const controller = createTimelineController({ subscribe: () => Object.assign(() => {}, { ready: Promise.resolve() }), refetch: async () => {
    calls++;
    return { ...page, hasOlder: true, startCursor: { epoch: "e", seq: calls === 1 ? 5200 : 5000 }, entries: calls === 1 ? [entry(5200), entry(5300)] : [entry(5000), entry(5100)] };
  } }, store, () => {});
  await vi.waitFor(() => expect(calls).toBe(2), { interval: 1 });
  expect(store.snapshot().blocks.some(block => block.order === 5100)).toBe(true);
  controller.stop();
});

it("6: newest error wins colour even when an older active tool is selected", () => {
  const store = new TimelineStore("");
  store.ingestLive({ timestamp: 1000, event: { type: "turn_started", provider: "codex", turnId: "t" } });
  store.ingestLive({ timestamp: 2000, event: { type: "timeline", provider: "codex", turnId: "t", item: { type: "tool_call", callId: "c", name: "Run", detail: { type: "shell", command: "x" }, status: "running", error: null } } });
  store.ingestLive({ timestamp: 3000, event: { type: "timeline", provider: "codex", turnId: "t", item: { type: "error", message: "failed" } } });
  expect(activePulseBlock(store.snapshot())?.id).toBe("tool:c");
  expect(pulseActivityColor(store.snapshot())).toBe("statusDanger");
});

it("7: stale running tool from an earlier turn is excluded by both indexed and fallback selection", () => {
  const store = new TimelineStore(""); store.finishBootstrap();
  store.ingestLive({ timestamp: 1000, event: { type: "turn_started", provider: "codex", turnId: "old" } });
  store.ingestLive({ timestamp: 2000, event: { type: "timeline", provider: "codex", turnId: "old", item: { type: "tool_call", callId: "old", name: "Old", detail: { type: "shell", command: "x" }, status: "running", error: null } } });
  store.ingestLive({ timestamp: 3000, event: { type: "turn_started", provider: "codex", turnId: "new" } });
  expect(statusHeader(store.snapshot())).toBe("Working");
  store.ingestLive({ timestamp: 4000, event: { type: "timeline", provider: "codex", turnId: "new", item: { type: "reasoning", text: "now" } } });
  expect(activePulseBlock(store.snapshot())?.kind).toBe("reasoning");
  const { activityBlock: _indexed, ...fallback } = store.snapshot();
  expect(activePulseBlock(fallback)?.kind).toBe("reasoning");
  store.ingestLive({ timestamp: 5000, event: { type: "turn_completed", provider: "codex", turnId: "new" } });
  expect(statusHeader(store.snapshot())).toBe("Idle");
});

it("8: chat sums count each live turn once, retain exact latest request, and reset with epoch", () => {
  const store = new TimelineStore(""); store.ingestPage(storePage([entry(1)]));
  for (const [id, amount, time] of [["a", 100, 10000], ["b", 200, 20000]] as const) {
    store.ingestLive({ timestamp: time, event: { type: "turn_started", provider: "codex", turnId: id } });
    store.updateAgent({ provider: "codex", activeTurn: { turnId: id, startedAt: new Date(time).toISOString() }, lastUsage: { inputTokens: amount, outputTokens: amount / 2, cachedInputTokens: 10 } });
    const terminal = { timestamp: time + 1000, event: { type: "turn_completed" as const, provider: "codex", turnId: id, usage: { inputTokens: amount, outputTokens: amount / 2, cachedInputTokens: 10, totalCostUsd: .75 } } };
    store.ingestLive(terminal); store.ingestLive(terminal);
  }
  expect(store.snapshot().tokenTotals).toMatchObject({ inputTokens: { value: 300, approximate: true }, outputTokens: { value: 150, approximate: true }, cachedInputTokens: { value: 20, approximate: true } });
  const input = buildPulseView(store.snapshot()).metrics[0]!;
  expect(input.value).toBe("~300"); expect(input.hint).toContain("Latest request 200 (exact");
  expect(input.hint).toMatch(/since \d\d:\d\d — earlier turns not observed/);
  expect(store.snapshot().metrics.totalCostUsd?.value).toBe(.75);
  store.replaceEpoch("new"); expect(store.snapshot().tokenTotals).toEqual({});
});

it("8: OpenCode sums observed steps without completion echoes, and cumulative normalization uses deltas", () => {
  const ledger = new TokenTotals();
  ledger.observe("a", "opencode", { inputTokens: 10, outputTokens: 20 }, false, 1000);
  ledger.observe("a", "opencode", { inputTokens: 15, outputTokens: 30 }, false, 2000);
  ledger.observe("a", "opencode", { inputTokens: 15, outputTokens: 30 }, true, 3000);
  ledger.observe("a", "opencode", { inputTokens: 15, outputTokens: 30 }, true, 3000);
  expect(ledger.metrics().outputTokens?.value).toBe(50);
  const cumulative = new TokenTotals();
  cumulative.observe("a", "cumulative", { outputTokens: 100 }, true, 1000, "cumulative");
  cumulative.observe("b", "cumulative", { outputTokens: 160 }, true, 2000, "cumulative");
  expect(cumulative.metrics().outputTokens?.value).toBe(60);
});

it("11: background requests each older cursor once and waits for its response", async () => {
  const store = new TimelineStore(""); let calls = 0;
  let resolve!: (value: RegistryTimelinePage) => void;
  const controller = createTimelineController({ subscribe: () => Object.assign(() => {}, { ready: Promise.resolve() }), refetch: () => {
    calls++; return calls === 1 ? Promise.resolve({ ...page, hasOlder: true, startCursor: { epoch: "e", seq: 10 }, entries: [entry(10)] }) : new Promise(done => { resolve = done; });
  } }, store, () => {});
  await vi.waitFor(() => expect(calls).toBe(2), { interval: 1 });
  await setImmediate();
  expect(calls).toBe(2);
  resolve({ ...page, entries: [entry(1)] }); await setImmediate();
  expect(calls).toBe(2);
  controller.stop();
});


it("5: resume checkpoints exclude live-only terminal rows that canonical history can never return", () => {
  const store = new TimelineStore(""); store.ingestPage(storePage([]));
  store.ingestLive({ epoch: "e", seq: 1, timestamp: 1000, event: { type: "turn_started", provider: "codex", turnId: "t" } });
  store.ingestLive({ epoch: "e", seq: 2, timestamp: 2000, event: { type: "turn_completed", provider: "codex", turnId: "t" } });
  expect(store.checkpoint()).toBeUndefined();
  store.ingestLive({ epoch: "e", seq: 3, timestamp: 3000, event: { type: "timeline", provider: "codex", turnId: "t", item: { type: "assistant_message", text: "matchable" } } });
  expect(store.checkpoint()?.sequences).toEqual([3]);
});
