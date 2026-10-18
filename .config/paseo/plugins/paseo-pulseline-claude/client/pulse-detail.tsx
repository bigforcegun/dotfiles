import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { buildDetailModel } from "./detail-model.ts";
import { detailStyles, pulseDetailTree, type PulsePrimitives } from "./detail-tree.ts";
import { resolvePulseAgentId } from "./pulse-target.ts";
import { usePulseView } from "./use-pulse-view.ts";

/** The only place React Native primitives enter the popover. */
const PRIMITIVES: PulsePrimitives = { View, Text };

/** Anchored popover body. Paseo owns anchoring, padding and dismissal. */
export function PulseDetail({ theme, layout, ...target }: PluginButtonContentProps) {
  const view = usePulseView(resolvePulseAgentId(target));
  const styles = useMemo(
    () => detailStyles(theme.colors, layout.compact),
    [theme, layout.compact],
  );
  const detail = useMemo(
    () => (view ? buildDetailModel(view.state, view.metrics, { phase: view.phase }) : null),
    [view],
  );
  return pulseDetailTree(detail, styles, theme.colors, PRIMITIVES);
}
