import { StyleSheet } from "react-native";
import { type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { type NodeKind } from "./model";
import { RADIUS } from "./view";

/**
 * Every fixed measurement the chrome around the canvas is built from, and the
 * one factory that turns a theme into styles. Two reasons this is not spread
 * across the components: the spacing scale is only a scale if it is written
 * down in one place, and a style object rebuilt on each render is a new object
 * to React even when nothing about it changed.
 *
 * What is missing here is deliberate. A node, an edge and a label are
 * positioned from the simulation and genuinely differ every frame; their styles
 * stay inline, where the arithmetic that produces them is visible.
 */

type Theme = PluginSurfaceProps["theme"];

/** The spacing scale. `compact` picks the tighter of each pair. */
const CHROME = {
  gap: 6,
  gapToolbar: 8,
  gapLegendColumn: 14,
  padCompact: 12,
  padRoomy: 16,
  padToolbar: 10,
  padLegend: 8,
  padButtonX: 10,
  padButtonY: 6,
  radiusButton: 8,
  hairline: 1,
  captionCompact: 9,
  captionRoomy: 10,
  fontButton: 13,
  titleCompact: 15,
  titleRoomy: 17,
  statusSwatch: 9,
  ruleWidth: 20,
  ruleHeight: 1.5,
} as const;

/** Shared by every row of the chrome: icon then label, vertically centred. */
export const row = StyleSheet.create({
  group: { flexDirection: "row", alignItems: "center", gap: CHROME.gap },
});

/**
 * The legend's kind markers are sized from RADIUS, which is fixed - so all
 * three exist up front rather than being rebuilt per render.
 */
export const kindMarker = StyleSheet.create(
  Object.fromEntries(
    (Object.keys(RADIUS) as NodeKind[]).map((kind) => [
      kind,
      {
        width: RADIUS[kind],
        height: RADIUS[kind],
        borderRadius: RADIUS[kind] / 2,
        borderWidth: CHROME.hairline,
      },
    ]),
  ) as Record<NodeKind, { width: number; height: number; borderRadius: number; borderWidth: number }>,
);

export const canvas = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  overlay: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  fill: { width: "100%", height: "100%" },
});

/**
 * Themed styles. Call once per (theme, compact) pair and hold the result -
 * StyleSheet.create registers each entry, so rebuilding it every render would
 * throw away the registration it exists to provide.
 */
export function makeStyles(theme: Theme, compact: boolean) {
  const pad = compact ? CHROME.padCompact : CHROME.padRoomy;
  const caption = compact ? CHROME.captionCompact : CHROME.captionRoomy;

  return StyleSheet.create({
    surface: { flex: 1, backgroundColor: theme.colors.surface0 },

    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      gap: CHROME.gapToolbar,
      paddingHorizontal: pad,
      paddingVertical: CHROME.padToolbar,
      borderBottomWidth: CHROME.hairline,
      borderBottomColor: theme.colors.border,
    },
    toolbarTitle: {
      color: theme.colors.foreground,
      fontSize: compact ? CHROME.titleCompact : CHROME.titleRoomy,
      flex: 1,
    },

    button: {
      paddingHorizontal: CHROME.padButtonX,
      paddingVertical: CHROME.padButtonY,
      borderRadius: CHROME.radiusButton,
      backgroundColor: theme.colors.surface2,
    },
    buttonActive: { backgroundColor: theme.colors.accent },
    buttonLabel: { fontSize: CHROME.fontButton, color: theme.colors.foreground },
    buttonLabelActive: { color: theme.colors.accentForeground },

    legend: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      columnGap: CHROME.gapLegendColumn,
      rowGap: CHROME.gap,
      paddingHorizontal: pad,
      paddingVertical: CHROME.padLegend,
      borderBottomWidth: CHROME.hairline,
      borderBottomColor: theme.colors.border,
    },
    legendCaption: { color: theme.colors.foregroundMuted, fontSize: caption },
    legendKindOutline: { borderColor: theme.colors.foregroundMuted },
    legendKindFill: { backgroundColor: theme.colors.foregroundMuted },
    statusSwatch: {
      width: CHROME.statusSwatch,
      height: CHROME.statusSwatch,
      borderRadius: CHROME.statusSwatch / 2,
    },
    ruleContains: {
      width: CHROME.ruleWidth,
      height: CHROME.ruleHeight,
      backgroundColor: theme.colors.foregroundMuted,
    },
    ruleSpawn: {
      width: CHROME.ruleWidth,
      height: CHROME.ruleHeight,
      backgroundColor: theme.colors.accent,
    },

    overlayText: { color: theme.colors.foregroundMuted },
    overlayError: { color: theme.colors.statusDanger },
  });
}

export type Styles = ReturnType<typeof makeStyles>;
