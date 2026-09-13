// Regressions for reviewer blockers (3)-(6): turn identity, history capacity,
// honest metrics and runtime pill degradation.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDetailModel } from "./detail-model.ts";
import { createFakeAgent, createManualClock, type FakeAgentState } from "./fake-agent.ts";
import { createFakeHost } from "./fake-host.ts";
import { at, conversation, entry, toolCall } from "./fixtures.ts";
import { derivePulseMetrics } from "./metrics.ts";
import { initialPulseState, reducePulse } from "./model.ts";
import { createPulselinePills } from "./registry.ts";
import { createPulseStore } from "./store.ts";

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

// (3) model: turn identity
test("a late terminal for an older turn does not close the current one", () => {
  let state = reducePulse(initialPulseState, { type: "turn", phase: "started", turnId: "t1", at: at(0) });
  state = reducePulse(state, { type: "turn", phase: "started", turnId: "t2", at: at(10) });
  state = reducePulse(state, { type: "turn", phase: "completed", turnId: "t1", at: at(11) });

  assert.equal(state.activeTurn?.turnId, "t2", "t2 is still running");
  assert.equal(state.busy, true);
  assert.equal(state.turnStartedAt, at(10));
  assert.equal(state.blocks.at(-1)?.kind, "success", "t1's outcome is still recorded");
  assert.equal(state.lastTurnMs, null, "t2's start never timed t1's completion");
});

test("a terminal without a turn id closes whatever is running", () => {
  let state = reducePulse(initialPulseState, { type: "turn", phase: "started", turnId: "t1", at: at(0) });
  state = reducePulse(state, { type: "turn", phase: "completed", at: at(6) });
  assert.equal(state.activeTurn, null);
  assert.equal(state.lastTurnMs, 6_000);
});

// (4) history: remaining capacity, deterministic trim, truthful gap
test("older pages are requested with the remaining capacity and the merge is trimmed", async () => {
  const rows = conversation("claude");
  const { agent, store } = storeFor(
    {
      history: [
        { epoch: "e", entries: rows.slice(5), hasOlder: true, startCursor: { epoch: "e", seq: 6 } },
        { epoch: "e", entries: rows.slice(0, 5), hasOlder: false },
      ],
    },
    8,
  );
  await agent.settleHistory();

  const second = agent.refetchOptions()[1] as { limit: number };
  assert.equal(second.limit, 2, "only the unused capacity is requested");
  const state = store.getView().state;
  assert.ok(state.blocks.length <= 8);
  assert.equal(state.lastSeq, 11, "the newest rows are the ones kept");
  assert.equal(state.gap, true, "the trim is disclosed");
  store.stop();
});

// (5) usage, honest totals, truncated counts, text rate
test("a usage_updated stream event updates the model", async () => {
  const { agent, store } = storeFor({ history: [{ epoch: "e", entries: [] }] });
  await agent.settleHistory();
  agent.emitTimeline({
    agentId: "agent-1",
    timestamp: at(30),
    event: { type: "usage_updated", usage: { outputTokens: 9, inputTokens: 40 } },
  });
  assert.equal(store.getView().state.usage?.outputTokens, 9);
  assert.equal(store.getView().metrics.inputTokens?.value, 40);
  store.stop();
});

test("observable chat and tool totals are reported as approximations", () => {
  const state = reducePulse(initialPulseState, {
    type: "history",
    epoch: "e",
    entries: conversation("claude"),
  });
  const metrics = derivePulseMetrics(state, Date.parse(at(30)));
  assert.equal(metrics.chatSeconds?.approx, true);
  assert.equal(metrics.chatSeconds?.value, 11);
  assert.equal(metrics.toolTotalSeconds?.approx, true);
  assert.equal(metrics.toolTotalSeconds?.value, 2);
});

test("counts drawn from a trimmed history are marked approximate", () => {
  const complete = reducePulse(initialPulseState, {
    type: "history",
    epoch: "e",
    entries: conversation("claude"),
  });
  const trimmed = reducePulse(initialPulseState, {
    type: "history",
    epoch: "e",
    entries: conversation("claude"),
    gap: true,
  });
  const exact = buildDetailModel(complete, derivePulseMetrics(complete, START));
  const approx = buildDetailModel(trimmed, derivePulseMetrics(trimmed, START));
  const rowsOf = (model: typeof exact) =>
    model.sections.find((section) => section.id === "activity")?.rows ?? [];
  assert.equal(rowsOf(exact).every((row) => row.approx === false), true);
  assert.equal(rowsOf(approx).every((row) => row.approx === true), true);
  assert.match(rowsOf(approx)[0]?.value ?? "", /^~/);
});

test("the text rate covers the current turn only, or nothing at all", () => {
  let state = reducePulse(initialPulseState, { type: "history", epoch: "e", entries: [] });
  state = reducePulse(state, {
    type: "live",
    entry: { ...entry(1, 0, { type: "assistant_message", text: "x".repeat(100) }), turnId: "t1" },
  });
  state = reducePulse(state, {
    type: "live",
    entry: { ...entry(2, 10, { type: "assistant_message", text: "x".repeat(100) }), turnId: "t1" },
  });
  const first = derivePulseMetrics(state, Date.parse(at(30)));
  assert.equal(first.textCharsPerSecond?.value, 20, "200 chars over the turn's own 10 seconds");

  state = reducePulse(state, {
    type: "live",
    entry: { ...entry(3, 300, { type: "assistant_message", text: "y".repeat(50) }), turnId: "t2" },
  });
  const second = derivePulseMetrics(state, Date.parse(at(320)));
  assert.equal(second.textCharsPerSecond, undefined, "one row in the new turn spans no interval");
});

// (6) pill degradation happens at runtime, not only in tests
test("labels published through the registry stay inside the runtime budget", async () => {
  const host = createFakeHost({
    agents: [{ id: "agent-1", workspaceId: "ws-1" }],
    agentStates: {
      "agent-1": { history: [{ epoch: "e", entries: conversation("claude") }] },
    },
  });
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();
  const lease = (await import("./store-registry.ts")).acquirePulseStore("agent-1", () =>
    createPulseStore({ agentId: "agent-1", handle: host.agent("agent-1").handle }),
  );
  await host.agent("agent-1").settleHistory();
  host.agent("agent-1").emitTimeline({
    agentId: "agent-1",
    timestamp: at(40),
    event: {
      type: "turn_completed",
      turnId: "t",
      usage: {
        inputTokens: 987_654,
        outputTokens: 123_456,
        cachedInputTokens: 54_321,
        totalCostUsd: 12.3456,
        contextWindowUsedTokens: 190_000,
        contextWindowMaxTokens: 200_000,
      },
    },
  });
  for (const record of host.created) {
    for (const patch of record.patches) {
      assert.ok(String(patch["label"]).length <= 44, String(patch["label"]));
    }
  }
  lease.release();
  await cleanup();
});

test("a running tool is still visible in the label", async () => {
  const { agent, store } = storeFor({ history: [{ epoch: "e", entries: [] }] });
  await agent.settleHistory();
  agent.emitTimeline({
    agentId: "agent-1",
    timestamp: at(21),
    seq: 1,
    event: { type: "timeline", item: toolCall("call-1", "search", "running") },
  });
  assert.ok(store.getView().state.blocks[0]?.pending);
  store.stop();
});
