// Regressions from the stage 3 gate review: epoch races, buffered event epochs,
// pre-history turn events, and multi-page history.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeAgent, createManualClock, type FakeAgentState } from "./fake-agent.ts";
import { createPulseStore } from "./store.ts";
import { at, conversation, entry } from "./fixtures.ts";

const START = Date.parse(at(20));

function setup(state: FakeAgentState, historyLimit?: number) {
  const agent = createFakeAgent("agent-1", state);
  const clock = createManualClock(START);
  const store = createPulseStore({
    agentId: "agent-1",
    handle: agent.handle,
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
    ...(historyLimit === undefined ? {} : { historyLimit }),
  });
  return { agent, clock, store };
}

function liveEnvelope(seq: number, offset: number, epoch: string, text: string) {
  return {
    agentId: "agent-1",
    timestamp: at(offset),
    seq,
    epoch,
    event: { type: "timeline", item: { type: "assistant_message", text } },
  };
}

test("a replacement during the initial fetch discards the old epoch and refetches", async () => {
  const { agent, store } = setup({
    deferHistory: true,
    history: [
      { epoch: "epoch-1", entries: conversation("claude") },
      { epoch: "epoch-2", entries: conversation("opencode").slice(0, 3) },
    ],
  });
  agent.emitTimeline({ agentId: "agent-1", event: { type: "replacement", epoch: "epoch-2" } });
  await agent.settleHistory();

  const state = store.getView().state;
  assert.equal(agent.refetchCalls(), 2, "the superseded request is followed by a new one");
  assert.equal(state.epoch, "epoch-2");
  assert.equal(state.historyLoaded, true);
  assert.equal(state.needsRefetch, false);
  assert.equal(state.blocks.length, 2, "only the replacement epoch's rows were committed");
  assert.equal(state.lastSeq, 3);
  store.stop();
});

test("buffered live events belonging to the replaced epoch are dropped", async () => {
  const { agent, store } = setup({
    deferHistory: true,
    history: [
      { epoch: "epoch-1", entries: conversation("claude") },
      { epoch: "epoch-2", entries: conversation("claude").slice(0, 3) },
    ],
  });
  agent.emitTimeline(liveEnvelope(30, 30, "epoch-1", "from the old epoch"));
  agent.emitTimeline({ agentId: "agent-1", event: { type: "replacement", epoch: "epoch-2" } });
  agent.emitTimeline(liveEnvelope(31, 31, "epoch-2", "from the new epoch"));
  await agent.settleHistory();

  const state = store.getView().state;
  assert.equal(state.epoch, "epoch-2");
  assert.equal(state.lastSeq, 31, "the new-epoch event applied");
  assert.equal(
    state.blocks.some((block) => block.key === "seq:30"),
    false,
    "the stale buffered event never reached the new epoch",
  );
});

test("a stale live event arriving after the replacement is ignored", async () => {
  const { agent, store } = setup({
    history: [
      { epoch: "epoch-1", entries: conversation("claude") },
      { epoch: "epoch-2", entries: conversation("claude").slice(0, 3) },
    ],
  });
  await agent.settleHistory();
  agent.emitTimeline({ agentId: "agent-1", event: { type: "replacement", epoch: "epoch-2" } });
  await agent.settleHistory();
  const before = store.getView().state;

  agent.emitTimeline(liveEnvelope(90, 40, "epoch-1", "ghost of the previous epoch"));

  const after = store.getView().state;
  assert.equal(after.blocks.length, before.blocks.length);
  assert.equal(after.lastSeq, before.lastSeq);
  store.stop();
});

test("turn events that arrive before history replay chronologically after it", async () => {
  const { agent, store } = setup({
    deferHistory: true,
    history: [{ epoch: "epoch-1", entries: conversation("claude") }],
  });
  // Deliberately out of arrival order: the completion is seen before the start.
  agent.emitTimeline({
    agentId: "agent-1",
    timestamp: at(45),
    event: { type: "turn_completed", turnId: "t1", usage: { outputTokens: 11 } },
  });
  agent.emitTimeline({
    agentId: "agent-1",
    timestamp: at(41),
    event: { type: "turn_started", turnId: "t1" },
  });
  assert.equal(store.getView().state.blocks.length, 0, "nothing lands before history");

  await agent.settleHistory();
  const state = store.getView().state;
  const historyBlocks = conversation("claude").length - 1 - 1; // no user block, tool rows collapse
  assert.equal(state.blocks.length, historyBlocks + 1, "one turn outcome block after history");
  assert.equal(state.blocks.at(-1)?.kind, "success");
  assert.equal(state.lastTurnMs, 4_000, "the buffered start was applied before the completion");
  assert.equal(state.usage?.outputTokens, 11);
  assert.equal(state.busy, false);
  store.stop();
});

test("history pages older than the tail are read to the contract limit", async () => {
  const rows = conversation("claude");
  const { agent, store } = setup({
    history: [
      {
        epoch: "epoch-1",
        entries: rows.slice(5),
        hasOlder: true,
        startCursor: { epoch: "epoch-1", seq: 6 },
      },
      { epoch: "epoch-1", entries: rows.slice(0, 5), hasOlder: false },
    ],
  });
  await agent.settleHistory();

  const state = store.getView().state;
  assert.equal(agent.refetchCalls(), 2);
  assert.deepEqual(agent.refetchOptions()[1], {
    direction: "before",
    projection: "canonical",
    limit: 194,
    cursor: { epoch: "epoch-1", seq: 6 },
  });
  assert.equal(state.gap, false, "the whole conversation was read");
  assert.equal(state.lastSeq, 11);
  assert.deepEqual(
    state.blocks.map((block) => block.kind),
    ["reasoning", "text", "read", "write", "error", "other", "other", "other", "text"],
    "older rows merged ahead of the tail without reordering",
  );
  assert.equal(new Set(state.blocks.map((block) => block.key)).size, state.blocks.length);
  store.stop();
});

test("history truncated by the limit is marked as a gap instead of pretending", async () => {
  const { agent, store } = setup(
    {
      history: [
        {
          epoch: "epoch-1",
          entries: conversation("claude"),
          hasOlder: true,
          startCursor: { epoch: "epoch-1", seq: 1 },
        },
      ],
    },
    3,
  );
  await agent.settleHistory();

  assert.equal(agent.refetchCalls(), 1, "the limit was already reached by the tail page");
  assert.equal(store.getView().state.gap, true);
  store.stop();
});

test("a page that reports its own gap keeps the model honest", async () => {
  const { agent, store } = setup({
    history: [{ epoch: "epoch-1", entries: conversation("claude"), gap: true }],
  });
  await agent.settleHistory();
  assert.equal(store.getView().state.gap, true);
  store.stop();
});

test("older pages from a different epoch stop pagination and mark a gap", async () => {
  const rows = conversation("claude");
  const { agent, store } = setup({
    history: [
      {
        epoch: "epoch-1",
        entries: rows.slice(5),
        hasOlder: true,
        startCursor: { epoch: "epoch-1", seq: 6 },
      },
      { epoch: "epoch-9", entries: rows.slice(0, 5), hasOlder: false },
    ],
  });
  await agent.settleHistory();

  const state = store.getView().state;
  assert.equal(state.epoch, "epoch-1");
  assert.equal(state.gap, true);
  assert.equal(
    state.blocks.some((block) => block.key === "seq:2"),
    false,
    "rows from another epoch were not merged in",
  );
  store.stop();
});

test("live entries are ignored when their epoch contradicts the model", async () => {
  const { agent, store } = setup({
    history: [{ epoch: "epoch-1", entries: [entry(1, 0, { type: "reasoning", text: "hi" })] }],
  });
  await agent.settleHistory();
  const before = store.getView().state.blocks.length;
  agent.emitTimeline(liveEnvelope(40, 40, "epoch-7", "wrong epoch"));
  assert.equal(store.getView().state.blocks.length, before);
  store.stop();
});
