// Active-tail cadence: the original TUI advances the pulse every 450 ms while the
// session is busy and stops when it is not
// (.config/opencode/plugins/chat-pulse-line/tui.js:1026).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeAgent, createManualClock } from "./fake-agent.ts";
import { at, conversation } from "./fixtures.ts";
import { PULSE_TICK_MS, createPulseStore } from "./store.ts";

const START = Date.parse(at(20));

function mounted() {
  const agent = createFakeAgent("agent-1", {
    history: [{ epoch: "e", entries: conversation("claude") }],
  });
  const clock = createManualClock(START);
  const store = createPulseStore({
    agentId: "agent-1",
    handle: agent.handle,
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  return { agent, clock, store };
}

test("the pulse ticks every 450 ms", () => {
  assert.equal(PULSE_TICK_MS, 450);
});

test("the phase advances while busy and resets when the turn ends", async () => {
  const { agent, clock, store } = mounted();
  await agent.settleHistory();
  assert.equal(store.getView().phase, 0, "an idle store has no phase");
  assert.equal(clock.pending(), 0, "and no timer");

  agent.emitSnapshot({
    id: "agent-1",
    status: "running",
    activeTurn: { turnId: "t", startedAt: at(20) },
  });
  assert.equal(clock.pending(), 1);

  clock.advance(450);
  assert.equal(store.getView().phase, 1);
  clock.advance(450);
  assert.equal(store.getView().phase, 0, "two phases, then round again");
  clock.advance(450);
  assert.equal(store.getView().phase, 1);

  agent.emitSnapshot({ id: "agent-1", status: "idle", activeTurn: null });
  assert.equal(store.getView().phase, 0, "idle resets the pulse instead of freezing it");
  assert.equal(clock.pending(), 0, "and releases the timer");
  store.stop();
});

test("stopping a busy store clears its pulse timer", async () => {
  const { agent, clock, store } = mounted();
  await agent.settleHistory();
  agent.emitSnapshot({
    id: "agent-1",
    status: "running",
    activeTurn: { turnId: "t", startedAt: at(20) },
  });
  clock.advance(450);
  assert.equal(clock.pending(), 1);

  store.stop();

  assert.equal(clock.pending(), 0, "no timer survives unmount");
  const before = store.getView().phase;
  clock.advance(4_500);
  assert.equal(store.getView().phase, before, "a stopped store never advances again");
});

test("the label advances with the phase while busy", async () => {
  const { agent, clock, store } = mounted();
  await agent.settleHistory();
  agent.emitSnapshot({
    id: "agent-1",
    status: "running",
    activeTurn: { turnId: "t", startedAt: at(20) },
  });
  const first = store.getView().label;
  clock.advance(450);
  const second = store.getView().label;
  assert.equal(first.length, second.length, "the pulse changes height, not width");
  assert.notEqual(first, second, "the active tail moved");
  store.stop();
});
