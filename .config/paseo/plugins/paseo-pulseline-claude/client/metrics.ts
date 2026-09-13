// Metric derivation with an explicit honesty policy.
//
//  - provider-reported usage      -> exact,  approx: false
//  - client-observed timings      -> approx, approx: true
//  - anything the protocol cannot supply -> omitted entirely, never zero
import type { PulseModelState } from "./model.ts";

export interface PulseMetric {
  readonly value: number;
  readonly approx: boolean;
}

export interface PulseMetrics {
  readonly inputTokens?: PulseMetric;
  readonly outputTokens?: PulseMetric;
  readonly cachedInputTokens?: PulseMetric;
  readonly costUsd?: PulseMetric;
  readonly contextUsedTokens?: PulseMetric;
  readonly contextMaxTokens?: PulseMetric;
  readonly turnSeconds?: PulseMetric;
  /** Span of the retained conversation, as this client observed it. */
  readonly chatSeconds?: PulseMetric;
  readonly toolCount?: PulseMetric;
  readonly toolAvgSeconds?: PulseMetric;
  readonly toolTotalSeconds?: PulseMetric;
  readonly textCharsPerSecond?: PulseMetric;
}

/**
 * Metrics Pulseline refuses to invent. The 0.8 wire protocol carries no
 * per-delta token stream and no reasoning or cache-write counters, so a rate or
 * a count for them would be a guess wearing a number's clothes.
 */
export const OMITTED_PULSE_METRICS = [
  "streamTokensPerSecond",
  "providerTokensPerSecond",
  "reasoningTokens",
  "cacheWriteTokens",
] as const;

function exact(value: number | undefined): PulseMetric | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return { value, approx: false };
}

function approximate(value: number | undefined, decimals = 0): PulseMetric | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  const factor = 10 ** decimals;
  return { value: Math.round(value * factor) / factor, approx: true };
}

function turnMs(state: PulseModelState, nowMs: number): number | undefined {
  const startedAt = state.activeTurn?.startedAt ?? null;
  if (startedAt) {
    const elapsed = nowMs - Date.parse(startedAt);
    return Number.isFinite(elapsed) ? elapsed : undefined;
  }
  return state.lastTurnMs ?? undefined;
}

/** Only the current turn supports a rate; a span across turns measures idling. */
function textRate(state: PulseModelState): number | undefined {
  if (!state.turnTextFirstAt || !state.turnTextLastAt || state.turnTextChars <= 0) return undefined;
  const spanMs = Date.parse(state.turnTextLastAt) - Date.parse(state.turnTextFirstAt);
  if (!Number.isFinite(spanMs) || spanMs <= 0) return undefined;
  return state.turnTextChars / (spanMs / 1000);
}

function chatMs(state: PulseModelState): number | undefined {
  const first = state.blocks[0];
  const last = state.blocks.at(-1);
  if (!first || !last) return undefined;
  const spanMs = Date.parse(last.endedAt ?? last.startedAt) - Date.parse(first.startedAt);
  return Number.isFinite(spanMs) && spanMs > 0 ? spanMs : undefined;
}

export function derivePulseMetrics(state: PulseModelState, nowMs: number): PulseMetrics {
  const usage = state.usage ?? {};
  const durations = state.toolDurationsMs;
  const toolBlocks = state.blocks.filter((block) => block.key.startsWith("tool:"));
  const averageMs =
    durations.length > 0
      ? durations.reduce((total, value) => total + value, 0) / durations.length
      : undefined;

  const elapsedTurnMs = turnMs(state, nowMs);
  const chatSpanMs = chatMs(state);
  const totalToolMs = durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) : undefined;
  const metrics: Record<string, PulseMetric | undefined> = {
    inputTokens: exact(usage.inputTokens),
    outputTokens: exact(usage.outputTokens),
    cachedInputTokens: exact(usage.cachedInputTokens),
    costUsd: exact(usage.totalCostUsd),
    contextUsedTokens: exact(usage.contextWindowUsedTokens),
    contextMaxTokens: exact(usage.contextWindowMaxTokens),
    turnSeconds: approximate(elapsedTurnMs === undefined ? undefined : elapsedTurnMs / 1000),
    chatSeconds: approximate(chatSpanMs === undefined ? undefined : chatSpanMs / 1000),
    toolCount: approximate(toolBlocks.length),
    toolAvgSeconds: approximate(averageMs === undefined ? undefined : averageMs / 1000, 1),
    toolTotalSeconds: approximate(totalToolMs === undefined ? undefined : totalToolMs / 1000, 1),
    textCharsPerSecond: approximate(textRate(state), 1),
  };

  for (const key of Object.keys(metrics)) {
    if (metrics[key] === undefined) delete metrics[key];
  }
  return metrics as PulseMetrics;
}
