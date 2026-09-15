// Source-level audit. The components cannot run under `node --test` (React Native
// has no node renderer), so their platform contract is asserted as text.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PULSE_THEME_TOKENS } from "./pulse-strip.ts";

const UI_FILES = ["client/pulse-icon.tsx", "client/pulse-detail.tsx"];
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
    assert.match(source, /from "react-native"/, file);
  }
});

test("no colour is hardcoded: every colour comes from theme.colors", () => {
  for (const file of UI_FILES) {
    const source = read(file);
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(source), false, `${file} has a hex colour`);
    assert.equal(/\brgba?\(/.test(source), false, `${file} has an rgb colour`);
    const used = [...source.matchAll(/theme\.colors\.([A-Za-z0-9]+)/g)].map(
      (match) => match[1] as string,
    );
    assert.ok(used.length > 0, `${file} reads no theme colour`);
    for (const token of used) {
      assert.ok(
        [...PULSE_THEME_TOKENS, "surface0", "surface1", "surface2", "accentForeground"].includes(
          token as never,
        ),
        `${file} uses theme.colors.${token}`,
      );
    }
  }
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
  assert.match(registry, /teardown\(\);\n\s*options\.onBootstrapError/, "cleanup precedes the report");
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

test("components respond to layout.compact", () => {
  for (const file of UI_FILES) assert.match(read(file), /layout\.compact/, file);
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
