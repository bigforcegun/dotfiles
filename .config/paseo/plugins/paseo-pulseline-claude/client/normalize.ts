// Wire envelopes -> model inputs. Everything arriving from the daemon is treated
// as unknown and validated here; a shape this module does not recognise is
// dropped rather than guessed at.
import type { PulseInput } from "./model.ts";
import type { PulseTimelineEntry, PulseTurnPhase, PulseUsage } from "./types.ts";

const TURN_PHASES: Record<string, PulseTurnPhase> = {
  turn_started: "started",
  turn_completed: "completed",
  turn_failed: "failed",
  turn_canceled: "canceled",
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function usage(value: unknown): PulseUsage | undefined {
  const source = record(value);
  if (!source) return undefined;
  const parsed: PulseUsage = {
    inputTokens: count(source["inputTokens"]),
    cachedInputTokens: count(source["cachedInputTokens"]),
    outputTokens: count(source["outputTokens"]),
    totalCostUsd: count(source["totalCostUsd"]),
    contextWindowMaxTokens: count(source["contextWindowMaxTokens"]),
    contextWindowUsedTokens: count(source["contextWindowUsedTokens"]),
  };
  return Object.values(parsed).some((entry) => entry !== undefined) ? parsed : undefined;
}

function timelineItem(value: unknown): PulseTimelineEntry["item"] | null {
  const item = record(value);
  const type = item ? text(item["type"]) : undefined;
  return item && type ? (item as PulseTimelineEntry["item"]) : null;
}

export interface ParsedHistoryPage {
  readonly epoch: string;
  readonly entries: readonly PulseTimelineEntry[];
  readonly gap: boolean;
  readonly hasOlder: boolean;
  readonly startCursor: unknown;
  readonly agent: unknown;
}

export function parseHistoryPage(raw: unknown): ParsedHistoryPage | null {
  const page = record(raw);
  if (!page) return null;
  const epoch = text(page["epoch"]) ?? "unknown";
  const rows = Array.isArray(page["entries"]) ? page["entries"] : [];
  const entries: PulseTimelineEntry[] = [];
  for (const row of rows) {
    const source = record(row);
    if (!source) continue;
    const item = timelineItem(source["item"]);
    const seq = count(source["seqEnd"]) ?? count(source["seqStart"]);
    const timestamp = text(source["timestamp"]);
    if (!item || seq === undefined || !timestamp) continue;
    entries.push({ seq, timestamp, turnId: text(source["turnId"]), item });
  }
  return {
    epoch,
    entries,
    gap: page["gap"] === true,
    hasOlder: page["hasOlder"] === true,
    startCursor: page["startCursor"] ?? null,
    agent: page["agent"] ?? null,
  };
}

export function normalizeTimelineEvent(raw: unknown): PulseInput | null {
  const envelope = record(raw);
  const event = envelope ? record(envelope["event"]) : null;
  const type = event ? text(event["type"]) : undefined;
  if (!envelope || !event || !type) return null;

  if (type === "replacement") {
    const epoch = text(event["epoch"]);
    return epoch ? { type: "replacement", epoch } : null;
  }

  // COMPAT: `usage_updated` is not in the 0.8 wire union
  // (packages/protocol/src/messages.ts:762-828); providers that emit it through a
  // future or plugin-backed path are still accepted here rather than dropped.
  if (type === "usage_updated") {
    const parsed = usage(event["usage"]);
    return parsed ? { type: "usage", usage: parsed } : null;
  }

  const phase = TURN_PHASES[type];
  if (phase) {
    const at = text(envelope["timestamp"]);
    if (!at) return null;
    return {
      type: "turn",
      phase,
      at,
      turnId: text(event["turnId"]),
      usage: usage(event["usage"]),
      epoch: text(envelope["epoch"]),
    };
  }

  if (type === "timeline") {
    const item = timelineItem(event["item"]);
    const seq = count(envelope["seq"]);
    const timestamp = text(envelope["timestamp"]);
    if (!item || seq === undefined || !timestamp) return null;
    return {
      type: "live",
      entry: { seq, timestamp, turnId: text(event["turnId"]), item },
      epoch: text(envelope["epoch"]),
    };
  }
  return null;
}

export function normalizeAgentSnapshot(raw: unknown): PulseInput | null {
  const update = record(raw);
  if (!update) return null;
  if (update["kind"] === "remove") return null;
  const snapshot = record(update["agent"]) ?? (update["kind"] ? null : update);
  if (!snapshot) return null;
  const turn = record(snapshot["activeTurn"]);
  return {
    type: "agent",
    status: text(snapshot["status"]) ?? null,
    activeTurn: turn ? { turnId: text(turn["turnId"]), startedAt: text(turn["startedAt"]) } : null,
    usage: usage(snapshot["lastUsage"]),
  };
}
