import type { PluginButtonContentProps, PluginButtonIconProps } from "@getpaseo/plugin/client";
import { useSyncExternalStore, type ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatMetric, type PulseKind, type PulseMetrics } from "./model";
import { createPulselineRuntime, type PulselineRuntime, type PulselineRuntimeInput } from "./runtime";
import type { TimelineSnapshot } from "./store";

type MetricLine = { readonly label: string; readonly value: string };
type PulseGeometry = { readonly height: number; readonly weight: number };
export type ContentTier = "full" | "blocks-only" | "fallback";

export interface PulselinePresentation extends PulselineRuntime {
  readonly Icon: ComponentType<PluginButtonIconProps>;
  readonly Content: ComponentType<PluginButtonContentProps>;
}

const PULSE_GEOMETRY = {
  text: { height: 8, weight: 3 },
  reasoning: { height: 12, weight: 2 },
  read: { height: 6, weight: 1 },
  write: { height: 14, weight: 2 },
  tool: { height: 10, weight: 2 },
  error: { height: 16, weight: 2 },
  success: { height: 16, weight: 2 },
  other: { height: 4, weight: 1 },
} satisfies Record<PulseKind, PulseGeometry>;

const styles = StyleSheet.create({
  icon: { alignItems: "flex-end", flexDirection: "row", justifyContent: "center" },
  iconBar: { borderRadius: 1, marginHorizontal: 1 },
  content: { maxWidth: 360 },
  header: { flexDirection: "row", justifyContent: "space-between" },
  title: { fontWeight: "700" },
  status: { flexShrink: 1, textAlign: "right" },
  strip: { alignItems: "center", flexDirection: "row" },
  block: { borderRadius: 2, minWidth: 3 },
  section: { gap: 4 },
  group: { flexDirection: "row", flexWrap: "wrap" },
  metric: { flexDirection: "row" },
  metricLabel: { fontWeight: "600" },
  empty: { flex: 1, textAlign: "center" },
});

function blockColor(kind: PulseKind, colors: PluginButtonContentProps["theme"]["colors"]): string {
  switch (kind) {
    case "text": return colors.foreground;
    case "reasoning": return colors.accent;
    case "read": return colors.foregroundMuted;
    case "write": return colors.accent;
    case "tool": return colors.statusWarning;
    case "error": return colors.statusDanger;
    case "success": return colors.statusSuccess;
    case "other": return colors.border;
  }
}

function available(lines: readonly (MetricLine | undefined)[]): readonly MetricLine[] {
  return lines.filter((line): line is MetricLine => line !== undefined);
}

function exactMetrics(metrics: PulseMetrics): readonly MetricLine[] {
  const input = formatMetric(metrics.inputTokens);
  const output = formatMetric(metrics.outputTokens);
  const cached = formatMetric(metrics.cachedInputTokens);
  const used = formatMetric(metrics.contextWindowUsedTokens);
  const maximum = formatMetric(metrics.contextWindowMaxTokens);
  const context = used && maximum ? `${used}/${maximum}` : (used ?? maximum);
  const cost = formatMetric(metrics.totalCostUsd);
  return available([
    input ? { label: "Input", value: `${input} tok` } : undefined,
    output ? { label: "Output", value: `${output} tok` } : undefined,
    cached ? { label: "Cached", value: `${cached} tok` } : undefined,
    context ? { label: "Context", value: context } : undefined,
    cost ? { label: "Cost", value: `$${cost}` } : undefined,
  ]);
}

function observedMetrics(metrics: PulseMetrics): readonly MetricLine[] {
  const chat = formatMetric(metrics.chatDurationMs);
  const toolCount = formatMetric(metrics.toolCount);
  const toolTotal = formatMetric(metrics.toolTotalDurationMs);
  const toolAverage = formatMetric(metrics.toolAverageDurationMs);
  const rate = formatMetric(metrics.textRateCharsPerSecond);
  return available([
    chat ? { label: "Chat", value: `${chat} ms` } : undefined,
    toolCount ? { label: "Tools", value: toolCount } : undefined,
    toolTotal ? { label: "Tool total", value: `${toolTotal} ms` } : undefined,
    toolAverage ? { label: "Tool avg", value: `${toolAverage} ms` } : undefined,
    rate ? { label: "Text", value: `${rate} char/s` } : undefined,
  ]);
}

export function selectContentTier(compact: boolean, snapshot: TimelineSnapshot): ContentTier {
  if (!compact) return "full";
  return snapshot.blocks.length > 0 ? "blocks-only" : "fallback";
}

export function pulseOpacity(snapshot: TimelineSnapshot): number {
  if (!snapshot.busy) return 1;
  switch (snapshot.pulsePhase) {
    case 0: return 0.55;
    case 1: return 0.75;
    case 2:
    case undefined:
      return 1;
  }
  return 1;
}

function currentTool(snapshot: TimelineSnapshot): string | undefined {
  return snapshot.blocks.findLast(
    ({ metadata }) => metadata?.type === "tool" && metadata.status === "running",
  )?.text;
}

function emptyFallback(snapshot: TimelineSnapshot): string {
  if (snapshot.busy) return "Working, awaiting output";
  const tokens = (snapshot.metrics.inputTokens?.value ?? 0) + (snapshot.metrics.outputTokens?.value ?? 0);
  return tokens > 0 ? `${tokens} tokens, no timeline` : "No timeline yet";
}

function MetricGroup({
  title,
  lines,
  compact,
  colors,
}: {
  readonly title: string;
  readonly lines: readonly MetricLine[];
  readonly compact: boolean;
  readonly colors: PluginButtonContentProps["theme"]["colors"];
}) {
  if (lines.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.metricLabel, { color: colors.foregroundMuted, fontSize: compact ? 9 : 10 }]}>{title}</Text>
      <View style={[styles.group, { gap: compact ? 4 : 8 }]}>
        {lines.map((line) => (
          <View key={line.label} style={[styles.metric, { gap: 4 }]}>
            <Text style={[styles.metricLabel, { color: colors.foregroundMuted, fontSize: compact ? 10 : 11 }]}>{line.label}</Text>
            <Text style={{ color: colors.foreground, fontSize: compact ? 10 : 11 }}>{line.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function createPulselinePresentation(input: PulselineRuntimeInput): PulselinePresentation {
  const runtime = createPulselineRuntime(input);
  const useSnapshot = () => useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );

  function Icon({ size, theme }: PluginButtonIconProps) {
    const snapshot = useSnapshot();
    const blocks = snapshot.blocks.slice(-3);
    const activeKind: PulseKind | undefined = currentTool(snapshot)
      ? "tool"
      : (snapshot.busy ? "reasoning" : undefined);
    const kinds: readonly PulseKind[] = activeKind
      ? [...blocks.slice(-2).map(({ kind }) => kind), activeKind]
      : (blocks.length > 0 ? blocks.map(({ kind }) => kind) : ["other"]);
    return (
      <View accessible={false} style={[styles.icon, { height: size, opacity: pulseOpacity(snapshot), width: size }]}> 
        {kinds.map((kind, index) => {
          const geometry = PULSE_GEOMETRY[kind];
          return <View key={`${kind}:${index}`} style={[styles.iconBar, { backgroundColor: blockColor(kind, theme.colors), height: Math.max(3, Math.min(size, geometry.height)), width: Math.max(2, size / 6) }]} />;
        })}
      </View>
    );
  }

  function Content({ theme, layout }: PluginButtonContentProps) {
    const snapshot = useSnapshot();
    const compact = layout.compact;
    const tier = selectContentTier(compact, snapshot);
    const showDetails = tier === "full";
    const blocks = snapshot.blocks.slice(compact ? -16 : -32);
    const tool = currentTool(snapshot);
    return (
      <View style={[styles.content, { gap: compact ? 8 : 12, padding: compact ? 8 : 12 }]}>
        {showDetails ? <View style={[styles.header, { gap: 8 }]}> 
          <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.foreground, fontSize: compact ? 12 : 14 }]}>Pulseline</Text>
          <Text numberOfLines={1} style={[styles.status, { color: tool ? theme.colors.statusWarning : theme.colors.foregroundMuted, fontSize: compact ? 10 : 11 }]}>{tool ? `${tool} · running` : snapshot.label}</Text>
        </View> : null}
        <View accessibilityLabel="Agent activity pulse" style={[styles.strip, { gap: compact ? 1 : 2, minHeight: compact ? 16 : 20 }]}>
          {blocks.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.foregroundMuted, fontSize: compact ? 10 : 11 }]}>{emptyFallback(snapshot)}</Text>
          ) : blocks.map((block) => {
            const geometry = PULSE_GEOMETRY[block.kind];
            return <View accessibilityLabel={block.text ? `${block.kind}: ${block.text}` : block.kind} key={block.id} style={[styles.block, { backgroundColor: blockColor(block.kind, theme.colors), flexGrow: geometry.weight, height: compact ? Math.max(3, geometry.height - 2) : geometry.height }]} />;
          })}
        </View>
        {showDetails ? <MetricGroup colors={theme.colors} compact={compact} lines={exactMetrics(snapshot.metrics)} title="Usage" /> : null}
        {showDetails ? <MetricGroup colors={theme.colors} compact={compact} lines={observedMetrics(snapshot.metrics)} title="Observed" /> : null}
      </View>
    );
  }

  return {
    ...runtime,
    Icon,
    Content,
  };
}
