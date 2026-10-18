// Reviewer 88a55069 blockers for Task 2.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createFakeAgent, createManualClock } from "./fake-agent.ts";
import { createFakeHost, type FakeHost } from "./fake-host.ts";
import { at, conversation } from "./fixtures.ts";
import { createPulselinePills } from "./registry.ts";
import { acquirePulseStore, pulseStoreCount } from "./store-registry.ts";
import { createPulseStore } from "./store.ts";
import { openPulseLease } from "./use-pulse-view.ts";
import { resolvePulseAgentId } from "./pulse-target.ts";

const ui = { Icon: () => null, Content: () => null };

function read(file: string): string {
  return readFileSync(new URL(`./${file}`, import.meta.url).pathname, "utf8");
}

function agentWithHistory(id = "agent-1") {
  return createFakeAgent(id, {
    history: Array.from({ length: 4 }, () => ({ epoch: "e", entries: conversation("claude") })),
  });
}

// (1) a closed mounted pill still owns exactly one runtime
test("the icon derives its agent from the button context", () => {
  assert.equal(resolvePulseAgentId({ context: "agent", agentId: "a-7", workspaceId: "w" }), "a-7");
  assert.equal(resolvePulseAgentId({ context: "workspace", workspaceId: "w" }), null);
});

test("the empty icon still leases the pulse for a closed pill", () => {
  const source = read("pulse-icon.tsx");
  assert.match(source, /usePulseView\(/, "a closed pill must own the store, not just the popover");
  assert.match(source, /resolvePulseAgentId\(/);
  assert.match(source, /borderRadius/, "and it draws the pulse dot");
});

test("mounting the component's lease opens exactly one runtime, unmounting closes it", async () => {
  const agent = agentWithHistory();
  const release = openPulseLease("agent-1", () => agent.handle);
  assert.ok(release, "a mounted component receives a cleanup");
  await agent.settleHistory();

  assert.equal(pulseStoreCount(), 1);
  assert.equal(agent.timelineSubscriptions(), 1);
  assert.equal(agent.agentSubscriptions(), 1);
  assert.equal(agent.refetchCalls(), 1);

  release?.();
  assert.equal(pulseStoreCount(), 0);
  assert.equal(agent.timelineSubscriptions(), 0);
  assert.equal(agent.agentSubscriptions(), 0);
});

test("icon and popover mounted together share the single lease", async () => {
  const agent = agentWithHistory("agent-2");
  const icon = openPulseLease("agent-2", () => agent.handle);
  const popover = openPulseLease("agent-2", () => agent.handle);
  await agent.settleHistory();
  assert.equal(pulseStoreCount(), 1);
  assert.equal(agent.refetchCalls(), 1);
  icon?.();
  assert.equal(pulseStoreCount(), 1, "the popover keeps it alive");
  popover?.();
  assert.equal(pulseStoreCount(), 0);
});

test("an unmounted agent id opens nothing", () => {
  const before = pulseStoreCount();
  const release = openPulseLease(null, () => {
    throw new Error("must not build a store");
  });
  assert.equal(pulseStoreCount(), before);
  release?.();
});

// (2) the animated label reaches the registration
function mount(host: FakeHost, agentId: string, clock: ReturnType<typeof createManualClock>) {
  return acquirePulseStore(agentId, () =>
    createPulseStore({
      agentId,
      handle: host.agent(agentId).handle,
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    }),
  );
}

test("a 450 ms tick publishes a new animated label to the registration", async () => {
  const host = createFakeHost({
    agents: [{ id: "agent-1", workspaceId: "ws-1" }],
    agentStates: {
      "agent-1": { history: [{ epoch: "e", entries: conversation("claude") }] },
    },
  });
  const clock = createManualClock(Date.parse(at(20)));
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();
  const lease = mount(host, "agent-1", clock);
  await host.agent("agent-1").settleHistory();

  host.agent("agent-1").emitSnapshot({
    id: "agent-1",
    status: "running",
    activeTurn: { turnId: "t", startedAt: at(20) },
  });
  const record = host.created[0];
  assert.ok(record);
  const beforePatches = record.patches.length;
  const beforeLabel = record.label;

  clock.advance(450);

  assert.ok(record.patches.length > beforePatches, "the tick published an update");
  assert.notEqual(record.label, beforeLabel, "the animated tail reached the pill");
  assert.equal(record.label, lease.store.getView().label, "pill and store agree");
  assert.equal(lease.store.getView().phase, 1);

  clock.advance(450);
  assert.equal(lease.store.getView().phase, 0, "two phases, then round again");
  assert.equal(record.label, lease.store.getView().label);

  lease.release();
  await cleanup();
});

// (3) deadline timers belong to the store and die with it
test("stopping during a hanging refetch cancels the deadline immediately", async () => {
  const agent = createFakeAgent("agent-1", { hangRefetch: true });
  const clock = createManualClock(Date.parse(at(20)));
  const store = createPulseStore({
    agentId: "agent-1",
    handle: agent.handle,
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
    requestTimeoutMs: 20_000,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(clock.pending(), 1, "the request is under a deadline");

  store.stop();

  assert.equal(clock.pending(), 0, "stop() cancels the pending deadline at once");
  clock.advance(60_000);
  assert.equal(clock.pending(), 0, "and nothing rearms afterwards");
});

test("a released lease leaves no deadline behind either", async () => {
  const agent = createFakeAgent("agent-9", { hangRefetch: true });
  const clock = createManualClock(Date.parse(at(20)));
  const lease = acquirePulseStore("agent-9", () =>
    createPulseStore({
      agentId: "agent-9",
      handle: agent.handle,
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
      requestTimeoutMs: 20_000,
    }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(clock.pending(), 1);
  lease.release();
  assert.equal(clock.pending(), 0);
  assert.equal(pulseStoreCount(), 0);
});

test("a settled request disarms its own deadline", async () => {
  const agent = agentWithHistory("agent-3");
  const clock = createManualClock(Date.parse(at(20)));
  const store = createPulseStore({
    agentId: "agent-3",
    handle: agent.handle,
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  await agent.settleHistory();
  assert.equal(clock.pending(), 0, "no deadline outlives a completed page");
  store.stop();
});

test("the deadline keeper disarms on settle and on clear", async () => {
  const { createDeadlineKeeper } = await import("./deadline.ts");
  const clock = createManualClock(0);
  const keeper = createDeadlineKeeper(clock.schedule, clock.cancel);

  await keeper.run(Promise.resolve("ok"), 1_000);
  assert.equal(keeper.armed(), 0, "a settled request disarms itself");
  assert.equal(clock.pending(), 0);

  const hanging = keeper.run(new Promise<never>(() => {}), 1_000);
  void hanging.catch(() => undefined);
  assert.equal(keeper.armed(), 1);
  keeper.clear();
  assert.equal(keeper.armed(), 0);
  assert.equal(clock.pending(), 0);
});
