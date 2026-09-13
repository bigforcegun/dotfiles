import assert from "node:assert/strict";
import { test } from "node:test";
import { PULSELINE_FALLBACK_LABEL, renderPulseLabel } from "./label.ts";
import { derivePulseMetrics } from "./metrics.ts";
import { initialPulseState, reducePulse } from "./model.ts";
import { PROVIDERS, USAGE_FULL, at, conversation } from "./fixtures.ts";

const NOW = Date.parse(at(30));

function view(provider: (typeof PROVIDERS)[number], overrides: Parameters<typeof reducePulse>[1][]) {
  let state = reducePulse(initialPulseState, {
    type: "history",
    epoch: "e",
    entries: conversation(provider),
  });
  for (const input of overrides) state = reducePulse(state, input);
  return { state, metrics: derivePulseMetrics(state, NOW) };
}

test("a loaded conversation renders blocks and unmarked exact tokens", () => {
  for (const provider of PROVIDERS) {
    const { state, metrics } = view(provider, [
      { type: "agent", status: "idle", activeTurn: null, usage: USAGE_FULL },
    ]);
    const label = renderPulseLabel(state, metrics);
    assert.match(label, /^[▁▂▃▄▅▆▇█]+ /, provider);
    assert.match(label, /↑2\.1k/);
    assert.match(label, /◇9k/, "round thousands drop the trailing zero");
    assert.equal(label.includes("~↑"), false, "provider tokens carry no approximation marker");
  }
});

test("both providers render byte-identical labels from the same inputs", () => {
  const labels = PROVIDERS.map((provider) => {
    const { state, metrics } = view(provider, [
      { type: "agent", status: "idle", activeTurn: null, usage: USAGE_FULL },
    ]);
    return renderPulseLabel(state, metrics);
  });
  assert.equal(labels[0], labels[1]);
});

test("approximate values are the only ones marked with a tilde", () => {
  const { state, metrics } = view("claude", [
    { type: "agent", status: "running", activeTurn: { turnId: "t", startedAt: at(20) } },
  ]);
  const label = renderPulseLabel(state, metrics, { maxLength: 120 });
  assert.match(label, /~10s/);
  for (const segment of label.split(" · ")) {
    const approximate = segment.startsWith("~");
    const derived = /s$|⚒/.test(segment);
    if (derived) assert.equal(approximate, true, segment);
  }
});

test("rendering is deterministic", () => {
  const { state, metrics } = view("claude", [
    { type: "agent", status: "idle", activeTurn: null, usage: USAGE_FULL },
  ]);
  assert.equal(renderPulseLabel(state, metrics), renderPulseLabel(state, metrics));
});

test("usage without blocks falls back to tokens", () => {
  const state = reducePulse(initialPulseState, {
    type: "agent",
    status: "idle",
    activeTurn: null,
    usage: USAGE_FULL,
  });
  const label = renderPulseLabel(state, derivePulseMetrics(state, NOW));
  assert.equal(/[▁▂▃▄▅▆▇█]/.test(label), false);
  assert.match(label, /↓18k/);
});

test("an active turn without blocks falls back to a busy marker", () => {
  const state = reducePulse(initialPulseState, {
    type: "agent",
    status: "running",
    activeTurn: { turnId: "t", startedAt: at(28) },
  });
  const label = renderPulseLabel(state, derivePulseMetrics(state, NOW));
  assert.match(label, /^▶/);
  assert.match(label, /~2s/);
});

test("an empty idle model falls back to the plugin name", () => {
  const label = renderPulseLabel(initialPulseState, derivePulseMetrics(initialPulseState, NOW));
  assert.equal(label, PULSELINE_FALLBACK_LABEL);
});

test("a narrow label degrades from the tail and keeps the pulse", () => {
  const { state, metrics } = view("claude", [
    { type: "agent", status: "idle", activeTurn: null, usage: USAGE_FULL },
  ]);
  const wide = renderPulseLabel(state, metrics, { maxLength: 200 });
  const narrow = renderPulseLabel(state, metrics, { maxLength: 18 });
  assert.ok(narrow.length <= 18);
  assert.ok(wide.length > narrow.length);
  assert.match(narrow, /^[▁▂▃▄▅▆▇█]+/);
});
