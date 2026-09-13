// Composer pill descriptor. One behavior instance per UI pair, so a label update
// never has to resupply the behavior and never closes an open popover.
import type {
  PluginButton,
  PluginButtonBehavior,
  PluginButtonContentProps,
  PluginButtonIconProps,
} from "@getpaseo/plugin/client";
import type { ComponentType } from "react";
import { PULSELINE_FALLBACK_LABEL, renderPulseLabel } from "./label.ts";
import type { PulseMetrics } from "./metrics.ts";
import type { PulseModelState } from "./model.ts";

export const PULSELINE_PILL_TITLE = "Pulseline · Claude";
/** Distinguishes this variant's pill from any other Pulseline in the same composer. */
export const PULSELINE_VARIANT_TAG = "plc";
export const PULSELINE_PILL_LABEL = `${PULSELINE_VARIANT_TAG} ${PULSELINE_FALLBACK_LABEL}`;
const DEFAULT_PILL_LENGTH = 44;

export interface PulselineUiParts {
  readonly Icon: ComponentType<PluginButtonIconProps>;
  readonly Content: ComponentType<PluginButtonContentProps>;
}

const behaviors = new WeakMap<PulselineUiParts, PluginButtonBehavior>();

function behaviorFor(ui: PulselineUiParts): PluginButtonBehavior {
  const existing = behaviors.get(ui);
  if (existing) return existing;
  const behavior: PluginButtonBehavior = { kind: "popover", Content: ui.Content };
  behaviors.set(ui, behavior);
  return behavior;
}

export function buildPillLabel(
  state: PulseModelState,
  metrics: PulseMetrics,
  options: { maxLength?: number } = {},
): string {
  const budget = (options.maxLength ?? DEFAULT_PILL_LENGTH) - PULSELINE_VARIANT_TAG.length - 1;
  return `${PULSELINE_VARIANT_TAG} ${renderPulseLabel(state, metrics, { maxLength: budget })}`;
}

export function pulselineButton(ui: PulselineUiParts, input: { label: string }): PluginButton {
  return {
    title: PULSELINE_PILL_TITLE,
    icon: ui.Icon,
    label: input.label,
    behavior: behaviorFor(ui),
  };
}
