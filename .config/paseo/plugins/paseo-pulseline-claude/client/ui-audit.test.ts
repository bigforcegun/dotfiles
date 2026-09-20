// Two audits. Imports and forbidden host surfaces are read from source, because
// that is what they are about. Everything the popover draws — hierarchy, accessible
// names, colours, density — is asserted against the real element tree, rendered
// through injected primitives (see fake-render.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildDetailModel, type DetailModel } from "./detail-model.ts";
import { FAKE_COLOR_VALUES, descendants, footerOf, renderDetail, type FakeNode } from "./fake-render.ts";
import { at } from "./fixtures.ts";
import { derivePulseMetrics } from "./metrics.ts";
import { initialPulseState, type PulseModelState } from "./model.ts";
import { buildPulseDot } from "./pulse-dot.ts";

const UI_FILES = ["client/pulse-icon.tsx", "client/pulse-detail.tsx"];
/** The icon renders nothing, so theme and density rules apply to the popover only. */
const DRAWING_UI_FILES = ["client/pulse-detail.tsx"];
const HOOK = "client/use-pulse-view.ts";
const ENTRY = "index.client.tsx";
const ALLOWED_IMPORTS = [
  "react",
  "react-native",
  "@getpaseo/plugin",
  "@getpaseo/plugin/client",
  "@getpaseo/plugin/client/react-native",
];

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url).pathname, "utf8");
}

function imports(source: string): string[] {
  return [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1] as string);
}

/** A popover with metric rows and more than one bar: enough to audit what is drawn. */
function shownModel(): DetailModel {
  const state: PulseModelState = {
    ...initialPulseState,
    historyLoaded: true,
    usage: {
      inputTokens: 1_200,
      outputTokens: 800,
      contextWindowUsedTokens: 2_000,
      contextWindowMaxTokens: 128_000,
    },
    blocks: [
      { key: "b1", kind: "text", startedAt: at(0), endedAt: at(1), pending: false },
      { key: "b2", kind: "error", startedAt: at(1), endedAt: at(2), pending: false },
    ],
  };
  return buildDetailModel(state, derivePulseMetrics(state, Date.parse(at(30))));
}

/** Hierarchy and accessible names, without any measurement. */
function shape(node: FakeNode): unknown {
  return [node.type, node.props.accessibilityLabel ?? null, node.children.map(shape)];
}

test("components import only host-provided modules or local files", () => {
  for (const file of [...UI_FILES, ENTRY]) {
    for (const specifier of imports(read(file))) {
      const local = specifier.startsWith("./") || specifier.startsWith("../");
      assert.ok(local || ALLOWED_IMPORTS.includes(specifier), `${file} imports ${specifier}`);
    }
  }
});

test("components never reach for private, DOM or icon-library modules", () => {
  const forbidden = [
    "@getpaseo/plugin/client/host",
    "lucide-react-native",
    "react-native-svg",
    "react-dom",
  ];
  for (const file of [...UI_FILES, ENTRY]) {
    const source = read(file);
    for (const module of forbidden) assert.equal(source.includes(module), false, `${file}:${module}`);
  }
});

test("the icon slot draws one themed dot that beats while the agent works", () => {
  const source = read("client/pulse-icon.tsx");
  assert.match(source, /from "react-native"/, "the slot now draws");
  assert.match(source, /borderRadius: diameter \/ 2/, "a circle, not a bar");
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(source), false, "no hardcoded colour");

  const idle: PulseModelState = { ...initialPulseState, historyLoaded: true };
  const working: PulseModelState = {
    ...idle,
    busy: true,
    blocks: [{ key: "t", kind: "tool", startedAt: at(0), pending: true }],
  };
  const calm = buildPulseDot(idle, 0);
  assert.equal(calm.busy, false);
  assert.equal(calm.token, "border", "nothing has happened yet: a neutral mark");
  assert.ok(calm.opacity < 1, "idle is calm");

  const beats = [0, 1].map((phase) => buildPulseDot(working, phase));
  assert.deepEqual(beats.map((dot) => dot.token), ["statusWarning", "statusWarning"]);
  assert.deepEqual(beats.map((dot) => dot.opacity), [1, 1]);
  const scales = beats.map((dot) => dot.scale);
  assert.deepEqual(scales, [...scales].sort((a, b) => a - b), "the dot grows through the phases");
  assert.ok((scales.at(-1) as number) - (scales[0] as number) >= 0.3, "and visibly so");
  assert.ok(scales.every((scale) => scale > calm.scale), "busy is always bigger than calm");

  const failed = buildPulseDot({ ...idle, status: "error" }, 0);
  assert.equal(failed.token, "statusDanger", "an error always shows red");
});

test("components use React Native primitives and no DOM surface", () => {
  const domTokens = [
    "document.",
    "window.",
    "localStorage",
    "navigator.",
    "className",
    "onClick",
    "<div",
    "<span",
    "<button",
  ];
  for (const file of UI_FILES) {
    const source = read(file);
    for (const token of domTokens) assert.equal(source.includes(token), false, `${file}:${token}`);
  }
  for (const file of DRAWING_UI_FILES) assert.match(read(file), /from "react-native"/, file);
});

test("every colour drawn comes from theme.colors", () => {
  const colourKeys = ["color", "backgroundColor", "borderColor"];
  let painted = 0;
  for (const node of descendants(renderDetail(shownModel()))) {
    for (const key of colourKeys) {
      const value = node.style[key];
      if (value === undefined) continue;
      painted += 1;
      assert.ok(
        FAKE_COLOR_VALUES.includes(value as string),
        `${node.type}.${key} draws ${String(value)}, which is not a theme colour`,
      );
    }
  }
  assert.ok(painted > 0, "the popover paints something");
});

test("the popover renders a body only: the host owns scrolling", () => {
  const source = read("client/pulse-detail.tsx");
  assert.equal(source.includes("ScrollView"), false, "no nested scroller inside a host sheet");
  assert.equal(source.includes("FlatList"), false);
});

test("the store is leased for the mounted lifetime and released on unmount", () => {
  const source = read(HOOK);
  assert.match(source, /usePaseo\(\)/, "the handle comes from the public client API");
  assert.match(source, /leasePulseStore\(/);
  assert.match(source, /lease\.release\(\)/);
  assert.equal(
    /\[agentId, paseo\]/.test(source),
    false,
    "the per-render api facade must not key the lease effect",
  );
  assert.match(source, /useEffect\(/, "the lease follows React's mounted lifetime");
});

test("no bootstrap failure is swallowed", () => {
  const registry = read("client/registry.ts");
  assert.equal(registry.includes(".catch(() => undefined)"), false, "no silent catch");
  assert.match(registry, /onBootstrapError\?\.\(/, "terminal failures are reported");
  const reportAt = registry.indexOf("options.onBootstrapError?.(");
  const teardownAt = registry.lastIndexOf("teardown();", reportAt);
  assert.ok(reportAt > 0 && teardownAt > 0 && teardownAt < reportAt, "cleanup precedes the report");
  const entry = read(ENTRY);
  assert.match(entry, /onBootstrapError/, "the entry wires the failure channel");
});

test("the registry never opens a timeline or a store by itself", () => {
  const source = read("client/registry.ts");
  for (const forbidden of ["createPulseStore", "timeline", "acquirePulseStore", "agents.ref"]) {
    assert.equal(source.includes(forbidden), false, `registry references ${forbidden}`);
  }
  assert.match(source, /subscriptionId/, "the directory subscription is paired with the listing");
});

test("the compact layout changes measurements, never the hierarchy", () => {
  const model = shownModel();
  const compact = renderDetail(model, { compact: true });
  const roomy = renderDetail(model, { compact: false });

  assert.deepEqual(shape(compact), shape(roomy), "density must not add or drop nodes");
  assert.notDeepEqual(compact.style, roomy.style, "the body reacts to layout.compact");
  assert.equal(compact.style.gap, 10);
  assert.equal(roomy.style.gap, 14);
  assert.equal((compact.children[0] as FakeNode).style.fontSize, 15);
  assert.equal((roomy.children[0] as FakeNode).style.fontSize, 17);
});

test("every metric row carries its accessible name and draws glyph and value", () => {
  const model = shownModel();
  const rows = (renderDetail(model).children[2] as FakeNode).children;
  assert.ok(model.rows.length > 0, "the fixture has metrics");
  assert.deepEqual(
    rows.map((row) => [row.props.accessibilityLabel, row.children.map((child) => child.text)]),
    model.rows.map((row) => [`${row.label} ${row.value}`, [row.glyph, row.value]]),
  );
});

test("the footer names the pulse and every bar names its kind", () => {
  const model = shownModel();
  const footer = footerOf(renderDetail(model));
  assert.equal(footer.props.accessibilityLabel, model.footer.accessibilityLabel);
  const bars = footer.children.filter((node) => node.children.length === 1);
  assert.equal(bars.length, model.footer.segments.length);
  assert.deepEqual(
    bars.map((wrapper) => (wrapper.children[0] as FakeNode).props.accessibilityLabel),
    model.footer.segments.map((segment) => segment.kind),
  );
  for (const separator of footer.children.filter((node) => node.children.length === 0)) {
    assert.equal(separator.props.accessibilityLabel, undefined, "a hairline is not announced");
  }
});

test("only the injected primitives are drawn", () => {
  for (const node of descendants(renderDetail(shownModel()))) {
    assert.ok(["View", "Text"].includes(node.type), `${node.type} is not a host primitive`);
  }
});

test("the entry wires the real icon and popover content into the registry", () => {
  const source = read(ENTRY);
  assert.match(source, /PulseIcon/);
  assert.match(source, /PulseDetail/);
  assert.match(source, /createPulselinePills\(/);
  assert.equal(source.includes("addWorkspacePanel"), false, "no agent panel in this variant");
  assert.equal(source.includes("Modal"), false, "the popover is the only detail surface");
});

test("no server entry and no plugin RPC exist in this plugin", () => {
  const manifest = read("paseo-plugin.json");
  assert.equal(manifest.includes("server"), false);
  assert.throws(() => read("index.server.ts"));
});
