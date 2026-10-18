import type { PluginButtonIconProps } from "@getpaseo/plugin/client";
import process from "node:process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryTimelineEvent } from "./controller";
import type { PulseKind } from "./model";
import type { PulselineRuntimeInput } from "./runtime";
import type { TimelineSnapshot } from "./store";

const hookHarness = vi.hoisted(() => {
  const cleanups: Array<() => void> = [];
  return { cleanups };
});

vi.mock("react", () => ({
  useSyncExternalStore<Snapshot>(
    subscribe: (listener: () => void) => () => void,
    getSnapshot: () => Snapshot,
  ): Snapshot {
    hookHarness.cleanups.push(subscribe(() => {}));
    return getSnapshot();
  },
}));

vi.mock("react-native", () => ({
  StyleSheet: { create: <Styles extends object>(styles: Styles) => styles },
  Text: "Text",
  View: "View",
}));

type PulseColor =
  | "foreground"
  | "accent"
  | "foregroundMuted"
  | "statusWarning"
  | "statusDanger"
  | "statusSuccess"
  | "border";

interface PulseSegmentFixture {
  readonly id: string;
  readonly kind: PulseKind;
  readonly glyph: string;
  readonly volumeTokens: number;
  readonly heightIndex: number;
  readonly height: number;
  readonly color: PulseColor;
  readonly active: boolean;
  readonly separatorAfter: boolean;
}

interface MetricFixture {
  readonly id: string;
  readonly icon: string;
  readonly value: string;
}

interface PulseViewFixture {
  readonly label: string;
  readonly segments: readonly PulseSegmentFixture[];
  readonly metrics: readonly MetricFixture[];
}

interface PresentationExports {
  readonly PULSE_GLYPHS?: readonly string[];
  readonly PULSE_GEOMETRY?: unknown;
  readonly PULSE_INTERVAL_MS?: number;
  readonly buildPulseView?: (snapshot: TimelineSnapshot, limit?: number) => PulseViewFixture;
  readonly formatClockDuration?: (milliseconds: number) => string;
  readonly createPulselinePresentation: (input: PulselineRuntimeInput) => {
    readonly Icon: (props: PluginButtonIconProps) => unknown;
    getSnapshot(): TimelineSnapshot;
    isMounted(): boolean;
    dispose(): void;
  };
}

const colors = {
  surface0: "surface-0",
  surface1: "surface-1",
  surface2: "surface-2",
  border: "border",
  foreground: "foreground",
  foregroundMuted: "foreground-muted",
  accent: "accent",
  accentForeground: "accent-foreground",
  statusSuccess: "success",
  statusWarning: "warning",
  statusDanger: "danger",
};

const iconProps: PluginButtonIconProps = {
  context: "agent",
  workspaceId: "workspace-1",
  agentId: "agent-1",
  size: 16,
  color: colors.foreground,
  theme: { colors },
  host: { id: "paseo", label: "Paseo" },
  layout: { compact: false, platform: "web" },
};

const empty: TimelineSnapshot = {
  busy: false,
  gap: false,
  blocks: [],
  metrics: {},
  label: "provider prose must stay out of the label",
};

async function presentationExports(): Promise<PresentationExports> {
  return vi.importActual<PresentationExports>("./pill");
}

function requireViewBuilder(module: PresentationExports) {
  expect(module.buildPulseView, "shared production view-model adapter").toBeTypeOf("function");
  return module.buildPulseView;
}

describe("Pulseline presentation contract", () => {
  beforeEach(() => {
    hookHarness.cleanups.length = 0;
  });

  it("uses kind only for color when all eight kinds have the same volume", async () => {
    // Given
    const module = await presentationExports();
    const buildView = requireViewBuilder(module);
    const kinds: readonly PulseKind[] = ["text", "reasoning", "read", "write", "tool", "error", "success", "other"];
    const snapshot: TimelineSnapshot = {
      ...empty,
      blocks: kinds.map((kind, order) => ({ id: kind, kind, order, timestamp: order, volumeTokens: 65, heightIndex: 2 })),
    };

    // When
    const view = buildView?.(snapshot, 8);

    // Then
    expect(module.PULSE_GLYPHS).toEqual(["⣀", "⣤", "⣶", "⣿"]);
    expect(module.PULSE_GEOMETRY).toBeUndefined();
    expect(view?.segments.map(({ color }) => color)).toEqual([
      "foreground", "accent", "foregroundMuted", "accent",
      "statusWarning", "statusDanger", "statusSuccess", "border",
    ]);
    expect(view?.segments.map(({ heightIndex, height }) => ({ heightIndex, height }))).toEqual(
      Array.from({ length: 8 }, () => ({ heightIndex: 2, height: 8 })),
    );
  });

  it("keeps the newest segments and moves active activity to the narrowed tail", async () => {
    // Given
    const buildView = requireViewBuilder(await presentationExports());
    const snapshot: TimelineSnapshot = {
      ...empty,
      busy: true,
      blocks: [
        { id: "old", kind: "text", order: 1, timestamp: 1, volumeTokens: 1, heightIndex: 0 },
        { id: "active-tool", kind: "tool", order: 2, timestamp: 2, volumeTokens: 65, heightIndex: 2, metadata: { type: "tool", name: "Read", detail: "read", status: "running" } },
        { id: "new", kind: "success", order: 3, timestamp: 3, volumeTokens: 129, heightIndex: 3 },
        { id: "newest", kind: "other", order: 4, timestamp: 4, volumeTokens: 257, heightIndex: 4 },
      ],
    };

    // When
    const view = buildView?.(snapshot, 3);

    // Then
    expect(view?.segments.map(({ id, active }) => ({ id, active }))).toEqual([
      { id: "new", active: false },
      { id: "newest", active: false },
      { id: "active-tool", active: true },
    ]);
    expect(view?.label).toBe("⣤⣶⣤");
  });

  it("uses pulse-only empty, busy, and idle labels while changing only active-tail height", async () => {
    // Given
    const buildView = requireViewBuilder(await presentationExports());
    const passive = { id: "passive", kind: "text" as const, order: 1, timestamp: 1, volumeTokens: 65, heightIndex: 2 as const };
    const busy = { ...empty, busy: true, blocks: [passive], pulsePhase: 0 as const };

    // When
    const emptyView = buildView?.(empty);
    const idleView = buildView?.({ ...empty, blocks: [passive] });
    const phase0 = buildView?.(busy);
    const phase1 = buildView?.({ ...busy, pulsePhase: 1 });

    // Then
    expect(emptyView?.label).toBe("⣀");
    expect(idleView?.label).toBe("⣤");
    expect(phase0?.segments.slice(0, -1)).toEqual(phase1?.segments.slice(0, -1));
    expect([phase0?.segments.at(-1)?.heightIndex, phase1?.segments.at(-1)?.heightIndex]).toEqual([2, 3]);
    expect(phase0?.segments.at(-1)?.active).toBe(true);
    expect([phase0?.label, phase1?.label]).toEqual(["⣤", "⣶"]);
    expect([emptyView?.label, idleView?.label, phase0?.label, phase1?.label].every((label) => /^[⣀⣤⣶⣿]+$/u.test(label ?? ""))).toBe(true);
  });

  it("formats icon-led metrics and leaves the full-width pulse footer last", async () => {
    // Given
    const buildView = requireViewBuilder(await presentationExports());
    const snapshot: TimelineSnapshot = {
      ...empty,
      blocks: [
        { id: "turn-start", kind: "text", order: 1, timestamp: 0, volumeTokens: 1, heightIndex: 0, turnId: "turn-1" },
        { id: "turn-end", kind: "success", order: 2, timestamp: 7_507_000, volumeTokens: 1, heightIndex: 0, turnId: "turn-1" },
      ],
      metrics: {
        inputTokens: { value: 999 }, outputTokens: { value: 1_500 }, cachedInputTokens: { value: 12_345 },
        totalCostUsd: { value: 1.235 }, contextWindowUsedTokens: { value: 1_500 }, contextWindowMaxTokens: { value: 128_000 },
        chatDurationMs: { value: 3_599_000 }, toolCount: { value: 12 }, toolTotalDurationMs: { value: 3_600_000 },
        toolAverageDurationMs: { value: 4_190 }, textRateCharsPerSecond: { value: 9.94 },
      },
    };

    // When
    const view = buildView?.(snapshot);

    // Then
    expect(view?.metrics.map(({ icon, value }) => `${icon} ${value}`)).toEqual([
      "↓ 999", "↑ 1.5k", "◇ 12.3k", "⚡ 0.4/s", "↯ 9.9/s", "🏁 125:07", "Σ 59:59",
      "🔧 12", "⏱ 4.2s", "⌛ 60:00", "◇ 1.5k/128k", "$ $1.24",
    ]);
    expect(buildView?.(empty).metrics).toEqual([]);
  });

  it.each([
    [0, "00:00"], [3_599_000, "59:59"], [3_600_000, "60:00"], [7_507_000, "125:07"],
  ])("formats unbounded clock duration %i as %s", async (milliseconds, expected) => {
    // Given
    const module = await presentationExports();
    expect(module.formatClockDuration, "clock formatter").toBeTypeOf("function");

    // When
    const formatted = module.formatClockDuration?.(milliseconds);

    // Then
    expect(formatted).toBe(expected);
  });

  it("renders the mandatory activity dot while retaining and cleaning its mounted runtime", async () => {
    // Given
    const module = await presentationExports();
    let emit: ((event: RegistryTimelineEvent) => void) | undefined;
    let tick: (() => void) | undefined;
    let stops = 0;
    const presentation = module.createPulselinePresentation({
      label: "Pulseline · OpenCode",
      agent: { provider: "opencode", activeTurn: null },
      timeline: () => ({
        subscribe: (handler) => {
          emit = handler;
          return Object.assign(() => { emit = undefined; }, { ready: Promise.resolve() });
        },
        refetch: async () => ({ epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, entries: [], error: null }),
      }),
      schedule: (callback) => { tick = callback; return () => { stops += 1; }; },
      onSnapshot: () => {},
    });

    // When
    const rendered = presentation.Icon(iconProps);
    await Promise.resolve();
    await Promise.resolve();
    emit?.({ agentId: "agent-1", epoch: "e", seq: 1, timestamp: "2026-09-12T00:00:01.000Z", event: { type: "turn_started", provider: "opencode", turnId: "turn-1" } });
    tick?.();
    emit?.({ agentId: "agent-1", epoch: "e", seq: 2, timestamp: "2026-09-12T00:00:02.000Z", event: { type: "turn_completed", provider: "opencode", turnId: "turn-1" } });
    const unmount = hookHarness.cleanups[0];
    unmount?.();
    const idle = presentation.getSnapshot();
    tick?.();

    // Then
    expect(rendered).toMatchObject({ props: { accessibilityLabel: "Agent activity idle" } });
    expect(module.PULSE_INTERVAL_MS).toBe(450);
    expect(presentation.isMounted()).toBe(false);
    expect(stops).toBe(1);
    expect(presentation.getSnapshot()).toEqual(idle);
    expect(idle).toMatchObject({ busy: false });
    expect(idle).not.toHaveProperty("pulsePhase");
    process.stdout.write("LIFECYCLE icon.dot=1 interval.ms=450 timer.stop=1 mounted.after=0 late.tick.mutations=0 idle.busy=0 idle.phase=none\n");
    presentation.dispose();
  });
});
