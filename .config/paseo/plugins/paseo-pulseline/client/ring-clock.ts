export const RING_PERIOD_MS = 900;

interface WebAnimatable {
  animate(keyframes: readonly Record<string, string>[], options: Record<string, unknown>): { currentTime: number | null; cancel(): void };
}

/** Phase from a shared clock, so a remounted ring continues instead of restarting at 0°. */
export function ringPhaseMs(now: number): number {
  return ((now % RING_PERIOD_MS) + RING_PERIOD_MS) % RING_PERIOD_MS;
}

/**
 * Starts a compositor-driven rotation on RN-web (Web Animations, like the host's own
 * status ring). Returns undefined where the node cannot animate itself (native, tests),
 * so the caller falls back to the JS-driven Animated loop.
 */
export function startWebRotation(node: unknown, now: number): (() => void) | undefined {
  if (!node || typeof (node as Partial<WebAnimatable>).animate !== "function") return undefined;
  const animation = (node as WebAnimatable).animate(
    [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
    { duration: RING_PERIOD_MS, iterations: Infinity, easing: "linear" },
  );
  animation.currentTime = ringPhaseMs(now);
  return () => animation.cancel();
}
