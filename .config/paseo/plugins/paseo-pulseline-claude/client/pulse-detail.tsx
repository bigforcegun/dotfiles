import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { buildDetailModel, type DetailRow } from "./detail-model.ts";
import { buildPulseStrip, type PulseStripBar } from "./pulse-strip.ts";
import { usePulseView } from "./use-pulse-view.ts";

type Styles = ReturnType<typeof useStyles>;

function useStyles(theme: PluginButtonContentProps["theme"], compact: boolean) {
  return useMemo(
    () => ({
      body: { gap: compact ? 10 : 14, minWidth: compact ? 220 : 300 },
      status: { color: theme.colors.foreground, fontSize: compact ? 15 : 17 },
      note: { color: theme.colors.foregroundMuted, fontSize: compact ? 11 : 12 },
      strip: {
        flexDirection: "row" as const,
        alignItems: "flex-end" as const,
        gap: 2,
        height: compact ? 28 : 40,
        paddingVertical: 2,
      },
      sectionTitle: { color: theme.colors.foregroundMuted, fontSize: compact ? 11 : 12 },
      section: { gap: compact ? 2 : 4 },
      row: { flexDirection: "row" as const, justifyContent: "space-between" as const, gap: 12 },
      rowLabel: { color: theme.colors.foregroundMuted, fontSize: compact ? 12 : 13 },
      rowValue: { color: theme.colors.foreground, fontSize: compact ? 12 : 13 },
      rowApprox: { color: theme.colors.foregroundMuted, fontSize: compact ? 12 : 13 },
      divider: { height: 1, backgroundColor: theme.colors.border },
    }),
    [theme, compact],
  );
}

function Bar({ bar, theme, height }: {
  bar: PulseStripBar;
  theme: PluginButtonContentProps["theme"];
  height: number;
}) {
  return (
    <View
      accessibilityLabel={`${bar.kind}${bar.pending ? ", running" : ""}`}
      style={{
        width: 4,
        borderRadius: 1,
        height: Math.max(2, height * bar.heightRatio),
        backgroundColor: theme.colors[bar.token],
        opacity: bar.pending ? 0.65 : 1,
        borderWidth: bar.pending ? 1 : 0,
        borderColor: theme.colors.accent,
      }}
    />
  );
}

function Row({ row, styles }: { row: DetailRow; styles: Styles }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{row.label}</Text>
      <Text style={row.approx ? styles.rowApprox : styles.rowValue}>{row.value}</Text>
    </View>
  );
}

function emptyNote(
  detail: ReturnType<typeof buildDetailModel>,
  state: { historyLoaded: boolean; historyFailed: boolean } | undefined,
): string {
  if (state && !state.historyLoaded) return "Reading this conversation from the daemon…";
  if (state?.historyFailed) return "The daemon did not return this conversation's history.";
  if (detail.busy) return "Waiting for the first rows of this turn.";
  return "Nothing to draw yet.";
}

/** Anchored popover body. Paseo owns anchoring, padding and dismissal. */
export function PulseDetail({ theme, layout, ...target }: PluginButtonContentProps) {
  const agentId = target.context === "agent" ? target.agentId : null;
  const view = usePulseView(agentId);
  const styles = useStyles(theme, layout.compact);
  const state = view?.state;
  const detail = useMemo(
    () => (view ? buildDetailModel(view.state, view.metrics) : null),
    [view],
  );
  const bars = useMemo(
    () => (state ? buildPulseStrip(state, { compact: layout.compact }) : []),
    [state, layout.compact],
  );
  const stripHeight = layout.compact ? 26 : 38;

  if (!detail) {
    return (
      <View style={styles.body}>
        <Text style={styles.status}>Pulseline is starting…</Text>
      </View>
    );
  }

  // Paseo owns anchoring, padding and scrolling for popover content: render body only.
  return (
    <View style={styles.body}>
        <Text style={styles.status}>{detail.status}</Text>
        {bars.length > 0 ? (
          <View accessibilityLabel="Conversation pulse" style={styles.strip}>
            {bars.map((bar) => (
              <Bar key={bar.key} bar={bar} theme={theme} height={stripHeight} />
            ))}
          </View>
        ) : (
          <Text style={styles.note}>{emptyNote(detail, state)}</Text>
        )}
        {detail.sections.map((section) => (
          <View key={section.id} style={styles.section}>
            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.rows.map((row) => (
              <Row key={row.label} row={row} styles={styles} />
            ))}
          </View>
        ))}
        {detail.incomplete ? (
          <Text style={styles.note}>Older history was not read; counts describe the tail only.</Text>
        ) : null}
    </View>
  );
}
