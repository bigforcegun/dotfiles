import type { AgentStreamEvent, AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { describe, expect, it } from "vitest";
import {
  heightIndexForTokens,
  normalizeStreamEvent,
  normalizeTimelineItem,
  usageMetrics,
  type TimelineSourceItem,
} from "./model";

const providers = ["claude", "opencode"] as const;

function block(item: TimelineSourceItem, provider: string, order = 1) {
  return normalizeTimelineItem({ item, provider, order, timestamp: order * 1_000, turnId: "turn-1" });
}

describe("normalized timeline model", () => {
  it("uses the original eight token-volume thresholds", () => {
    // Given
    const volumes = [16, 17, 64, 65, 128, 129, 256, 257, 512, 513, 1_024, 1_025, 2_048, 2_049];

    // When
    const heights = volumes.map(heightIndexForTokens);

    // Then
    expect(heights).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7]);
  });

  it("persists volume-derived heights for same-kind text and available tool payloads", () => {
    // Given
    const shortText = block({ type: "assistant_message", text: "tiny" }, "opencode");
    const longText = block({ type: "assistant_message", text: "x".repeat(2_052) }, "opencode", 2);
    const toolOutput = block({
      type: "tool_call", callId: "shell", name: "Shell", status: "completed", error: null,
      detail: { type: "shell", command: "run", output: "x".repeat(8_200) },
    }, "opencode", 3);
    const toolError = block({
      type: "tool_call", callId: "failed", name: "Read", status: "failed", error: "x".repeat(260),
      detail: { type: "read", filePath: "missing" },
    }, "opencode", 4);
    const payloadMissing = block({
      type: "tool_call", callId: "fallback", name: "Read", status: "completed", error: null,
      detail: { type: "read", filePath: "small" },
    }, "opencode", 5);

    // Then
    expect([shortText?.kind, longText?.kind]).toEqual(["text", "text"]);
    expect([shortText?.volumeTokens, shortText?.heightIndex]).toEqual([1, 0]);
    expect([longText?.volumeTokens, longText?.heightIndex]).toEqual([513, 5]);
    expect([toolOutput?.volumeTokens, toolOutput?.heightIndex]).toEqual([2_050, 7]);
    expect([toolError?.volumeTokens, toolError?.heightIndex]).toEqual([65, 2]);
    expect([payloadMissing?.volumeTokens, payloadMissing?.heightIndex]).toEqual([1, 0]);
  });

  it.each(providers)("maps the shared timeline contract for provider=%s", (provider) => {
    // Given
    const items: readonly TimelineSourceItem[] = [
      { type: "assistant_message", text: "answer" },
      { type: "user_message", text: "question" },
      { type: "reasoning", text: "thinking" },
      { type: "tool_call", callId: "r", name: "Read", detail: { type: "read", filePath: "a" }, status: "completed", error: null },
      { type: "tool_call", callId: "s", name: "Search", detail: { type: "search", query: "q" }, status: "completed", error: null },
      { type: "tool_call", callId: "f", name: "Fetch", detail: { type: "fetch", url: "https://example.test" }, status: "completed", error: null },
      { type: "tool_call", callId: "e", name: "Edit", detail: { type: "edit", filePath: "a" }, status: "completed", error: null },
      { type: "tool_call", callId: "w", name: "Write", detail: { type: "write", filePath: "b" }, status: "completed", error: null },
      { type: "tool_call", callId: "x", name: "Shell", detail: { type: "shell", command: "pwd" }, status: "completed", error: null },
      { type: "tool_call", callId: "bad", name: "Read", detail: { type: "read", filePath: "c" }, status: "failed", error: "denied" },
      { type: "notification", level: "warning", message: "notice" },
      { type: "compaction", status: "completed", trigger: "auto", preTokens: 42 },
      { type: "unknown", metadata: { source: "future" } },
    ];

    // When
    const normalized = items.map((item, index) => block(item, provider, index + 1));

    // Then
    expect(normalized.map((entry) => entry?.kind)).toEqual([
      "text", undefined, "reasoning", "read", "read", "read", "write", "write", "tool", "error", "other", "other", "other",
    ]);
    expect(normalized[10]?.metadata).toEqual({ type: "notification", level: "warning" });
    expect(normalized[11]?.metadata).toEqual({ type: "compaction", trigger: "auto", preTokens: 42 });
    expect(normalized[12]?.metadata).toEqual({ type: "unknown", sourceType: "unknown" });
  });

  it.each(providers)("maps terminal turn outcomes for provider=%s", (provider) => {
    // Given
    const completed: AgentStreamEvent = { type: "turn_completed", provider, turnId: "turn-1" };
    const failed: AgentStreamEvent = { type: "turn_failed", provider, turnId: "turn-2", error: "boom" };

    // When
    const results = [completed, failed].map((event, order) =>
      normalizeStreamEvent({ event, order, timestamp: order * 1_000 }),
    );

    // Then
    expect(results.map((entry) => entry?.kind)).toEqual(["success", "error"]);
  });

  it("marks observed metrics only and omits unavailable metrics", () => {
    // Given
    const reported = usageMetrics({
      inputTokens: 100,
      outputTokens: 40,
      cachedInputTokens: 25,
      totalCostUsd: 0.012,
      contextWindowMaxTokens: 200_000,
      contextWindowUsedTokens: 140,
    });

    // Then
    expect(Object.keys(reported).sort()).toEqual([
      "cachedInputTokens", "contextWindowMaxTokens", "contextWindowUsedTokens", "inputTokens", "outputTokens", "totalCostUsd",
    ]);
    expect(reported).not.toHaveProperty("providerTokensPerSecond");
    expect(reported).not.toHaveProperty("reasoningTokensPerSecond");
    expect(reported).not.toHaveProperty("cacheWriteTokens");
  });
});
