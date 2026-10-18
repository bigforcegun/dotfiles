// Production failure: the pill mounted, the popover opened, and the model stayed
// empty forever. `ConnectionSubscriptions.observeTimeline().ready` never settles
// when the session is not connected — the adapter returns null and syncTimelines
// bails without resolving (packages/client/src/{daemon-client.ts:1082,
// connection/index.ts:92-98}) — so gating history on it hangs the plugin.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDetailModel } from "./detail-model.ts";
import { createFakeAgent, createManualClock, type FakeAgentState } from "./fake-agent.ts";
import { at, conversation } from "./fixtures.ts";
import { derivePulseMetrics } from "./metrics.ts";
import { initialPulseState } from "./model.ts";
import { createPulseStore } from "./store.ts";

const START = Date.parse(at(20));

function storeFor(state: FakeAgentState) {
  const agent = createFakeAgent("agent-1", state);
  const clock = createManualClock(START);
  const store = createPulseStore({
    agentId: "agent-1",
    handle: agent.handle,
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  return { agent, store };
}

test("history loads even when subscription readiness never settles", async () => {
  const { agent, store } = storeFor({
    neverReady: true,
    history: [{ epoch: "e", entries: conversation("claude") }],
  });
  await agent.settleHistory();

  const state = store.getView().state;
  assert.equal(agent.refetchCalls(), 1, "a hung readiness promise must not gate the fetch");
  assert.equal(state.historyLoaded, true);
  assert.ok(state.blocks.length > 0, "the conversation is drawn");
});

test("when readiness lands later the store refreshes once to close the window", async () => {
  const { agent, store } = storeFor({
    deferReady: true,
    history: [
      { epoch: "e", entries: conversation("claude").slice(0, 3) },
      { epoch: "e", entries: conversation("claude") },
    ],
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(agent.refetchCalls(), 1, "the first page does not wait");

  await agent.settleReady();
  assert.equal(agent.refetchCalls(), 2, "acknowledged demand triggers exactly one refresh");
  assert.ok(store.getView().state.blocks.length > 0);
  store.stop();
});

test("a model that has not loaded yet reads as loading, not as an empty chat", () => {
  const model = buildDetailModel(initialPulseState, derivePulseMetrics(initialPulseState, START));
  assert.equal(model.empty, false, "an unloaded model is not an empty conversation");
  assert.match(model.status, /loading/i);
});

test("a history that failed every bounded attempt says so instead of drawing nothing", async () => {
  const { agent, store } = storeFor({ failEveryRefetch: true });
  await agent.settleHistory();

  const view = store.getView();
  assert.equal(view.state.historyLoaded, true);
  assert.equal(view.state.historyFailed, true);
  const model = buildDetailModel(view.state, view.metrics);
  assert.equal(model.empty, false);
  assert.match(model.status, /unavailable/i);
  store.stop();
});

test("an empty conversation still reads as empty once history really loaded", async () => {
  const { agent, store } = storeFor({ history: [{ epoch: "e", entries: [] }] });
  await agent.settleHistory();
  const view = store.getView();
  const model = buildDetailModel(view.state, view.metrics);
  assert.equal(view.state.historyLoaded, true);
  assert.equal(view.state.historyFailed, false);
  assert.equal(model.empty, true);
  assert.match(model.status, /No activity/i);
  store.stop();
});

test("a daemon that never answers is bounded by a deadline, not by hope", async () => {
  const agent = createFakeAgent("agent-1", { hangRefetch: true });
  const clock = createManualClock(START);
  const store = createPulseStore({
    agentId: "agent-1",
    handle: agent.handle,
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
    requestTimeoutMs: 20_000,
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    clock.advance(20_000);
    await new Promise((resolve) => setImmediate(resolve));
  }

  const view = store.getView();
  assert.equal(view.state.historyLoaded, true, "the pill stops claiming it is still loading");
  assert.equal(view.state.historyFailed, true);
  assert.equal(clock.pending(), 0, "every deadline timer was cleared");
  assert.match(buildDetailModel(view.state, view.metrics).status, /unavailable/i);
  store.stop();
});
