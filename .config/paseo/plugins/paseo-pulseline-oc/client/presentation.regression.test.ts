import { describe, expect, it, vi } from "vitest";
import type { RegistryTimelineEvent } from "./controller";
import { buildPulseView, selectContentTier } from "./pill";
import { createPulselineRuntime } from "./runtime";
import type { TimelineSnapshot } from "./store";

vi.mock("react-native", () => ({
  StyleSheet: { create: <Styles extends object>(styles: Styles) => styles },
  Text: "Text",
  View: "View",
}));

const empty: TimelineSnapshot = {
  busy: false,
  gap: false,
  blocks: [],
  metrics: {},
  label: "Pulseline · OpenCode",
};

describe("Pulseline presentation regressions", () => {
  it("degrades compact content from full to blocks-only to fallback", () => {
    // Given
    const withBlock: TimelineSnapshot = {
      ...empty,
      blocks: [{ id: "text:1", kind: "text", order: 1, timestamp: 1, volumeTokens: 2, heightIndex: 0, text: "hello" }],
    };

    // When / Then
    expect(selectContentTier(false, withBlock)).toBe("full");
    expect(selectContentTier(true, withBlock)).toBe("blocks-only");
    expect(selectContentTier(true, empty)).toBe("fallback");
  });

  it("pulses the active tail exactly one volume bucket and clamps the maximum", () => {
    // Given
    const low = { id: "low", kind: "text" as const, order: 1, timestamp: 1, volumeTokens: 65, heightIndex: 2 as const };
    const maximum = { id: "maximum", kind: "text" as const, order: 1, timestamp: 1, volumeTokens: 2_049, heightIndex: 7 as const };

    // When
    const base = buildPulseView({ ...empty, busy: true, pulsePhase: 0, blocks: [low] });
    const raised = buildPulseView({ ...empty, busy: true, pulsePhase: 1, blocks: [low] });
    const clamped = buildPulseView({ ...empty, busy: true, pulsePhase: 1, blocks: [maximum] });

    // Then
    expect([base.segments[0]?.heightIndex, raised.segments[0]?.heightIndex, clamped.segments[0]?.heightIndex]).toEqual([2, 3, 7]);
    expect([base.segments[0]?.height, raised.segments[0]?.height, clamped.segments[0]?.height]).toEqual([8, 10, 18]);
  });

  it("advances and synchronously resets phase only while mounted and busy", async () => {
    // Given
    const ticks: Array<() => void> = [];
    let emit: ((event: RegistryTimelineEvent) => void) | undefined;
    const runtime = createPulselineRuntime({
      label: "Pulseline · OpenCode",
      agent: { provider: "opencode", activeTurn: null },
      timeline: () => ({
        subscribe: (handler) => {
          emit = handler;
          return Object.assign(() => { emit = undefined; }, { ready: Promise.resolve() });
        },
        refetch: async () => ({ epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, entries: [], error: null }),
      }),
      schedule: (tick) => { ticks.push(tick); return () => {}; },
      onSnapshot: () => {},
    });
    expect(ticks).toHaveLength(0);

    // When
    const unmount = runtime.subscribe(() => {});
    await Promise.resolve();
    await Promise.resolve();
    emit?.({ agentId: "agent-1", epoch: "e", seq: 1, timestamp: "2026-09-12T00:00:01.000Z", event: { type: "turn_started", provider: "opencode", turnId: "turn-1" } });
    expect(runtime.getSnapshot()).toMatchObject({ busy: true });
    const first = runtime.getSnapshot().pulsePhase;
    ticks[0]?.();
    const second = runtime.getSnapshot().pulsePhase;
    ticks[0]?.();
    const third = runtime.getSnapshot().pulsePhase;

    // Then
    expect([first, second, third]).toEqual([0, 1, 2]);
    emit?.({ agentId: "agent-1", epoch: "e", seq: 2, timestamp: "2026-09-12T00:00:02.000Z", event: { type: "turn_completed", provider: "opencode", turnId: "turn-1" } });
    const idle = runtime.getSnapshot();
    expect(idle).toMatchObject({ busy: false });
    expect(idle.pulsePhase).toBeUndefined();
    ticks[0]?.();
    expect(runtime.getSnapshot()).toEqual(idle);
    unmount();
  });
});
