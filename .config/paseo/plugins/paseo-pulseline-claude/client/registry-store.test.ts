// Registry ↔ store integration under the leased model: registration is cold and
// a store exists only while a component holds a lease.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeHost, type FakeHost } from "./fake-host.ts";
import { PROVIDERS, conversation } from "./fixtures.ts";
import { createPulselinePills } from "./registry.ts";
import { acquirePulseStore, getPulseStore, pulseStoreCount } from "./store-registry.ts";
import { createPulseStore } from "./store.ts";

const eligible = { id: "agent-1", workspaceId: "ws-1" };
const ui = { Icon: () => null, Content: () => null };

function hostWith(provider: (typeof PROVIDERS)[number] = "claude", extra: string[] = []) {
  const agentStates: Record<string, { history: { epoch: string; entries: never[] }[] }> = {};
  const states = Object.fromEntries(
    ["agent-1", ...extra].map((id) => [
      id,
      { history: [{ epoch: "epoch-1", entries: conversation(provider) }] },
    ]),
  );
  return createFakeHost({
    agents: [eligible, ...extra.map((id) => ({ id, workspaceId: "ws-2" }))],
    agentStates: { ...agentStates, ...states },
  });
}

/** What a mounted icon or popover does through `usePulseView`. */
function mount(host: FakeHost, agentId: string) {
  return acquirePulseStore(agentId, () =>
    createPulseStore({ agentId, handle: host.agent(agentId).handle }),
  );
}

test("a mounted pill's label follows the model's deterministic text state", async () => {
  const host = hostWith();
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();
  const record = host.created[0];
  assert.equal(record?.label, "plc Pulseline · Claude", "cold registration shows the plugin name");

  const lease = mount(host, "agent-1");
  await host.agent("agent-1").settleHistory();

  assert.ok((record?.updates ?? 0) > 0);
  assert.match(record?.label ?? "", /^plc [▁▂▃▄▅▆▇█]/);
  lease.release();
  await cleanup();
});

test("both providers drive the same label through the registry", async () => {
  const labels: string[] = [];
  for (const provider of PROVIDERS) {
    const host = hostWith(provider);
    const cleanup = createPulselinePills(host, { ui });
    await host.settleList();
    const lease = mount(host, "agent-1");
    await host.agent("agent-1").settleHistory();
    labels.push(host.created[0]?.label ?? "");
    lease.release();
    await cleanup();
  }
  assert.equal(labels[0], labels[1]);
});

test("published updates only ever patch the label", async () => {
  const host = hostWith();
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();
  const lease = mount(host, "agent-1");
  await host.agent("agent-1").settleHistory();

  const record = host.created[0];
  assert.ok(record && record.patches.length > 0);
  for (const patch of record.patches) {
    assert.deepEqual(Object.keys(patch), ["label"], JSON.stringify(patch));
  }
  assert.equal(record.contribution.button.behavior.kind, "popover");
  lease.release();
  await cleanup();
});

test("a provider change churns neither the registration nor the mounted store", async () => {
  const host = hostWith();
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();
  const lease = mount(host, "agent-1");
  await host.agent("agent-1").settleHistory();
  const refetches = host.agent("agent-1").refetchCalls();

  host.emit({ kind: "upsert", agent: { ...eligible, provider: "opencode/gpt-5.6" } });

  assert.equal(host.created.length, 1);
  assert.equal(host.agent("agent-1").refetchCalls(), refetches);
  assert.equal(host.agent("agent-1").timelineSubscriptions(), 1);
  lease.release();
  await cleanup();
});

test("a workspace move re-registers the pill and keeps the mounted store", async () => {
  const host = hostWith();
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();
  const lease = mount(host, "agent-1");
  await host.agent("agent-1").settleHistory();

  host.emit({ kind: "upsert", agent: { id: "agent-1", workspaceId: "ws-2" } });

  assert.equal(host.created.length, 2, "the pill moved to the new composer");
  assert.equal(pulseStoreCount(), 1, "the store belongs to the mounted component, not the pill");
  assert.equal(host.agent("agent-1").refetchCalls(), 1, "no second history fetch for a move");
  assert.match([...host.live.values()][0]?.label ?? "", /^plc [▁▂▃▄▅▆▇█]/);
  lease.release();
  assert.equal(pulseStoreCount(), 0);
  await cleanup();
});

test("removing an agent drops its pill and leaves no store behind", async () => {
  const host = hostWith();
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();
  assert.equal(pulseStoreCount(), 0);

  host.emit({ kind: "remove", agentId: "agent-1" });

  assert.equal(host.live.size, 0);
  assert.equal(pulseStoreCount(), 0);
  assert.equal(host.agent("agent-1").timelineSubscriptions(), 0);
  await cleanup();
});

test("cleanup removes registrations and starts no store of its own", async () => {
  const host = hostWith("claude", ["agent-9"]);
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();
  assert.equal(host.live.size, 2);
  assert.equal(pulseStoreCount(), 0);

  await cleanup();

  assert.equal(host.live.size, 0);
  assert.equal(pulseStoreCount(), 0);
  for (const agentId of ["agent-1", "agent-9"]) {
    assert.equal(host.agent(agentId).timelineSubscriptions(), 0, agentId);
    assert.equal(host.agent(agentId).agentSubscriptions(), 0, agentId);
  }
  assert.equal(getPulseStore("agent-1"), null);
});
