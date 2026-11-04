import type { PluginButtonContentProps, PluginButtonIconProps } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState, useSyncExternalStore, type FunctionComponent } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { buildPulseView, PULSE_LABEL_WIDTH, type PulseColor, type PulseMetricLine, type PulseSegment } from "./pulse-view";
import { createPulselineRuntime, type PulselineRuntime, type PulselineRuntimeInput } from "./runtime";
import { Icon as HostIcon, ScrollView } from "@getpaseo/plugin/client/ui";
import { buildHistoryView, statusHeader, pulseActivityColor, pulseSegmentIcon, pulseLegend } from "./pulse-view";
import { counterLayout } from "./counter-layout";
import { attachStripWheel } from "./strip-wheel";
import type { TimelineSnapshot } from "./store";

export { PULSE_GLYPHS, PULSE_LABEL_WIDTH, buildComposerPulseLabel, buildPulseView, formatClockDuration } from "./pulse-view";
export { PULSE_INTERVAL_MS } from "./runtime";

export type ContentTier = "full" | "blocks-only" | "fallback";

const COMPOSER_LABEL_SLOT_WIDTH = 8;


type PulselineLabelProps = PluginButtonIconProps;

export interface PulselinePresentation extends PulselineRuntime {
  readonly Icon: FunctionComponent<PluginButtonIconProps>;
  readonly Label: FunctionComponent<PulselineLabelProps>;
  readonly Content: FunctionComponent<PluginButtonContentProps>;
}

const styles = StyleSheet.create({
  content: { width: "100%", minWidth: 0 },
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

function Metrics({ lines, colors }: {
  readonly lines: readonly PulseMetricLine[];
  readonly colors: PluginButtonContentProps["theme"]["colors"];
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
          style={{ width: "16.666666%", height: 36, flexDirection: "row", gap: 2, alignItems: "center", justifyContent: "center", minWidth: 0 }}>
          <HostIcon name={line.icon} size={counter.iconSize} color={colors.foregroundMuted} />
          <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: counter.fontSize, fontWeight: "600", fontFamily: "monospace", fontVariant: ["tabular-nums"] }}>{counter.value}</Text>
        </Pressable>; })}
      </View>)}
    <View style={{ minHeight: 68, backgroundColor: colors.surface1, padding: 4 }}>
      <Text style={{ color: colors.foregroundMuted, fontSize: 10 }}>{lines.find(line => line.id === hovered)?.hint ?? "Hover or focus a counter for its source and exact value."}</Text>
    </View>
  </View>;
}

function PulseFooter({ segments, colors, historyLoaded }: {
  readonly segments: readonly PulseSegment[];
  readonly historyLoaded: boolean;
  readonly colors: PluginButtonContentProps["theme"]["colors"];
}) {
  const [hoveredId, setHovered] = useState<string | null>(null);
  const selected = segments.find(item => item.id === hoveredId) ?? segments.at(-1);
  const scroller = useRef<import("react-native").ScrollView | null>(null);
  const initiallyScrolled = useRef(false);
  useEffect(() => attachStripWheel(scroller.current?.getScrollableNode?.()), []);
  useEffect(() => {
    if (historyLoaded && segments.length && !initiallyScrolled.current) {
      scroller.current?.scrollToEnd({ animated: false });
      initiallyScrolled.current = true;
    }
  }, [historyLoaded, segments.length]);
  const description = selected ? `${selected.kind}${selected.metadata?.type === "tool" ? ` · ${selected.metadata.name} · ${selected.metadata.status}` : ""} · size bucket ${selected.sizeBucket}/8 (~${selected.volumeTokens} tokens)` : "No activity yet";
  return <View accessibilityLabel="Agent activity pulse" style={{ width: "100%" }}>
    <View accessibilityLabel="Selected activity details" style={{ height: 42, flexDirection: "row", gap: 4, paddingTop: 4 }}>
      <HostIcon name={selected ? pulseSegmentIcon(selected) : "Activity"} size={12} color={colors.foregroundMuted} />
      <Text numberOfLines={2} style={{ flex: 1, fontSize: 10, color: colors.foregroundMuted }}>{description}</Text>
    </View>
    <ScrollView horizontal ref={scroller} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}
      style={{ width: "100%", height: 76, flexShrink: 0 }}
      contentContainerStyle={{ paddingBottom: 20 }}
      onContentSizeChange={() => {
        if (!initiallyScrolled.current && historyLoaded && segments.length) {
          scroller.current?.scrollToEnd({ animated: false });
          initiallyScrolled.current = true;
        }
      }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 54, gap: 2 }}>
        {segments.map(item => <Pressable key={item.id} accessibilityLabel={`${item.kind} size bucket ${item.sizeBucket}`}
          onHoverIn={() => setHovered(item.id)} onHoverOut={() => setHovered(null)}
          onFocus={() => setHovered(item.id)} onBlur={() => setHovered(null)}
          onPress={() => setHovered(item.id)}
          style={{ width: 10, height: 54, ...(hoveredId === item.id ? { backgroundColor: colors.surface2 } : {}) }}>
          <View style={{ width: 10, height: 40, justifyContent: "flex-end" }}>
            <View style={{ width: 10, borderRadius: 2, height: item.height * 2, opacity: item.opacity, backgroundColor: segmentColor(item.color, colors) }} />
          </View>
          <View style={{ width: 10, height: 14, alignItems: "center", justifyContent: "center" }}>
            <HostIcon name={pulseSegmentIcon(item)} size={10} color={segmentColor(item.color, colors)} />
          </View>
        </Pressable>)}
      </View>
    </ScrollView>
    <View accessibilityLabel="Activity colour legend" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {pulseLegend(segments).map(entry => <View key={`${entry.label}:${entry.color}`} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: segmentColor(entry.color, colors) }} />
        <Text style={{ color: colors.foregroundMuted, fontSize: 9 }}>{entry.label}</Text>
      </View>)}
    </View>
  </View>;
}

function WorkingRing({ size, color }: { size: number; color: string }) {
  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.timing(rotation, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: false }));
    animation.start();
    return () => { animation.stop(); rotation.setValue(0); };
  }, [rotation]);
  const diameter = Math.max(8, size - 2);
  return <View style={{ width: diameter, height: diameter }}>
    <View style={{ position: "absolute", width: diameter, height: diameter, borderRadius: diameter / 2, borderWidth: 2, borderColor: color, opacity: 0.2 }} />
    <Animated.View style={{ width: diameter, height: diameter, transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
      <View style={{ width: diameter / 2, height: diameter / 2, borderTopLeftRadius: diameter / 2, borderTopWidth: 2, borderLeftWidth: 2, borderColor: color }} />
    </Animated.View>
  </View>;
}

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
      <View style={[styles.content, { gap: 8 }]}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <ActivityMark size={16} colors={theme.colors} snapshot={snapshot} />
          <Text accessibilityRole="header" style={[styles.header, { color: theme.colors.foreground, fontSize: 14 }]}>{statusHeader(snapshot)}</Text>
          </View>
          {snapshot.gap ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>Incomplete history</Text> : null}
        </View>
        <Metrics colors={theme.colors} lines={view.metrics} />
        <PulseFooter colors={theme.colors} segments={view.segments} historyLoaded={snapshot.historyLoaded === true} />
      </View>
    );
  }

  return { ...runtime, Icon, Label, Content };
}
