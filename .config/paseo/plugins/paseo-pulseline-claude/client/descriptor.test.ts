import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PULSELINE_PILL_TITLE,
  PULSELINE_VARIANT_TAG,
  buildPillLabel,
  pulselineButton,
} from "./descriptor.ts";
import { derivePulseMetrics } from "./metrics.ts";
import { initialPulseState, reducePulse } from "./model.ts";
import { USAGE_FULL, at, conversation } from "./fixtures.ts";

const NOW = Date.parse(at(30));
const ui = { Icon: () => null, Content: () => null };

function view(inputs: Parameters<typeof reducePulse>[1][] = []) {
  let state = reducePulse(initialPulseState, {
    type: "history",
    epoch: "e",
    entries: conversation("claude"),
  });
  for (const input of inputs) state = reducePulse(state, input);
  return { state, metrics: derivePulseMetrics(state, NOW) };
}

test("the descriptor carries a unique accessible title and a variant-tagged label", () => {
  const button = pulselineButton(ui, { label: buildPillLabel(view().state, view().metrics) });
  assert.equal(button.title, PULSELINE_PILL_TITLE);
  assert.equal(PULSELINE_PILL_TITLE, "Pulseline · Claude");
  assert.ok(button.label?.startsWith(`${PULSELINE_VARIANT_TAG} `), button.label);
  assert.notEqual(button.label, button.title, "the label is the live state, not the plugin name");
});

test("the icon is the injected component, not a Lucide name", () => {
  const button = pulselineButton(ui, { label: "x" });
  assert.equal(button.icon, ui.Icon);
  assert.equal(typeof button.icon, "function");
});

test("the behavior is a popover carrying the injected Content", () => {
  const button = pulselineButton(ui, { label: "x" });
  assert.equal(button.behavior.kind, "popover");
  assert.equal(button.behavior.kind === "popover" && button.behavior.Content, ui.Content);
});

test("two descriptors share one behavior instance so label updates never replace it", () => {
  const first = pulselineButton(ui, { label: "a" });
  const second = pulselineButton(ui, { label: "b" });
  assert.equal(first.behavior, second.behavior);
  assert.equal(first.icon, second.icon);
});

test("the label carries the variant tag, the pulse and exact tokens", () => {
  const { state, metrics } = view([
    { type: "agent", status: "idle", activeTurn: null, usage: USAGE_FULL },
  ]);
  const label = buildPillLabel(state, metrics);
  assert.match(label, /^plc [▁▂▃▄▅▆▇█]/);
  assert.match(label, /↑2\.1k/);
  assert.equal(label.includes("~↑"), false);
});

test("the label degrades within the pill budget and keeps tag plus pulse", () => {
  const { state, metrics } = view([
    { type: "agent", status: "idle", activeTurn: null, usage: USAGE_FULL },
  ]);
  const narrow = buildPillLabel(state, metrics, { maxLength: 20 });
  assert.ok(narrow.length <= 20, narrow);
  assert.match(narrow, /^plc [▁▂▃▄▅▆▇█]+$/);
});

test("an empty idle model still yields a tagged label", () => {
  const label = buildPillLabel(initialPulseState, derivePulseMetrics(initialPulseState, NOW));
  assert.equal(label, `${PULSELINE_VARIANT_TAG} Pulseline · Claude`);
});

test("a busy model marks the label", () => {
  const { state, metrics } = view([
    { type: "agent", status: "running", activeTurn: { turnId: "t", startedAt: at(20) } },
  ]);
  assert.match(buildPillLabel(state, metrics), /^plc ▶/);
});
