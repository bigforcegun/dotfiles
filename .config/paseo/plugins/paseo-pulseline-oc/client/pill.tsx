import type { PluginButtonContentProps, PluginButtonIconProps } from "@getpaseo/plugin/client";
import { useSyncExternalStore, type FunctionComponent } from "react";
import { StyleSheet, Text, View } from "react-native";
import { buildPulseView, PULSE_LABEL_WIDTH, type PulseColor, type PulseMetricLine, type PulseSegment } from "./pulse-view";
import { createPulselineRuntime, type PulselineRuntime, type PulselineRuntimeInput } from "./runtime";
import type { TimelineSnapshot } from "./store";

export { PULSE_GLYPHS, PULSE_LABEL_WIDTH, buildComposerPulseLabel, buildPulseView, formatClockDuration } from "./pulse-view";
export { PULSE_INTERVAL_MS } from "./runtime";

export type ContentTier = "full" | "blocks-only" | "fallback";

const DOT_SCALE = [1, 1.3, 1.1] as const;
const DOT_OPACITY = [0.8, 1, 0.9] as const;
const COMPOSER_LABEL_SLOT_WIDTH = 8;
const FOOTER_HEIGHT_SCALE = 3;

type PulselineLabelProps = PluginButtonIconProps;

export interface PulselinePresentation extends PulselineRuntime {
  readonly Icon: FunctionComponent<PluginButtonIconProps>;
  readonly Label: FunctionComponent<PulselineLabelProps>;
  readonly Content: FunctionComponent<PluginButtonContentProps>;
}

const styles = StyleSheet.create({
  content: { maxWidth: 360, width: "100%" },
  header: { fontWeight: "700" },
  metrics: { flexDirection: "row", flexWrap: "wrap" },
  metric: { flexDirection: "row" },
  metricIcon: { fontWeight: "700" },
  empty: { textAlign: "center" },
  icon: { alignItems: "center", justifyContent: "center" },
  dot: { borderRadius: 4, height: 8, width: 8 },
  composerLabel: { alignItems: "flex-end", flexDirection: "row", flexShrink: 0, height: 18, justifyContent: "flex-end", overflow: "hidden", width: PULSE_LABEL_WIDTH * COMPOSER_LABEL_SLOT_WIDTH },
  composerLabelGlyph: { flexShrink: 0, fontSize: 12, height: 18, lineHeight: 18, textAlign: "center", width: COMPOSER_LABEL_SLOT_WIDTH },
  footer: { alignItems: "flex-end", flexDirection: "row", minHeight: 54, width: "100%" },
  segment: { flexDirection: "row", width: 6 },
  block: { borderRadius: 2, flex: 1 },
  separator: { alignSelf: "stretch", width: 1 },
});

export function selectContentTier(compact: boolean, snapshot: TimelineSnapshot): ContentTier {
  if (!compact) return "full";
  return snapshot.blocks.length > 0 ? "blocks-only" : "fallback";
}

function segmentColor(
  color: PulseColor,
  colors: PluginButtonContentProps["theme"]["colors"],
): string {
  return colors[color];
}

function Metrics({
  lines,
  compact,
  colors,
}: {
  readonly lines: readonly PulseMetricLine[];
  readonly compact: boolean;
  readonly colors: PluginButtonContentProps["theme"]["colors"];
}) {
  if (lines.length === 0) {
    return <Text style={[styles.empty, { color: colors.foregroundMuted, fontSize: compact ? 10 : 11 }]}>No metrics yet</Text>;
  }
  return (
    <View style={[styles.metrics, { gap: compact ? 6 : 10 }]}>
      {lines.map((line) => (
        <View key={line.id} style={[styles.metric, { gap: 3 }]}>
          <Text style={[styles.metricIcon, { color: colors.foregroundMuted, fontSize: compact ? 10 : 11 }]}>{line.icon}</Text>
          <Text style={{ color: colors.foreground, fontSize: compact ? 10 : 11 }}>{line.value}</Text>
        </View>
      ))}
    </View>
  );
}

function PulseFooter({
  segments,
  colors,
}: {
  readonly segments: readonly PulseSegment[];
  readonly colors: PluginButtonContentProps["theme"]["colors"];
}) {
  return (
    <View accessibilityLabel="Agent activity pulse" style={styles.footer}>
      {segments.map((item) => (
        <View key={item.id} style={styles.segment}>
          <View
            accessibilityLabel={item.kind}
            style={[styles.block, { backgroundColor: segmentColor(item.color, colors), height: item.height * FOOTER_HEIGHT_SCALE }]}
          />
          {item.separatorAfter ? <View style={[styles.separator, { backgroundColor: colors.surface0 }]} /> : null}
        </View>
      ))}
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
    const signal = buildPulseView(snapshot, 1).segments.at(-1);
    const phase = snapshot.pulsePhase ?? 0;
    const color = snapshot.blocks.length > 0 || snapshot.busy
      ? segmentColor(signal?.color ?? "accent", theme.colors)
      : theme.colors.foregroundMuted;
    return (
      <View
        accessibilityLabel={`Agent activity ${snapshot.busy ? "active" : "idle"}`}
        style={[styles.icon, { height: size, width: size }]}
      >
        <View
          style={[
            styles.dot,
            {
              backgroundColor: color,
              opacity: snapshot.busy ? DOT_OPACITY[phase] : 0.5,
              transform: [{ scale: snapshot.busy ? DOT_SCALE[phase] : 0.75 }],
            },
          ]}
        />
      </View>
    );
  }

  function Label({ theme }: PulselineLabelProps) {
    const snapshot = useSnapshot();
    const segments = buildPulseView(snapshot, PULSE_LABEL_WIDTH).segments;
    const phase = snapshot.pulsePhase ?? 0;
    return (
      <View accessibilityLabel="Agent activity pulse" style={styles.composerLabel}>
        {segments.map((segment) => (
          <Text
            key={segment.id}
            accessibilityLabel={segment.kind}
            style={[
              styles.composerLabelGlyph,
              {
                color: segmentColor(segment.color, theme.colors),
                opacity: segment.active ? DOT_OPACITY[phase] : 0.9,
              },
            ]}
          >
            {segment.glyph}
          </Text>
        ))}
      </View>
    );
  }

  function Content({ theme, layout }: PluginButtonContentProps) {
    const snapshot = useSnapshot();
    const compact = layout.compact;
    const view = buildPulseView(snapshot);
    const showDetails = selectContentTier(compact, snapshot) === "full";
    return (
      <View style={[styles.content, { gap: compact ? 8 : 12, padding: compact ? 8 : 12 }]}>
        {showDetails ? <Text accessibilityRole="header" style={[styles.header, { color: theme.colors.foreground, fontSize: 14 }]}>Pulseline activity</Text> : null}
        {showDetails ? <Metrics colors={theme.colors} compact={compact} lines={view.metrics} /> : null}
        <PulseFooter colors={theme.colors} segments={view.segments} />
      </View>
    );
  }

  return { ...runtime, Icon, Label, Content };
}
