import type { PluginButtonContentProps, PluginButtonIconProps } from "@getpaseo/plugin/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryTimelineEvent } from "./controller";
import { buildComposerPulseLabel, PULSE_GLYPHS } from "./pulse-view";
import type { PulselineRuntimeInput } from "./runtime";
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

vi.mock("react/jsx-runtime", () => ({ Fragment: "Fragment", jsx: jsxHarness.render, jsxs: jsxHarness.render }));
vi.mock("react/jsx-dev-runtime", () => ({ Fragment: "Fragment", jsxDEV: jsxHarness.render }));
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
    readonly Icon: (props: PluginButtonIconProps) => UiNode;
    readonly Label: (props: PluginButtonIconProps) => UiNode;
    readonly Content: (props: PluginButtonContentProps) => UiNode;
    dispose(): void;
  };
}

const colors = {
  surface0: "surface-0", surface1: "surface-1", surface2: "surface-2", border: "border",
  foreground: "foreground", foregroundMuted: "foreground-muted", accent: "accent",
  accentForeground: "accent-foreground", statusSuccess: "success", statusWarning: "warning",
  statusDanger: "danger",
};

const hostProps = {
  context: "agent" as const,
  workspaceId: "workspace-1",
  agentId: "agent-1",
  theme: { colors },
  host: { id: "paseo", label: "Paseo" },
  layout: { compact: false, platform: "web" as const },
};

function childrenOf(node: UiNode): readonly unknown[] {
  const children = node.props["children"];
  return Array.isArray(children) ? children : [children];
}

function isUiNode(value: unknown): value is UiNode {
  return typeof value === "object" && value !== null && "type" in value && "props" in value;
}

function styleOf(node: UiNode): Record<string, unknown> {
  const style = node.props["style"];
  if (!Array.isArray(style)) return isRecord(style) ? style : {};
  return Object.assign({}, ...style.filter(isRecord));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function input(
  onEvent: (handler: (event: RegistryTimelineEvent) => void) => void,
  onTick: (callback: () => void) => void = () => {},
): PulselineRuntimeInput {
  return {
    label: "Pulseline · OpenCode",
    agent: { provider: "opencode", activeTurn: null },
    timeline: () => ({
      subscribe: (handler) => {
        onEvent(handler);
        return Object.assign(() => {}, { ready: Promise.resolve() });
      },
      refetch: async () => ({ epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, entries: [], error: null }),
    }),
    schedule: (callback) => { onTick(callback); return () => {}; },
    onSnapshot: () => {},
  };
}

describe("Pulseline visual clarity", () => {
  beforeEach(() => { hookHarness.cleanups.length = 0; });

  it("matches Claude's composer glyph vocabulary, capacity, order, and spacing", () => {
    const kinds = ["other", "read", "text", "tool", "reasoning", "write", "success", "error"] as const;
    const snapshot: TimelineSnapshot = {
      busy: false,
      gap: false,
      label: "Pulseline · OpenCode",
      metrics: {},
      blocks: Array.from({ length: 12 }, (_, index) => ({
        id: `block-${index}`,
        kind: kinds[index % kinds.length] ?? "other",
        order: index,
        timestamp: index,
        volumeTokens: 2 ** (index + 2),
        heightIndex: ([0, 1, 2, 3, 4, 5, 6, 7] as const)[Math.min(index, 7)] ?? 7,
      })),
    };

    const label = buildComposerPulseLabel(snapshot);

    expect(PULSE_GLYPHS).toEqual(["⣀", "⣤", "⣶", "⣿"]);
    expect([...label]).toHaveLength(12);
    expect(label).toBe("⣀⣀⣤⣤⣶⣶⣿⣿⣿⣿⣿⣿");
    expect(label).not.toContain(" ");
  });

  it("renders a calm semantic dot that becomes an accent activity pulse", async () => {
    let emit: ((event: RegistryTimelineEvent) => void) | undefined;
    let tick: (() => void) | undefined;
    const module = await vi.importActual<PresentationModule>("./pill");
    const presentation = module.createPulselinePresentation(input(
      (handler) => { emit = handler; },
      (callback) => { tick = callback; },
    ));

    const idle = presentation.Icon({ ...hostProps, size: 16, color: colors.foreground });
    await Promise.resolve();
    await Promise.resolve();
    emit?.({ agentId: "agent-1", epoch: "e", seq: 1, timestamp: "2026-09-12T00:00:01.000Z", event: { type: "turn_started", provider: "opencode", turnId: "turn-1" } });
    emit?.({ agentId: "agent-1", epoch: "e", seq: 2, timestamp: "2026-09-12T00:00:02.000Z", event: { type: "timeline", provider: "opencode", turnId: "turn-1", item: { type: "reasoning", text: "fresh activity" } } });
    const active0 = presentation.Icon({ ...hostProps, size: 16, color: colors.foreground });
    tick?.();
    const active1 = presentation.Icon({ ...hostProps, size: 16, color: colors.foreground });
    emit?.({ agentId: "agent-1", epoch: "e", seq: 3, timestamp: "2026-09-12T00:00:03.000Z", event: { type: "turn_completed", provider: "opencode", turnId: "turn-1" } });
    const settled = presentation.Icon({ ...hostProps, size: 16, color: colors.foreground });

    const idleDot = childrenOf(idle).find(isUiNode);
    const activeDot0 = childrenOf(active0).find(isUiNode);
    const activeDot1 = childrenOf(active1).find(isUiNode);
    const settledDot = childrenOf(settled).find(isUiNode);
    expect(idle.props["accessibilityLabel"]).toBe("Agent activity idle");
    expect(styleOf(idleDot ?? idle)).toMatchObject({ backgroundColor: "foreground-muted", opacity: 0.5, transform: [{ scale: 0.75 }] });
    expect(active0.props["accessibilityLabel"]).toBe("Agent activity active");
    expect(styleOf(activeDot0 ?? active0)).toMatchObject({ backgroundColor: "accent", opacity: 0.8, transform: [{ scale: 1 }] });
    expect(styleOf(activeDot1 ?? active1)).toMatchObject({ backgroundColor: "accent", opacity: 1, transform: [{ scale: 1.3 }] });
    expect(settled.props["accessibilityLabel"]).toBe("Agent activity idle");
    expect(styleOf(settledDot ?? settled)).toMatchObject({ backgroundColor: "success", opacity: 0.5, transform: [{ scale: 0.75 }] });

    for (const cleanup of hookHarness.cleanups) cleanup();
    presentation.dispose();
  });

  it("renders the footer with wider blocks and strong shared-baseline height separation", async () => {
    let emit: ((event: RegistryTimelineEvent) => void) | undefined;
    const module = await vi.importActual<PresentationModule>("./pill");
    const presentation = module.createPulselinePresentation(input((handler) => { emit = handler; }));
    presentation.Content({ ...hostProps, close: () => {} });
    await Promise.resolve();
    await Promise.resolve();
    emit?.({ agentId: "agent-1", epoch: "e", seq: 1, timestamp: "2026-09-12T00:00:01.000Z", event: { type: "timeline", provider: "opencode", item: { type: "assistant_message", text: "visible" } } });

    const content = presentation.Content({ ...hostProps, close: () => {} });
    const footer = childrenOf(content).filter(isUiNode).at(-1);
    const segment = footer ? childrenOf(footer).find(isUiNode) : undefined;
    const block = segment ? childrenOf(segment).find(isUiNode) : undefined;
    expect(styleOf(footer ?? content)).toMatchObject({ alignItems: "flex-end", minHeight: 54, width: "100%" });
    expect(styleOf(segment ?? content)).toMatchObject({ width: 6 });
    expect(styleOf(block ?? content)).toMatchObject({ backgroundColor: "foreground", height: 12 });

    for (const cleanup of hookHarness.cleanups) cleanup();
    presentation.dispose();
  });

  it("renders each Claude glyph as an independently colored fixed-width Text slot", async () => {
    let emit: ((event: RegistryTimelineEvent) => void) | undefined;
    let tick: (() => void) | undefined;
    const module = await vi.importActual<PresentationModule>("./pill");
    const presentation = module.createPulselinePresentation(input(
      (handler) => { emit = handler; },
      (callback) => { tick = callback; },
    ));
    const labelProps = { ...hostProps, size: 16, color: colors.foreground };
    presentation.Label(labelProps);
    await Promise.resolve();
    await Promise.resolve();
    emit?.({ agentId: "agent-1", epoch: "e", seq: 1, timestamp: "2026-09-12T00:00:01.000Z", event: { type: "turn_started", provider: "opencode", turnId: "turn-1" } });
    emit?.({ agentId: "agent-1", epoch: "e", seq: 2, timestamp: "2026-09-12T00:00:02.000Z", event: { type: "timeline", provider: "opencode", turnId: "turn-1", item: { type: "assistant_message", text: "visible" } } });
    emit?.({ agentId: "agent-1", epoch: "e", seq: 3, timestamp: "2026-09-12T00:00:03.000Z", event: { type: "timeline", provider: "opencode", turnId: "turn-1", item: { type: "reasoning", text: "thinking" } } });

    const before = presentation.Label(labelProps);
    const beforeGlyphs = childrenOf(before).filter(isUiNode);
    expect(styleOf(before)).toMatchObject({ alignItems: "flex-end", height: 18, justifyContent: "flex-end", overflow: "hidden", width: 96 });
    expect(beforeGlyphs).toHaveLength(2);
    expect(beforeGlyphs.every(({ type }) => type === "Text")).toBe(true);
    expect(beforeGlyphs.map(({ props }) => props["children"])).toEqual(["⣀", "⣀"]);
    expect(beforeGlyphs.map((glyph) => styleOf(glyph)["color"])).toEqual(["foreground", "accent"]);
    expect(beforeGlyphs.map((glyph) => styleOf(glyph)["width"])).toEqual([8, 8]);

    tick?.();
    const after = presentation.Label(labelProps);
    const afterGlyphs = childrenOf(after).filter(isUiNode);
    expect(styleOf(after)).toEqual(styleOf(before));
    expect(afterGlyphs.map((glyph) => styleOf(glyph)["width"])).toEqual([8, 8]);
    expect(afterGlyphs.map(({ props }) => props["children"])).toEqual(["⣀", "⣤"]);
    expect(afterGlyphs[0]).toEqual(beforeGlyphs[0]);
    expect(styleOf(afterGlyphs[1] ?? after)["opacity"]).not.toBe(styleOf(beforeGlyphs[1] ?? before)["opacity"]);

    for (const cleanup of hookHarness.cleanups) cleanup();
    presentation.dispose();
  });
});
