// Composer pulse as a label made of labels: one fixed-width `Text` child per glyph
// of the plain-string pulse, each drawn in its own semantic kind colour. The glyph
// vocabulary, the glyph choice per segment and the capacity are exactly the ones
// `label.ts` renders into the fallback string — this module changes colour and
// nothing else. Slot width, child count and container width are constants, so the
// beat can never resize the pill. Primitives are injected, as in the popover footer.
import { createElement, type ReactElement } from "react";
import type { PulsePrimitives, PulseThemeColors } from "./detail-tree.ts";
import { PULSE_LABEL_GLYPHS, PULSE_LABEL_WIDTH, labelGlyph } from "./label.ts";
import type { PulseSegment } from "./pulse-segments.ts";

/**
 * Advance of one glyph cell. Braille patterns are narrow-ink, so this is the cell
 * the host font already gives them at `GLYPH_FONT_SIZE`; the slot is clipped to it
 * rather than measured, which keeps the drawn width independent of the font.
 */
export const SLOT_WIDTH = 8;
export const GLYPH_FONT_SIZE = 12;
/** One line box for every cell: all glyphs then sit on the same bottom edge. */
export const LABEL_HEIGHT = 16;
/** Fixed capacity: the container is always this many slots wide. */
export const PULSE_SLOTS = PULSE_LABEL_WIDTH;
/** A passive cell is barely dimmed; the active one breathes between these two. */
export const PASSIVE_OPACITY = 0.9;
export const BEAT_OPACITY = [0.7, 1] as const;

/**
 * The full contract, in one place, so another pulseline implementation can copy it
 * byte for byte: same glyphs, same order, same capacity, same cell geometry.
 */
export const PULSE_LABEL_SPEC = {
  /** U+28C0, U+28E4, U+28F6, U+28FF — four ordered volume levels, low to high. */
  glyphs: PULSE_LABEL_GLYPHS,
  capacity: PULSE_SLOTS,
  slotWidth: SLOT_WIDTH,
  fontSize: GLYPH_FONT_SIZE,
  lineHeight: LABEL_HEIGHT,
} as const;

/** Every cell, drawn or empty, has this box. Fixed width, no flex, no padding. */
const SLOT_STYLE = {
  width: SLOT_WIDTH,
  fontSize: GLYPH_FONT_SIZE,
  lineHeight: LABEL_HEIGHT,
  textAlign: "center",
  includeFontPadding: false,
} as const;

function cell(
  key: string,
  glyph: string,
  color: string | undefined,
  opacity: number,
  ui: PulsePrimitives,
): ReactElement {
  return createElement(
    ui.Text,
    {
      key,
      numberOfLines: 1,
      allowFontScaling: false,
      // Only `color` and `opacity` vary between cells; the box never does.
      style: { ...SLOT_STYLE, ...(color ? { color } : {}), opacity },
    },
    glyph,
  );
}

/**
 * The beat lives in the trailing cell only. Its glyph already steps up one level
 * with the phase, but four drawn levels saturate at the top, so the opacity carries
 * the beat as well — a style change inside a fixed box, never a geometry change.
 */
function beatOpacity(phase: number): number {
  const step = ((phase % BEAT_OPACITY.length) + BEAT_OPACITY.length) % BEAT_OPACITY.length;
  return BEAT_OPACITY[step] as number;
}

/**
 * The pulse as fixed-width glyph cells. Segments are right-aligned inside the fixed
 * capacity and empty cells pad the left, so the drawn width is constant whether the
 * agent has one row or forty. The trailing cell is the only one that changes with
 * the phase, and it changes its glyph level and opacity inside its own fixed box.
 */
export interface PulseGlyphsOptions {
  readonly slots?: number;
  readonly phase?: number;
}

export function pulseGlyphsTree(
  segments: PulseSegment[],
  colors: PulseThemeColors,
  ui: PulsePrimitives,
  options: PulseGlyphsOptions = {},
): ReactElement {
  const slots = options.slots ?? PULSE_SLOTS;
  const visible = segments.slice(Math.max(0, segments.length - slots));
  const padding = Math.max(0, slots - visible.length);
  return createElement(
    ui.View,
    {
      accessibilityLabel: "Agent activity pulse",
      style: {
        width: slots * SLOT_WIDTH,
        height: LABEL_HEIGHT,
        flexDirection: "row",
        alignItems: "flex-end",
        overflow: "hidden",
      },
    },
    [
      ...Array.from({ length: padding }, (_, index) =>
        cell(`pad-${index}`, "", undefined, PASSIVE_OPACITY, ui),
      ),
      ...visible.map((segment) =>
        cell(
          segment.key,
          labelGlyph(segment),
          colors[segment.token],
          segment.active ? beatOpacity(options.phase ?? 0) : PASSIVE_OPACITY,
          ui,
        ),
      ),
    ],
  );
}
