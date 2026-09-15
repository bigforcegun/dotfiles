import type { AgentStreamEvent, AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { describe, expect, it } from "vitest";
import {
  formatMetric,
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

    // When
    const displays = {
      exact: formatMetric(reported.inputTokens),
      observed: formatMetric({ value: 320, approximate: true }),
    };

    // Then
    expect(displays).toEqual({ exact: "100", observed: "~320" });
    expect(Object.keys(reported).sort()).toEqual([
      "cachedInputTokens", "contextWindowMaxTokens", "contextWindowUsedTokens", "inputTokens", "outputTokens", "totalCostUsd",
    ]);
    expect(reported).not.toHaveProperty("providerTokensPerSecond");
    expect(reported).not.toHaveProperty("reasoningTokensPerSecond");
    expect(reported).not.toHaveProperty("cacheWriteTokens");
  });
});
