// Composer pill descriptor. One behavior instance per UI pair, so a label update
// never has to resupply the behavior and never closes an open popover.
import type {
  PluginButton,
  PluginButtonBehavior,
  PluginButtonContentProps,
  PluginButtonIconProps,
} from "@getpaseo/plugin/client";
import type { ComponentType } from "react";
import { PULSE_IDLE_LABEL, PULSE_LABEL_WIDTH, renderPulseLabel } from "./label.ts";
import type { PulseModelState } from "./model.ts";

/** Accessible name, tooltip and sheet title only: it is never the visible label. */
export const PULSELINE_PILL_TITLE = "Pulseline · Claude";
/** The visible label before anything is drawn. */
export const PULSELINE_PILL_LABEL = PULSE_IDLE_LABEL;

export interface PulselineUiParts {
  readonly Icon: ComponentType<PluginButtonIconProps>;
  readonly Content: ComponentType<PluginButtonContentProps>;
  /** Optional custom composer label; rendered by hosts that support one. */
  readonly Label?: ComponentType<PluginButtonIconProps> | undefined;
}

/**
 * v0.8 ships a string label. A host that adds a component label reads `Label`;
 * today's host keeps the extra key untouched (`validateButton` spreads the button,
 * `packages/app/src/plugins/buttons/validation.ts:82`) and renders the string, so
 * supplying both is forward-compatible and costs nothing now.
 */
export type PulselinePillButton = PluginButton & {
  readonly Label?: ComponentType<PluginButtonIconProps> | undefined;
};

const behaviors = new WeakMap<PulselineUiParts, PluginButtonBehavior>();

function behaviorFor(ui: PulselineUiParts): PluginButtonBehavior {
  const existing = behaviors.get(ui);
  if (existing) return existing;
  const behavior: PluginButtonBehavior = { kind: "popover", Content: ui.Content };
  behaviors.set(ui, behavior);
  return behavior;
}

/**
 * The label is pulse-only: no variant tag, no provider name, no metrics. Metrics
 * live in the popover, where they have room and an icon each.
 */
export function buildPillLabel(
  state: PulseModelState,
  _metrics: unknown,
  options: { width?: number; phase?: number } = {},
): string {
  return renderPulseLabel(state, {
    width: options.width ?? PULSE_LABEL_WIDTH,
    phase: options.phase ?? 0,
  });
}

export function pulselineButton(
  ui: PulselineUiParts,
  input: { label: string },
): PulselinePillButton {
  return {
    title: PULSELINE_PILL_TITLE,
    icon: ui.Icon,
    label: input.label,
    ...(ui.Label ? { Label: ui.Label } : {}),
    behavior: behaviorFor(ui),
  };
}
