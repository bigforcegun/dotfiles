import { useMemo } from "react";
import { Text, View } from "react-native";
import { type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { type NodeKind } from "./model";
import { kindMarker, makeStyles, row } from "./styles";
import { PROJECT_COLOR } from "./view";

/**
 * Size encodes what a node is, colour encodes how it is doing. Neither is
 * guessable from the graph alone, so the legend has to say both.
 */

interface LegendProps {
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
}

const KINDS: NodeKind[] = ["project", "workspace", "agent"];

export function Legend({ theme, compact }: LegendProps) {
  const styles = useMemo(() => makeStyles(theme, compact), [theme, compact]);

  // Themed, so neither list can live in the static sheet - but both are the
  // same for a given theme, so each row's style array is built once here rather
  // than on every render.
  const statuses = useMemo(
    () =>
      (
        [
          ["running", theme.colors.accent],
          ["attention", theme.colors.statusWarning],
          ["failed", theme.colors.statusDanger],
          ["done", theme.colors.statusSuccess],
          ["idle", theme.colors.foregroundMuted],
          ["archived", theme.colors.border],
        ] as const
      ).map(([label, color]) => ({ label, style: [styles.statusSwatch, { backgroundColor: color }] })),
    [theme, styles],
  );

  const kindStyles = useMemo(
    () =>
      Object.fromEntries(
        KINDS.map((kind) => [
          kind,
          [
            kindMarker[kind],
            styles.legendKindOutline,
            // A project dot is black in every theme, so the outline is what
            // keeps it visible rather than the fill.
            kind === "project" ? { backgroundColor: PROJECT_COLOR } : styles.legendKindFill,
          ],
        ]),
      ) as Record<NodeKind, object[]>,
    [styles],
  );

  return (
    <View style={styles.legend}>
      <View style={row.group}>
        {KINDS.map((kind) => (
          <View key={kind} style={row.group}>
            <View style={kindStyles[kind]} />
            <Text style={styles.legendCaption}>{kind}</Text>
          </View>
        ))}
      </View>

      <View style={row.group}>
        {statuses.map((entry) => (
          <View key={entry.label} style={row.group}>
            <View style={entry.style} />
            <Text style={styles.legendCaption}>{entry.label}</Text>
          </View>
        ))}
      </View>

      <View style={row.group}>
        <View style={row.group}>
          <View style={styles.ruleContains} />
          <Text style={styles.legendCaption}>contains</Text>
        </View>
        <View style={row.group}>
          <View style={styles.ruleSpawn} />
          <Text style={styles.legendCaption}>spawned</Text>
        </View>
      </View>
    </View>
  );
}
