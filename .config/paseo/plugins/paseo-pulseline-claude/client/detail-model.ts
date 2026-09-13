// Popover view model. Exact provider numbers and observed estimates live in
// separate groups, and an absent measurement produces no row at all.
import type { PulseMetric, PulseMetrics } from "./metrics.ts";
import type { PulseModelState } from "./model.ts";

export interface DetailRow {
  readonly label: string;
  readonly value: string;
  readonly approx: boolean;
}

export interface DetailSection {
  readonly id: "usage" | "timing" | "activity";
  readonly title: string;
  readonly rows: DetailRow[];
}

export interface DetailModel {
  readonly status: string;
  readonly busy: boolean;
  readonly empty: boolean;
  readonly incomplete: boolean;
  readonly sections: DetailSection[];
}

function compact(value: number): string {
  if (value < 1000) return String(Math.round(value));
  const scaled = value / 1000;
  return scaled >= 10 ? `${Math.round(scaled)}k` : `${scaled.toFixed(1).replace(/\.0$/, "")}k`;
}

function exactRow(label: string, metric: PulseMetric | undefined, value?: string): DetailRow[] {
  if (!metric) return [];
  return [{ label, value: value ?? compact(metric.value), approx: false }];
}

function approxRow(label: string, metric: PulseMetric | undefined, unit: string): DetailRow[] {
  if (!metric) return [];
  return [{ label, value: `~${metric.value}${unit}`, approx: true }];
}

function usageRows(metrics: PulseMetrics): DetailRow[] {
  const context =
    metrics.contextUsedTokens && metrics.contextMaxTokens
      ? `${compact(metrics.contextUsedTokens.value)} / ${compact(metrics.contextMaxTokens.value)}` +
        ` (${Math.round((metrics.contextUsedTokens.value / metrics.contextMaxTokens.value) * 100)}%)`
      : undefined;
  return [
    ...exactRow("Input", metrics.inputTokens),
    ...exactRow("Output", metrics.outputTokens),
    ...exactRow("Cache read", metrics.cachedInputTokens),
    ...(context ? exactRow("Context", metrics.contextUsedTokens, context) : []),
    ...exactRow("Cost", metrics.costUsd, `$${metrics.costUsd?.value.toFixed(2) ?? ""}`),
  ];
}

function timingRows(metrics: PulseMetrics): DetailRow[] {
  return [
    ...approxRow("Turn", metrics.turnSeconds, "s"),
    ...approxRow("Chat", metrics.chatSeconds, "s"),
    ...approxRow("Tools", metrics.toolCount, ""),
    ...approxRow("Tool average", metrics.toolAvgSeconds, "s"),
    ...approxRow("Tool total", metrics.toolTotalSeconds, "s"),
    ...approxRow("Text rate", metrics.textCharsPerSecond, "c/s"),
  ];
}

/** A trimmed or gapped history can only support approximate counts. */
function activityRows(state: PulseModelState): DetailRow[] {
  const partial = state.gap || state.truncated;
  const counts = {
    Messages: state.blocks.filter((block) => block.kind === "text").length,
    Reasoning: state.blocks.filter((block) => block.kind === "reasoning").length,
    Tools: state.blocks.filter((block) => block.key.startsWith("tool:")).length,
    Errors: state.blocks.filter((block) => block.kind === "error").length,
  };
  return Object.entries(counts)
    .filter(([, value]) => value > 0)
    .map(([label, value]) => ({
      label,
      value: partial ? `~${value}` : String(value),
      approx: partial,
    }));
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

export function buildDetailModel(state: PulseModelState, metrics: PulseMetrics): DetailModel {
  const candidates: DetailSection[] = [
    { id: "usage", title: "Reported by the provider", rows: usageRows(metrics) },
    { id: "timing", title: "Observed by this client (~)", rows: timingRows(metrics) },
    { id: "activity", title: "Activity", rows: activityRows(state) },
  ];
  const sections = candidates.filter((section) => section.rows.length > 0);

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
    sections,
  };
}
