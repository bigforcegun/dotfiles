import type { PluginButtonIconProps } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";
import type { PulsePrimitives } from "./detail-tree.ts";
import { PULSE_SLOTS, pulseGlyphsTree } from "./pulse-glyphs.ts";
import { buildPulseSegments } from "./pulse-segments.ts";
import { resolvePulseAgentId } from "./pulse-target.ts";
import { usePulseView } from "./use-pulse-view.ts";

const PRIMITIVES: PulsePrimitives = { View, Text };

/**
 * Optional custom composer label. Paseo's shipped contract is a plain string, so
 * the descriptor keeps one; a host that supports a Label component renders this
 * instead and gets the very same glyphs, one `Text` per cell, each in its own kind
 * colour, inside a fixed container the pulse cannot resize. Props follow the icon
 * slot's shape (host props + button context); the component ignores the rest.
 */
export function PulseLabel(props: PluginButtonIconProps) {
  const { theme, ...target } = props;
  const view = usePulseView(resolvePulseAgentId(target));
  const segments = view
    ? buildPulseSegments(view.state, { width: PULSE_SLOTS, phase: view.phase })
    : [];
  return pulseGlyphsTree(segments, theme.colors, PRIMITIVES, { phase: view?.phase ?? 0 });
}
