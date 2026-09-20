import type { PaseoAgentStream } from "@getpaseo/client";
import type { AgentTimelineItem, AgentUsage } from "@getpaseo/protocol/agent-types";
import { pulseVolume, textTokenEstimate, toolTokenEstimate, type PulseHeightIndex } from "./volume";

export { heightIndexForTokens, type PulseHeightIndex } from "./volume";

export type StreamEvent = PaseoAgentStream["event"];

export type PulseKind = "text" | "reasoning" | "read" | "write" | "tool" | "error" | "success" | "other";

export type PulseMetadata =
  | { readonly type: "notification"; readonly level: "info" | "warning" | "error" }
  | { readonly type: "compaction"; readonly trigger?: "auto" | "manual"; readonly preTokens?: number }
  | { readonly type: "unknown"; readonly sourceType: string }
  | { readonly type: "tool"; readonly name: string; readonly detail: string; readonly status: string }
  | { readonly type: "turn"; readonly outcome: "completed" | "failed" | "canceled" };

export type TimelineSourceItem =
  | AgentTimelineItem
  | { readonly type: "unknown"; readonly metadata: Readonly<Record<string, unknown>> };

export interface PulseBlock {
  readonly id: string;
  readonly kind: PulseKind;
  readonly order: number;
  readonly timestamp: number;
  readonly volumeTokens: number;
  readonly heightIndex: PulseHeightIndex;
  readonly turnId?: string;
  readonly text?: string;
  readonly metadata?: PulseMetadata;
}

export interface MetricValue {
  readonly value: number;
  readonly approximate?: true;
}

export interface PulseMetrics {
  readonly inputTokens?: MetricValue;
  readonly outputTokens?: MetricValue;
  readonly cachedInputTokens?: MetricValue;
  readonly totalCostUsd?: MetricValue;
  readonly contextWindowMaxTokens?: MetricValue;
  readonly contextWindowUsedTokens?: MetricValue;
  readonly chatDurationMs?: MetricValue;
  readonly toolCount?: MetricValue;
  readonly toolTotalDurationMs?: MetricValue;
  readonly toolAverageDurationMs?: MetricValue;
  readonly textRateCharsPerSecond?: MetricValue;
}

interface TimelineInput {
  readonly item: TimelineSourceItem;
  readonly provider: string;
  readonly order: number;
  readonly timestamp: number;
  readonly turnId?: string;
}

interface StreamInput {
  readonly event: StreamEvent;
  readonly order: number;
  readonly timestamp: number;
}

function context(input: TimelineInput, id: string, volumeTokens = 1) {
  return {
    id,
    order: input.order,
    timestamp: input.timestamp,
    ...pulseVolume(volumeTokens),
    ...(input.turnId ? { turnId: input.turnId } : {}),
  };
}

function toolKind(detail: AgentTimelineItem & { readonly type: "tool_call" }): PulseKind {
  if (detail.status === "failed") return "error";
  switch (detail.detail.type) {
    case "read":
    case "search":
    case "fetch":
      return "read";
    case "edit":
    case "write":
      return "write";
    case "shell":
    case "worktree_setup":
    case "sub_agent":
    case "plain_text":
    case "plan":
    case "unknown":
      return "tool";
  }
}

export function normalizeTimelineItem(input: TimelineInput): PulseBlock | undefined {
  const item = input.item;
  switch (item.type) {
    case "user_message":
      return undefined;
    case "assistant_message":
      return { ...context(input, `text:${item.messageId ?? input.order}`, textTokenEstimate(item.text)), kind: "text", text: item.text };
    case "reasoning":
      return { ...context(input, `reasoning:${input.order}`, textTokenEstimate(item.text)), kind: "reasoning", text: item.text };
    case "tool_call":
      return {
        ...context(input, `tool:${item.callId}`, toolTokenEstimate(item)),
        kind: toolKind(item),
        text: item.name,
        metadata: { type: "tool", name: item.name, detail: item.detail.type, status: item.status },
      };
    case "error":
      return { ...context(input, `error:${input.order}`, textTokenEstimate(item.message)), kind: "error", text: item.message };
    case "notification":
      return {
        ...context(input, `notification:${input.order}`),
        kind: "other",
        text: item.message,
        metadata: { type: "notification", level: item.level },
      };
    case "compaction":
      return {
        ...context(input, `compaction:${input.order}`),
        kind: "other",
        metadata: {
          type: "compaction",
          ...(item.trigger ? { trigger: item.trigger } : {}),
          ...(item.preTokens === undefined ? {} : { preTokens: item.preTokens }),
        },
      };
    case "todo":
    case "plugin":
    case "unknown":
      return {
        ...context(input, `${item.type}:${input.order}`),
        kind: "other",
        metadata: { type: "unknown", sourceType: item.type },
      };
  }
}

export function normalizeStreamEvent(input: StreamInput): PulseBlock | undefined {
  const event = input.event;
  switch (event.type) {
    case "timeline":
      return normalizeTimelineItem({
        item: event.item,
        provider: event.provider,
        order: input.order,
        timestamp: input.timestamp,
        ...(event.turnId ? { turnId: event.turnId } : {}),
      });
    case "turn_completed":
      return {
        id: `turn:${event.turnId ?? input.order}`,
        kind: "success",
        order: input.order,
        timestamp: input.timestamp,
        ...pulseVolume(event.usage?.outputTokens ?? 1),
        ...(event.turnId ? { turnId: event.turnId } : {}),
        metadata: { type: "turn", outcome: "completed" },
      };
    case "turn_failed":
      return {
        id: `turn:${event.turnId ?? input.order}`,
        kind: "error",
        order: input.order,
        timestamp: input.timestamp,
        ...pulseVolume(textTokenEstimate(event.error)),
        ...(event.turnId ? { turnId: event.turnId } : {}),
        text: event.error,
        metadata: { type: "turn", outcome: "failed" },
      };
    case "turn_canceled":
      return {
        id: `turn:${event.turnId ?? input.order}`,
        kind: "other",
        order: input.order,
        timestamp: input.timestamp,
        ...pulseVolume(textTokenEstimate(event.reason)),
        ...(event.turnId ? { turnId: event.turnId } : {}),
        text: event.reason,
        metadata: { type: "turn", outcome: "canceled" },
      };
    case "thread_started":
    case "turn_started":
    case "permission_requested":
    case "permission_resolved":
    case "attention_required":
      return undefined;
  }
}

export function usageMetrics(usage: AgentUsage): PulseMetrics {
  return {
    ...(usage.inputTokens === undefined ? {} : { inputTokens: { value: usage.inputTokens } }),
    ...(usage.outputTokens === undefined ? {} : { outputTokens: { value: usage.outputTokens } }),
    ...(usage.cachedInputTokens === undefined
      ? {}
      : { cachedInputTokens: { value: usage.cachedInputTokens } }),
    ...(usage.totalCostUsd === undefined ? {} : { totalCostUsd: { value: usage.totalCostUsd } }),
    ...(usage.contextWindowMaxTokens === undefined
      ? {}
      : { contextWindowMaxTokens: { value: usage.contextWindowMaxTokens } }),
    ...(usage.contextWindowUsedTokens === undefined
      ? {}
      : { contextWindowUsedTokens: { value: usage.contextWindowUsedTokens } }),
  };
}
