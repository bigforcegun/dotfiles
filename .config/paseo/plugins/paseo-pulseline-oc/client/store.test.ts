import { describe, expect, it } from "vitest";
import { TimelineStore, type TimelinePage } from "./store";

function page(input: Partial<TimelinePage> & Pick<TimelinePage, "epoch" | "entries">): TimelinePage {
  return {
    epoch: input.epoch,
    entries: input.entries,
    gap: input.gap ?? false,
    reset: input.reset ?? false,
    hasOlder: input.hasOlder ?? false,
    startCursor: input.startCursor ?? null,
  };
}

describe("timeline store", () => {
  it("combines paginated history with buffered live events and deduplicates tool lifecycle", () => {
    // Given
    const store = new TimelineStore("Pulseline · OpenCode");
    store.beginBootstrap();
    store.ingestLive({
      epoch: "epoch-1",
      seq: 4,
      timestamp: 4_000,
      event: {
        type: "timeline",
        provider: "opencode",
        turnId: "turn-1",
        item: { type: "tool_call", callId: "tool-1", name: "Edit", detail: { type: "edit", filePath: "a" }, status: "completed", error: null },
      },
    });

    // When
    store.ingestPage(page({
      epoch: "epoch-1",
      hasOlder: true,
      startCursor: { epoch: "epoch-1", seq: 2 },
      entries: [
        { provider: "opencode", turnId: "turn-1", timestamp: 2_000, seqStart: 2, seqEnd: 2, item: { type: "assistant_message", text: "answer" } },
        { provider: "opencode", turnId: "turn-1", timestamp: 3_000, seqStart: 3, seqEnd: 3, item: { type: "tool_call", callId: "tool-1", name: "Edit", detail: { type: "edit", filePath: "a" }, status: "running", error: null } },
      ],
    }));
    store.ingestPage(page({
      epoch: "epoch-1",
      entries: [{ provider: "opencode", turnId: "turn-1", timestamp: 1_000, seqStart: 1, seqEnd: 1, item: { type: "user_message", text: "question" } }],
    }));
    store.finishBootstrap();

    // Then
    expect(store.snapshot().blocks.map(({ kind }) => kind)).toEqual(["text", "write"]);
    expect(store.snapshot().blocks.filter(({ id }) => id === "tool:tool-1")).toHaveLength(1);
    expect(store.snapshot().metrics.toolTotalDurationMs).toEqual({ value: 1_000, approximate: true });
    expect(store.snapshot().metrics.toolAverageDurationMs).toEqual({ value: 1_000, approximate: true });
  });

  it("keeps arrival order after an explicit live sequence", () => {
    // Given
    const store = new TimelineStore("Pulseline · OpenCode");
    store.ingestLive({
      epoch: "epoch-1",
      seq: 3,
      timestamp: 1_000,
      event: {
        type: "timeline",
        provider: "opencode",
        item: { type: "assistant_message", text: "first" },
      },
    });

    // When
    store.ingestLive({
      epoch: "epoch-1",
      timestamp: 2_000,
      event: {
        type: "timeline",
        provider: "opencode",
        item: { type: "assistant_message", text: "second" },
      },
    });

    // Then
    expect(store.snapshot().blocks.map(({ text }) => text)).toEqual(["first", "second"]);
  });

  it("replaces epochs, records gaps, and ignores stale epoch events", () => {
    // Given
    const store = new TimelineStore("Pulseline · OpenCode");
    store.ingestPage(page({
      epoch: "old",
      entries: [{ provider: "claude", timestamp: 1_000, seqStart: 1, seqEnd: 1, item: { type: "assistant_message", text: "old" } }],
    }));

    // When
    store.replaceEpoch("new");
    store.ingestPage(page({
      epoch: "new",
      gap: true,
      reset: true,
      entries: [{ provider: "claude", timestamp: 2_000, seqStart: 2, seqEnd: 2, item: { type: "reasoning", text: "new" } }],
    }));
    store.ingestLive({ epoch: "old", seq: 3, timestamp: 3_000, event: { type: "timeline", provider: "claude", item: { type: "assistant_message", text: "stale" } } });
    store.finishBootstrap();

    // Then
    expect(store.snapshot()).toMatchObject({ epoch: "new", gap: true });
    expect(store.snapshot().blocks.map(({ kind }) => kind)).toEqual(["reasoning"]);
  });

  it("uses busy and exact-token fallbacks without inventing unavailable values", () => {
    // Given
    const store = new TimelineStore("Pulseline · OpenCode");

    // When / Then
    expect(store.snapshot().label).toBe("Pulseline · OpenCode");
    expect(store.snapshot().metrics).not.toHaveProperty("chatDurationMs");
    expect(store.snapshot().metrics).not.toHaveProperty("toolTotalDurationMs");
    expect(store.snapshot().metrics).not.toHaveProperty("toolAverageDurationMs");
    expect(store.snapshot().metrics).not.toHaveProperty("textRateCharsPerSecond");
    store.updateAgent({ provider: "opencode", activeTurn: { turnId: "turn-1", startedAt: null } });
    expect(store.snapshot().label).toBe("Pulseline · OpenCode · busy");
    store.updateAgent({ provider: "opencode", activeTurn: null, lastUsage: { inputTokens: 12, outputTokens: 3 } });
    expect(store.snapshot().label).toBe("Pulseline · OpenCode · 15 tok");
    expect(store.snapshot().metrics).not.toHaveProperty("reasoningTokensPerSecond");
  });

  it("marks client-observed turn and text rates as approximate", () => {
    // Given
    const store = new TimelineStore("Pulseline · OpenCode");
    store.ingestLive({ timestamp: 1_000, seq: 1, epoch: "e", event: { type: "turn_started", provider: "claude", turnId: "turn-1" } });
    store.ingestLive({ timestamp: 2_000, seq: 2, epoch: "e", event: { type: "timeline", provider: "claude", turnId: "turn-1", item: { type: "assistant_message", text: "four" } } });

    // When
    store.ingestLive({ timestamp: 3_000, seq: 3, epoch: "e", event: { type: "turn_completed", provider: "claude", turnId: "turn-1" } });

    // Then
    expect(store.snapshot().metrics.chatDurationMs).toEqual({ value: 2_000, approximate: true });
    expect(store.snapshot().metrics.textRateCharsPerSecond).toEqual({ value: 2, approximate: true });
  });

  it("marks historical turn and text rates as approximate", () => {
    // Given
    const store = new TimelineStore("Pulseline · OpenCode");

    // When
    store.ingestPage(page({
      epoch: "history",
      entries: [
        { provider: "opencode", turnId: "turn-1", timestamp: 1_000, seqStart: 1, seqEnd: 1, item: { type: "assistant_message", text: "four" } },
        { provider: "opencode", turnId: "turn-1", timestamp: 3_000, seqStart: 2, seqEnd: 2, item: { type: "reasoning", text: "done" } },
      ],
    }));

    // Then
    expect(store.snapshot().metrics.chatDurationMs).toEqual({ value: 2_000, approximate: true });
    expect(store.snapshot().metrics.textRateCharsPerSecond).toEqual({ value: 2, approximate: true });
  });
});
