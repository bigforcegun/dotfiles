import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it, vi } from "vitest";
import { TimelineStore, type TimelineEntry, type TimelinePage } from "./store";
import { buildPulseView } from "./pulse-view";
import { HistoryFacts } from "./history-facts";

interface ProbeRow { seqStart: number; seqEnd: number; offsetMs: number; type: string; textLength?: number; callId?: string; status?: "completed" | "failed"; detailType?: string }
const probe = JSON.parse(readFileSync(new URL("./fixtures/opencode-history-probe.json", import.meta.url), "utf8")) as { rows: ProbeRow[] };
const entries: TimelineEntry[] = probe.rows.map(row => ({ provider: "opencode", timestamp: row.offsetMs, seqStart: row.seqStart, seqEnd: row.seqEnd,
  item: row.type === "tool_call" ? { type: "tool_call", callId: row.callId!, name: "Anonymised tool", detail: { type: "unknown", input: null, output: null }, ...(row.status === "failed" ? { status: "failed", error: "redacted" } : { status: "completed", error: null }) }
    : row.type === "todo" ? { type: "todo", items: [] } : { type: row.type as "user_message" | "assistant_message" | "reasoning", text: "x".repeat(row.textLength ?? 0) },
}));
const page = (rows: readonly TimelineEntry[], extra: Partial<TimelinePage> = {}): TimelinePage => ({ epoch: "probe", reset: false, gap: false, hasOlder: false, startCursor: null, entries: rows, ...extra });
function load(rows: readonly TimelineEntry[]) {
  const store = new TimelineStore("");
  for (let end = rows.length; end > 0; end -= 40) store.ingestPage(page(rows.slice(Math.max(0, end - 40), end), { hasOlder: end > 40 }));
  store.finishBootstrap(); return store;
}

it("recovers closed OpenCode spans and text rate from the real anonymised boundary shapes, despite backwards part timestamps", () => {
  const store = load(entries), snapshot = store.snapshot();
  expect(snapshot.metrics.toolCount?.value).toBe(120);
  expect(snapshot.metrics.chatDurationMs).toEqual({ value: 1171808, approximate: true });
  expect(snapshot.turnDurationMs).toBe(187288);
  expect(snapshot.metrics.textRateCharsPerSecond).toEqual({ value: 9410 * 1000 / 1171808, approximate: true });
  expect(snapshot.metrics.toolTotalDurationMs).toBeUndefined();
  expect(snapshot.metrics.toolAverageDurationMs).toBeUndefined();
  for (const id of ["chat", "turn", "text-rate"]) {
    const line = buildPulseView(snapshot).metrics.find(line => line.id === id)!;
    expect(line.value).toMatch(/^~/); expect(line.hint).toContain("derived from history");
  }
  const before = snapshot.metrics;
  store.ingestPage(page(entries.slice(-40), { hasOlder: true })); store.ingestPage(page(entries));
  expect(store.snapshot().metrics).toEqual(before); // Refetch must not accumulate text or spans twice.
});

it("prefers native turnId grouping when supplied and retains the same probe spans", () => {
  let id = "";
  const native = entries.map(entry => { if (entry.item.type === "user_message") id = `native-${entry.seqStart}`; return { ...entry, turnId: id }; });
  const snapshot = load(native).snapshot();
  expect(snapshot.metrics.chatDurationMs?.value).toBe(1171808);
  expect(snapshot.turnDurationMs).toBe(187288);
  expect(snapshot.metrics.textRateCharsPerSecond?.value).toBe(9410 * 1000 / 1171808);
});

it.each(["identical", "import-burst"] as const)("rejects %s history timestamps without inventing time-based counters", shape => {
  const snapshot = load(entries.map((entry, i) => ({ ...entry, turnId: "imported", timestamp: 1700000000000 + (shape === "identical" ? 0 : i) }))).snapshot();
  expect(snapshot.metrics.toolCount?.value).toBe(120);
  for (const field of ["chatDurationMs", "textRateCharsPerSecond", "toolTotalDurationMs", "toolAverageDurationMs"] as const) expect(snapshot.metrics[field]).toBeUndefined();
  expect(snapshot.turnDurationMs).toBeUndefined();
});

it("recovers only actual running→terminal pairs, even when the older running row arrives after a completed block", () => {
  const tool = entries.find(entry => entry.item.type === "tool_call")!.item as Extract<TimelineEntry["item"], { type: "tool_call" }>;
  const rows: TimelineEntry[] = [
    { provider: "opencode", seqStart: 1, seqEnd: 1, timestamp: 1000, item: { type: "user_message", text: "x" } },
    { provider: "opencode", seqStart: 2, seqEnd: 2, timestamp: 2000, item: { ...tool, status: "running", error: null } },
    { provider: "opencode", seqStart: 3, seqEnd: 3, timestamp: 4000, item: { ...tool, status: "completed", error: null } },
    { provider: "opencode", seqStart: 4, seqEnd: 4, timestamp: 5000, item: { type: "assistant_message", text: "xxxx" } },
  ];
  const store = new TimelineStore(""); store.ingestPage(page(rows.slice(2), { hasOlder: true })); store.ingestPage(page(rows.slice(0, 2))); store.finishBootstrap();
  expect(store.snapshot().blocks.find(block => block.metadata?.type === "tool")?.metadata).toMatchObject({ status: "completed" });
  expect(store.snapshot().metrics.toolTotalDurationMs).toEqual({ value: 2000, approximate: true });
  expect(store.snapshot().metrics.toolAverageDurationMs).toEqual({ value: 2000, approximate: true });
  expect(buildPulseView(store.snapshot()).metrics.find(line => line.id === "tool-total")?.hint).toContain("derived from history");
});

it("combines earlier history and live spans without counting refetched live text or a turn twice", () => {
  const store = new TimelineStore(""); store.ingestPage(page([])); store.finishBootstrap();
  store.ingestLive({ seq: 10, timestamp: 2000, event: { type: "turn_started", provider: "opencode", turnId: "live" } });
  store.ingestLive({ seq: 11, timestamp: 3000, event: { type: "timeline", provider: "opencode", turnId: "live", item: { type: "assistant_message", text: "xxxx" } } });
  store.ingestLive({ seq: 12, timestamp: 4000, event: { type: "turn_completed", provider: "opencode", turnId: "live" } });
  store.ingestPage(page([
    { provider: "opencode", seqStart: 1, seqEnd: 1, timestamp: 1000, item: { type: "user_message", text: "x" } },
    { provider: "opencode", seqStart: 2, seqEnd: 2, timestamp: 1500, item: { type: "assistant_message", text: "xxxx" } },
    { provider: "opencode", seqStart: 9, seqEnd: 9, timestamp: 2000, item: { type: "user_message", text: "x" } },
    { provider: "opencode", seqStart: 11, seqEnd: 11, timestamp: 3000, item: { type: "assistant_message", text: "xxxx" } },
  ]));
  expect(store.snapshot().metrics.chatDurationMs).toEqual({ value: 2500, approximate: true });
  expect(store.snapshot().metrics.textRateCharsPerSecond?.value).toBe(8 * 1000 / 2500);
  expect(store.snapshot().turnDurationMs).toBe(2000);
});

it("epoch replacement clears inferred history; orphan rows do not become an invented chat turn", () => {
  const store = load(entries);
  expect(store.snapshot().turnDurationMs).toBe(187288);
  store.ingestPage(page([{ provider: "opencode", timestamp: 10000, seqStart: 1, seqEnd: 1, item: { type: "assistant_message", text: "x" } }], { epoch: "new" }));
  expect(store.snapshot().turnDurationMs).toBeUndefined();
  expect(store.snapshot().metrics.chatDurationMs).toBeUndefined();
});

it("leaves provider-only counters unavailable with an explicit missing-report explanation", () => {
  const snapshot = load(entries).snapshot();
  for (const id of ["input", "output", "cache", "output-rate", "context", "cost"]) {
    const line = buildPulseView(snapshot).metrics.find(line => line.id === id)!;
    expect(line.value).toBe("—"); expect(line.hint).toContain("not reported for this chat");
  }
});

it("does not divide text from an untimed history turn by another turn's duration", () => {
  const store = new TimelineStore("");
  store.ingestPage(page([
    { provider: "opencode", turnId: "timed", seqStart: 1, seqEnd: 1, timestamp: 1000, item: { type: "user_message", text: "x" } },
    { provider: "opencode", turnId: "timed", seqStart: 2, seqEnd: 2, timestamp: 3000, item: { type: "assistant_message", text: "xxxx" } },
    { provider: "opencode", turnId: "untimed", seqStart: 3, seqEnd: 3, timestamp: 5000, item: { type: "assistant_message", text: "x".repeat(100) } },
  ]));
  expect(store.snapshot().metrics.textRateCharsPerSecond).toEqual({ value: 2, approximate: true });
});

it("ignores a backwards tool span instead of counting a fake zero-duration pair in the average", () => {
  const tool = entries.find(entry => entry.item.type === "tool_call")!.item as Extract<TimelineEntry["item"], { type: "tool_call" }>;
  const rows: TimelineEntry[] = [
    { provider: "opencode", timestamp: 1000, seqStart: 1, seqEnd: 1, item: { type: "user_message", text: "x" } },
    ...([ ["bad", "running", 4000], ["bad", "completed", 3000], ["good", "running", 5000], ["good", "completed", 7000] ] as const).map(([callId, status, timestamp], index) => ({ provider: "opencode", timestamp, seqStart: index + 2, seqEnd: index + 2, item: { ...tool, callId, status, error: null } })),
  ];
  const snapshot = load(rows).snapshot();
  expect(snapshot.metrics.toolCount?.value).toBe(2);
  expect(snapshot.metrics.toolTotalDurationMs?.value).toBe(2000);
  expect(snapshot.metrics.toolAverageDurationMs?.value).toBe(2000);
});

it("does not replay or scan historical facts on live events or clock ticks", () => {
  const derive = vi.spyOn(HistoryFacts.prototype, "derive");
  try {
    const store = load(entries), pages = derive.mock.calls.length;
    store.ingestLive({ seq: 2000, timestamp: 20000000, event: { type: "turn_started", provider: "opencode", turnId: "live" } });
    for (let seq = 2001; seq < 2010; seq++) {
      store.ingestLive({ seq, timestamp: 20000000 + seq, event: { type: "timeline", provider: "opencode", turnId: "live", item: { type: "assistant_message", text: "xxxx" } } });
      store.snapshot(21000000 + seq);
    }
    expect(derive).toHaveBeenCalledTimes(pages);
  } finally { derive.mockRestore(); }
});
