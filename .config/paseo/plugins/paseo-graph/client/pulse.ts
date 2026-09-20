import { NODE_OPACITY } from "./view";

/**
 * The travelling crest that marks a running chat. A cosine wave, phase-shifted
 * by distance from the chat, so the signal reads as moving up the chain rather
 * than blinking in unison.
 */

/**
 * A running chat sends a signal up its own chain. The crest starts at the
 * workspace and arrives at the chat, so the eye is led to where the work is
 * rather than merely told that a line changed colour.
 */
const PULSE_PERIOD_MS = 1600;

/** Phase lead per hop: what makes the crest travel instead of blinking in unison. */
const PULSE_HOP_MS = 260;

/** ~14 repaints a second. A swell this slow needs no more, and in tree mode -
 * where the simulation is parked - this is the only thing repainting at all. */
export const PULSE_FRAME_MS = 70;

export const PULSE_MAX_OPACITY = 0.95;

/** Thicker than EDGE_THICKNESS, so the signal reads as the line swelling. */
export const PULSE_THICKNESS = 3;

/** Below this the overlay is invisible anyway; skipping it keeps the quiet
 * half of every cycle out of the tree. */
export const PULSE_MIN_VISIBLE = 0.02;

/**
 * The dot itself breathes: dimmer than resting at the trough, full strength at
 * the crest. Whatever the hover cascade already decided is the ceiling, so a
 * node faded by a hover elsewhere breathes faintly instead of flashing.
 */
const PULSE_NODE_TROUGH = 0.4;

export function pulsedNodeOpacity(resting: number, faded: boolean, wave: number): number {
  const trough = resting * PULSE_NODE_TROUGH;
  const crest = faded ? resting : NODE_OPACITY.active;
  return trough + (crest - trough) * wave;
}

/**
 * A thin ring under the dot, on top of the breathing. It swells with the wave,
 * while the dot keeps its size - size means kind, and the legend says so.
 */
export const HALO_EXTRA = 1.7;

export const HALO_SWELL = 2.3;

export const HALO_MAX_OPACITY = 0.5;

export function pulseWave(timeMs: number, depth: number): number {
  const shifted = timeMs + depth * PULSE_HOP_MS;
  const phase = ((shifted % PULSE_PERIOD_MS) + PULSE_PERIOD_MS) % PULSE_PERIOD_MS;
  return 0.5 - 0.5 * Math.cos((phase / PULSE_PERIOD_MS) * Math.PI * 2);
}
