import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeAgent, createManualClock } from "./fake-agent.ts";
import { createPulseStore } from "./store.ts";
import { PROVIDERS, USAGE_FULL, at, conversation, entry, toolCall } from "./fixtures.ts";

const START = Date.parse(at(20));

function setup(
  provider: (typeof PROVIDERS)[number],
  overrides: Parameters<typeof createFakeAgent>[1] = {},
) {
  const agent = createFakeAgent("agent-1", {
    history: [{ epoch: "epoch-1", entries: conversation(provider) }],
    ...overrides,
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

test("history bootstrap fills the model for every provider", async () => {
  for (const provider of PROVIDERS) {
    const { agent, store } = setup(provider);
    await agent.settleHistory();
    const view = store.getView();
    assert.equal(view.state.historyLoaded, true, provider);
    assert.ok(view.state.blocks.length > 0, provider);
    assert.notEqual(view.label, "");
    store.stop();
  }
});

test("history is requested as a canonical tail page", async () => {
  const { agent, store } = setup("claude");
  await agent.settleHistory();
  assert.deepEqual(agent.lastRefetchOptions(), {
    direction: "tail",
    projection: "canonical",
    limit: 200,
  });
  store.stop();
});

test("live events that arrive before history are buffered and replayed in order", async () => {
  const { agent, store } = setup("claude", {
    history: [{ epoch: "epoch-1", entries: conversation("claude") }],
    deferHistory: true,
  });
  agent.emitTimeline({
    agentId: "agent-1",
    timestamp: at(13),
    seq: 12,
    epoch: "epoch-1",
    event: { type: "timeline", item: { type: "reasoning", text: "late" }, turnId: "turn-1" },
  });
  agent.emitTimeline({
    agentId: "agent-1",
    timestamp: at(14),
    seq: 11,
    epoch: "epoch-1",
    event: { type: "timeline", item: { type: "reasoning", text: "stale" }, turnId: "turn-1" },
  });
  assert.equal(store.getView().state.historyLoaded, false);

  await agent.settleHistory();
  const state = store.getView().state;
  assert.equal(state.historyLoaded, true);
  assert.equal(state.lastSeq, 12, "the buffered newer event applied, the stale one did not");
  assert.equal(state.blocks.at(-1)?.kind, "reasoning");
  store.stop();
});

test("a history page that resolves after stop changes nothing and notifies nobody", async () => {
  const { agent, store } = setup("claude", {
    history: [{ epoch: "epoch-1", entries: conversation("claude") }],
    deferHistory: true,
  });
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });
  store.stop();
  await agent.settleHistory();

  assert.equal(store.getView().state.historyLoaded, false);
  assert.equal(store.getView().state.blocks.length, 0);
  assert.equal(notifications, 0);
});

test("an epoch replacement clears the model and refetches", async () => {
  const { agent, store } = setup("claude", {
    history: [
      { epoch: "epoch-1", entries: conversation("claude") },
      { epoch: "epoch-2", entries: conversation("opencode").slice(0, 3) },
    ],
  });
  await agent.settleHistory();
  assert.equal(agent.refetchCalls(), 1);

  agent.emitTimeline({ agentId: "agent-1", event: { type: "replacement", epoch: "epoch-2" } });
  await agent.settleHistory();

  assert.equal(agent.refetchCalls(), 2);
  const state = store.getView().state;
  assert.equal(state.epoch, "epoch-2");
  assert.equal(state.blocks.length, 2, "only the second page's assistant blocks survive");
  store.stop();
});

test("turn and usage events reach the label without a refetch", async () => {
  const { agent, store } = setup("claude");
  await agent.settleHistory();
  const before = store.getView().label;

  agent.emitTimeline({
    agentId: "agent-1",
    timestamp: at(25),
    event: { type: "turn_completed", turnId: "turn-1", usage: USAGE_FULL },
  });

  const after = store.getView();
  assert.equal(after.metrics.outputTokens?.value, 2_100);
  assert.notEqual(after.label, before);
  assert.equal(agent.refetchCalls(), 1);
  store.stop();
});

test("a running tool that terminates live does not duplicate its block", async () => {
  const { agent, store } = setup("claude", { history: [{ epoch: "e", entries: [] }] });
  await agent.settleHistory();
  for (const [seq, status] of [
    [1, "running"],
    [2, "completed"],
  ] as const) {
    agent.emitTimeline({
      agentId: "agent-1",
      timestamp: entry(seq, seq * 2, toolCall("call-1", "read", status)).timestamp,
      seq,
      event: { type: "timeline", item: toolCall("call-1", "read", status) },
    });
  }
  const blocks = store.getView().state.blocks;
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.pending, false);
  store.stop();
});

test("the busy ticker runs only while the agent is busy and stops with the store", async () => {
  const { agent, clock, store } = setup("claude");
  await agent.settleHistory();
  assert.equal(clock.pending(), 0, "an idle agent needs no ticker");

  agent.emitSnapshot({
    id: "agent-1",
    status: "running",
    activeTurn: { turnId: "t1", startedAt: at(20) },
  });
  assert.equal(clock.pending(), 1);

  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });
  clock.advance(1_000);
  assert.ok(notifications > 0, "the ticker republishes the elapsed turn time");

  agent.emitSnapshot({ id: "agent-1", status: "idle", activeTurn: null });
  assert.equal(clock.pending(), 0);

  agent.emitSnapshot({
    id: "agent-1",
    status: "running",
    activeTurn: { turnId: "t2", startedAt: at(30) },
  });
  assert.equal(clock.pending(), 1);
  store.stop();
  assert.equal(clock.pending(), 0);
});

test("stop closes both subscriptions and ignores later events", async () => {
  const { agent, store } = setup("claude");
  await agent.settleHistory();
  assert.equal(agent.timelineSubscriptions(), 1);
  assert.equal(agent.agentSubscriptions(), 1);
  const label = store.getView().label;

  store.stop();
  assert.equal(agent.timelineSubscriptions(), 0);
  assert.equal(agent.agentSubscriptions(), 0);

  agent.emitTimeline({
    agentId: "agent-1",
    timestamp: at(40),
    seq: 99,
    event: { type: "timeline", item: { type: "assistant_message", text: "ignored" } },
  });
  assert.equal(store.getView().label, label);
  store.stop();
});

test("subscribers are notified on change and released on unsubscribe", async () => {
  const { agent, store } = setup("claude");
  let seen = 0;
  const unsubscribe = store.subscribe(() => {
    seen += 1;
  });
  await agent.settleHistory();
  assert.ok(seen > 0);
  const before = seen;
  unsubscribe();
  agent.emitTimeline({
    agentId: "agent-1",
    timestamp: at(41),
    seq: 50,
    event: { type: "timeline", item: { type: "assistant_message", text: "more" } },
  });
  assert.equal(seen, before);
  store.stop();
});

test("an unparseable envelope is ignored rather than fatal", async () => {
  const { agent, store } = setup("claude");
  await agent.settleHistory();
  const label = store.getView().label;
  for (const junk of [null, undefined, 42, {}, { event: null }, { event: { type: "mystery" } }]) {
    agent.emitTimeline(junk);
  }
  assert.equal(store.getView().label, label);
  store.stop();
});
