import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { buildHistoryView } from "./pulse-view";
import { stripExtent, stripWindow, prependOffset } from "./strip-window";
import { createPulselineRuntime } from "./runtime";
import { setImmediate } from "node:timers/promises";
import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import type { RegistryTimelineEvent } from "./controller";
import type { PulseBlock } from "./model";
const counters = vi.hoisted(() => ({ columns: 0, texts: 0 }));
vi.mock("react-native", async () => {
  const React = await import("react");
  return { View: "View", Text: (props: Record<string, unknown>) => { counters.texts++; return React.createElement("Text", props); }, Pressable: (props: Record<string, unknown>) => { counters.columns++; return React.createElement("Pressable", props); },
    StyleSheet: { create: (styles: unknown) => styles }, Animated: { View: "AnimatedView", Value: class { interpolate() { return "rotation"; } setValue() {} }, loop: () => ({ start() {}, stop() {} }), timing: () => ({}) }, Easing: { linear: (x: number) => x } };
});
vi.mock("@getpaseo/plugin/client/ui", async () => {
  const React = await import("react");
  return { Icon: "HostIcon", ScrollView: React.forwardRef((props: Record<string, unknown>, ref) => React.createElement("ScrollView", { ...props, ref })) };
});
import { createPulselinePresentation, PulseFooter } from "./pill";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const colors = { surface0: "s0", surface1: "s1", surface2: "s2", foreground: "fg", foregroundMuted: "muted", accent: "accent", border: "border", accentForeground: "af", statusWarning: "warn", statusDanger: "danger", statusSuccess: "ok" };
const blocks = (count: number, start = 0): PulseBlock[] => Array.from({ length: count }, (_, i) => ({ id: String(start + i), order: start + i, timestamp: start + i, kind: "reasoning", heightIndex: 2, volumeTokens: 65 }));
const segments = (items: PulseBlock[], phase: 0 | 1 | 2 = 0) => buildHistoryView({ busy: true, gap: false, blocks: items, metrics: {}, label: "", pulsePhase: phase }).segments;
let renderer: ReactTestRenderer | undefined;
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; });

it("11a/b: 5000 blocks render a bounded window and a tick renders exactly one blinking column", async () => {
  const items = blocks(5000); const scroll = { scrollToEnd: vi.fn(), scrollTo: vi.fn(), getScrollableNode: () => undefined };
  counters.columns = 0;
  await act(async () => { renderer = create(<PulseFooter segments={segments(items)} colors={colors} historyLoaded />, { createNodeMock: element => element.type === "ScrollView" ? scroll : {} }); });
  const initial = counters.columns;
  expect(initial).toBeGreaterThan(0); expect(initial).toBeLessThanOrEqual(151);
  expect(renderer!.root.findAllByType("Pressable" as never)).toHaveLength(initial);
  await act(async () => { renderer!.update(<PulseFooter segments={segments(items, 1)} colors={colors} historyLoaded />); });
  expect(counters.columns - initial).toBe(1);
  expect(scroll.scrollToEnd).toHaveBeenCalled();
  await act(async () => { renderer!.root.findByType("ScrollView" as never).props["onLayout"]({ nativeEvent: { layout: { width: 280 } } }); });
  expect(scroll.scrollTo).toHaveBeenCalledWith({ x: stripExtent(5000) - 280, animated: false });
  const beforeHover = counters.columns;
  await act(async () => { renderer!.root.findAllByType("Pressable" as never)[0]!.props["onHoverIn"](); });
  expect(counters.columns - beforeHover).toBe(1);
});

it("background prepend preserves a detached horizontal offset", async () => {
  const items = blocks(300);
  const scroll = { scrollToEnd: vi.fn(), scrollTo: vi.fn(), getScrollableNode: () => undefined };
  await act(async () => { renderer = create(<PulseFooter segments={segments(items)} colors={colors} historyLoaded />, { createNodeMock: element => element.type === "ScrollView" ? scroll : {} }); });
  await act(async () => { renderer!.root.findByType("ScrollView" as never).props["onScroll"]({ nativeEvent: { contentOffset: { x: 0 } } }); });
  const prepended = [...blocks(20, -20), ...items];
  await act(async () => { renderer!.update(<PulseFooter segments={segments(prepended)} colors={colors} historyLoaded />); });
  expect(scroll.scrollTo).toHaveBeenCalledWith({ x: prependOffset(0, 20), animated: false });
  expect(renderer!.root.findAllByType("Pressable" as never).length).toBeLessThanOrEqual(151);
});

it("11a: spacers preserve the exact scroll extent at every offset", () => {
  for (const offset of [-100, 0, 120, 30000, stripExtent(5000) - 360, 100000]) {
    const window = stripWindow(5000, offset, 360);
    const columns = (window.end - window.first) * 12 - (window.end === 5000 ? 2 : 0);
    expect(window.leading + columns + window.trailing).toBe(stripExtent(5000));
    expect(window.end - window.first).toBeLessThanOrEqual(151);
  }
});


it("D: scrolling a hovered column out clears selection to the default last block", async () => {
  const items = blocks(5000).map(item => ({ ...item, metadata: { type: "tool" as const, name: `block-${item.id}`, detail: "read", status: "completed" } }));
  await act(async () => { renderer = create(<PulseFooter segments={segments(items)} colors={colors} historyLoaded />); });
  await act(async () => { renderer!.root.findAllByType("Pressable" as never)[0]!.props["onHoverIn"](); });
  const hint = () => renderer!.root.findByProps({ accessibilityLabel: "Selected activity details" }).findByType("Text" as never).props["children"];
  expect(hint()).not.toContain("block-4999");
  await act(async () => { renderer!.root.findByType("ScrollView" as never).props["onScroll"]({ nativeEvent: { contentOffset: { x: 0 } } }); });
  expect(hint()).toContain("block-4999");
});

it("E: scroll frames inside an unchanged window never rerender hint/legend Text", async () => {
  const items = blocks(5000);
  await act(async () => { renderer = create(<PulseFooter segments={segments(items)} colors={colors} historyLoaded />); });
  const move = async (x: number) => act(async () => { renderer!.root.findByType("ScrollView" as never).props["onScroll"]({ nativeEvent: { contentOffset: { x } } }); });
  await move(1201); const texts = counters.texts;
  for (let x = 1202; x < 1210; x++) await move(x);
  expect(counters.texts).toBe(texts);
});

it.each(["evicted", "coalesced"] as const)("F: preserves a visible anchor when the head is %s", async change => {
  const items = blocks(300);
  const scroll = { scrollToEnd: vi.fn(), scrollTo: vi.fn(), getScrollableNode: () => undefined };
  await act(async () => { renderer = create(<PulseFooter segments={segments(items)} colors={colors} historyLoaded />, { createNodeMock: element => element.type === "ScrollView" ? scroll : {} }); });
  await act(async () => { renderer!.root.findByType("ScrollView" as never).props["onScroll"]({ nativeEvent: { contentOffset: { x: 1205 } } }); });
  scroll.scrollTo.mockClear();
  const changed = change === "evicted" ? items.slice(20) : [items[19]!, ...items.slice(20)];
  await act(async () => { renderer!.update(<PulseFooter segments={segments(changed)} colors={colors} historyLoaded />); });
  expect(scroll.scrollTo).toHaveBeenCalledWith({ x: 1205 - (change === "evicted" ? 20 : 19) * 12, animated: false });
});

it("background controller fills history independently of strip width or scroll events", async () => {
  let calls = 0;
  const cursors: number[] = [];
  const runtime = createPulselineRuntime({ agent: { provider: "codex" }, label: "", schedule: () => () => {}, onSnapshot: () => {}, timeline: () => ({
    subscribe: () => Object.assign(() => {}, { ready: Promise.resolve() }), refetch: async options => {
      calls++; const end = options?.cursor?.seq ?? 36;
      cursors.push(end);
      const start = Math.max(1, end - 5);
      return { epoch: "e", reset: false, gap: false, hasOlder: start > 1, startCursor: start > 1 ? { epoch: "e", seq: start } : null, error: null, entries: Array.from({ length: end - start }, (_, i) => ({ provider: "codex", timestamp: new Date(start + i).toISOString(), seqStart: start + i, seqEnd: start + i, item: { type: "assistant_message" as const, text: "x" } })) };
    },
  }) });
  function Connected() {
    const snapshot = React.useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
    return <PulseFooter segments={buildHistoryView(snapshot).segments} colors={colors} historyLoaded={snapshot.historyLoaded === true} loadingOlder={snapshot.loadingOlder ?? false} />;
  }
  await act(async () => { renderer = create(<Connected />); });
  await act(async () => { await vi.waitFor(() => expect(calls).toBe(7), { interval: 1 }); });
  expect(calls).toBe(7); expect(new Set(cursors).size).toBe(cursors.length);
  expect(runtime.getSnapshot().blocks).toHaveLength(35);
});

it("J: real popover root width is fixed across loading, idle, busy and counter hover", async () => {
  let emit!: (event: RegistryTimelineEvent) => void;
  let resolve!: (value: { epoch: string; reset: boolean; gap: boolean; hasOlder: boolean; startCursor: null; entries: []; error: null }) => void;
  const presentation = createPulselinePresentation({ agent: { provider: "codex" }, label: "", schedule: () => () => {}, onSnapshot: () => {}, timeline: () => ({ subscribe: handler => { emit = handler; return Object.assign(() => {}, { ready: Promise.resolve() }); }, refetch: () => new Promise(done => { resolve = done; }) }) });
  const props: PluginButtonContentProps = { context: "agent", workspaceId: "w", agentId: "a", theme: { colors }, host: { id: "h", label: "h" }, layout: { compact: false, platform: "web" }, close: () => {} };
  await act(async () => { renderer = create(React.createElement(presentation.Content, props)); });
  const width = () => {
    const content = renderer!.root.findAllByType("View" as never)[0]!;
    return Object.assign({}, ...content.props["style"])["width"];
  };
  const fixed = width(); expect(fixed).toBe(394);
  await act(async () => { resolve({ epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, entries: [], error: null }); });
  expect(width()).toBe(fixed);
  await act(async () => { emit({ agentId: "a", timestamp: new Date(1000).toISOString(), event: { type: "turn_started", provider: "codex", turnId: "t" } }); });
  expect(width()).toBe(fixed);
  await act(async () => { renderer!.root.findAllByType("Pressable" as never)[0]!.props["onHoverIn"](); });
  expect(width()).toBe(fixed);
  expect(fixed + 2 * 12 + 2).toBe(420);
});


it("D: an evicted hover is forgotten permanently, even if that id later returns", async () => {
  const items = blocks(300).map(item => ({ ...item, metadata: { type: "tool" as const, name: `block-${item.id}`, detail: "read", status: "completed" } }));
  const first = Math.max(0, Math.floor((stripExtent(300) - 360) / 12) - 60);
  await act(async () => { renderer = create(<PulseFooter segments={segments(items)} colors={colors} historyLoaded />); });
  await act(async () => { renderer!.root.findAllByType("Pressable" as never)[0]!.props["onHoverIn"](); });
  const hint = () => renderer!.root.findByProps({ accessibilityLabel: "Selected activity details" }).findByType("Text" as never).props["children"];
  expect(hint()).toContain(`block-${first}`);
  await act(async () => { renderer!.update(<PulseFooter segments={segments(items.filter(item => item.id !== String(first)))} colors={colors} historyLoaded />); });
  await act(async () => { renderer!.update(<PulseFooter segments={segments(items)} colors={colors} historyLoaded />); });
  expect(hint()).toContain("block-299");
});

it("scroll and layout cannot start additional data requests after history completes", async () => {
  let calls = 0;
  const runtime = createPulselineRuntime({ agent: { provider: "codex" }, label: "", schedule: () => () => {}, onSnapshot: () => {}, timeline: () => ({ subscribe: () => Object.assign(() => {}, { ready: Promise.resolve() }), refetch: async () => { calls++; return { epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, error: null, entries: [] }; } }) });
  function Connected() {
    const snapshot = React.useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
    return <PulseFooter segments={buildHistoryView(snapshot).segments} colors={colors} historyLoaded={snapshot.historyLoaded === true} loadingOlder={snapshot.loadingOlder ?? false} />;
  }
  await act(async () => { renderer = create(<Connected />); });
  for (let i = 0; i < 3; i++) await act(async () => {
    const scroll = renderer!.root.findByType("ScrollView" as never);
    scroll.props["onLayout"]({ nativeEvent: { layout: { width: 394 } } });
    scroll.props["onScroll"]({ nativeEvent: { contentOffset: { x: 0 } } });
  });
  expect(calls).toBe(1);
});

it.each([
  ["append", true], ["growth", true], ["append", false], ["growth", false],
] as const)("real runtime %s follows only when near right end (pinned=%s)", async (change, pinned) => {
  let emit!: (event: RegistryTimelineEvent) => void;
  const runtime = createPulselineRuntime({ agent: { provider: "codex", activeTurn: { turnId: "t", startedAt: new Date(1000).toISOString() } }, label: "", onSnapshot: () => {}, schedule: () => () => {}, timeline: () => ({
    subscribe: handler => { emit = handler; return Object.assign(() => {}, { ready: Promise.resolve() }); },
    refetch: async () => ({ epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, error: null, entries: Array.from({ length: 300 }, (_, i) => ({ provider: "codex", turnId: "t", timestamp: new Date((i + 1) * 1000).toISOString(), seqStart: i + 1, seqEnd: i + 1, item: i === 299 ? { type: "assistant_message" as const, messageId: "last", text: "x" } : { type: "reasoning" as const, text: "x" } })) }),
  }) });
  function Connected() {
    const snapshot = React.useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
    return <PulseFooter segments={buildHistoryView(snapshot).segments} colors={colors} historyLoaded={snapshot.historyLoaded === true} />;
  }
  const scroll = { scrollToEnd: vi.fn(), scrollTo: vi.fn(), getScrollableNode: () => undefined };
  await act(async () => { renderer = create(<Connected />, { createNodeMock: element => element.type === "ScrollView" ? scroll : {} }); });
  const x = pinned ? stripExtent(300) - 360 - 6 : 1205;
  await act(async () => { renderer!.root.findByType("ScrollView" as never).props["onScroll"]({ nativeEvent: { contentOffset: { x } } }); });
  scroll.scrollToEnd.mockClear(); scroll.scrollTo.mockClear();
  await act(async () => { emit({ agentId: "a", epoch: "e", seq: 301, timestamp: new Date(301000).toISOString(), event: { type: "timeline", provider: "codex", turnId: "t", item: change === "growth" ? { type: "assistant_message", messageId: "last", text: "x".repeat(260) } : { type: "reasoning", text: "x".repeat(260) } } }); });
  if (pinned) {
    expect(scroll.scrollToEnd).toHaveBeenCalledWith({ animated: false });
    const columns = renderer!.root.findAllByType("Pressable" as never);
    expect(columns.at(-1)!.props["accessibilityLabel"]).toContain("size bucket 3");
    // A native content-size notification also preserves the pin.
    await act(async () => { renderer!.root.findByType("ScrollView" as never).props["onContentSizeChange"](); });
    expect(scroll.scrollToEnd).toHaveBeenCalled();
  } else {
    expect(scroll.scrollToEnd).not.toHaveBeenCalled();
    expect(scroll.scrollTo).not.toHaveBeenCalled();
  }
});

it("popover Content rerenders live status after same-call tool updates without stale memo keys", async () => {
  let emit!: (event: RegistryTimelineEvent) => void;
  const presentation = createPulselinePresentation({ agent: { provider: "codex" }, label: "", schedule: () => () => {}, onSnapshot: () => {}, timeline: () => ({ subscribe: handler => { emit = handler; return Object.assign(() => {}, { ready: Promise.resolve() }); }, refetch: async () => ({ epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, error: null, entries: [] }) }) });
  const props: PluginButtonContentProps = { context: "agent", workspaceId: "w", agentId: "a", theme: { colors }, host: { id: "h", label: "h" }, layout: { compact: false, platform: "web" }, close: () => {} };
  await act(async () => { renderer = create(React.createElement(presentation.Content, props)); });
  const header = () => renderer!.root.findAllByType("Text" as never).find(node => node.props["accessibilityRole"] === "header")!.props["children"];
  let seq = 0;
  const send = async (event: RegistryTimelineEvent["event"]) => act(async () => { emit({ agentId: "a", epoch: "e", seq: ++seq, timestamp: new Date(seq * 1000).toISOString(), event } as RegistryTimelineEvent); });
  const tool = (callId: string, name: string, status: "running" | "completed") => send({ type: "timeline", provider: "codex", turnId: "t", item: { type: "tool_call", callId, name, detail: { type: "shell", command: "x" }, status, error: null } });
  await send({ type: "turn_started", provider: "codex", turnId: "t" }); expect(header()).toBe("Working");
  await tool("c1", "Bash", "running"); expect(header()).toBe("Running Bash");
  await tool("c1", "Bash", "completed"); expect(header()).toBe("Working");
  await tool("c2", "Read", "running"); expect(header()).toBe("Running Read");
  await tool("c2", "Read", "completed"); expect(header()).toBe("Working");
  await send({ type: "turn_completed", provider: "codex", turnId: "t" }); expect(header()).toBe("Idle");
  await send({ type: "turn_started", provider: "codex", turnId: "next" }); expect(header()).toBe("Working");
});

it("background history progress replaces the existing counter hint and marks the strip's left edge", async () => {
  const pending: Array<(page: import("./controller").RegistryTimelinePage) => void> = [];
  const rows = (start: number) => Array.from({ length: 200 }, (_, i) => ({ provider: "opencode", timestamp: new Date(i + start).toISOString(), seqStart: i + start, seqEnd: i + start, item: { type: "reasoning" as const, text: "x" } }));
  const page = { epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, error: null, entries: rows(0) };
  const presentation = createPulselinePresentation({ agent: { provider: "opencode" }, label: "", schedule: () => () => {}, onSnapshot: () => {}, timeline: () => ({ subscribe: () => Object.assign(() => {}, { ready: Promise.resolve() }), refetch: async options => options?.direction === "before" ? new Promise(done => { pending.push(done); }) : { ...page, hasOlder: true, startCursor: { epoch: "e", seq: 400 }, entries: rows(400) } }) });
  const props: PluginButtonContentProps = { context: "agent", workspaceId: "w", agentId: "a", theme: { colors }, host: { id: "h", label: "h" }, layout: { compact: false, platform: "web" }, close: () => {} };
  await act(async () => { renderer = create(React.createElement(presentation.Content, props)); });
  const hint = () => renderer!.root.findByProps({ accessibilityLabel: "Counter details" });
  expect(hint().findByType("Text" as never).props["children"]).toBe("Loading history… 200 blocks");
  expect(hint().props["style"].height).toBe(32);
  expect(renderer!.root.findAllByProps({ accessibilityLabel: "History loading at left edge" })).toHaveLength(1);
  await act(async () => { await vi.waitFor(() => expect(pending).toHaveLength(1), { interval: 1 }); pending[0]!({ ...page, hasOlder: true, startCursor: { epoch: "e", seq: 200 }, entries: rows(200) }); });
  expect(hint().findByType("Text" as never).props["children"]).toBe("Loading history… 400 blocks");
  await act(async () => { await vi.waitFor(() => expect(pending).toHaveLength(2), { interval: 1 }); pending[1]!(page); });
  expect(hint().findByType("Text" as never).props["children"]).toBe("Hover or focus a counter for its source and exact value.");
  expect(renderer!.root.findAllByProps({ accessibilityLabel: "History loading at left edge" })).toHaveLength(0);
  expect(hint().props["style"].height).toBe(32);
});

it("background prepends keep a pinned strip at the newest end", async () => {
  const items = blocks(300), scroll = { scrollToEnd: vi.fn(), scrollTo: vi.fn(), getScrollableNode: () => undefined };
  await act(async () => { renderer = create(<PulseFooter segments={segments(items)} colors={colors} historyLoaded />, { createNodeMock: element => element.type === "ScrollView" ? scroll : {} }); });
  scroll.scrollToEnd.mockClear();
  await act(async () => { renderer!.update(<PulseFooter segments={segments([...blocks(200, -200), ...items])} colors={colors} historyLoaded />); });
  expect(scroll.scrollToEnd).toHaveBeenCalledWith({ animated: false });
  expect(renderer!.root.findAllByType("Pressable" as never).at(-1)!.props["accessibilityLabel"]).toBe("reasoning size bucket 3");
});
