// Timeline item -> pulse block. Pure, provider-neutral, no timing state.
import { estimateItemTokens, heightIndexForTokens } from "./volume.ts";
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

export function blockFromEntry(entry: PulseTimelineEntry): PulseBlock | null {
  const classified = classifyItem(entry.item);
  if (!classified) return null;
  // Volume is measured once, here, and travels with the block: a passive row keeps
  // the height its own payload earned, whatever its kind.
  const volumeTokens = estimateItemTokens(entry.item);
  return {
    key: classified.key ?? `seq:${entry.seq}`,
    kind: classified.kind,
    startedAt: entry.timestamp,
    endedAt: classified.pending ? undefined : entry.timestamp,
    turnId: entry.turnId,
    reason: classified.reason,
    label: classified.label,
    volumeTokens,
    heightIndex: heightIndexForTokens(volumeTokens),
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
    startedAt: at,
    endedAt: at,
    turnId,
    reason: phase === "canceled" ? "unknown" : undefined,
    // A turn outcome carries no payload of its own.
    heightIndex: 0,
    pending: false,
  };
}
