import type { PluginButtonContentProps, PluginButtonIconProps } from "@getpaseo/plugin/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryTimelineEvent } from "./controller";
import { COUNTER_SCALE } from "./counter-layout";
import { buildComposerPulseLabel, PULSE_GLYPHS, PULSE_LABEL_WIDTH } from "./pulse-view";
import type { PulselineRuntimeInput } from "./runtime";
import type { TimelineSnapshot } from "./store";

const hookHarness = vi.hoisted(() => {
  const cleanups: Array<() => void> = [];
  return { cleanups, states: [] as unknown[], cursor: 0 };
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
  useCallback: <Callback,>(callback: Callback) => callback,
  memo: <Props,>(component: (props: Props) => unknown) => component,
  useLayoutEffect: () => {},
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => {
    const index = hookHarness.cursor++;
    if (!(index in hookHarness.states)) hookHarness.states[index] = value;
    return [hookHarness.states[index], (next: unknown) => { hookHarness.states[index] = next; }];
  },
  useEffect: () => {},
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
  Pressable: "Pressable",
  Animated: { View: "AnimatedView", Value: class { interpolate() { return "rotation"; } setValue() {} }, loop: () => ({ start() {}, stop() {} }), timing: () => ({}) },
  Easing: { linear: (x: number) => x },
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

function nodes(value: unknown): UiNode[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isUiNode(value)) return [];
  return [value, ...nodes(value.props["children"])];
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
    label: "Pulseline",
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
  beforeEach(() => { hookHarness.cleanups.length = 0; hookHarness.states = []; hookHarness.cursor = 0; });

  it("matches Claude's composer glyph vocabulary, capacity, order, and spacing", () => {
    const kinds = ["other", "read", "text", "tool", "reasoning", "write", "success", "error"] as const;
    const snapshot: TimelineSnapshot = {
      busy: false,
      gap: false,
      label: "Pulseline",
      metrics: {},
      blocks: Array.from({ length: PULSE_LABEL_WIDTH + 4 }, (_, index) => ({
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
    expect(PULSE_LABEL_WIDTH).toBe(12);
    expect([...label]).toHaveLength(PULSE_LABEL_WIDTH);
    expect(label).toBe("⣶⣶" + "⣿".repeat(PULSE_LABEL_WIDTH - 2));
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
    expect(styleOf(idleDot ?? idle)).toMatchObject({ backgroundColor: "foreground-muted", opacity: 0.5 });
    expect(active0.props["accessibilityLabel"]).toBe("Agent activity active");
    expect(styleOf(activeDot0 ?? active0)).toMatchObject({ width: 14, height: 14 });
    expect(styleOf(activeDot1 ?? active1)).toMatchObject({ width: 14, height: 14 });
    expect(settled.props["accessibilityLabel"]).toBe("Agent activity idle");
    expect(styleOf(settledDot ?? settled)).toMatchObject({ backgroundColor: "foreground-muted", opacity: 0.5 });

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
    const scroll = footer ? nodes(footer).find(child => child.type === "ScrollView") : undefined;
    const strip = scroll ? childrenOf(scroll).find(isUiNode) : undefined;
    const segment = strip ? childrenOf(strip).flat().filter(isUiNode).find(node => node.type === "Pressable") : undefined;
    const barArea = segment ? childrenOf(segment).find(isUiNode) : undefined;
    const block = barArea ? childrenOf(barArea).find(isUiNode) : undefined;
    expect(styleOf(footer ?? content)).toMatchObject({ width: "100%" });
    expect(scroll?.props["horizontal"]).toBe(true);
    expect(styleOf(segment ?? content)).toMatchObject({ width: 10 });
    expect(styleOf(block ?? content)).toMatchObject({ backgroundColor: "foreground", height: 8 });

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
    expect(styleOf(before)).toMatchObject({ alignItems: "flex-end", height: 18, justifyContent: "flex-end", overflow: "hidden", width: PULSE_LABEL_WIDTH * 8 });
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

vi.mock("@getpaseo/plugin/client/ui", () => ({ Icon: "HostIcon", ScrollView: "ScrollView" }));


it("shows counter facts and tool details on hover/focus and initially scrolls to newest", async () => {
  hookHarness.states = []; hookHarness.cursor = 0;
  let emit: ((event: RegistryTimelineEvent) => void) | undefined;
  const module = await vi.importActual<PresentationModule>("./pill");
  const presentation = module.createPulselinePresentation(input(handler => { emit = handler; }));
  const render = () => { hookHarness.cursor = 0; return presentation.Content({ ...hostProps, close: () => {} }); };
  render(); await Promise.resolve(); await Promise.resolve();
  emit?.({ agentId: "agent-1", epoch: "e", seq: 1, timestamp: "2026-09-12T00:00:01.000Z", event: { type: "timeline", provider: "opencode", item: { type: "tool_call", callId: "tool", name: "Read", detail: { type: "read", filePath: "a" }, status: "completed", error: null } } });
  let tree = render();
  const counter = nodes(tree).find(node => node.type === "Pressable" && String(node.props["accessibilityLabel"]).startsWith("Input tokens:"))!;
  (counter.props["onHoverIn"] as () => void)();
  tree = render();
  expect(nodes(tree).some(node => node.type === "Text" && String(node.props["children"]).includes("Input tokens: Chat sum —"))).toBe(true);
  const counterHint = nodes(tree).find(node => node.props["accessibilityLabel"] === "Counter details")!;
  expect(nodes(counterHint).find(node => node.type === "HostIcon")?.props["name"]).toBe("ArrowDown");
  expect(nodes(counterHint).find(node => node.type === "HostIcon")?.props["color"]).toBe(colors.foregroundMuted);
  const bar = nodes(tree).find(node => node.type === "Pressable" && String(node.props["accessibilityLabel"]).includes("size bucket"))!;
  (bar.props["onFocus"] as () => void)();
  tree = render();
  expect(nodes(tree).some(node => node.type === "Text" && String(node.props["children"]).includes("Read · completed · ~"))).toBe(true);
  const scroll = nodes(tree).find(node => node.type === "ScrollView")!;
  const scrollToEnd = vi.fn();
  (scroll.props["ref"] as { current: unknown }).current = { scrollToEnd };
  (scroll.props["onContentSizeChange"] as () => void)();
  (scroll.props["onContentSizeChange"] as () => void)();
  expect(scrollToEnd).toHaveBeenCalledExactlyOnceWith({ animated: false });
  presentation.dispose();
});

it("renders inline counters, shared header ring, whole-column hover, scrolling icons and observed legend", async () => {
  hookHarness.states = []; hookHarness.cursor = 0;
  let emit: ((event: RegistryTimelineEvent) => void) | undefined;
  let tick: (() => void) | undefined;
  const module = await vi.importActual<PresentationModule>("./pill");
  const presentation = module.createPulselinePresentation(input(handler => { emit = handler; }, callback => { tick = callback; }));
  const render = () => { hookHarness.cursor = 0; return presentation.Content({ ...hostProps, close: () => {} }); };
  const columns = (tree: UiNode) => nodes(tree).filter(node => node.type === "Pressable" && String(node.props["accessibilityLabel"]).includes("size bucket"));
  render(); await Promise.resolve(); await Promise.resolve();
  const send = (seq: number, event: RegistryTimelineEvent["event"]) => emit?.({ agentId: "agent-1", epoch: "e", seq, timestamp: new Date(seq * 1000).toISOString(), event } as RegistryTimelineEvent);
  send(1, { type: "turn_started", provider: "opencode", turnId: "t" });
  send(2, { type: "timeline", provider: "opencode", turnId: "t", item: { type: "assistant_message", text: "a" } });
  send(3, { type: "timeline", provider: "opencode", turnId: "t", item: { type: "reasoning", text: "b" } });
  let tree = render();
  const counterSlots = nodes(tree).filter(node => node.type === "Pressable" && String(node.props["accessibilityLabel"]).includes(": "));
  expect(counterSlots).toHaveLength(12);
  for (const slot of counterSlots) {
    expect(styleOf(slot)).toMatchObject({ flexDirection: "row", width: "16.666666%", height: 36 });
    expect(childrenOf(slot).filter(isUiNode).map(child => child.type)).toEqual(["HostIcon", "Text"]);
  }
  for (const slot of counterSlots) expect(styleOf(slot)).toMatchObject({ justifyContent: "flex-start", paddingLeft: 0 });
  const counterHint = nodes(tree).find(node => node.props["accessibilityLabel"] === "Counter details")!;
  expect(styleOf(counterHint)).toMatchObject({ height: 32, paddingLeft: 0 });
  expect(styleOf(counterHint)["minHeight"]).toBeUndefined();
  expect(nodes(counterHint).find(node => node.type === "HostIcon")?.props["name"]).toBe("Info");
  const counterTexts = counterSlots.flatMap(slot => childrenOf(slot).filter(isUiNode).filter(child => child.type === "Text"));
  expect(counterTexts).toHaveLength(12);
  expect(new Set(counterTexts.map(text => styleOf(text)["fontSize"]))).toEqual(new Set([9 * COUNTER_SCALE]));
  expect(counterTexts.every(text => text.props["adjustsFontSizeToFit"] === undefined)).toBe(true);
  expect(new Set(counterSlots.flatMap(slot => childrenOf(slot).filter(isUiNode).filter(child => child.type === "HostIcon").map(icon => icon.props["size"])))).toEqual(new Set([10 * COUNTER_SCALE]));
  const pill = presentation.Icon({ ...hostProps, size: 16, color: colors.foreground });
  const headerMark = nodes(tree).find(node => node.props["accessibilityLabel"] === "Agent activity active");
  expect(headerMark).toEqual(pill);
  const legend = nodes(tree).find(node => node.props["accessibilityLabel"] === "Activity colour legend")!;
  expect(nodes(legend).filter(node => node.type === "Text").map(node => node.props["children"])).toEqual(["text", "reasoning"]);
  const scroll = nodes(tree).find(node => node.type === "ScrollView")!;
  const icons = nodes(scroll).filter(node => node.type === "HostIcon");
  expect(icons.map(node => node.props["name"])).toEqual(["MessageSquare", "Brain"]);
  expect(icons.map(node => node.props["color"])).toEqual([colors.foreground, colors.accent]);
  for (const column of columns(tree)) {
    expect(styleOf(column)).toMatchObject({ height: 54 });
    expect([10, 12]).toContain(styleOf(column)["width"]);
    const [bar, icon] = childrenOf(column).filter(isUiNode);
    expect(styleOf(bar!)).toMatchObject({ width: 10, height: 40 });
    expect(styleOf(icon!)).toMatchObject({ width: 10, height: 14 });
  }
  const footer = nodes(tree).find(node => node.props["accessibilityLabel"] === "Agent activity pulse")!;
  expect(childrenOf(footer).filter(isUiNode).map(node => nodes(node).some(child => child.type === "ScrollView") ? "strip" : node.props["accessibilityLabel"])).toEqual(["Selected activity details", "strip", "Activity colour legend"]);
  const hintText = (root: UiNode) => {
    const hint = nodes(root).find(node => node.props["accessibilityLabel"] === "Selected activity details")!;
    return nodes(hint).find(node => node.type === "Text")?.props["children"];
  };
  expect(hintText(tree)).toContain("reasoning");
  expect(scroll.props["showsHorizontalScrollIndicator"]).toBe(false);
  expect(scroll.props["showsVerticalScrollIndicator"]).toBe(false);
  expect(styleOf(scroll)["height"]).toBe(76);
  expect(scroll.props["contentContainerStyle"]).toEqual({ paddingBottom: 20 });
  expect(columns(tree).every(column => styleOf(column)["backgroundColor"] === undefined)).toBe(true);
  const blockHint = nodes(tree).find(node => node.props["accessibilityLabel"] === "Selected activity details")!;
  expect(styleOf(blockHint)).toMatchObject({ paddingLeft: 0, height: 32 });
  expect(styleOf(tree)).toMatchObject({ paddingLeft: 0, gap: 4 });
  const beforeColumns = columns(tree).map(styleOf);
  (columns(tree)[0]!.props["onHoverIn"] as () => void)();
  tree = render();
  expect(styleOf(columns(tree)[0]!)).toMatchObject({ height: 54, backgroundColor: colors.surface2 });
  expect(styleOf(columns(tree)[1]!)["backgroundColor"]).toBeUndefined();
  expect(hintText(tree)).toContain("text");
  tick?.(); tree = render();
  expect(columns(tree).map(styleOf)).toEqual(beforeColumns.map((style, index) => index === 0 ? { ...style, backgroundColor: colors.surface2 } : style));
  const bars = columns(tree).map(column => nodes(column).find(node => styleOf(node)["borderRadius"] === 2)!);
  expect(bars.map(bar => styleOf(bar)["height"])).toEqual([8, 12]);
  expect(bars.map(bar => styleOf(bar)["opacity"])).toEqual([0.9, 1]);
  (columns(tree)[0]!.props["onHoverOut"] as () => void)();
  tree = render();
  expect(styleOf(columns(tree)[0]!)["backgroundColor"]).toBeUndefined();
  expect(hintText(tree)).toContain("reasoning");
  send(4, { type: "timeline", provider: "opencode", turnId: "t", item: { type: "error", message: "test" } });
  tree = render();
  expect(nodes(tree).filter(node => node.type === "View").some(node => styleOf(node)["borderColor"] === colors.statusDanger)).toBe(true);
  send(5, { type: "turn_completed", provider: "opencode", turnId: "t" });
  tree = render();
  const idleScroll = nodes(tree).find(node => node.type === "ScrollView")!;
  const idleIcons = nodes(idleScroll).filter(node => node.type === "HostIcon");
  expect(idleIcons.map(icon => icon.props["color"])).toEqual([colors.foreground, colors.accent, colors.statusDanger, colors.statusSuccess]);
  for (const column of columns(tree)) {
    const bar = nodes(column).find(node => styleOf(node)["borderRadius"] === 2)!;
    const icon = nodes(column).find(node => node.type === "HostIcon")!;
    expect(icon.props["color"]).toBe(styleOf(bar)["backgroundColor"]);
  }
  const idleMark = nodes(tree).find(node => node.props["accessibilityLabel"] === "Agent activity idle");
  expect(idleMark).toEqual(presentation.Icon({ ...hostProps, size: 16, color: colors.foreground }));
  presentation.dispose();
});
