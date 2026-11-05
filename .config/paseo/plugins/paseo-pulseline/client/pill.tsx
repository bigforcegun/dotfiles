import type { PluginButtonContentProps, PluginButtonIconProps } from "@getpaseo/plugin/client";
import { memo, useCallback, useRef, useState, useSyncExternalStore, type FunctionComponent } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WorkingRing } from "./working-ring";
import { buildPulseView, PULSE_LABEL_WIDTH, type PulseColor, type PulseMetricLine, type PulseSegment } from "./pulse-view";
import { createPulselineRuntime, type PulselineRuntime, type PulselineRuntimeInput } from "./runtime";
import { Icon as HostIcon } from "@getpaseo/plugin/client/ui";
import { buildHistoryView, statusHeader, pulseActivityColor, pulseSegmentIcon, pulseStripData } from "./pulse-view";
import { VirtualStrip } from "./virtual-strip";
import { counterLayout } from "./counter-layout";

import type { TimelineSnapshot } from "./store";

export { PULSE_GLYPHS, PULSE_LABEL_WIDTH, buildComposerPulseLabel, buildPulseView, formatClockDuration } from "./pulse-view";
export { PULSE_INTERVAL_MS } from "./runtime";

export type ContentTier = "full" | "blocks-only" | "fallback";

const COMPOSER_LABEL_SLOT_WIDTH = 8;
const POPOVER_CONTENT_WIDTH = 420 - 2 * 12 - 2 * 1;


type PulselineLabelProps = PluginButtonIconProps;

export interface PulselinePresentation extends PulselineRuntime {
  readonly Icon: FunctionComponent<PluginButtonIconProps>;
  readonly Label: FunctionComponent<PulselineLabelProps>;
  readonly Content: FunctionComponent<PluginButtonContentProps>;
}

const styles = StyleSheet.create({
  // v0.14 host: max surface 420, plugin padding 12 per side, surface border 1 per side.
  content: { width: POPOVER_CONTENT_WIDTH, minWidth: POPOVER_CONTENT_WIDTH, maxWidth: POPOVER_CONTENT_WIDTH, flexShrink: 0 },
  header: { fontWeight: "700" },
  icon: { alignItems: "center", justifyContent: "center" },
  dot: { borderRadius: 4, height: 8, width: 8 },
  composerLabel: { alignItems: "flex-end", flexDirection: "row", flexShrink: 0, height: 18, justifyContent: "flex-end", overflow: "hidden", width: PULSE_LABEL_WIDTH * COMPOSER_LABEL_SLOT_WIDTH },
  composerLabelGlyph: { flexShrink: 0, fontSize: 12, height: 18, lineHeight: 18, textAlign: "center", width: COMPOSER_LABEL_SLOT_WIDTH },
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

function Metrics({ lines, colors, loading = false, loadedBlocks = 0 }: {
  readonly lines: readonly PulseMetricLine[];
  readonly colors: PluginButtonContentProps["theme"]["colors"];
  readonly loading?: boolean;
  readonly loadedBlocks?: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [slotWidth, setSlotWidth] = useState(40);
  return <View onLayout={event => setSlotWidth(event.nativeEvent.layout.width / 6)}>
    {[lines.slice(0, 6), lines.slice(6, 12)].map((row, index) =>
      <View key={index} style={{ flexDirection: "row", width: "100%" }}>
        {row.map(line => {
          const counter = counterLayout(line.value, slotWidth);
          return <Pressable key={line.id} accessibilityLabel={line.hint}
          onHoverIn={() => setHovered(line.id)} onHoverOut={() => setHovered(null)}
          onFocus={() => setHovered(line.id)} onBlur={() => setHovered(null)}
          onPress={() => setHovered(hovered === line.id ? null : line.id)}
          style={{ width: "16.666666%", height: 36, flexDirection: "row", gap: 2, alignItems: "center", justifyContent: "flex-start", paddingLeft: 0, minWidth: 0 }}>
          <HostIcon name={line.icon} size={counter.iconSize} color={colors.foregroundMuted} />
          <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: counter.fontSize, fontWeight: "600", fontFamily: "monospace", fontVariant: ["tabular-nums"] }}>{counter.value}</Text>
        </Pressable>; })}
      </View>)}
    <View accessibilityLabel="Counter details" style={{ height: 32, flexDirection: "row", alignItems: "flex-start", gap: 4, paddingLeft: 0 }}>
      {loading ? <WorkingRing size={12} color={colors.foregroundMuted} /> : <HostIcon name={lines.find(line => line.id === hovered)?.icon ?? "Info"} size={12} color={colors.foregroundMuted} />}
      <Text numberOfLines={2} style={{ flex: 1, lineHeight: 14, color: colors.foregroundMuted, fontSize: 10 }}>{loading ? `Loading history… ${loadedBlocks} blocks` : lines.find(line => line.id === hovered)?.hint ?? "Hover or focus a counter for its source and exact value."}</Text>
    </View>
  </View>;
}

export function PulseFooter({ segments, colors, historyLoaded, loadingOlder = false }: {
  readonly segments: readonly PulseSegment[];
  readonly historyLoaded: boolean;
  readonly loadingOlder?: boolean;
  readonly colors: PluginButtonContentProps["theme"]["colors"];
}) {
  const [hoveredId, setHovered] = useState<string | null>(null);
  const hoverRef = useRef<string | null>(hoveredId);
  const onSelect = useCallback((id: string | null) => {
    if (hoverRef.current !== id) { hoverRef.current = id; setHovered(id); }
  }, []);
  const data = pulseStripData(segments);
  const index = hoveredId === null ? undefined : data.indices.get(hoveredId);
  const selected = index === undefined ? segments.at(-1) : segments[index];
  const description = selected ? `${selected.kind}${selected.metadata?.type === "tool" ? ` · ${selected.metadata.name} · ${selected.metadata.status}` : ""} · size bucket ${selected.sizeBucket}/8 (~${selected.volumeTokens} tokens)` : "No activity yet";
  return <View accessibilityLabel="Agent activity pulse" style={{ width: "100%" }}>
    <BlockHint description={description} icon={selected ? pulseSegmentIcon(selected) : "Activity"} color={colors.foregroundMuted} />
    <View style={{ width: "100%" }}>
      <VirtualStrip segments={segments} data={data} colors={colors} historyLoaded={historyLoaded} hoveredId={hoveredId} onSelect={onSelect} />
      {loadingOlder ? <View accessibilityLabel="History loading at left edge" pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: 12, height: 54, borderLeftWidth: 1, borderColor: colors.foregroundMuted }}>
        <WorkingRing size={12} color={colors.foregroundMuted} />
      </View> : null}
    </View>
    <Legend entries={data.legend} colors={colors} />
  </View>;
}

const BlockHint = memo(function BlockHint({ description, icon, color }: { description: string; icon: string; color: string }) {
  return <View accessibilityLabel="Selected activity details" style={{ height: 32, flexDirection: "row", gap: 4, paddingLeft: 0 }}>
    <HostIcon name={icon} size={12} color={color} />
    <Text numberOfLines={2} style={{ flex: 1, fontSize: 10, color }}>{description}</Text>
  </View>;
});
const Legend = memo(function Legend({ entries, colors }: { entries: ReturnType<typeof pulseStripData>["legend"]; colors: PluginButtonContentProps["theme"]["colors"] }) {
  return <View accessibilityLabel="Activity colour legend" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
    {entries.map(entry => <View key={`${entry.label}:${entry.color}`} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: colors[entry.color] }} />
      <Text style={{ color: colors.foregroundMuted, fontSize: 9 }}>{entry.label}</Text>
    </View>)}
  </View>;
});


function ActivityMark({ size, colors, snapshot }: { size: number; colors: PluginButtonContentProps["theme"]["colors"]; snapshot: TimelineSnapshot }) {
  return <View accessibilityLabel={`Agent activity ${snapshot.busy ? "active" : "idle"}`} style={[styles.icon, { height: size, width: size }]}>
    {snapshot.busy ? <WorkingRing size={size} color={segmentColor(pulseActivityColor(snapshot), colors)} /> :
      <View style={[styles.dot, { backgroundColor: colors.foregroundMuted, opacity: 0.5 }]} />}
  </View>;
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
    return <ActivityMark size={size} colors={theme.colors} snapshot={snapshot} />;
  }

  function Label({ theme }: PulselineLabelProps) {
    const snapshot = useSnapshot();
    const segments = buildPulseView(snapshot, PULSE_LABEL_WIDTH).segments;
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
                opacity: segment.opacity,
              },
            ]}
          >
            {segment.glyph}
          </Text>
        ))}
      </View>
    );
  }

  function Content({ theme }: PluginButtonContentProps) {
    const snapshot = useSnapshot();
    const view = buildHistoryView(snapshot);
    return (
      <View style={[styles.content, { gap: 4, paddingLeft: 0 }]}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <ActivityMark size={16} colors={theme.colors} snapshot={snapshot} />
          <Text accessibilityRole="header" style={[styles.header, { color: theme.colors.foreground, fontSize: 14 }]}>{statusHeader(snapshot)}</Text>
          </View>
          {snapshot.gap && !snapshot.loadingOlder ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>Incomplete history</Text> : null}
        </View>
        <Metrics colors={theme.colors} lines={view.metrics} loading={snapshot.loadingOlder === true} loadedBlocks={snapshot.blocks.length} />
        <PulseFooter colors={theme.colors} segments={view.segments} historyLoaded={snapshot.historyLoaded === true} loadingOlder={snapshot.loadingOlder ?? false} />
      </View>
    );
  }

  return { ...runtime, Icon, Label, Content };
}
