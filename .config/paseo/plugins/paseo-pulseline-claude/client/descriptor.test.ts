import assert from "node:assert/strict";
import { test } from "node:test";
import { PULSELINE_PILL_TITLE, buildPillLabel, pulselineButton } from "./descriptor.ts";
import { PULSE_IDLE_LABEL } from "./label.ts";
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

test("the descriptor keeps the title accessible and the label pulse-only", () => {
  const button = pulselineButton(ui, { label: buildPillLabel(view().state, view().metrics) });
  assert.equal(button.title, PULSELINE_PILL_TITLE);
  assert.equal(PULSELINE_PILL_TITLE, "Pulseline · Claude");
  assert.match(button.label ?? "", /^[⣀⣤⣶⣿]+$/, button.label);
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

test("the label never carries metrics or provider text", () => {
  const { state, metrics } = view([
    { type: "agent", status: "idle", activeTurn: null, usage: USAGE_FULL },
  ]);
  const label = buildPillLabel(state, metrics);
  assert.match(label, /^[⣀⣤⣶⣿]+$/);
  assert.equal(/plc|Pulseline|↑|↓|◇|~/.test(label), false, label);
});

test("the label degrades to the newest glyphs when narrowed", () => {
  const { state, metrics } = view([
    { type: "agent", status: "idle", activeTurn: null, usage: USAGE_FULL },
  ]);
  const narrow = buildPillLabel(state, metrics, { width: 8 });
  assert.equal(narrow.length, 8);
  assert.match(narrow, /^[⣀⣤⣶⣿]+$/);
  assert.equal(narrow, buildPillLabel(state, metrics, { width: 40 }).slice(-8));
});

test("an empty idle model yields the neutral mark", () => {
  const label = buildPillLabel(initialPulseState, derivePulseMetrics(initialPulseState, NOW));
  assert.equal(label, "⣀");
});

test("a busy model pulses its tail instead of prefixing text", () => {
  const { state, metrics } = view([
    { type: "agent", status: "running", activeTurn: { turnId: "t", startedAt: at(20) } },
  ]);
  const even = buildPillLabel(state, metrics, { phase: 0 });
  const odd = buildPillLabel(state, metrics, { phase: 1 });
  assert.match(even, /^[⣀⣤⣶⣿]+$/);
  assert.equal(even.length, odd.length);
  assert.notEqual(even.at(-1), odd.at(-1));
  assert.equal(even.slice(0, -1), odd.slice(0, -1), "only the tail moves");
});

test("the optional component label rides along without disturbing the string one", () => {
  const Label = () => null;
  const plain = pulselineButton(ui, { label: "⣀" });
  assert.equal("Label" in plain, false, "a host-only string pill stays exactly as before");

  const labelled = { ...ui, Label };
  const withLabel = pulselineButton(labelled, { label: "⣀" });
  assert.equal(withLabel.Label, Label, "a host that renders a component label gets one");
  assert.equal(withLabel.label, "⣀", "and the string stays as the fallback");
  assert.equal(
    withLabel.behavior,
    pulselineButton(labelled, { label: "⣤" }).behavior,
    "the behavior instance is still shared per ui object",
  );
});
