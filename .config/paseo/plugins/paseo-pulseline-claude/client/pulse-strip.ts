// Pulse strip view model. Emits theme token names, never colour values, so the
// component stays theme-driven and this module stays testable without a renderer.
import type { PulseModelState } from "./model.ts";
import type { PulseBlockKind } from "./types.ts";

export const PULSE_THEME_TOKENS = [
  "foreground",
  "foregroundMuted",
  "accent",
  "statusSuccess",
  "statusWarning",
  "statusDanger",
  "border",
] as const;

export type PulseColorToken = (typeof PULSE_THEME_TOKENS)[number];

/** Eight kinds, seven usable tokens: read and success intentionally share one. */
export const BLOCK_COLOR_TOKENS: Record<PulseBlockKind, PulseColorToken> = {
  text: "foreground",
  reasoning: "accent",
  read: "statusSuccess",
  write: "statusWarning",
  tool: "foregroundMuted",
  error: "statusDanger",
  success: "statusSuccess",
  other: "border",
};

const MIN_HEIGHT = 0.15;
const ROOMY_BARS = 32;
const COMPACT_BARS = 12;

export interface PulseStripBar {
  readonly key: string;
  readonly kind: PulseBlockKind;
  readonly token: PulseColorToken;
  /** 0.15..1 of the strip height. Weight is approximate by construction. */
  readonly heightRatio: number;
  readonly pending: boolean;
  readonly label: string | undefined;
}

export interface PulseStripOptions {
  readonly compact: boolean;
}

export function buildPulseStrip(
  state: PulseModelState,
  options: PulseStripOptions,
): PulseStripBar[] {
  const limit = options.compact ? COMPACT_BARS : ROOMY_BARS;
  return state.blocks.slice(-limit).map((block) => ({
    key: block.key,
    kind: block.kind,
    token: BLOCK_COLOR_TOKENS[block.kind],
    heightRatio: Math.min(1, Math.max(MIN_HEIGHT, MIN_HEIGHT + block.weight * (1 - MIN_HEIGHT))),
    pending: block.pending,
    label: block.label,
  }));
}
