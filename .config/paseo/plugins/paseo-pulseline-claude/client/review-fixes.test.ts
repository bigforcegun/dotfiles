// Regressions for the reviewer's blockers, each pinned to the public v0.8 contract.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDetailModel } from "./detail-model.ts";
import { createFakeAgent, createManualClock, type FakeAgentState } from "./fake-agent.ts";
import { createFakeHost } from "./fake-host.ts";
import { at, conversation, entry, toolCall } from "./fixtures.ts";
import { derivePulseMetrics } from "./metrics.ts";
import { initialPulseState, reducePulse } from "./model.ts";
import { PULSELINE_SUBSCRIPTION_ID, createPulselinePills } from "./registry.ts";
import { MAX_BUFFERED_INPUTS, createPulseStore } from "./store.ts";

const START = Date.parse(at(20));
const ui = { Icon: () => null, Content: () => null };

function storeFor(state: FakeAgentState, historyLimit?: number) {
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

function live(seq: number, offset: number, text: string) {
  return {
    agentId: "agent-1",
    timestamp: at(offset),
    seq,
    event: { type: "timeline", item: { type: "assistant_message", text } },
  };
}

// (1) registry: directory subscription pairing and stale bootstrap pages
test("the bootstrap listing establishes the daemon directory subscription", async () => {
  const host = createFakeHost({ agents: [{ id: "a", workspaceId: "ws" }] });
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();
  const [first] = host.listOptions();
  assert.deepEqual((first as { subscribe?: unknown }).subscribe, {
    subscriptionId: PULSELINE_SUBSCRIPTION_ID,
  });
  await cleanup();
});

test("a stale bootstrap page never resurrects an agent a live event already decided", async () => {
  const host = createFakeHost({
    agents: [
      { id: "gone", workspaceId: "ws-1" },
      { id: "moved", workspaceId: "ws-1" },
    ],
    deferList: true,
  });
  const cleanup = createPulselinePills(host, { ui });
  host.emit({ kind: "remove", agentId: "gone" });
  host.emit({ kind: "upsert", agent: { id: "moved", workspaceId: "ws-9" } });
  await host.settleList();

  const targets = [...host.live.values()].map(
    (record) => `${record.contribution.agentId}@${record.contribution.workspaceId}`,
  );
  assert.deepEqual(targets, ["moved@ws-9"]);
  await cleanup();
});

// (2) store: readiness, failure handling, snapshot refresh, bounded buffer
// Superseded by client/readiness.test.ts: gating history on `ready` hangs the
// plugin whenever the session is disconnected, because the sender returns null
// and syncTimelines never resolves the interest
// (packages/client/src/daemon-client.ts:1082, connection/index.ts:92-98).
test("history does not wait for a readiness promise that may never settle", async () => {
  const { agent, store } = storeFor({
    deferReady: true,
    history: [{ epoch: "e", entries: conversation("claude") }],
  });
  await agent.settleHistory();
  assert.equal(agent.refetchCalls(), 1, "the fetch is issued without waiting");
  assert.equal(store.getView().state.historyLoaded, true);
  store.stop();
});

test("a failing history is retried a bounded number of times, then declared incomplete", async () => {
  const { agent, store } = storeFor({ failEveryRefetch: true });
  agent.emitTimeline(live(5, 5, "arrived while history was failing"));
  await agent.settleHistory();

  const state = store.getView().state;
  assert.ok(agent.refetchCalls() >= 2 && agent.refetchCalls() <= 3, String(agent.refetchCalls()));
  assert.equal(state.historyLoaded, true, "the model must not stay stuck behind a failed page");
  assert.equal(state.gap, true, "and it says so instead of pretending to be complete");
  assert.equal(state.lastSeq, 5, "the buffered live row was flushed");
  store.stop();
});

test("the pre-history buffer is bounded and reports the loss", async () => {
  const { agent, store } = storeFor({
    deferHistory: true,
    history: [{ epoch: "e", entries: [] }],
  });
  for (let index = 1; index <= MAX_BUFFERED_INPUTS + 20; index += 1) {
    agent.emitTimeline(live(index, index, `row ${index}`));
  }
  await agent.settleHistory();

  const state = store.getView().state;
  assert.equal(state.lastSeq, MAX_BUFFERED_INPUTS + 20, "the newest rows survive");
  assert.equal(state.gap, true, "dropped rows are disclosed");
  store.stop();
});

test("the snapshot a timeline page carries refreshes status, turn and usage", async () => {
  const { agent, store } = storeFor({
    history: [
      {
        epoch: "e",
        entries: conversation("claude"),
        agent: {
          id: "agent-1",
          status: "running",
          activeTurn: { turnId: "t9", startedAt: at(25) },
          lastUsage: { outputTokens: 5 },
        },
      },
    ],
  });
  await agent.settleHistory();
  const state = store.getView().state;
  assert.equal(state.busy, true);
  assert.equal(state.activeTurn?.turnId, "t9");
  assert.equal(state.usage?.outputTokens, 5);
  store.stop();
});

test("a failing older page keeps the tail already received and marks a gap", async () => {
  const rows = conversation("claude");
  const { agent, store } = storeFor({
    history: [
      { epoch: "e", entries: rows.slice(5), hasOlder: true, startCursor: { epoch: "e", seq: 6 } },
      { epoch: "e", entries: [], fail: true },
    ],
  });
  await agent.settleHistory();
  const state = store.getView().state;
  assert.equal(agent.refetchCalls(), 2);
  assert.ok(state.blocks.length > 0, "the tail survived the failed continuation");
  assert.equal(state.gap, true);
  assert.equal(state.historyLoaded, true);
  store.stop();
});
