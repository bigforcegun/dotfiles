import assert from "node:assert/strict";
import { test } from "node:test";
import { OMITTED_PULSE_METRICS, derivePulseMetrics } from "./metrics.ts";
import { initialPulseState, reducePulse } from "./model.ts";
import { PROVIDERS, USAGE_FULL, at, conversation, entry, toolCall } from "./fixtures.ts";

const NOW = Date.parse(at(30));

function loaded(provider: (typeof PROVIDERS)[number]) {
  return reducePulse(initialPulseState, {
    type: "history",
    epoch: "e",
    entries: conversation(provider),
  });
}

test("provider-reported usage is exact and unmarked, for every provider", () => {
  for (const provider of PROVIDERS) {
    const state = reducePulse(loaded(provider), {
      type: "agent",
      status: "idle",
      activeTurn: null,
      usage: USAGE_FULL,
    });
    const metrics = derivePulseMetrics(state, NOW);
    assert.deepEqual(metrics.inputTokens, { value: 18_000, approx: false }, provider);
    assert.deepEqual(metrics.outputTokens, { value: 2_100, approx: false }, provider);
    assert.deepEqual(metrics.cachedInputTokens, { value: 9_000, approx: false }, provider);
    assert.deepEqual(metrics.costUsd, { value: 0.42, approx: false }, provider);
    assert.deepEqual(metrics.contextUsedTokens, { value: 124_000, approx: false }, provider);
    assert.deepEqual(metrics.contextMaxTokens, { value: 200_000, approx: false }, provider);
  }
});

test("client-observed metrics are always approximate", () => {
  const state = reducePulse(loaded("claude"), {
    type: "agent",
    status: "running",
    activeTurn: { turnId: "t1", startedAt: at(20) },
  });
  const metrics = derivePulseMetrics(state, NOW);
  assert.equal(metrics.turnSeconds?.approx, true);
  assert.equal(metrics.turnSeconds?.value, 10);
  assert.equal(metrics.toolCount?.approx, true);
  assert.equal(metrics.toolAvgSeconds?.approx, true);
  assert.equal(metrics.textCharsPerSecond?.approx, true);
});

test("the approximation policy holds for every emitted metric", () => {
  const exactKeys = new Set([
    "inputTokens",
    "outputTokens",
    "cachedInputTokens",
    "costUsd",
    "contextUsedTokens",
    "contextMaxTokens",
  ]);
  const state = reducePulse(loaded("opencode"), {
    type: "agent",
    status: "running",
    activeTurn: { turnId: "t1", startedAt: at(20) },
    usage: USAGE_FULL,
  });
  const metrics = derivePulseMetrics(state, NOW);
  for (const [key, metric] of Object.entries(metrics)) {
    if (!metric) continue;
    assert.equal(metric.approx, !exactKeys.has(key), `${key} approximation flag`);
  }
});

test("unavailable metrics are omitted, never zero", () => {
  const metrics = derivePulseMetrics(initialPulseState, NOW);
  for (const key of ["inputTokens", "outputTokens", "costUsd", "turnSeconds", "toolAvgSeconds"]) {
    assert.equal(metrics[key as keyof typeof metrics], undefined, key);
  }
  for (const metric of Object.values(metrics)) {
    assert.notEqual(metric?.value, 0);
  }
});

test("metrics the protocol cannot supply are never emitted", () => {
  const state = reducePulse(loaded("claude"), {
    type: "agent",
    status: "running",
    activeTurn: { turnId: "t1", startedAt: at(20) },
    usage: USAGE_FULL,
  });
  const metrics = derivePulseMetrics(state, NOW) as Record<string, unknown>;
  assert.deepEqual(
    [...OMITTED_PULSE_METRICS].sort(),
    ["cacheWriteTokens", "providerTokensPerSecond", "reasoningTokens", "streamTokensPerSecond"],
  );
  for (const key of OMITTED_PULSE_METRICS) {
    assert.equal(key in metrics, false, key);
  }
});

test("a partial usage payload omits the fields the provider withheld", () => {
  const state = reducePulse(initialPulseState, {
    type: "agent",
    status: "idle",
    activeTurn: null,
    usage: { outputTokens: 12 },
  });
  const metrics = derivePulseMetrics(state, NOW);
  assert.deepEqual(metrics.outputTokens, { value: 12, approx: false });
  assert.equal(metrics.inputTokens, undefined);
  assert.equal(metrics.costUsd, undefined);
  assert.equal(metrics.contextUsedTokens, undefined);
});

test("a tool whose start was never observed contributes no duration", () => {
  let state = reducePulse(initialPulseState, { type: "history", epoch: "e", entries: [] });
  state = reducePulse(state, {
    type: "live",
    entry: entry(1, 5, toolCall("call-x", "read", "completed")),
  });
  assert.deepEqual(state.toolDurationsMs, []);
  const metrics = derivePulseMetrics(state, NOW);
  assert.equal(metrics.toolAvgSeconds, undefined);
  assert.equal(metrics.toolCount?.value, 1);
});

test("a completed turn reports its observed duration, still approximate", () => {
  let state = reducePulse(initialPulseState, { type: "turn", phase: "started", at: at(0) });
  state = reducePulse(state, { type: "turn", phase: "completed", at: at(9) });
  const metrics = derivePulseMetrics(state, NOW);
  assert.deepEqual(metrics.turnSeconds, { value: 9, approx: true });
});
