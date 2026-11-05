import { describe, expect, it } from "vitest";
import { RING_PERIOD_MS, ringPhaseMs, startWebRotation } from "./ring-clock";

describe("working ring animation", () => {
  it("uses a compositor animation on web nodes, phased from the shared clock", () => {
    // Given
    const calls: { keyframes: unknown; options: Record<string, unknown> }[] = [];
    const animation = { currentTime: null as number | null, cancelled: false, cancel() { this.cancelled = true; } };
    const node = { animate: (keyframes: unknown, options: Record<string, unknown>) => { calls.push({ keyframes, options }); return animation; } };

    // When
    const stop = startWebRotation(node, RING_PERIOD_MS * 3 + 250);

    // Then
    expect(calls).toHaveLength(1);
    expect(calls[0]?.options).toEqual(expect.objectContaining({ duration: RING_PERIOD_MS, iterations: Infinity, easing: "linear" }));
    expect(animation.currentTime).toBe(250);
    stop?.();
    expect(animation.cancelled).toBe(true);
  });

  it("falls back when the node cannot animate itself", () => {
    expect(startWebRotation(null, 0)).toBeUndefined();
    expect(startWebRotation({}, 0)).toBeUndefined();
  });

  it("keeps the phase within one period for any clock value", () => {
    expect(ringPhaseMs(0)).toBe(0);
    expect(ringPhaseMs(RING_PERIOD_MS)).toBe(0);
    expect(ringPhaseMs(-100)).toBe(RING_PERIOD_MS - 100);
  });
});
