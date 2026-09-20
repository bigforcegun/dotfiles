// Popover view model: one ordered list of icon-led metric rows and the pulse
// footer, which is always last. Row order, glyphs and formatting follow the
// agreed cross-plugin baseline; a datum the provider never sent has no row.
import { formatClock, formatCount, formatMoney, formatRate, formatToolAverage } from "./format.ts";
import type { PulseMetric, PulseMetrics } from "./metrics.ts";
import type { PulseModelState } from "./model.ts";
import {
  MAX_PULSE_SEGMENTS,
  buildPulseSegments,
  type PulseSegment,
} from "./pulse-segments.ts";

export interface DetailRow {
  /** Original status glyph: ↓ ↑ ◇ ⚡ ↯ 💬/🏁 Σ 🔧 ⏱ ⌛ $ */
  readonly glyph: string;
  /** Accessible name only; the popover shows the glyph and the value. */
  readonly label: string;
  readonly value: string;
  readonly approx: boolean;
}

export interface DetailFooter {
  readonly placement: "last";
  readonly width: number;
  readonly accessibilityLabel: string;
  readonly segments: PulseSegment[];
}

export interface DetailModel {
  readonly status: string;
  readonly busy: boolean;
  readonly empty: boolean;
  readonly incomplete: boolean;
  readonly rows: DetailRow[];
  readonly emptyMetricsText: string;
  readonly footer: DetailFooter;
}

export interface DetailModelOptions {
  readonly phase?: number;
}

export const EMPTY_METRICS_TEXT = "No metrics yet";
const FOOTER_LABEL = "Agent activity pulse";

function row(
  glyph: string,
  label: string,
  metric: PulseMetric | undefined,
  format: (value: number) => string,
): DetailRow[] {
  if (!metric) return [];
  const value = format(metric.value);
  return [{ glyph, label, value: metric.approx ? `~${value}` : value, approx: metric.approx }];
}

/** Context shows both sides; a side the provider withheld reads `?`. */
function contextRow(state: PulseModelState): DetailRow[] {
  const used = state.usage?.contextWindowUsedTokens;
  const max = state.usage?.contextWindowMaxTokens;
  if (used === undefined && max === undefined) return [];
  const left = typeof used === "number" ? formatCount(used) : "?";
  const right = typeof max === "number" ? formatCount(max) : "?";
  return [{ glyph: "◇", label: "Context", value: `${left}/${right}`, approx: false }];
}

function metricRows(state: PulseModelState, metrics: PulseMetrics): DetailRow[] {
  return [
    ...row("↓", "Input", metrics.inputTokens, formatCount),
    ...row("↑", "Output", metrics.outputTokens, formatCount),
    ...row("◇", "Cache read", metrics.cachedInputTokens, formatCount),
    ...row("⚡", "Output rate", metrics.outputTokensPerSecond, (v) => `${formatRate(v)}/s`),
    ...row("↯", "Text rate", metrics.textCharsPerSecond, (v) => `${formatRate(v)}/s`),
    ...row(state.activeTurn ? "💬" : "🏁", "Turn", metrics.turnSeconds, (v) =>
      formatClock(v * 1_000),
    ),
    ...row("Σ", "Chat", metrics.chatSeconds, (v) => formatClock(v * 1_000)),
    ...row("🔧", "Tools", metrics.toolCount, formatCount),
    ...row("⏱", "Tool average", metrics.toolAvgSeconds, (v) => formatToolAverage(v * 1_000)),
    ...row("⌛", "Tool total", metrics.toolTotalSeconds, (v) => formatClock(v * 1_000)),
    ...contextRow(state),
    ...row("$", "Cost", metrics.costUsd, formatMoney),
  ];
}

function describe(state: PulseModelState): string {
  const running = state.blocks.find((block) => block.pending);
  if (running) return `Running ${running.label ?? running.kind}`;
  if (state.busy) return "Working…";
  if (!state.historyLoaded) return "Loading the conversation…";
  if (state.historyFailed && state.blocks.length === 0) return "History unavailable";
  if (state.status === "error") return "Agent reported an error";
  if (state.blocks.length === 0 && !state.usage) return "No activity yet";
  return "Idle";
}

export function buildDetailModel(
  state: PulseModelState,
  metrics: PulseMetrics,
  options: DetailModelOptions = {},
): DetailModel {
  return {
    status: describe(state),
    busy: state.busy,
    // "Empty" means an empty conversation, not a history that never arrived.
    empty:
      state.historyLoaded &&
      !state.historyFailed &&
      state.blocks.length === 0 &&
      !state.usage &&
      !state.busy,
    incomplete: state.gap,
    rows: metricRows(state, metrics),
    emptyMetricsText: EMPTY_METRICS_TEXT,
    footer: {
      placement: "last",
      width: MAX_PULSE_SEGMENTS,
      accessibilityLabel: FOOTER_LABEL,
      segments: buildPulseSegments(state, {
        width: MAX_PULSE_SEGMENTS,
        phase: options.phase ?? 0,
      }),
    },
  };
}
