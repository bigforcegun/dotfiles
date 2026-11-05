import { describe, expect, it } from "vitest";
import { TimelineStore, type TimelineEntry } from "./store";
import { buildHistoryView, buildPulseView } from "./pulse-view";
import type { StreamEvent } from "./model";

function emit(store: TimelineStore, seq: number, event: StreamEvent) {
  store.ingestLive({ epoch: "e", seq, timestamp: seq * 1000, event });
}
function think(store: TimelineStore, seq: number, text: string, turnId = "t") {
  emit(store, seq, { type: "timeline", provider: "codex", turnId, item: { type: "reasoning", text } });
}
function history(store: TimelineStore, entries: TimelineEntry[]) {
  store.ingestPage({ epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, entries });
}
function row(start: number, end: number, text: string): TimelineEntry {
  return { provider: "codex", turnId: "t", timestamp: start * 1000, seqStart: start, seqEnd: end, item: { type: "reasoning", text } };
}

describe("growing reasoning display", () => {
  it("keeps one stable, growing, active column in both surfaces", () => {
    const store = new TimelineStore("");
    emit(store, 1, { type: "turn_started", provider: "codex", turnId: "t" });
    think(store, 2, "a".repeat(32));
    const first = store.snapshot();
    think(store, 3, "b".repeat(128));
    const next = store.snapshot();
    expect(next.blocks).toHaveLength(1);
    expect(next.blocks[0]).toMatchObject({ id: first.blocks[0]!.id, order: 3, text: "a".repeat(32) + "b".repeat(128), volumeTokens: 40 });
    expect(next.blocks[0]!.heightIndex).toBeGreaterThan(first.blocks[0]!.heightIndex);
    expect(next.activityBlock).toBe(next.blocks[0]);
    expect(buildPulseView(next).segments).toHaveLength(1);
    expect(buildHistoryView(next).segments).toHaveLength(1);
    expect(buildHistoryView(next).segments[0]!.active).toBe(true);
    expect(store.snapshot(9999).blocks).toBe(next.blocks);
    expect(first.blocks[0]!.text).toBe("a".repeat(32));
    expect(next.metrics).not.toHaveProperty("outputTokens");
  });

  it.each(["tool", "text", "user", "turn", "gap"] as const)("respects a %s boundary", boundary => {
    const store = new TimelineStore("");
    think(store, 1, "before");
    if (boundary === "tool") emit(store, 2, { type: "timeline", provider: "codex", turnId: "t", item: { type: "tool_call", callId: "call", name: "Read", detail: { type: "read", filePath: "a" }, status: "completed", error: null } });
    if (boundary === "text" || boundary === "user") emit(store, 2, { type: "timeline", provider: "codex", turnId: "t", item: { type: boundary === "text" ? "assistant_message" : "user_message", text: "boundary" } });
    think(store, boundary === "turn" ? 2 : 3, "after", boundary === "turn" ? "next" : "t");
    expect(store.snapshot().blocks.filter(block => block.kind === "reasoning").map(block => block.text)).toEqual(["before", "after"]);
  });

  it("keeps canonical replacement, partial refetch and replay from doubling volume", () => {
    const store = new TimelineStore("");
    think(store, 2, "abcd"); think(store, 3, "efgh"); think(store, 4, "ijkl");
    const id = store.snapshot().blocks[0]!.id;
    history(store, [row(2, 3, "abcdefgh")]);
    expect(store.snapshot().blocks).toHaveLength(1);
    expect(store.snapshot().blocks[0]).toMatchObject({ id, text: "abcdefghijkl", volumeTokens: 3 });
    history(store, [row(2, 4, "abcdefghijkl")]);
    think(store, 3, "replay");
    expect(store.snapshot().blocks[0]).toMatchObject({ id, text: "abcdefghijkl", volumeTokens: 3 });
    think(store, 5, "mnop");
    expect(store.snapshot().blocks[0]).toMatchObject({ id, text: "abcdefghijklmnop", volumeTokens: 4 });
    expect(store.checkpoint()!.sequences).toEqual([4, 5]);
    expect(store.oldestCursor()).toEqual({ epoch: "e", seq: 2 });
  });

  it("joins reverse-paged history and clears runs on epoch replacement", () => {
    const store = new TimelineStore("");
    history(store, [row(3, 4, "efgh")]);
    history(store, [row(1, 2, "abcd")]);
    expect(store.snapshot().blocks).toHaveLength(1);
    expect(store.snapshot().blocks[0]).toMatchObject({ id: "reasoning:1", text: "abcdefgh" });
    store.replaceEpoch("new"); store.finishBootstrap();
    store.ingestLive({ epoch: "new", seq: 1, timestamp: 1000, event: { type: "timeline", provider: "codex", turnId: "t", item: { type: "reasoning", text: "new" } } });
    expect(store.snapshot().blocks.map(block => block.text)).toEqual(["new"]);
  });
});
