import type { PluginButtonIconProps } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import { View } from "react-native";
import { usePulseView } from "./use-pulse-view.ts";

/**
 * Composer pill icon: a state dot that breathes while a turn is in flight. The
 * phase comes from the store's own turn clock, so this component owns no timer.
 */
export function PulseIcon({ theme, layout, size, color, ...target }: PluginButtonIconProps) {
  const agentId = target.context === "agent" ? target.agentId : null;
  const view = usePulseView(agentId);
  const state = view?.state;
  const pending = state?.blocks.some((block) => block.pending) ?? false;
  const failing = state?.status === "error" || state?.blocks.at(-1)?.kind === "error";
  const busy = state?.busy ?? false;
  const seconds = view?.metrics.turnSeconds?.value ?? 0;

  const styles = useMemo(() => {
    const fill = failing
      ? theme.colors.statusDanger
      : busy
        ? theme.colors.accent
        : pending
          ? theme.colors.statusWarning
          : state?.historyLoaded
            ? theme.colors.foregroundMuted
            : color;
    const ring = layout.compact ? 1 : 1.5;
    return {
      frame: {
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: busy ? ring : 0,
        borderColor: theme.colors.accent,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      core: {
        width: Math.max(2, size * (busy && Math.floor(seconds) % 2 === 0 ? 0.72 : 0.5)),
        height: Math.max(2, size * (busy && Math.floor(seconds) % 2 === 0 ? 0.72 : 0.5)),
        borderRadius: size,
        backgroundColor: fill,
        opacity: busy && Math.floor(seconds) % 2 === 1 ? 0.6 : 1,
      },
    };
  }, [theme, layout.compact, size, color, busy, pending, failing, seconds, state?.historyLoaded]);

  return (
    <View style={styles.frame}>
      <View style={styles.core} />
    </View>
  );
}
