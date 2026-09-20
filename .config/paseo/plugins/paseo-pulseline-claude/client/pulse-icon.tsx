import type { PluginButtonIconProps } from "@getpaseo/plugin/client";
import { View } from "react-native";
import { buildPulseDot } from "./pulse-dot.ts";
import { resolvePulseAgentId } from "./pulse-target.ts";
import { usePulseView } from "./use-pulse-view.ts";

/**
 * Paseo requires every button to supply an icon and always reserves a 16x16 slot
 * for it (packages/app/src/plugins/buttons/view.tsx:89, :283, :658). The label is
 * a plain string, so this slot carries the only colour the pill can show: a dot
 * tinted by the newest activity that beats while the agent works. It is also the
 * part of the pill mounted while the popover is closed, so the lease lives here.
 */
export function PulseIcon({ theme, size, color, ...target }: PluginButtonIconProps) {
  const view = usePulseView(resolvePulseAgentId(target));
  const dot = buildPulseDot(view?.state ?? null, view?.phase ?? 0);
  const diameter = Math.max(4, Math.round(size * dot.scale));
  return (
    <View
      accessibilityLabel={dot.busy ? "Agent working" : "Agent idle"}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <View
        style={{
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: theme.colors[dot.token] ?? color,
          opacity: dot.opacity,
        }}
      />
    </View>
  );
}
