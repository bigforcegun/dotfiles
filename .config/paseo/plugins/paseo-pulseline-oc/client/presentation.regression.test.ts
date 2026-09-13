import { describe, expect, it, vi } from "vitest";
import type { RegistryTimelineEvent } from "./controller";
import { pulseOpacity, selectContentTier } from "./pill";
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
      blocks: [{ id: "text:1", kind: "text", order: 1, timestamp: 1, text: "hello" }],
    };

    // When / Then
    expect(selectContentTier(false, withBlock)).toBe("full");
    expect(selectContentTier(true, withBlock)).toBe("blocks-only");
    expect(selectContentTier(true, empty)).toBe("fallback");
  });

  it("changes a bounded non-layout pulse only while mounted and busy", async () => {
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
    const first = pulseOpacity(runtime.getSnapshot());
    ticks[0]?.();
    const second = pulseOpacity(runtime.getSnapshot());
    ticks[0]?.();
    const third = pulseOpacity(runtime.getSnapshot());

    // Then
    expect(new Set([first, second, third]).size).toBeGreaterThan(1);
    expect([first, second, third].every((value) => value >= 0.5 && value <= 1)).toBe(true);
    emit?.({ agentId: "agent-1", epoch: "e", seq: 2, timestamp: "2026-09-12T00:00:02.000Z", event: { type: "turn_completed", provider: "opencode", turnId: "turn-1" } });
    const idle = runtime.getSnapshot();
    expect(idle).toMatchObject({ busy: false });
    expect(pulseOpacity(idle)).toBe(1);
    ticks[0]?.();
    expect(runtime.getSnapshot()).toEqual(idle);
    unmount();
  });
});
