// Volume model: how much a block actually carried, in estimated tokens, and the
// height bucket that follows from it. Kind decides colour; volume decides height.
// The thresholds are the original chat-pulse-line ones and are the only place a
// bar's height is decided.
import type { PulseTimelineItem } from "./types.ts";

const CHARS_PER_TOKEN = 4;
const THRESHOLDS = [16, 64, 128, 256, 512, 1024, 2048];
export const MAX_HEIGHT_INDEX = 7;

/** <=16 -> 0, <=64 -> 1, <=128 -> 2, <=256 -> 3, <=512 -> 4, <=1024 -> 5, <=2048 -> 6, else 7. */
export function heightIndexForTokens(tokens: number | undefined): number {
  if (tokens === undefined) return 0;
  for (const [index, limit] of THRESHOLDS.entries()) if (tokens <= limit) return index;
  return MAX_HEIGHT_INDEX;
}

/** Payload fields a provider may fill; everything else is metadata, not volume. */
const PAYLOAD_KEYS = [
  "output",
  "error",
  "raw",
  "title",
  "content",
  "result",
  "log",
  "text",
  "unifiedDiff",
  "newString",
  "oldString",
  "message",
  "annotations",
  "webResults",
  "commands",
  "actions",
  "input",
];

function charsOf(value: unknown, depth = 0): number {
  if (typeof value === "string") return value.length;
  if (typeof value === "number" || typeof value === "boolean") return String(value).length;
  if (value === null || typeof value !== "object" || depth >= 3) return 0;
  if (Array.isArray(value)) {
    return value.reduce((sum: number, item) => sum + charsOf(item, depth + 1), 0);
  }
  return Object.entries(value as Record<string, unknown>).reduce(
    (sum, [key, nested]) => sum + (PAYLOAD_KEYS.includes(key) ? charsOf(nested, depth + 1) : 0),
    0,
  );
}

function tokensOf(chars: number): number | undefined {
  return chars > 0 ? Math.ceil(chars / CHARS_PER_TOKEN) : undefined;
}

/**
 * Estimated tokens carried by one timeline item, or undefined when the provider
 * sent no payload at all — a running tool has produced nothing yet, and saying so
 * is more honest than inventing a size for it.
 */
export function estimateItemTokens(item: PulseTimelineItem): number | undefined {
  switch (item.type) {
    case "assistant_message":
    case "reasoning":
      return tokensOf(charsOf(item["text"]));
    case "error":
    case "notification":
      return tokensOf(charsOf(item["message"]));
    case "todo":
      return tokensOf(charsOf(item["items"]));
    case "compaction": {
      // The only item that reports a real token count instead of a payload.
      const pre = item["preTokens"];
      return typeof pre === "number" && pre > 0 ? pre : undefined;
    }
    case "tool_call":
      return tokensOf(charsOf(item["detail"]) + charsOf(item["error"]));
    default:
      return tokensOf(charsOf(item["data"]) + charsOf(item["text"]));
  }
}
