import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import process from "node:process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryTimelineEvent } from "./controller";
import type { PulseBlock } from "./model";
import { buildPulseView } from "./pulse-view";
import { createPulselineRuntime, type PulselineRuntimeInput } from "./runtime";
import type { TimelineSnapshot } from "./store";

const hookHarness = vi.hoisted(() => {
  const cleanups: Array<() => void> = [];
  return { cleanups };
});

const jsxHarness = vi.hoisted(() => ({
  render(
    type: string | ((props: Readonly<Record<string, unknown>>) => unknown),
    props: Readonly<Record<string, unknown>>,
  ): unknown {
    return typeof type === "function" ? type(props) : { type, props };
  },
}));

vi.mock("react", () => ({
  useSyncExternalStore<Snapshot>(
    subscribe: (listener: () => void) => () => void,
    getSnapshot: () => Snapshot,
  ): Snapshot {
    hookHarness.cleanups.push(subscribe(() => {}));
    return getSnapshot();
  },
}));

vi.mock("react/jsx-runtime", () => ({
  Fragment: "Fragment",
  jsx: jsxHarness.render,
  jsxs: jsxHarness.render,
}));

vi.mock("react/jsx-dev-runtime", () => ({
  Fragment: "Fragment",
  jsxDEV: jsxHarness.render,
}));

vi.mock("react-native", () => ({
  StyleSheet: { create: <Styles extends object>(styles: Styles) => styles },
  Text: "Text",
  View: "View",
}));

interface UiNode {
  readonly type: string;
  readonly props: Readonly<Record<string, unknown>>;
}

interface PresentationModule {
  readonly createPulselinePresentation: (input: PulselineRuntimeInput) => {
    readonly Content: (props: PluginButtonContentProps) => UiNode;
  };
}

const colors = {
  surface0: "surface-0", surface1: "surface-1", surface2: "surface-2", border: "border",
  foreground: "foreground", foregroundMuted: "foreground-muted", accent: "accent",
  accentForeground: "accent-foreground", statusSuccess: "success", statusWarning: "warning",
  statusDanger: "danger",
};

const contentProps: PluginButtonContentProps = {
  context: "agent",
  workspaceId: "workspace-1",
  agentId: "agent-1",
  close: () => {},
  theme: { colors },
  host: { id: "paseo", label: "Paseo" },
  layout: { compact: false, platform: "web" },
};

const empty: TimelineSnapshot = {
  busy: false,
  gap: false,
  blocks: [],
  metrics: {},
  label: "Pulseline · OpenCode",
};
const MIN_VOLUME = { volumeTokens: 1, heightIndex: 0 } as const;

function childrenOf(node: UiNode): readonly unknown[] {
  const children = node.props["children"];
  return Array.isArray(children) ? children : [children];
}

function isUiNode(value: unknown): value is UiNode {
  return typeof value === "object" && value !== null && "type" in value && "props" in value;
}

describe("Pulseline independent review regressions", () => {
  beforeEach(() => {
    hookHarness.cleanups.length = 0;
  });

  it("bounds compact count one to only active or newest activity", () => {
    // Given
    const blocks: readonly PulseBlock[] = [
      { ...MIN_VOLUME, id: "old", kind: "text", order: 1, timestamp: 1 },
      { ...MIN_VOLUME, id: "active", kind: "tool", order: 2, timestamp: 2, metadata: { type: "tool", name: "Read", detail: "read", status: "running" } },
      { ...MIN_VOLUME, id: "new", kind: "success", order: 3, timestamp: 3 },
      { ...MIN_VOLUME, id: "newest", kind: "other", order: 4, timestamp: 4 },
    ];

    // When
    const busy = buildPulseView({ ...empty, busy: true, blocks }, 1);
    const idle = buildPulseView({ ...empty, blocks }, 1);
    const clamped = [0, -4, 1, 2].map((limit) => buildPulseView({ ...empty, busy: true, blocks }, limit));

    // Then
    expect(busy.segments.map(({ id }) => id)).toEqual(["active"]);
    expect(idle.segments.map(({ id }) => id)).toEqual(["newest"]);
    expect(clamped.map(({ segments }) => segments.length)).toEqual([1, 1, 1, 2]);
    process.stdout.write("REVIEW_DRIVER count.busy=1 count.idle=1 clamped=1,1,1,2\n");
  });

  it("derives the latest turn from two hundred thousand blocks without argument expansion", () => {
    // Given
    const blocks: PulseBlock[] = Array.from({ length: 200_000 }, (_, index) => ({
      id: `block-${index}`,
      kind: "text",
      order: index,
      timestamp: index * 1_000,
      ...MIN_VOLUME,
      ...(index === 199_999 ? {} : { turnId: "latest-turn" }),
    }));

    // When
    const build = () => buildPulseView({ ...empty, blocks }, 3);

    // Then
    expect(build).not.toThrow();
    const duration = build().metrics.find(({ id }) => id === "turn")?.value;
    expect(duration).toBe("3333:18");
    process.stdout.write(`REVIEW_DRIVER blocks=200000 turn=${duration}\n`);
  });

  it("reuses immutable block analysis and reads only bounded tail work on phase rebuild", () => {
    // Given
    const source: PulseBlock[] = Array.from({ length: 10_000 }, (_, index) => ({
      id: `block-${index}`,
      kind: index === 10 ? "tool" : "text",
      order: index,
      timestamp: index,
      ...MIN_VOLUME,
      ...(index === 10 ? { metadata: { type: "tool" as const, name: "Read", detail: "read", status: "running" } } : {}),
    }));
    let indexedReads = 0;
    const blocks = new Proxy(source, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/u.test(property)) indexedReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const phase0 = buildPulseView({ ...empty, busy: true, blocks, pulsePhase: 0 }, 3);
    indexedReads = 0;

    // When
    const phase1 = buildPulseView({ ...empty, busy: true, blocks, pulsePhase: 1 }, 3);

    // Then
    expect(indexedReads).toBeLessThanOrEqual(8);
    expect(phase1.segments).toHaveLength(3);
    expect(phase0.segments.slice(0, -1)).toEqual(phase1.segments.slice(0, -1));
    expect(phase0.segments.slice(0, -1)).toHaveLength(2);
    expect(phase0.segments.at(-1)?.glyph).not.toBe(phase1.segments.at(-1)?.glyph);
    expect(phase0.segments.at(-1)?.height).not.toBe(phase1.segments.at(-1)?.height);
    process.stdout.write(`REVIEW_DRIVER cached.reads=${indexedReads} passive=2 active.height=${phase0.segments.at(-1)?.height}->${phase1.segments.at(-1)?.height} active.glyph=${phase0.segments.at(-1)?.glyph}->${phase1.segments.at(-1)?.glyph}\n`);
  });

  it("keeps the runtime blocks array identical across pulse-only ticks", async () => {
    // Given
    let emit: ((event: RegistryTimelineEvent) => void) | undefined;
    let tick: (() => void) | undefined;
    let stops = 0;
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
      schedule: (callback) => { tick = callback; return () => { stops += 1; }; },
      onSnapshot: () => {},
    });
    const unmount = runtime.subscribe(() => {});
    await Promise.resolve();
    await Promise.resolve();
    emit?.({ agentId: "agent", epoch: "e", seq: 1, timestamp: "2026-09-12T00:00:00.000Z", event: { type: "turn_started", provider: "opencode", turnId: "turn" } });
    emit?.({ agentId: "agent", epoch: "e", seq: 2, timestamp: "2026-09-12T00:00:01.000Z", event: { type: "timeline", provider: "opencode", turnId: "turn", item: { type: "assistant_message", text: "active" } } });
    const blocks = runtime.getSnapshot().blocks;

    // When
    tick?.();

    // Then
    expect(runtime.getSnapshot().blocks).toBe(blocks);
    unmount();
    const idle = runtime.getSnapshot();
    tick?.();
    expect(runtime.getSnapshot()).toEqual(idle);
    expect(stops).toBe(1);
    process.stdout.write("REVIEW_DRIVER runtime.blocks.reused=1 timer.stop=1 late.tick.mutations=0\n");
  });

  it("renders the real Content footer last and full width without view metadata", async () => {
    // Given
    const module = await vi.importActual<PresentationModule>("./pill");
    const presentation = module.createPulselinePresentation({
      label: "Pulseline · OpenCode",
      agent: { provider: "opencode", activeTurn: null },
      timeline: () => ({
        subscribe: () => Object.assign(() => {}, { ready: Promise.resolve() }),
        refetch: async () => ({ epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, entries: [], error: null }),
      }),
      schedule: () => () => {},
      onSnapshot: () => {},
    });

    // When
    const rendered = presentation.Content(contentProps);
    const footer = childrenOf(rendered).filter(isUiNode).at(-1);

    // Then
    expect(footer?.type).toBe("View");
    expect(footer?.props["accessibilityLabel"]).toBe("Agent activity pulse");
    expect(footer?.props["style"]).toMatchObject({ width: "100%" });
    expect(buildPulseView(empty)).not.toHaveProperty("footer");
    hookHarness.cleanups[0]?.();
    process.stdout.write("REVIEW_DRIVER content.footer.last=1 content.footer.width=100% view.footer.metadata=0\n");
  });

  it("formats compact and decimal boundaries deterministically", () => {
    // Given
    const snapshot: TimelineSnapshot = {
      ...empty,
      metrics: {
        inputTokens: { value: 999 }, outputTokens: { value: 1_000 }, cachedInputTokens: { value: 1_250 },
        totalCostUsd: { value: 1.235 }, chatDurationMs: { value: 800_000 }, toolCount: { value: 1_000 },
        toolAverageDurationMs: { value: 1_050 }, textRateCharsPerSecond: { value: 9.96 },
      },
    };

    // When
    const values = new Map(buildPulseView(snapshot).metrics.map(({ id, value }) => [id, value]));

    // Then
    expect(values.get("input")).toBe("999");
    expect(values.get("output")).toBe("1k");
    expect(values.get("cache")).toBe("1.3k");
    expect(values.get("output-rate")).toBe("1.3/s");
    expect(values.get("text-rate")).toBe("10.0/s");
    expect(values.get("tool-count")).toBe("1k");
    expect(values.get("tool-average")).toBe("1.1s");
    expect(values.get("cost")).toBe("$1.24");
    process.stdout.write("REVIEW_DRIVER decimals=999,1k,1.3k,1.3/s,10.0/s,1k,1.1s,$1.24\n");
  });
});
