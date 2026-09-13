// Deterministic text state for the composer pill's host-owned label.
// Approximate values are the only ones that ever carry a `~`.
import type { PulseMetric, PulseMetrics } from "./metrics.ts";
import type { PulseModelState } from "./model.ts";

export const PULSELINE_FALLBACK_LABEL = "Pulseline · Claude";
const GLYPHS = "▁▂▃▄▅▆▇█";
const MAX_GLYPHS = 8;
const DEFAULT_MAX_LENGTH = 44;

export interface PulseLabelOptions {
  readonly maxLength?: number;
}

function glyph(weight: number): string {
  const index = Math.min(GLYPHS.length - 1, Math.max(0, Math.round(weight * (GLYPHS.length - 1))));
  return GLYPHS[index] as string;
}

function compact(value: number): string {
  if (value < 1000) return String(Math.round(value));
  const scaled = value / 1000;
  if (scaled >= 10) return `${Math.round(scaled)}k`;
  return `${scaled.toFixed(1).replace(/\.0$/, "")}k`;
}

function mark(metric: PulseMetric, text: string): string {
  return metric.approx ? `~${text}` : text;
}

function tokenSegment(metrics: PulseMetrics): string | null {
  const parts: string[] = [];
  if (metrics.inputTokens) parts.push(`↓${compact(metrics.inputTokens.value)}`);
  if (metrics.outputTokens) parts.push(`↑${compact(metrics.outputTokens.value)}`);
  if (metrics.cachedInputTokens) parts.push(`◇${compact(metrics.cachedInputTokens.value)}`);
  return parts.length > 0 ? parts.join(" ") : null;
}

function detailSegments(metrics: PulseMetrics): string[] {
  const parts: (string | null)[] = [];
  if (metrics.contextUsedTokens && metrics.contextMaxTokens) {
    const percent = Math.round(
      (metrics.contextUsedTokens.value / metrics.contextMaxTokens.value) * 100,
    );
    parts.push(`⛁${percent}%`);
  }
  if (metrics.turnSeconds) parts.push(mark(metrics.turnSeconds, `${metrics.turnSeconds.value}s`));
  if (metrics.toolCount) parts.push(mark(metrics.toolCount, `⚒${metrics.toolCount.value}`));
  if (metrics.costUsd) parts.push(`$${metrics.costUsd.value.toFixed(2)}`);
  if (metrics.textCharsPerSecond) {
    parts.push(mark(metrics.textCharsPerSecond, `${metrics.textCharsPerSecond.value}c/s`));
  }
  return parts.filter((part): part is string => part !== null);
}

export function renderPulseLabel(
  state: PulseModelState,
  metrics: PulseMetrics,
  options: PulseLabelOptions = {},
): string {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const pulse = state.blocks
    .slice(-MAX_GLYPHS)
    .map((block) => glyph(block.weight))
    .join("");
  const head = `${state.busy ? "▶ " : ""}${pulse}`.trim();
  const tokens = tokenSegment(metrics);
  const details = detailSegments(metrics);

  if (head === "" && !tokens && details.length === 0) return PULSELINE_FALLBACK_LABEL;

  let label = head;
  let truncated = false;
  if (tokens) {
    // Tokens ride next to the pulse; everything else is a separate segment.
    const candidate = label === "" ? tokens : `${label} ${tokens}`;
    if (candidate.length <= maxLength) label = candidate;
    else truncated = true;
  }
  for (const part of details) {
    if (truncated) break;
    const candidate = label === "" ? part : `${label} · ${part}`;
    if (candidate.length > maxLength) break;
    label = candidate;
  }
  return label === "" ? PULSELINE_FALLBACK_LABEL : label;
}
