import assert from "node:assert/strict";
import { test } from "node:test";
import { BLOCK_COLOR_TOKENS, PULSE_THEME_TOKENS, buildPulseStrip } from "./pulse-strip.ts";
import { initialPulseState, reducePulse } from "./model.ts";
import { PROVIDERS, conversation, entry, toolCall } from "./fixtures.ts";

function loaded(provider: (typeof PROVIDERS)[number]) {
  return reducePulse(initialPulseState, {
    type: "history",
    epoch: "e",
    entries: conversation(provider),
  });
}

test("every block kind maps to a theme token, never to a literal color", () => {
  const kinds = ["text", "reasoning", "read", "write", "tool", "error", "success", "other"];
  assert.deepEqual(Object.keys(BLOCK_COLOR_TOKENS).sort(), [...kinds].sort());
  for (const token of Object.values(BLOCK_COLOR_TOKENS)) {
    assert.ok(PULSE_THEME_TOKENS.includes(token), token);
    assert.equal(/^#|rgb/.test(token), false, token);
  }
});

test("the strip mirrors the model for every provider", () => {
  const strips = PROVIDERS.map((provider) =>
    buildPulseStrip(loaded(provider), { compact: false }).map((bar) => `${bar.kind}:${bar.token}`),
  );
  assert.deepEqual(strips[0], strips[1]);
  assert.deepEqual(strips[0]?.slice(0, 4), [
    "reasoning:accent",
    "text:foreground",
    "read:statusSuccess",
    "write:statusWarning",
  ]);
});

test("bar height follows block weight and stays inside its bounds", () => {
  const state = reducePulse(
    reducePulse(initialPulseState, { type: "history", epoch: "e", entries: [] }),
    { type: "live", entry: entry(1, 0, { type: "assistant_message", text: "ok" }) },
  );
  const heavy = reducePulse(state, {
    type: "live",
    entry: entry(2, 1, { type: "assistant_message", text: "x".repeat(4000) }),
  });
  const bars = buildPulseStrip(heavy, { compact: false });
  assert.equal(bars.length, 2);
  for (const bar of bars) {
    assert.ok(bar.heightRatio >= 0.15 && bar.heightRatio <= 1, String(bar.heightRatio));
  }
  assert.ok((bars[1]?.heightRatio ?? 0) > (bars[0]?.heightRatio ?? 1));
});

test("compact layouts show fewer bars than roomy ones", () => {
  let state = reducePulse(initialPulseState, { type: "history", epoch: "e", entries: [] });
  for (let index = 0; index < 40; index += 1) {
    state = reducePulse(state, {
      type: "live",
      entry: entry(index + 1, index, { type: "assistant_message", text: `chunk ${index}` }),
    });
  }
  const roomy = buildPulseStrip(state, { compact: false });
  const compact = buildPulseStrip(state, { compact: true });
  assert.ok(compact.length < roomy.length);
  assert.ok(roomy.length <= 32);
});

test("a running tool stays flagged as pending", () => {
  const state = reducePulse(
    reducePulse(initialPulseState, { type: "history", epoch: "e", entries: [] }),
    { type: "live", entry: entry(1, 0, toolCall("call-1", "read", "running")) },
  );
  assert.equal(buildPulseStrip(state, { compact: false })[0]?.pending, true);
});

test("an empty model yields an empty strip rather than a placeholder bar", () => {
  assert.deepEqual(buildPulseStrip(initialPulseState, { compact: false }), []);
});
