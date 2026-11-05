import { afterEach, expect, it, vi } from "vitest";
import { setImmediate } from "node:timers/promises";
import { TimelineStore, type TimelineSnapshot } from "./store";
import { TimelineAccounting } from "./store-accounting";
import { MAX_RETAINED_BLOCKS, setBoundedBlock } from "./store-bounds";
import { createPulselineRuntime } from "./runtime";
import { createTimelineController, type RegistryTimelineSource, type RegistryTimelineEvent } from "./controller";
import { activePulseBlock, buildHistoryView, buildPulseView, pulseActivityColor, statusHeader } from "./pulse-view";
import type { PulseBlock } from "./model";
import { createPulselineRegistry, type RegistryHost } from "./registry";

vi.mock("./pill", () => ({ createPulselinePresentation: vi.fn(), buildComposerPulseLabel: () => "" }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const block = (order: number): PulseBlock => ({ id: String(order), order, timestamp: order, kind: "text", heightIndex: 0, volumeTokens: 1 });
const empty: TimelineSnapshot = { blocks: [], metrics: {}, busy: false, gap: false, label: "" };
const page = { epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, entries: [], error: null };

it("publishes by cached identity, never serializes snapshots, and dedupes a refresh after a phase tick", async () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  const stringify = JSON.stringify;
  vi.spyOn(JSON, "stringify").mockImplementation((value, ...args) => {
    if (value && typeof value === "object" && "blocks" in value) throw new Error("serialized history");
    return stringify(value, ...args);
  });
  let emit: ((event: RegistryTimelineEvent) => void) | undefined;
  let tick = () => {};
  const onSnapshot = vi.fn();
  const runtime = createPulselineRuntime({ label: "", agent: { provider: "codex" }, onSnapshot,
    schedule: callback => { tick = callback; return () => {}; }, timeline: () => ({
      subscribe: handler => { emit = handler; return Object.assign(() => {}, { ready: Promise.resolve() }); }, refetch: async () => page,
    }) });
  const unmount = runtime.subscribe(() => {});
  await Promise.resolve(); await Promise.resolve();
  emit!({ agentId: "a", epoch: "e", seq: 1, timestamp: new Date(1000).toISOString(), event: { type: "turn_started", provider: "codex", turnId: "t" } });
  tick(); const count = onSnapshot.mock.calls.length;
  runtime.updateAgent({ provider: "codex" }); // stale idle catalog is ignored
  expect(onSnapshot).toHaveBeenCalledTimes(count);
  expect(runtime.getSnapshot().pulsePhase).toBe(1);
  unmount(); const kept = runtime.getSnapshot(); tick(); expect(runtime.getSnapshot()).toBe(kept);
  runtime.dispose();
});

it("caches snapshots and sorted arrays, amortizes prune and never scans accounting on clock reads", () => {
  const prune = vi.spyOn(TimelineAccounting.prototype, "retain");
  const metrics = vi.spyOn(TimelineAccounting.prototype, "metrics");
  const store = new TimelineStore("");
  for (let seq = 1; seq <= 100; seq++) store.ingestLive({ seq, timestamp: seq, event: { type: "timeline", provider: "codex", item: { type: "assistant_message", text: "x" } } });
  const snapshot = store.snapshot(); const reads = metrics.mock.calls.length;
  for (let i = 0; i < 100; i++) expect(store.snapshot()).toBe(snapshot);
  expect(metrics).toHaveBeenCalledTimes(reads);
  expect(prune).not.toHaveBeenCalled();
  store.ingestLive({ seq: 101, timestamp: 1000, event: { type: "turn_started", provider: "codex", turnId: "t" } });
  expect(store.snapshot(2000).turnDurationMs).toBe(1000);
  expect(store.snapshot(3000).blocks).toBe(snapshot.blocks);
  expect(prune).not.toHaveBeenCalled();
  for (let seq = 102; seq < 150; seq++) store.ingestLive({ seq, timestamp: seq, event: { type: "timeline", provider: "codex", item: { type: "assistant_message", text: "x" } } });
  expect(prune.mock.calls.length).toBeLessThanOrEqual(1);
});

it("evicts a full ordered live queue in constant work, protects active history and moves updated identities", () => {
  let reads = 0;
  class CountedMap extends Map<string, PulseBlock> {
    override values(): MapIterator<PulseBlock> {
      const iterator = super.values();
      return { ...iterator, next: () => { reads++; return iterator.next(); }, [Symbol.iterator]() { return this; } } as MapIterator<PulseBlock>;
    }
  }
  const blocks = new CountedMap();
  for (let i = 0; i < MAX_RETAINED_BLOCKS; i++) setBoundedBlock(blocks, { ...block(i), ...(i === 0 ? { turnId: "active" } : {}) }, "active");
  reads = 0;
  for (let i = MAX_RETAINED_BLOCKS; i < MAX_RETAINED_BLOCKS + 100; i++) setBoundedBlock(blocks, block(i), "active");
  expect(reads).toBeLessThanOrEqual(300);
  expect(blocks.size).toBe(MAX_RETAINED_BLOCKS); expect(blocks.has("0")).toBe(true);
  setBoundedBlock(blocks, { ...block(10000), id: "101" }, "active");
  expect([...blocks.values()].at(-1)?.id).toBe("101");
  setBoundedBlock(blocks, block(10001), undefined);
  expect(blocks.has("0")).toBe(false);
});

it("stops before paging past retained block capacity and marks the missing history", async () => {
  const store = new TimelineStore("");
  let calls = 0;
  const source: RegistryTimelineSource = {
    subscribe: () => Object.assign(() => {}, { ready: Promise.resolve() }),
    async refetch() {
      calls++;
      return { ...page, hasOlder: true, startCursor: { epoch: "e", seq: 10000 - calls * 200 }, entries: Array.from({ length: 200 }, (_, i) => {
        const seq = 10000 - calls * 200 + i;
        return { provider: "codex", timestamp: new Date(seq).toISOString(), seqStart: seq, seqEnd: seq, item: { type: "assistant_message" as const, text: "x" } };
      }) };
    },
  };
  const controller = createTimelineController(source, store, () => {});
  await setImmediate();
  await vi.waitFor(() => expect(calls).toBe(MAX_RETAINED_BLOCKS / 200), { interval: 1 });
  expect(calls).toBe(MAX_RETAINED_BLOCKS / 200);
  expect(store.snapshot()).toMatchObject({ historyLoaded: true, gap: true });
  expect(store.snapshot().blocks).toHaveLength(MAX_RETAINED_BLOCKS);
  controller.stop();
});

it("computes activity colour without constructing metric lines or touching usage", () => {
  const snapshot = { ...empty, blocks: [{ ...block(1), kind: "reasoning" as const }], get metrics(): TimelineSnapshot["metrics"] { throw new Error("read metrics for one colour"); } };
  expect(pulseActivityColor(snapshot)).toBe("accent");
});

it("releases the subscription returned after registry cleanup while the first list was pending", async () => {
  let resolve!: (value: Awaited<ReturnType<RegistryHost["paseo"]["agents"]["list"]>>) => void;
  const release = vi.fn(async () => {});
  const cleanup = createPulselineRegistry({ paseo: { agents: {
    list: () => new Promise(done => { resolve = done; }), subscribe: () => () => {}, ref: () => { throw new Error("unexpected timeline work"); },
  } }, addComposerPill: () => { throw new Error("unexpected registration"); } }, () => () => {});
  cleanup(); cleanup();
  resolve({ entries: [], pageInfo: { hasMore: false, nextCursor: null }, subscription: { release } });
  await setImmediate();
  expect(release).toHaveBeenCalledOnce();
  expect(cleanup.pendingWaits()).toBe(0);
});

it("completes the active turn using fallback identity when terminal event has no turnId", () => {
  const store = new TimelineStore("");
  store.ingestLive({ timestamp: 1000, event: { type: "turn_started", provider: "codex", turnId: "t" } });
  store.ingestLive({ timestamp: 4000, event: { type: "turn_completed", provider: "codex" } });
  expect(store.snapshot(10000)).toMatchObject({ busy: false, turnDurationMs: 3000, metrics: { chatDurationMs: { value: 3000 } } });
  store.accountingSizes();
  expect(store.snapshot().turnDurationMs).toBe(3000);
});

it("makes named live transitions authoritative over stale catalog snapshots without losing known starts", () => {
  const store = new TimelineStore("");
  store.updateAgent({ provider: "codex", activeTurn: { turnId: "t", startedAt: new Date(500).toISOString() } });
  store.updateAgent({ provider: "codex", lastUsage: { contextWindowUsedTokens: 50 } });
  expect(store.snapshot(900)).toMatchObject({ busy: true, turnDurationMs: 400 });
  store.ingestLive({ timestamp: 1000, event: { type: "turn_started", provider: "codex", turnId: "t" } });
  store.updateAgent({ provider: "codex", activeTurn: null });
  store.updateAgent({ provider: "codex", activeTurn: { turnId: "stale-other", startedAt: new Date(100).toISOString() } });
  store.updateAgent({ provider: "codex", activeTurn: { turnId: "t", startedAt: null } });
  expect(store.snapshot(2000)).toMatchObject({ busy: true, turnDurationMs: 1500 });
  store.ingestLive({ timestamp: 3000, event: { type: "turn_completed", provider: "codex", turnId: "t" } });
  store.updateAgent({ provider: "codex", activeTurn: { turnId: "t", startedAt: new Date(500).toISOString() } });
  expect(store.snapshot(5000)).toMatchObject({ busy: false, turnDurationMs: 2500 });
  store.updateAgent({ provider: "codex", activeTurn: { turnId: "new", startedAt: new Date(6000).toISOString() } });
  expect(store.snapshot(7000)).toMatchObject({ busy: true, turnDurationMs: 1000 });
});

it("promotes format units before rounding would cross 1000", () => {
  for (const value of [999.5, 999.6, 999.96, 1000]) {
    const view = buildPulseView({ ...empty, tokenTotals: { inputTokens: { value } }, metrics: { inputTokens: { value } }, outputRate: { value, approximate: true, turn: "last turn", turnId: "t", tokens: value, durationMs: 1000, source: "provider turn output" } });
    expect(view.metrics.find(line => line.id === "input")?.value).toBe("1k");
    expect(view.metrics.find(line => line.id === "output-rate")?.value).not.toMatch(/1000/);
  }
});

it("shares running-tool selection between strip, header, composer and colour, falling back to last block", () => {
  const tool: PulseBlock = { ...block(2), kind: "tool", metadata: { type: "tool", name: "Shell", status: "running", detail: "shell" } };
  const snapshot = { ...empty, busy: true, blocks: [block(1), tool, { ...block(3), kind: "reasoning" as const }] };
  expect(activePulseBlock(snapshot)).toBe(tool);
  expect(buildHistoryView(snapshot).segments.filter(segment => segment.active).map(segment => segment.id)).toEqual([tool.id]);
  expect(buildPulseView(snapshot).segments.at(-1)?.id).toBe(tool.id);
  expect(statusHeader(snapshot)).toBe("Running Shell"); expect(pulseActivityColor(snapshot)).toBe("statusWarning");
  const finished = { ...snapshot, blocks: [block(1), { ...tool, metadata: { ...tool.metadata!, type: "tool" as const, name: "Shell", detail: "shell", status: "completed" } }, block(3)] };
  expect(activePulseBlock(finished)?.id).toBe("3");
});


it("does not infer unused turn spans from block timestamps and exposes only two startTurn parameters", () => {
  const timed: PulseBlock = { ...block(1), turnId: "t", get timestamp(): number { throw new Error("unused turn duration scan"); } };
  expect(() => buildPulseView({ ...empty, busy: true, blocks: [timed] })).not.toThrow();
  expect(TimelineAccounting.prototype.startTurn.length).toBe(2);
});
