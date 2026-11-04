import { heightIndexForTokens, type MetricValue, type PulseBlock, type PulseHeightIndex, type PulseKind } from "./model";
import type { TimelineSnapshot } from "./store";

export const PULSE_GLYPHS = ["⣀", "⣤", "⣶", "⣿"] as const;
export const PULSE_LABEL_WIDTH = 16;

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
  readonly sizeBucket: number;
  readonly heightIndex: PulseHeightIndex;
  readonly height: number;
  readonly color: PulseColor;
  readonly active: boolean;
  readonly opacity: number;
  readonly separatorAfter: boolean;
  readonly metadata?: PulseBlock["metadata"];
}

export interface PulseMetricLine {
  readonly id: string;
  readonly icon: string;
  readonly value: string;
  readonly hint: string;
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
    ...(block.metadata ? { metadata: block.metadata } : {}),
    glyph: PULSE_GLYPHS[glyphIndex],
    volumeTokens: block.volumeTokens,
    sizeBucket: block.heightIndex + 1,
    heightIndex,
    height: PULSE_HEIGHTS[heightIndex],
    color: PULSE_COLORS[block.kind],
    active,
    opacity: active ? (phase === 1 ? 1 : 0.8) : 0.9,
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
    ? Math.max(1, Math.floor(limit))
    : PULSE_LABEL_WIDTH;
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

export function statusHeader(snapshot: TimelineSnapshot): string {
  const running = snapshot.blocks.findLast(block => block.metadata?.type === "tool" && block.metadata.status === "running");
  if (running?.metadata?.type === "tool") return `Running ${running.metadata.name}`;
  if (snapshot.busy) return "Working";
  if (snapshot.historyFailed) return "History unavailable";
  if (snapshot.historyLoaded === false) return "Loading…";
  return snapshot.blocks.length ? "Idle" : "No activity yet";
}

function bounded(metric: MetricValue): string {
  if (Math.abs(metric.value) >= 999_500) return `${prefix(metric)}999k+`;
  return compact(metric);
}

function metricLines(snapshot: TimelineSnapshot): readonly PulseMetricLine[] {
  const m = snapshot.metrics;
  const line = (id: string, icon: string, name: string, metric: MetricValue | undefined, meaning: string, format = bounded): PulseMetricLine => ({
    id, icon, value: metric ? format(metric) : "—",
    hint: `${name}: ${metric ? `${metric.value} (${metric.approximate ? "~ approximate" : "exact"})` : "— (unavailable)"}. ${meaning}`,
  });
  const duration = (metric: MetricValue) => metric.value >= 6_000_000 ? `${prefix(metric)}99m+` : clock(metric);
  const rate = (metric: MetricValue) => `${bounded(metric)}/s`;
  const outputRate = (metric: MetricValue) => metric.value < 1000 && !Number.isInteger(metric.value) ? oneDecimal(metric, "/s") : rate(metric);
  const used = m.contextWindowUsedTokens;
  const max = m.contextWindowMaxTokens;
  const context = used || max ? { value: used?.value ?? max!.value, ...((used?.approximate || max?.approximate) ? { approximate: true as const } : {}) } : undefined;
  return [
    line("input", "ArrowDown", "Input tokens", m.inputTokens, "Latest provider usage; not chat total."),
    line("output", "ArrowUp", "Output tokens", m.outputTokens, "Latest provider usage; not chat total."),
    line("cache", "Database", "Cached input tokens", m.cachedInputTokens, "Provider-reported cache reads."),
    line("output-rate", "Zap", "Output tokens per second", snapshot.outputRate,
      snapshot.outputRate ? `Approximate ${snapshot.outputRate.turn} (${snapshot.outputRate.turnId}): ${snapshot.outputRate.tokens} output tokens / ${snapshot.outputRate.durationMs} ms; ${snapshot.outputRate.source}; includes waits.` : "No retained turn has measured output tokens and duration.", outputRate),
    line("text-rate", "Gauge", "Text units per second", m.textRateCharsPerSecond, "Unique assistant UTF-16 units / observed work spans.", rate),
    line("turn", "MessageSquare", "Turn duration (ms)", snapshot.turnDurationMs === undefined ? undefined : { value: snapshot.turnDurationMs, approximate: true }, "Observed start to now while running; reconstructed for history.", duration),
    line("chat", "Clock", "Chat work duration (ms)", m.chatDurationMs, "Sum of observed turn spans; excludes idle gaps.", duration),
    line("tool-count", "Wrench", "Tools", m.toolCount, "Distinct observed tool calls, including running calls."),
    line("tool-average", "Timer", "Average tool duration (ms)", m.toolAverageDurationMs, "Mean of calls with observed start and end.", duration),
    line("tool-total", "Hourglass", "Total tool duration (ms)", m.toolTotalDurationMs, "Sum of timed calls; parallel spans overlap.", duration),
    { ...line("context", "Layers", "Context tokens", context, "Provider-reported used / maximum."),
      hint: `Context: ${used?.value ?? "—"} / ${max?.value ?? "—"} (${context?.approximate ? "~ approximate" : context ? "exact" : "unavailable"}). Provider context snapshot.`,
      value: context ? (used && max && max.value > 0 ? `${prefix(context)}${Math.min(999, Math.round(used.value * 100 / max.value))}%` : "—") : "—" },
    line("cost", "DollarSign", "Cost (USD)", m.totalCostUsd, "Latest provider-reported cost; no inferred pricing.", metric =>
      `${prefix(metric)}${metric.value > 0 && metric.value < .01 ? "<$0.01" : metric.value >= 100 ? "$99+" : `$${metric.value.toFixed(2)}`}`),
  ];
}

export function buildHistoryView(snapshot: TimelineSnapshot): PulseView {
  const segments = snapshot.blocks.map((block, index) => segment(block,
    snapshot.busy && index === snapshot.blocks.length - 1, snapshot.pulsePhase ?? 0));
  return { label: segments.map(item => item.glyph).join(""), segments, metrics: metricLines(snapshot) };
}

export function buildPulseView(snapshot: TimelineSnapshot, limit = PULSE_LABEL_WIDTH): PulseView {
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


export function pulseActivityColor(snapshot: TimelineSnapshot): PulseColor {
  if (snapshot.blocks.at(-1)?.kind === "error") return "statusDanger";
  return buildPulseView(snapshot, 1).segments.at(-1)?.color ?? "accent";
}

export function pulseSegmentIcon(item: PulseSegment): string {
  if (item.kind === "error") return "AlertTriangle";
  if (item.metadata?.type === "compaction") return "Archive";
  if (item.metadata?.type === "tool") {
    switch (item.metadata.detail) {
      case "read": return "FileText";
      case "edit": case "write": return "Pencil";
      case "shell": return "Terminal";
      case "search": return "Search";
      case "fetch": return "Globe";
      case "sub_agent": return "Bot";
      default: return /task|subagent/i.test(item.metadata.name) ? "Bot" : "Wrench";
    }
  }
  switch (item.kind) {
    case "reasoning": return "Brain";
    case "text": return "MessageSquare";
    case "read": return "FileText";
    case "write": return "Pencil";
    default: return "Wrench";
  }
}

export function pulseLegend(segments: readonly PulseSegment[]): readonly { label: string; color: PulseColor }[] {
  const entries = new Map<string, { label: string; color: PulseColor }>();
  for (const item of segments) {
    const label = item.kind === "success" ? "ok" : item.kind === "tool" && item.metadata?.type === "tool" && item.metadata.status === "running" ? "running" : item.kind;
    const key = `${label}:${item.color}`;
    if (!entries.has(key)) entries.set(key, { label, color: item.color });
  }
  return [...entries.values()];
}
