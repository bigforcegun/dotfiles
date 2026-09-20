import assert from "node:assert/strict";
import { test } from "node:test";
import { PULSE_IDLE_LABEL, PULSE_LABEL_WIDTH, renderPulseLabel } from "./label.ts";
import { initialPulseState, reducePulse } from "./model.ts";
import { buildPulseSegments } from "./pulse-segments.ts";
import { PROVIDERS, at, conversation } from "./fixtures.ts";

function loaded(provider: (typeof PROVIDERS)[number] = "claude") {
  return reducePulse(initialPulseState, {
    type: "history",
    epoch: "e",
    entries: conversation(provider),
  });
}

test("the label is the pulse and nothing else", () => {
  const label = renderPulseLabel(loaded());
  assert.match(label, /^[⣀⣤⣶⣿]+$/);
  assert.equal(label.length, buildPulseSegments(loaded(), { width: PULSE_LABEL_WIDTH, phase: 0 }).length);
});

test("both providers render the same label from the same fixture", () => {
  assert.equal(renderPulseLabel(loaded("claude")), renderPulseLabel(loaded("opencode")));
});

test("rendering is deterministic", () => {
  assert.equal(renderPulseLabel(loaded()), renderPulseLabel(loaded()));
});

test("an idle empty model falls back to a neutral mark", () => {
  assert.equal(renderPulseLabel(initialPulseState), "⣀");
  assert.equal(PULSE_IDLE_LABEL, "⣀");
});

test("a busy model with no rows yet shows the busy dot", () => {
  const busy = reducePulse(initialPulseState, {
    type: "agent",
    status: "running",
    activeTurn: { turnId: "t", startedAt: at(20) },
  });
  assert.equal(renderPulseLabel(busy, { width: 4 }), "⣀", "the active placeholder at phase 0");
});

test("narrowing keeps the newest glyphs", () => {
  const wide = renderPulseLabel(loaded(), { width: 40 });
  const narrow = renderPulseLabel(loaded(), { width: 8 });
  assert.equal(narrow, wide.slice(-8));
});
