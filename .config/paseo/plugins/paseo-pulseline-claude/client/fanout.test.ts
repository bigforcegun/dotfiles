// The reported production failure: one pill per agent used to mean one store,
// one timeline subscription and one history fetch per agent. With 90 agents in
// the directory that is a fan-out the daemon pays for. Registration must be
// cold; only a mounted pill may talk to the daemon.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createManualClock } from "./fake-agent.ts";
import { createFakeHost, type FakeHost } from "./fake-host.ts";
import { conversation, at } from "./fixtures.ts";
import { createPulselinePills } from "./registry.ts";
import { createPulseStore } from "./store.ts";
import { acquirePulseStore, pulseStoreCount } from "./store-registry.ts";

const AGENT_COUNT = 90;
const ui = { Icon: () => null, Content: () => null };
const clock = createManualClock(Date.parse(at(20)));

function directory() {
  const agents = Array.from({ length: AGENT_COUNT }, (_, index) => ({
    id: `agent-${index}`,
    workspaceId: `ws-${index % 5}`,
  }));
  const agentStates = Object.fromEntries(
    agents.map((agent) => [
      agent.id,
      { history: [{ epoch: "epoch-1", entries: conversation("claude") }] },
    ]),
  );
  return createFakeHost({ agents, agentStates });
}

/** What a mounted icon or popover does through `usePulseView`. */
function mount(host: FakeHost, agentId: string) {
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

function daemonWork(host: FakeHost) {
  let subscriptions = 0;
  let refetches = 0;
  for (let index = 0; index < AGENT_COUNT; index += 1) {
    const agent = host.agent(`agent-${index}`);
    subscriptions += agent.timelineSubscriptions() + agent.agentSubscriptions();
    refetches += agent.refetchCalls();
  }
  return { subscriptions, refetches };
}

test("registering ninety pills performs no per-agent daemon work", async () => {
  const host = directory();
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();

  assert.equal(host.live.size, AGENT_COUNT, "every eligible agent still gets a pill");
  assert.equal(pulseStoreCount(), 0, "no store exists before a pill mounts");
  assert.deepEqual(daemonWork(host), { subscriptions: 0, refetches: 0 });
  assert.equal(clock.pending(), 0, "no timers");
  await cleanup();
});

test("mounting one pill creates exactly one store, subscription and history fetch", async () => {
  const host = directory();
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();

  const lease = mount(host, "agent-7");
  await host.agent("agent-7").settleHistory();

  assert.equal(pulseStoreCount(), 1);
  assert.equal(host.agent("agent-7").timelineSubscriptions(), 1);
  assert.equal(host.agent("agent-7").agentSubscriptions(), 1);
  assert.equal(host.agent("agent-7").refetchCalls(), 1);
  assert.deepEqual(daemonWork(host), { subscriptions: 2, refetches: 1 }, "the other 89 stay cold");

  const mounted = host.created.find((record) => record.contribution.agentId === "agent-7");
  assert.match(mounted?.label ?? "", /^[⣀⣤⣶⣿]+$/, "the mounted pill shows live state");
  const idle = host.created.find((record) => record.contribution.agentId === "agent-8");
  assert.equal(idle?.label, "⣀", "unmounted pills keep the neutral placeholder");

  lease.release();
  await cleanup();
});

test("two mounts of the same pill share one store", async () => {
  const host = directory();
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();

  const icon = mount(host, "agent-3");
  const popover = mount(host, "agent-3");
  await host.agent("agent-3").settleHistory();

  assert.equal(pulseStoreCount(), 1);
  assert.equal(host.agent("agent-3").timelineSubscriptions(), 1);
  assert.equal(host.agent("agent-3").refetchCalls(), 1);

  icon.release();
  assert.equal(pulseStoreCount(), 1, "the popover still holds it");
  popover.release();
  assert.equal(pulseStoreCount(), 0);
  assert.equal(host.agent("agent-3").timelineSubscriptions(), 0);
  await cleanup();
});

test("unmounting releases the store, its subscriptions and its timers", async () => {
  const host = directory();
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();
  const lease = mount(host, "agent-11");
  await host.agent("agent-11").settleHistory();
  host.agent("agent-11").emitSnapshot({
    id: "agent-11",
    status: "running",
    activeTurn: { turnId: "t", startedAt: at(20) },
  });
  assert.equal(clock.pending(), 1, "a busy agent ticks while mounted");

  lease.release();

  assert.equal(pulseStoreCount(), 0);
  assert.equal(clock.pending(), 0);
  assert.deepEqual(daemonWork(host), { subscriptions: 0, refetches: 1 });
  const record = host.created.find((entry) => entry.contribution.agentId === "agent-11");
  assert.equal(record?.label, "⣀", "the label falls back when nothing is mounted");
  await cleanup();
});

test("a reconnect that re-registers every pill still does no timeline work", async () => {
  const host = directory();
  const first = createPulselinePills(host, { ui });
  await host.settleList();
  await first();

  const second = createPulselinePills(host, { ui });
  await host.settleList();

  assert.equal(host.live.size, AGENT_COUNT);
  assert.equal(pulseStoreCount(), 0);
  assert.deepEqual(daemonWork(host), { subscriptions: 0, refetches: 0 });
  await second();
  assert.equal(host.live.size, 0);
});
