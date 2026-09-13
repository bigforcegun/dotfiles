// Timeline item -> pulse block. Pure, provider-neutral, no timing state.
import type {
  PulseBlock,
  PulseBlockKind,
  PulseOtherReason,
  PulseTimelineEntry,
  PulseTimelineItem,
} from "./types.ts";

const READ_DETAILS = new Set(["read", "search", "fetch"]);
const WRITE_DETAILS = new Set(["edit", "write"]);
const OTHER_REASONS: Record<string, PulseOtherReason> = {
  todo: "todo",
  plugin: "plugin",
  notification: "notification",
  compaction: "compaction",
};

export interface PulseClassification {
  readonly kind: PulseBlockKind;
  readonly reason?: PulseOtherReason | undefined;
  readonly key?: string | undefined;
  readonly label?: string | undefined;
  readonly pending: boolean;
}

function detailKind(item: PulseTimelineItem): PulseBlockKind {
  const detail = item["detail"];
  const type =
    typeof detail === "object" && detail !== null
      ? (detail as { type?: unknown }).type
      : undefined;
  if (typeof type !== "string") return "tool";
  if (READ_DETAILS.has(type)) return "read";
  if (WRITE_DETAILS.has(type)) return "write";
  return "tool";
}

/** Returns null for items that must not draw an assistant pulse block. */
export function classifyItem(item: PulseTimelineItem): PulseClassification | null {
  switch (item.type) {
    case "user_message":
      return null;
    case "assistant_message":
      return { kind: "text", pending: false };
    case "reasoning":
      return { kind: "reasoning", pending: false };
    case "error":
      return { kind: "error", pending: false };
    case "tool_call": {
      const callId = typeof item["callId"] === "string" ? item["callId"] : "unknown";
      const status = item["status"];
      const pending = status === "running";
      const kind = status === "failed" ? "error" : detailKind(item);
      const name = typeof item["name"] === "string" ? item["name"] : undefined;
      return { kind, key: `tool:${callId}`, label: name, pending };
    }
    default: {
      const reason = OTHER_REASONS[item.type] ?? "unknown";
      return { kind: "other", reason, pending: false };
    }
  }
}

function textLength(item: PulseTimelineItem): number {
  const text = item["text"];
  if (typeof text === "string") return text.length;
  if (item.type === "tool_call") return 240;
  return 80;
}

/** Log-scaled so one long answer cannot flatten every other block. */
export function itemWeight(item: PulseTimelineItem): number {
  const scaled = Math.log10(1 + textLength(item)) / 4;
  return Math.min(1, Math.max(0.05, Number(scaled.toFixed(3))));
}

export function blockFromEntry(entry: PulseTimelineEntry): PulseBlock | null {
  const classified = classifyItem(entry.item);
  if (!classified) return null;
  return {
    key: classified.key ?? `seq:${entry.seq}`,
    kind: classified.kind,
    weight: itemWeight(entry.item),
    startedAt: entry.timestamp,
    endedAt: classified.pending ? undefined : entry.timestamp,
    turnId: entry.turnId,
    reason: classified.reason,
    label: classified.label,
    pending: classified.pending,
  };
}

export function turnBlock(
  phase: "completed" | "failed" | "canceled",
  turnId: string | undefined,
  at: string,
): PulseBlock {
  const kind: PulseBlockKind =
    phase === "completed" ? "success" : phase === "failed" ? "error" : "other";
  return {
    key: `turn:${turnId ?? "unknown"}:${phase}`,
    kind,
    weight: 0.25,
    startedAt: at,
    endedAt: at,
    turnId,
    reason: phase === "canceled" ? "unknown" : undefined,
    pending: false,
  };
}
