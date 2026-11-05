import { describe, expect, it, vi } from "vitest";
import { TimelineAccounting } from "./store-accounting";
import { TimelineStore, type TimelinePage, type TimelineSnapshot } from "./store";
import { buildHistoryView, buildPulseView, statusHeader } from "./pulse-view";
import { createPulselineRuntime } from "./runtime";

const empty: TimelineSnapshot = { busy: false, gap: false, blocks: [], metrics: {}, label: "" };
const page: TimelinePage = { epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, entries: [
  { provider: "opencode", turnId: "t", timestamp: 1000, seqStart: 1, seqEnd: 1, item: { type: "assistant_message", messageId: "m", text: "1234567890" } },
] };

describe("UI rework regressions", () => {
  it("does not combine latest output usage with a chat-wide duration", () => {
    const snapshot = { ...empty, metrics: { outputTokens: { value: 500 }, chatDurationMs: { value: 10000, approximate: true as const } } };
    expect(buildPulseView(snapshot).metrics.find(line => line.id === "output-rate")?.value).toBe("—");
  });

  it("makes the exact diagnostic double-observe case idempotent", () => {
    const accounting = new TimelineAccounting();
    accounting.startTurn("t", 0);
    const item = { type: "assistant_message" as const, text: "1234567890" };
    accounting.observeItem(item, "t", 1000);
    accounting.observeItem(item, "t", 1000);
    accounting.completeTurn("t", 2000);
    expect(accounting.metrics(false).textRateCharsPerSecond).toEqual({ value: 5, approximate: true });
  });

  it("deduplicates overlapping pages and accounts replacement message snapshots by delta", () => {
    const store = new TimelineStore("");
    store.ingestPage(page);
    store.ingestPage(page);
    store.ingestLive({ epoch: "e", seq: 2, timestamp: 2000, event: { type: "timeline", provider: "opencode", turnId: "t", item: { type: "assistant_message", messageId: "m", text: "12345678901234567890" } } });
    store.ingestPage(page); // older snapshot cannot shrink the newer message
    store.ingestLive({ epoch: "e", seq: 3, timestamp: 3000, event: { type: "turn_completed", provider: "opencode", turnId: "t" } });
    expect(store.snapshot().blocks.find(block => block.id === "text:m")?.text).toHaveLength(20);
    expect(store.snapshot().metrics.textRateCharsPerSecond).toEqual({ value: 10, approximate: true });
  });

  it("ticks the turn from its start through silence and freezes at completion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    let tick = () => {};
    const runtime = createPulselineRuntime({ label: "", agent: { provider: "opencode", activeTurn: { turnId: "t", startedAt: new Date(1000).toISOString() } },
      timeline: () => ({ subscribe: () => Object.assign(() => {}, { ready: Promise.resolve() }), refetch: async () => ({ ...page, entries: [], error: null }) }),
      schedule: callback => { tick = callback; return () => {}; }, onSnapshot: () => {},
    });
    const unmount = runtime.subscribe(() => {});
    await Promise.resolve(); await Promise.resolve();
    vi.setSystemTime(6500); tick();
    expect(runtime.getSnapshot().turnDurationMs).toBe(5500);
    expect(buildPulseView(runtime.getSnapshot()).metrics.find(line => line.id === "turn")?.value).toBe("~00:05");
    unmount(); runtime.dispose(); vi.useRealTimers();
    const store = new TimelineStore("");
    store.ingestLive({ timestamp: 1000, event: { type: "turn_started", provider: "opencode", turnId: "t" } });
    store.ingestLive({ timestamp: 6500, event: { type: "turn_completed", provider: "opencode", turnId: "t" } });
    expect(store.snapshot(20000).turnDurationMs).toBe(5500);
  });

  it("distinguishes missing, zero and small positive costs", () => {
    const cost = (value?: number) => buildPulseView({ ...empty, metrics: value === undefined ? {} : { totalCostUsd: { value } } }).metrics.find(line => line.id === "cost")?.value;
    expect([cost(), cost(0), cost(.001), cost(1.2)]).toEqual(["—", "$0.00", "<$0.01", "$1.20"]);
  });

  it("always exposes the same twelve slots and exact tooltip facts", () => {
    const unavailable = buildPulseView(empty).metrics;
    expect(unavailable.map(line => line.id)).toEqual(["input", "output", "cache", "output-rate", "text-rate", "turn", "chat", "tool-count", "tool-average", "tool-total", "context", "cost"]);
    expect(unavailable.every(line => line.value === "—")).toBe(true);
    const input = buildPulseView({ ...empty, tokenTotals: { inputTokens: { value: 1234, approximate: true } }, metrics: { inputTokens: { value: 1234 } } }).metrics[0]!;
    expect(input.value).toBe("~1.2k");
    expect(input.hint).toContain("Chat sum 1234 (~ approximate)");
  });

  it("renders more than 36 bars in chronological order, retaining tool metadata", () => {
    const blocks = Array.from({ length: 80 }, (_, order) => ({ id: String(order), kind: "tool" as const, order, timestamp: order, volumeTokens: 1, heightIndex: 0 as const,
      metadata: { type: "tool" as const, name: "Read", detail: "read", status: order === 1 ? "running" : "completed" } }));
    const view = buildHistoryView({ ...empty, busy: true, blocks });
    expect(view.segments.map(segment => segment.id)).toEqual(blocks.map(block => block.id));
    expect(view.segments[1]?.active).toBe(true);
    expect(view.segments.at(-1)?.active).toBe(false);
    expect(view.segments[1]?.metadata).toEqual(blocks[1]?.metadata);
    expect(buildPulseView({ ...empty, busy: true, blocks }, 12).segments).toHaveLength(12);
  });

  it("exposes loading, failure, idle, working and running tool states", () => {
    expect(statusHeader({ ...empty, historyLoaded: false })).toBe("Loading…");
    expect(statusHeader({ ...empty, historyLoaded: true, historyFailed: true })).toBe("History unavailable");
    expect(statusHeader(empty)).toBe("No activity yet");
    expect(statusHeader({ ...empty, busy: true })).toBe("Working");
    const store = new TimelineStore(""); store.ingestPage(page); store.finishBootstrap();
    expect(statusHeader(store.snapshot())).toBe("Idle");
    store.ingestLive({ epoch: "e", seq: 2, timestamp: 2000, event: { type: "turn_started", provider: "opencode", turnId: "t" } });
    store.ingestLive({ epoch: "e", seq: 3, timestamp: 3000, event: { type: "timeline", provider: "opencode", turnId: "t", item: { type: "tool_call", callId: "c", name: "Read", detail: { type: "read", filePath: "a" }, status: "running", error: null } } });
    expect(statusHeader(store.snapshot())).toBe("Running Read");
  });
});
