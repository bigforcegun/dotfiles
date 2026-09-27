import { useMemo } from "react";
import { Text, View } from "react-native";
import { type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { type NodeKind } from "./model";
import { kindMarker, makeStyles, row } from "./styles";
import { PROJECT_COLOR, providerIcon } from "./view";

/**
 * Size encodes what a node is, colour encodes how it is doing, and the mark
 * inside an agent says which tool runs it. None of the three is guessable from
 * the graph alone, so the legend has to say all three.
 */

interface LegendProps {
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
  /** Provider families present on the canvas, already sorted. */
  families: readonly string[];
}

const KINDS: NodeKind[] = ["project", "workspace", "agent"];

/** Big enough to read in a text row, unlike the mark on a zoomed-out dot. */
const LEGEND_GLYPH_SIZE = 11;

export function Legend({ theme, compact, families }: LegendProps) {
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

      {families.length > 0 ? (
        <View style={row.group}>
          {families.map((family) => {
            const icon = providerIcon(family);
            if (!icon) return null;
            return (
              <View key={family} style={row.group}>
                <Icon name={icon} size={LEGEND_GLYPH_SIZE} color={theme.colors.foregroundMuted} />
                <Text style={styles.legendCaption}>{family}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

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
