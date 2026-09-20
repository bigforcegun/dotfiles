// Pill adapter: the composer label is the pulse and nothing else. The public API
// exposes the label as a plain string, so the same segment model is joined into
// glyphs here and drawn as bars in the detail footer.
import type { PulseModelState } from "./model.ts";
import {
  buildPulseSegments,
  glyphIndexForUnits,
  type PulseSegment,
  type PulseSegmentOptions,
} from "./pulse-segments.ts";

/**
 * Composer vocabulary: four ordered levels, chosen for narrow apparent ink — braille
 * dots leave air on both sides, so each cell reads thinner than a block element.
 *
 * Vertical placement is not ours: the host owns the composer Text and its alignment
 * (`styles.composerLabel`). This plugin therefore does not try to bottom-align
 * anything from the string side — no padding, no spacing, no repeated glyphs, no
 * offset tricks. One cell per segment, in order, and nothing else.
 */
export const PULSE_LABEL_GLYPHS = ["⣀", "⣤", "⣶", "⣿"] as const;

/** Nothing drawn yet and idle: the shallowest cell. */
export const PULSE_IDLE_LABEL = "⣀";
/** Nothing drawn yet while a turn runs: the active placeholder one step up. */
export const PULSE_BUSY_LABEL = "⣤";
/**
 * Glyph budget for a composer pill. Kept short on purpose: the host truncates a
 * wide label to an ellipsis, and an ellipsis is not a pulse.
 */
export const PULSE_LABEL_WIDTH = 12;

export interface PulseLabelOptions extends Partial<PulseSegmentOptions> {}

/**
 * Eight volume buckets fold into four drawn levels, two buckets per cell. A passive
 * bar rounds its bucket down, the active one rounds up, so the single-bucket beat
 * still crosses a level and the pill visibly moves while work runs — except at the
 * top, where there is nothing above to move to. The footer keeps all eight buckets.
 */
export function labelGlyph(segment: PulseSegment): string {
  const bucket = glyphIndexForUnits(segment.height);
  const step = segment.active ? Math.ceil(bucket / 2) : Math.floor(bucket / 2);
  const clamped = Math.min(PULSE_LABEL_GLYPHS.length - 1, Math.max(0, step));
  return PULSE_LABEL_GLYPHS[clamped] as string;
}

export function renderPulseLabel(
  state: PulseModelState,
  options: PulseLabelOptions = {},
): string {
  const segments = buildPulseSegments(state, {
    width: options.width ?? PULSE_LABEL_WIDTH,
    phase: options.phase ?? 0,
  });
  if (segments.length === 0) return state.busy ? PULSE_BUSY_LABEL : PULSE_IDLE_LABEL;
  return segments.map(labelGlyph).join("");
}
