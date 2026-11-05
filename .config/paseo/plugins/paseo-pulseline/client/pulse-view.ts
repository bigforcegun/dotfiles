import { heightIndexForTokens, type MetricValue, type PulseBlock, type PulseHeightIndex, type PulseKind } from "./model";
import type { TimelineSnapshot } from "./store";

export const PULSE_GLYPHS = ["⣀", "⣤", "⣶", "⣿"] as const;
// Host pill: maxWidth 160 - padding 24 - icon 16 - gap 8 = ~112px of 12px text.
// Measured (macOS system font, 12pt): one braille cell = 8.2px, so 12 cells = 98px fit,
// 14 = 115px and 16 = 131px overflow; numberOfLines=1 then cuts the newest glyphs on the
// right and only the U+2800 left padding stays visible.
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

const activityCache = new WeakMap<readonly PulseBlock[], { latestTurn: string | undefined; selected: Map<string | undefined, PulseBlock | null> }>();

/** One selection rule for strip, header, composer and icon: newest running tool, else newest block. */
export function activePulseBlock(snapshot: TimelineSnapshot): PulseBlock | undefined {
  if (snapshot.activityBlock !== undefined) return snapshot.activityBlock ?? undefined;
  let cached = activityCache.get(snapshot.blocks);
  if (!cached) {
    cached = { latestTurn: snapshot.blocks.findLast(item => item.turnId !== undefined)?.turnId, selected: new Map() };
    activityCache.set(snapshot.blocks, cached);
  }
  const turn = snapshot.activeTurnId ?? cached.latestTurn;
  if (cached.selected.has(turn)) return cached.selected.get(turn) ?? undefined;
  const last = snapshot.blocks.at(-1);
  const running = snapshot.blocks.findLast(item => item.turnId === turn && item.metadata?.type === "tool" && item.metadata.status === "running");
  const block = running ?? (last?.metadata?.type === "tool" && last.metadata.status === "running" && last.turnId !== turn ? undefined : last);
  cached.selected.set(turn, block ?? null);
  return block;
}

function segment(block: PulseBlock, active: boolean, phase: 0 | 1 | 2): PulseSegment {
  const heightIndex = active && phase === 1
    ? ACTIVE_HEIGHT_INDEX[block.heightIndex]
    : block.heightIndex;
  // The string label cannot express opacity. Animate in glyph space so that
  // adjacent height buckets folding to the same glyph still visibly blink.
  const baseGlyph = (active ? ACTIVE_GLYPH_INDEX : PASSIVE_GLYPH_INDEX)[block.heightIndex];
  const glyphIndex = active && phase === 1 ? (baseGlyph === 3 ? 2 : baseGlyph + 1) : baseGlyph;
  return {
    id: block.id,
    kind: block.kind,
    ...(block.metadata ? { metadata: block.metadata } : {}),
    glyph: PULSE_GLYPHS[glyphIndex]!,
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
  const activeBlock = snapshot.busy ? activePulseBlock(snapshot) : undefined;
  const hasActive = activeBlock !== undefined;
  const phase = snapshot.pulsePhase ?? 0;
  const count = Number.isFinite(limit)
    ? Math.max(1, Math.floor(limit))
    : PULSE_LABEL_WIDTH;
  const passive: PulseSegment[] = [];
  const passiveCount = hasActive ? count - 1 : count;
  for (let index = blocks.length - 1; index >= 0 && passive.length < passiveCount; index -= 1) {
    if (blocks[index] === activeBlock) continue;
    const block = blocks[index];
    if (block) passive.push(segment(block, false, phase));
  }
  passive.reverse();
  let active: PulseSegment | undefined;
  if (activeBlock) {
    active = segment(activeBlock, true, phase);
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
  if (Math.abs(value) < 999.5) return `${prefix(metric)}${Math.round(value)}`;
  const scaled = value / 1_000;
  const formatted = String(Number(scaled.toFixed(1)));
  return `${prefix(metric)}${formatted}k`;
}

function oneDecimal(metric: MetricValue, suffix: string): string {
  if (Math.abs(metric.value) >= 999.95) return `${compact(metric)}${suffix}`;
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
  const running = activePulseBlock(snapshot);
  if (snapshot.busy && running?.metadata?.type === "tool" && running.metadata.status === "running") return `Running ${running.metadata.name}`;
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
  const tokens = (id: string, icon: string, name: string, field: "inputTokens" | "outputTokens" | "cachedInputTokens") => {
    const sum = snapshot.tokenTotals?.[field];
    const latest = m[field];
    const since = snapshot.usageObservedSince === undefined ? "" : (() => { const date = new Date(snapshot.usageObservedSince); return ` since ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")} — earlier turns not observed`; })();
    return { ...line(id, icon, name, sum, ""), hint: `${name}: Chat sum ${sum?.value ?? "—"} (~ approximate). Latest request ${latest?.value ?? "—"} (${latest ? "exact, provider-reported" : "unavailable"}).${snapshot.earlierUsageUnobserved ? since : ""}${snapshot.usageObservationGaps ? " some turns not observed (observation interrupted)." : ""}` };
  };
  const lines = [
    tokens("input", "ArrowDown", "Input tokens", "inputTokens"),
    tokens("output", "ArrowUp", "Output tokens", "outputTokens"),
    tokens("cache", "Database", "Cached input tokens", "cachedInputTokens"),
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
  const unreported = new Set([
    ...(!m.inputTokens ? ["input"] : []), ...(!m.outputTokens ? ["output", "output-rate"] : []),
    ...(!m.cachedInputTokens ? ["cache"] : []), ...(!used && !max ? ["context"] : []), ...(!m.totalCostUsd ? ["cost"] : []),
  ]);
  return lines.map(line => ({ ...line,
    value: snapshot.loadingOlder && line.value !== "—" && !line.value.startsWith("~") ? `~${line.value}` : line.value,
    hint: `${line.hint}${line.value === "—" && unreported.has(line.id) ? " not reported for this chat." : ""}${snapshot.historyDerivedMetrics?.includes(line.id) ? " Includes estimates derived from history (row timestamps and turn boundaries)." : ""}${snapshot.loadingOlder ? " History loading; chat-derived totals are provisional." : ""}`,
  }));
}

export interface PulseStripData {
  readonly indices: ReadonlyMap<string, number>;
  readonly legend: readonly { label: string; color: PulseColor }[];
}
const stripDataCache = new WeakMap<readonly PulseSegment[], PulseStripData>();
export function pulseStripData(segments: readonly PulseSegment[]): PulseStripData {
  let data = stripDataCache.get(segments);
  if (!data) { data = { indices: new Map(segments.map((item, index) => [item.id, index])), legend: pulseLegend(segments) }; stripDataCache.set(segments, data); }
  return data;
}

const historyCache = new WeakMap<readonly PulseBlock[], { base: readonly PulseSegment[]; indices: Map<string, number>; views: Map<string, { label: string; segments: readonly PulseSegment[] }> }>();
export function buildHistoryView(snapshot: TimelineSnapshot): PulseView {
  let cached = historyCache.get(snapshot.blocks);
  if (!cached) {
    cached = { base: snapshot.blocks.map(block => segment(block, false, 0)), indices: new Map(snapshot.blocks.map((block, index) => [block.id, index])), views: new Map() };
    historyCache.set(snapshot.blocks, cached);
  }
  const active = snapshot.busy ? activePulseBlock(snapshot) : undefined;
  const phase = snapshot.pulsePhase === 1 ? 1 : 0;
  const key = `${active?.id ?? "idle"}:${phase}`;
  let view = cached.views.get(key);
  if (!view) {
    const segments = cached.base.slice();
    if (active) { const index = cached.indices.get(active.id); if (index !== undefined) segments[index] = segment(active, true, phase); }
    view = { label: segments.map(item => item.glyph).join(""), segments };
    if (cached.views.size > 3) cached.views.clear();
    stripDataCache.set(segments, pulseStripData(cached.base));
    cached.views.set(key, view);
  }
  return { ...view, metrics: metricLines(snapshot) };
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
  return pulseSegments(snapshot, PULSE_LABEL_WIDTH).map(item => item.glyph).join("").padStart(PULSE_LABEL_WIDTH, "⠀");
}


export function pulseActivityColor(snapshot: TimelineSnapshot): PulseColor {
  if (snapshot.blocks.at(-1)?.kind === "error") return "statusDanger";
  const block = activePulseBlock(snapshot);
  return block ? PULSE_COLORS[block.kind] : "accent";
}

export function pulseSegmentIcon(item: PulseSegment): string {
  if (item.metadata?.type === "turn") {
    switch (item.metadata.outcome) {
      case "completed": return "CircleCheck";
      case "failed": return "CircleX";
      case "canceled": return "Ban";
    }
  }
  if (item.kind === "error") return "AlertTriangle";
  if (item.metadata?.type === "compaction") return "Archive";
  if (item.metadata?.type === "notification") return "Bell";
  if (item.metadata?.type === "unknown") {
    switch (item.metadata.sourceType) {
      case "todo": return "ListTodo";
      case "plugin": return "Puzzle";
      default: return "CircleHelp";
    }
  }
  if (item.metadata?.type === "tool") {
    if (isMcpTool(item.metadata)) return "Plug";
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
    case "tool": return "Wrench";
    case "success": return "CircleCheck";
    default: return "CircleHelp";
  }
}

// Protocol 0.14 has no MCP detail variant. Names preserve the provider's MCP
// namespace even when the detail is classified as read/search/etc.
function isMcpTool(metadata: Extract<NonNullable<PulseSegment["metadata"]>, { type: "tool" }>): boolean {
  return /^(mcp__|mcp:)/i.test(metadata.name);
}

function legendLabel(item: PulseSegment): string {
  const metadata = item.metadata;
  if (metadata?.type === "turn") return metadata.outcome === "completed" ? "done" : metadata.outcome;
  if (metadata?.type === "notification") return "note";
  if (metadata?.type === "compaction") return "compaction";
  if (metadata?.type === "unknown") return metadata.sourceType === "todo" || metadata.sourceType === "plugin" ? metadata.sourceType : "unknown";
  if (metadata?.type === "tool" && isMcpTool(metadata)) return "mcp";
  if (item.kind === "success") return "done";
  return item.kind === "tool" && metadata?.type === "tool" && metadata.status === "running" ? "running" : item.kind;
}

const legendCache = new WeakMap<readonly PulseSegment[], readonly { label: string; color: PulseColor }[]>();
export function pulseLegend(segments: readonly PulseSegment[]): readonly { label: string; color: PulseColor }[] {
  const cached = legendCache.get(segments);
  if (cached) return cached;
  const entries = new Map<string, { label: string; color: PulseColor }>();
  for (const item of segments) {
    const label = legendLabel(item);
    const key = `${label}:${item.color}`;
    if (!entries.has(key)) entries.set(key, { label, color: item.color });
  }
  const result = [...entries.values()];
  legendCache.set(segments, result);
  return result;
}
