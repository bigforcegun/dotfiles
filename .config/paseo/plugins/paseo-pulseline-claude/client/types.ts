// Normalized, provider-neutral shapes. Nothing here knows which agent provider
// produced the data: the daemon already flattened Claude, OpenCode and the rest
// into one timeline vocabulary.

export type PulseBlockKind =
  | "text"
  | "reasoning"
  | "read"
  | "write"
  | "tool"
  | "error"
  | "success"
  | "other";

export type PulseOtherReason = "todo" | "plugin" | "notification" | "compaction" | "unknown";

export interface PulseTimelineItem {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface PulseTimelineEntry {
  readonly seq: number;
  readonly timestamp: string;
  readonly turnId?: string | undefined;
  readonly item: PulseTimelineItem;
}

export interface PulseBlock {
  /** Stable identity: a tool's callId, a turn outcome, or the row sequence. */
  readonly key: string;
  readonly kind: PulseBlockKind;
  /** Relative visual weight in 0..1. Approximate by construction. */
  readonly weight: number;
  readonly startedAt: string;
  readonly endedAt?: string | undefined;
  readonly turnId?: string | undefined;
  readonly reason?: PulseOtherReason | undefined;
  /** Tool name for tool rows; absent for everything else. */
  readonly label?: string | undefined;
  readonly pending: boolean;
}

export interface PulseUsage {
  readonly inputTokens?: number | undefined;
  readonly cachedInputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly totalCostUsd?: number | undefined;
  readonly contextWindowMaxTokens?: number | undefined;
  readonly contextWindowUsedTokens?: number | undefined;
}

export interface PulseActiveTurn {
  readonly turnId?: string | undefined;
  readonly startedAt?: string | undefined;
}

export type PulseTurnPhase = "started" | "completed" | "failed" | "canceled";
