// The one local pulse segment model, shared by the glyph-string pill adapter and
// the React Native detail footer. Height comes from the block's own volume bucket
// (volume.ts), never from its kind; kind decides colour only. The active tail
// alternates between its bucket and one step above it, every 450 ms.
import type { PulseModelState } from "./model.ts";
import { BLOCK_COLOR_TOKENS, type PulseColorToken } from "./pulse-strip.ts";
import type { PulseBlock, PulseBlockKind } from "./types.ts";
import { MAX_HEIGHT_INDEX } from "./volume.ts";

export const PULSE_HEIGHT_GLYPHS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;
export const MAX_PULSE_SEGMENTS = 36;

/** Kept for the shared tuple; the footer draws constant-width bars, not weighted ones. */
export const KIND_WEIGHTS: Record<PulseBlockKind, number> = {
  text: 3,
  reasoning: 2,
  read: 1,
  write: 2,
  tool: 2,
  error: 2,
  success: 2,
  other: 1,
};

/** The active bar alternates base / base+1, 450 ms apart. */
export const PULSE_PHASES = 2;

const UNITS_PER_STEP = 2;
const BASE_UNITS = 4;

export interface PulseSegment {
  readonly key: string;
  readonly kind: PulseBlockKind;
  /** Height units, 4..18, two per glyph step. */
  readonly height: number;
  /** Layout weight: flexGrow of the segment's wrapper. */
  readonly weight: number;
  readonly token: PulseColorToken;
  readonly glyph: string;
  readonly active: boolean;
  /** True for every visible segment but the last: separators sit between bars. */
  readonly separator: boolean;
  readonly label: string | undefined;
}

export interface PulseSegmentOptions {
  /** Segment budget: glyph count for the pill, bar count for the footer. */
  readonly width: number;
  /** Advances every 450 ms while busy; 0 when idle. */
  readonly phase: number;
}

export function glyphIndexForUnits(units: number): number {
  const index = Math.round((units - BASE_UNITS) / UNITS_PER_STEP);
  return Math.min(PULSE_HEIGHT_GLYPHS.length - 1, Math.max(0, index));
}

export function unitsForGlyphIndex(index: number): number {
  return BASE_UNITS + index * UNITS_PER_STEP;
}

/** A block's own volume bucket; an unmeasured block sits at the bottom, honestly. */
export function heightIndexOf(block: Pick<PulseBlock, "heightIndex">): number {
  const index = block.heightIndex ?? 0;
  return Math.min(MAX_HEIGHT_INDEX, Math.max(0, Math.round(index)));
}

function segmentOf(
  block: { key: string; kind: PulseBlockKind; label?: string | undefined },
  heightIndex: number,
  active: boolean,
  separator = false,
): PulseSegment {
  const index = Math.min(MAX_HEIGHT_INDEX, Math.max(0, heightIndex));
  return {
    key: block.key,
    kind: block.kind,
    height: unitsForGlyphIndex(index),
    weight: KIND_WEIGHTS[block.kind],
    token: BLOCK_COLOR_TOKENS[block.kind],
    glyph: PULSE_HEIGHT_GLYPHS[index] as string,
    active,
    separator,
    label: block.label,
  };
}

/** Drawn when there is nothing to draw: one neutral bar, never a sentence. */
export const PULSE_FALLBACK_SEGMENT: PulseSegment = segmentOf(
  { key: "pulse-empty", kind: "other" },
  0,
  false,
);

/** Separators sit between bars, so the trailing segment never carries one. */
function withSeparators(segments: PulseSegment[]): PulseSegment[] {
  const last = segments.length - 1;
  return segments.map((segment, index) =>
    segment.separator === index < last ? segment : { ...segment, separator: index < last },
  );
}

/** The active bar beats one step above its own volume bucket, and no further. */
function beatIndex(base: number, phase: number): number {
  const step = ((phase % PULSE_PHASES) + PULSE_PHASES) % PULSE_PHASES;
  return Math.min(MAX_HEIGHT_INDEX, base + (step === 0 ? 0 : 1));
}

/** Nothing drawn yet: a neutral bar when idle, an active reasoning bar when busy. */
function placeholder(busy: boolean, phase: number): PulseSegment {
  if (!busy) return PULSE_FALLBACK_SEGMENT;
  return segmentOf({ key: "pulse-busy", kind: "reasoning" }, beatIndex(0, phase), true);
}

export function buildPulseSegments(
  state: PulseModelState,
  options: PulseSegmentOptions,
): PulseSegment[] {
  const width = Math.max(0, Math.min(MAX_PULSE_SEGMENTS, options.width));
  if (width === 0) return [];
  if (state.blocks.length === 0) return [placeholder(state.busy, options.phase)];

  const blocks = [...state.blocks];
  if (!state.busy) {
    return withSeparators(
      blocks
        .slice(Math.max(0, blocks.length - width))
        .map((block) => segmentOf(block, heightIndexOf(block), false)),
    );
  }

  // While busy the pulse belongs to the running tool, or to the newest row when
  // no tool is running; either way it is pinned to the tail.
  const activeIndex = blocks.map((block) => block.pending).lastIndexOf(true);
  const active = blocks[activeIndex >= 0 ? activeIndex : blocks.length - 1];
  if (!active) return [];
  const rest = blocks.filter((_, index) => index !== (activeIndex >= 0 ? activeIndex : blocks.length - 1));
  const head = rest.slice(Math.max(0, rest.length - (width - 1)));
  return withSeparators([
    ...head.map((block) => segmentOf(block, heightIndexOf(block), false)),
    segmentOf(active, beatIndex(heightIndexOf(active), options.phase), true),
  ]);
}
