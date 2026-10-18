// The composer dot. Paseo hands plugins a string label and a 16x16 icon slot, so
// the slot is the only place Pulseline can carry colour: the dot takes the colour
// of the newest activity, breathes with the 450 ms pulse phase while the agent
// works, and settles into a calm muted mark when it stops.
import type { PulseModelState } from "./model.ts";
import { BLOCK_COLOR_TOKENS, type PulseColorToken } from "./pulse-strip.ts";
import { PULSE_PHASES } from "./pulse-segments.ts";

export interface PulseDot {
  readonly token: PulseColorToken;
  /** Diameter as a fraction of the host's icon size. */
  readonly scale: number;
  readonly opacity: number;
  readonly busy: boolean;
}

/** Calm when idle; the busy sizes are one per phase, so the dot visibly beats. */
const IDLE_SCALE = 0.4;
const IDLE_OPACITY = 0.55;
const BUSY_SCALES = [0.62, 0.96];

/** Colour follows the running row, else the newest one; an error always shows red. */
function colorToken(state: PulseModelState): PulseColorToken {
  if (state.status === "error") return "statusDanger";
  const running = [...state.blocks].reverse().find((block) => block.pending);
  const newest = running ?? state.blocks.at(-1);
  return newest ? BLOCK_COLOR_TOKENS[newest.kind] : "border";
}

export function buildPulseDot(state: PulseModelState | null, phase: number): PulseDot {
  if (!state) return { token: "border", scale: IDLE_SCALE, opacity: IDLE_OPACITY, busy: false };
  const token = colorToken(state);
  if (!state.busy) return { token, scale: IDLE_SCALE, opacity: IDLE_OPACITY, busy: false };
  const step = ((phase % PULSE_PHASES) + PULSE_PHASES) % PULSE_PHASES;
  return { token, scale: BUSY_SCALES[step] ?? IDLE_SCALE, opacity: 1, busy: true };
}
