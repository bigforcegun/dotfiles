import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_PULSE_BLOCKS, initialPulseState, reducePulse } from "./model.ts";
import { PROVIDERS, at, conversation, entry, toolCall } from "./fixtures.ts";

function bootstrap(provider: (typeof PROVIDERS)[number], gap = false) {
  return reducePulse(initialPulseState, {
    type: "history",
    epoch: "epoch-1",
    entries: conversation(provider),
    gap,
  });
}

test("history bootstrap produces the same blocks for every provider", () => {
  const shapes = PROVIDERS.map((provider) =>
    bootstrap(provider).blocks.map((block) => `${block.kind}:${block.key}`),
  );
  assert.deepEqual(shapes[0], shapes[1]);
  const state = bootstrap("claude");
  assert.equal(state.historyLoaded, true);
  assert.equal(state.epoch, "epoch-1");
  assert.equal(state.lastSeq, 11);
  // The read tool's running and completed rows collapse into one block.
  assert.equal(state.blocks.filter((block) => block.key === "tool:call-read").length, 1);
});

test("empty history still marks the model loaded and draws nothing", () => {
  const state = reducePulse(initialPulseState, { type: "history", epoch: "e", entries: [] });
  assert.equal(state.historyLoaded, true);
  assert.equal(state.blocks.length, 0);
  assert.equal(state.gap, false);
});

test("a second history page merges without reordering or duplicating", () => {
  const all = conversation("claude");
  const first = reducePulse(initialPulseState, {
    type: "history",
    epoch: "e",
    entries: all.slice(0, 5),
  });
  const second = reducePulse(first, { type: "history", epoch: "e", entries: all.slice(5) });
  const seen = new Set(second.blocks.map((block) => block.key));
  assert.equal(seen.size, second.blocks.length);
  assert.equal(second.lastSeq, 11);
  assert.deepEqual(
    second.blocks.map((block) => block.kind),
    bootstrap("claude").blocks.map((block) => block.kind),
  );
});

test("a gapped page marks the model incomplete", () => {
  assert.equal(bootstrap("claude", true).gap, true);
  assert.equal(bootstrap("claude", false).gap, false);
});

test("live entries append and stale sequences are ignored", () => {
  let state = bootstrap("claude");
  state = reducePulse(state, {
    type: "live",
    entry: entry(12, 14, { type: "assistant_message", text: "one more thing" }),
  });
  assert.equal(state.lastSeq, 12);
  const count = state.blocks.length;
  state = reducePulse(state, {
    type: "live",
    entry: entry(11, 12, { type: "assistant_message", text: "replayed" }),
  });
  assert.equal(state.blocks.length, count);
});

test("a running tool that terminates updates in place", () => {
  let state = reducePulse(initialPulseState, { type: "history", epoch: "e", entries: [] });
  state = reducePulse(state, {
    type: "live",
    entry: entry(1, 0, toolCall("call-1", "read", "running")),
  });
  assert.equal(state.blocks.length, 1);
  assert.equal(state.blocks[0]?.pending, true);
  state = reducePulse(state, {
    type: "live",
    entry: entry(2, 4, toolCall("call-1", "read", "failed")),
  });
  assert.equal(state.blocks.length, 1);
  assert.equal(state.blocks[0]?.kind, "error");
  assert.equal(state.blocks[0]?.pending, false);
  assert.deepEqual(state.toolDurationsMs, [4000]);
});

test("turn lifecycle adds outcome blocks and timings", () => {
  let state = reducePulse(initialPulseState, { type: "history", epoch: "e", entries: [] });
  state = reducePulse(state, { type: "turn", phase: "started", turnId: "t1", at: at(0) });
  assert.equal(state.activeTurn?.turnId, "t1");
  state = reducePulse(state, { type: "turn", phase: "completed", turnId: "t1", at: at(12) });
  assert.equal(state.activeTurn, null);
  assert.equal(state.blocks.at(-1)?.kind, "success");
  assert.equal(state.lastTurnMs, 12_000);

  state = reducePulse(state, { type: "turn", phase: "started", turnId: "t2", at: at(20) });
  state = reducePulse(state, { type: "turn", phase: "failed", turnId: "t2", at: at(25) });
  assert.equal(state.blocks.at(-1)?.kind, "error");
});

test("turn_completed usage lands on the model", () => {
  const state = reducePulse(initialPulseState, {
    type: "turn",
    phase: "completed",
    turnId: "t1",
    at: at(3),
    usage: { outputTokens: 42 },
  });
  assert.equal(state.usage?.outputTokens, 42);
});

test("epoch replacement clears derived state and asks for a refetch", () => {
  const state = reducePulse(bootstrap("claude"), { type: "replacement", epoch: "epoch-2" });
  assert.equal(state.blocks.length, 0);
  assert.equal(state.epoch, "epoch-2");
  assert.equal(state.historyLoaded, false);
  assert.equal(state.needsRefetch, true);
  assert.equal(state.lastSeq, null);
});

test("agent snapshots carry status, active turn and usage", () => {
  const state = reducePulse(initialPulseState, {
    type: "agent",
    status: "running",
    activeTurn: { turnId: "t9", startedAt: at(2) },
    usage: { outputTokens: 7 },
  });
  assert.equal(state.busy, true);
  assert.equal(state.activeTurn?.turnId, "t9");
  assert.equal(state.usage?.outputTokens, 7);
  const idle = reducePulse(state, { type: "agent", status: "idle", activeTurn: null });
  assert.equal(idle.busy, false);
  assert.equal(idle.usage?.outputTokens, 7, "a snapshot without usage keeps the last one");
});

test("blocks are capped and truncation is recorded", () => {
  let state = reducePulse(initialPulseState, { type: "history", epoch: "e", entries: [] });
  for (let index = 0; index < MAX_PULSE_BLOCKS + 5; index += 1) {
    state = reducePulse(state, {
      type: "live",
      entry: entry(index + 1, index, { type: "assistant_message", text: `chunk ${index}` }),
    });
  }
  assert.equal(state.blocks.length, MAX_PULSE_BLOCKS);
  assert.equal(state.truncated, true);
});

test("reduce never mutates the previous state", () => {
  const before = bootstrap("claude");
  const snapshot = JSON.stringify(before);
  reducePulse(before, { type: "live", entry: entry(99, 30, { type: "reasoning", text: "hm" }) });
  assert.equal(JSON.stringify(before), snapshot);
});
