import { heightIndexForTokens, type MetricValue, type PulseBlock, type PulseHeightIndex, type PulseKind } from "./model";
import type { TimelineSnapshot } from "./store";

export const PULSE_GLYPHS = ["⣀", "⣤", "⣶", "⣿"] as const;
export const PULSE_LABEL_WIDTH = 12;

const PULSE_HEIGHTS = [4, 6, 8, 10, 12, 14, 16, 18] as const;
const ACTIVE_HEIGHT_INDEX = [1, 2, 3, 4, 5, 6, 7, 7] as const;
const PASSIVE_GLYPH_INDEX = [0, 0, 1, 1, 2, 2, 3, 3] as const;
const ACTIVE_GLYPH_INDEX = [0, 1, 1, 2, 2, 3, 3, 3] as const;

const PULSE_COLORS = {
  text: "foreground",
  reasoning: "accent",
  read: "foregroundMuted",
  write: "accent",
  tool: "statusWarning",
  error: "statusDanger",
  success: "statusSuccess",
  other: "border",
} as const satisfies Record<PulseKind, PulseColor>;

export type PulseColor =
  | "foreground"
  | "accent"
  | "foregroundMuted"
  | "statusWarning"
  | "statusDanger"
  | "statusSuccess"
  | "border";

export interface PulseSegment {
  readonly id: string;
  readonly kind: PulseKind;
  readonly glyph: string;
  readonly volumeTokens: number;
  readonly heightIndex: PulseHeightIndex;
  readonly height: number;
  readonly color: PulseColor;
  readonly active: boolean;
  readonly separatorAfter: boolean;
}

export interface PulseMetricLine {
  readonly id: string;
  readonly icon: string;
  readonly value: string;
}

export interface PulseView {
  readonly label: string;
  readonly segments: readonly PulseSegment[];
  readonly metrics: readonly PulseMetricLine[];
}

interface BlockAnalysis {
  readonly runningToolIndex: number;
  readonly latestTurnDuration: number | undefined;
}

const blockAnalysis = new WeakMap<readonly PulseBlock[], BlockAnalysis>();
const MAX_SEGMENTS = 36;

function analyzeBlocks(blocks: readonly PulseBlock[]): BlockAnalysis {
  const cached = blockAnalysis.get(blocks);
  if (cached) return cached;
  let runningToolIndex = -1;
  let latestTurnId: string | undefined;
  let turnStart = Number.POSITIVE_INFINITY;
  let turnEnd = Number.NEGATIVE_INFINITY;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (!block) continue;
    if (runningToolIndex < 0 && block.metadata?.type === "tool" && block.metadata.status === "running") {
      runningToolIndex = index;
    }
    if (latestTurnId === undefined && block.turnId !== undefined) latestTurnId = block.turnId;
    if (latestTurnId !== undefined && block.turnId === latestTurnId) {
      turnStart = Math.min(turnStart, block.timestamp);
      turnEnd = Math.max(turnEnd, block.timestamp);
    }
  }
  const analysis = {
    runningToolIndex,
    latestTurnDuration: Number.isFinite(turnStart) ? turnEnd - turnStart : undefined,
  };
  blockAnalysis.set(blocks, analysis);
  return analysis;
}

function segment(block: PulseBlock, active: boolean, phase: 0 | 1 | 2): PulseSegment {
  const heightIndex = active && phase === 1
    ? ACTIVE_HEIGHT_INDEX[block.heightIndex]
    : block.heightIndex;
  const glyphIndex = (active ? ACTIVE_GLYPH_INDEX : PASSIVE_GLYPH_INDEX)[heightIndex];
  return {
    id: block.id,
    kind: block.kind,
    glyph: PULSE_GLYPHS[glyphIndex],
    volumeTokens: block.volumeTokens,
    heightIndex,
    height: PULSE_HEIGHTS[heightIndex],
    color: PULSE_COLORS[block.kind],
    active,
    separatorAfter: false,
  };
}

function pulseSegments(snapshot: TimelineSnapshot, limit: number): readonly PulseSegment[] {
  const blocks = snapshot.blocks;
  const analysis = analyzeBlocks(blocks);
  const activeIndex = snapshot.busy
    ? (analysis.runningToolIndex >= 0 ? analysis.runningToolIndex : blocks.length - 1)
    : -1;
  const phase = snapshot.pulsePhase ?? 0;
  const count = Number.isFinite(limit)
    ? Math.max(1, Math.min(MAX_SEGMENTS, Math.floor(limit)))
    : 16;
  const passive: PulseSegment[] = [];
  const passiveCount = activeIndex >= 0 ? count - 1 : count;
  for (let index = blocks.length - 1; index >= 0 && passive.length < passiveCount; index -= 1) {
    if (index === activeIndex) continue;
    const block = blocks[index];
    if (block) passive.push(segment(block, false, phase));
  }
  passive.reverse();
  let active: PulseSegment | undefined;
  if (activeIndex >= 0) {
    const activeBlock = blocks[activeIndex];
    if (activeBlock) active = segment(activeBlock, true, phase);
  } else if (snapshot.busy) {
    active = segment({ id: "active", kind: "reasoning", order: 0, timestamp: 0, volumeTokens: 1, heightIndex: 0 }, true, phase);
  }
  if (passive.length === 0 && !active) {
    const reportedTokens = (snapshot.metrics.inputTokens?.value ?? 0) + (snapshot.metrics.outputTokens?.value ?? 0);
    const volumeTokens = Math.max(1, Math.ceil(reportedTokens));
    passive.push(segment({
      id: "fallback",
      kind: reportedTokens > 0 ? "success" : "other",
      order: 0,
      timestamp: 0,
      volumeTokens,
      heightIndex: heightIndexForTokens(volumeTokens),
    }, false, phase));
  }
  const visible = active ? [...passive, active] : passive;
  return visible.map((item, index) => ({ ...item, separatorAfter: index < visible.length - 1 }));
}

function prefix(metric: MetricValue): string {
  return metric.approximate ? "~" : "";
}

function compact(metric: MetricValue): string {
  const value = metric.value;
  if (Math.abs(value) < 1_000) return `${prefix(metric)}${Math.round(value)}`;
  const scaled = value / 1_000;
  const formatted = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1);
  return `${prefix(metric)}${formatted}k`;
}

function oneDecimal(metric: MetricValue, suffix: string): string {
  return `${prefix(metric)}${metric.value.toFixed(1)}${suffix}`;
}

export function formatClockDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clock(metric: MetricValue): string {
  return `${prefix(metric)}${formatClockDuration(metric.value)}`;
}

function metricLines(snapshot: TimelineSnapshot): readonly PulseMetricLine[] {
  const metrics = snapshot.metrics;
  const lines: PulseMetricLine[] = [];
  if (metrics.inputTokens) lines.push({ id: "input", icon: "↓", value: compact(metrics.inputTokens) });
  if (metrics.outputTokens) lines.push({ id: "output", icon: "↑", value: compact(metrics.outputTokens) });
  if (metrics.cachedInputTokens) lines.push({ id: "cache", icon: "◇", value: compact(metrics.cachedInputTokens) });
  if (metrics.outputTokens && metrics.chatDurationMs?.value) {
    lines.push({
      id: "output-rate",
      icon: "⚡",
      value: oneDecimal({ value: metrics.outputTokens.value * 1_000 / metrics.chatDurationMs.value }, "/s"),
    });
  }
  if (metrics.textRateCharsPerSecond) lines.push({ id: "text-rate", icon: "↯", value: oneDecimal(metrics.textRateCharsPerSecond, "/s") });
  const latestTurn = analyzeBlocks(snapshot.blocks).latestTurnDuration;
  if (latestTurn !== undefined) lines.push({ id: "turn", icon: snapshot.busy ? "💬" : "🏁", value: formatClockDuration(latestTurn) });
  if (metrics.chatDurationMs) lines.push({ id: "chat", icon: "Σ", value: clock(metrics.chatDurationMs) });
  if (metrics.toolCount) lines.push({ id: "tool-count", icon: "🔧", value: compact(metrics.toolCount) });
  if (metrics.toolAverageDurationMs) lines.push({ id: "tool-average", icon: "⏱", value: oneDecimal({ ...metrics.toolAverageDurationMs, value: metrics.toolAverageDurationMs.value / 1_000 }, "s") });
  if (metrics.toolTotalDurationMs) lines.push({ id: "tool-total", icon: "⌛", value: clock(metrics.toolTotalDurationMs) });
  const used = metrics.contextWindowUsedTokens;
  const maximum = metrics.contextWindowMaxTokens;
  if (used || maximum) lines.push({ id: "context", icon: "◇", value: `${used ? compact(used) : "?"}/${maximum ? compact(maximum) : "?"}` });
  if (metrics.totalCostUsd) lines.push({ id: "cost", icon: "$", value: `${prefix(metrics.totalCostUsd)}$${metrics.totalCostUsd.value.toFixed(2)}` });
  return lines;
}

export function buildPulseView(snapshot: TimelineSnapshot, limit = 16): PulseView {
  const segments = pulseSegments(snapshot, limit);
  return {
    label: segments.map(({ glyph }) => glyph).join(""),
    segments,
    metrics: metricLines(snapshot),
  };
}

export function buildComposerPulseLabel(snapshot: TimelineSnapshot): string {
  return buildPulseView(snapshot, PULSE_LABEL_WIDTH).label;
}
