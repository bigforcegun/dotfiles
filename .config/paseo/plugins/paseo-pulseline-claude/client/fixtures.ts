// Provider-neutral fixtures. The provider name only rides along in the envelope;
// every assertion built on these entries must hold identically for each provider.
import type { PulseTimelineEntry, PulseTimelineItem } from "./types.ts";

export const PROVIDERS = ["claude", "opencode"] as const;
export type FixtureProvider = (typeof PROVIDERS)[number];

const BASE_MS = Date.parse("2026-09-12T10:00:00.000Z");

export function at(offsetSeconds: number): string {
  return new Date(BASE_MS + offsetSeconds * 1000).toISOString();
}

export function entry(
  seq: number,
  offsetSeconds: number,
  item: PulseTimelineItem,
  turnId = "turn-1",
): PulseTimelineEntry {
  return { seq, timestamp: at(offsetSeconds), turnId, item };
}

export function toolCall(
  callId: string,
  detailType: string,
  status: "running" | "completed" | "failed" | "canceled",
): PulseTimelineItem {
  return {
    type: "tool_call",
    callId,
    name: detailType,
    status,
    error: status === "failed" ? "boom" : null,
    detail: { type: detailType },
  };
}

/**
 * One scripted conversation, identical in shape for every provider: prompt,
 * reasoning, answer, a read tool that runs then completes, a write tool, a
 * failed shell tool, and three items that must land in `other`.
 */
export function conversation(_provider: FixtureProvider): PulseTimelineEntry[] {
  return [
    entry(1, 0, { type: "user_message", text: "please refactor the parser" }),
    entry(2, 1, { type: "reasoning", text: "thinking about the parser" }),
    entry(3, 2, { type: "assistant_message", text: "Reading the parser first." }),
    entry(4, 3, toolCall("call-read", "read", "running")),
    entry(5, 5, toolCall("call-read", "read", "completed")),
    entry(6, 6, toolCall("call-edit", "edit", "completed")),
    entry(7, 8, toolCall("call-shell", "shell", "failed")),
    entry(8, 9, { type: "notification", level: "warning", message: "context is filling up" }),
    entry(9, 10, { type: "compaction", status: "completed", trigger: "auto" }),
    entry(10, 11, { type: "todo", items: [{ text: "ship it", completed: false }] }),
    entry(11, 12, { type: "assistant_message", text: "Done. The parser is smaller now." }),
  ];
}

export const USAGE_FULL = {
  inputTokens: 18_000,
  cachedInputTokens: 9_000,
  outputTokens: 2_100,
  totalCostUsd: 0.42,
  contextWindowMaxTokens: 200_000,
  contextWindowUsedTokens: 124_000,
};
