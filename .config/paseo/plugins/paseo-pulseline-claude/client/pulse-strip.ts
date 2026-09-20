// Kind colour map. Emits theme token names, never colour values, so the components
// stay theme-driven. Geometry lives in the single segment model (pulse-segments.ts).
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

/** Agreed kind colours; reasoning and write intentionally share the accent token. */
export const BLOCK_COLOR_TOKENS: Record<PulseBlockKind, PulseColorToken> = {
  text: "foreground",
  reasoning: "accent",
  read: "foregroundMuted",
  write: "accent",
  tool: "statusWarning",
  error: "statusDanger",
  success: "statusSuccess",
  other: "border",
};
