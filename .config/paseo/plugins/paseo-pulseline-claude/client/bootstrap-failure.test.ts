// The bootstrap used to be detached and its failures swallowed, so a plugin whose
// directory listing failed still "loaded": zero pills, no wire subscription, no
// complaint. These regressions pin the failure paths instead.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeHost } from "./fake-host.ts";
import { conversation } from "./fixtures.ts";
import { PULSELINE_SUBSCRIPTION_ID, createPulselinePills } from "./registry.ts";
import { pulseStoreCount } from "./store-registry.ts";

const ui = { Icon: () => null, Content: () => null };

function hostWith(overrides: Parameters<typeof createFakeHost>[0] = {}) {
  return createFakeHost({
    agents: [
      { id: "agent-1", workspaceId: "ws-1" },
      { id: "agent-2", workspaceId: "ws-2" },
    ],
    agentStates: {
      "agent-1": { history: [{ epoch: "e", entries: conversation("claude") }] },
    },
    ...overrides,
  });
}

test("a first listing rejection is retried and the pills still appear", async () => {
  const host = hostWith({ failListTimes: 1 });
  const errors: unknown[] = [];
  const cleanup = createPulselinePills(host, { ui, onBootstrapError: (error) => errors.push(error) });
  await host.settleList();
  await host.settleList();

  assert.equal(host.live.size, 2, "the retry recovered the directory");
  assert.equal(errors.length, 0, "a recovered attempt is not an error");
  assert.equal(host.listCalls(), 2, "exactly one retry");
  const paired = host
    .listOptions()
    .filter((options) => (options as { subscribe?: unknown }).subscribe !== undefined);
  assert.equal(paired.length, 2, "every attempt re-establishes the directory subscription");
  assert.deepEqual((paired.at(-1) as { subscribe: unknown }).subscribe, {
    subscriptionId: PULSELINE_SUBSCRIPTION_ID,
  });
  await cleanup();
});

test("a terminal listing failure tears everything down and is reported once", async () => {
  const host = hostWith({ failListTimes: 99 });
  const errors: unknown[] = [];
  const cleanup = createPulselinePills(host, { ui, onBootstrapError: (error) => errors.push(error) });
  await host.settleList();
  await host.settleList();

  assert.equal(host.listCalls(), 2, "the retry is bounded");
  assert.equal(errors.length, 1, "the failure is surfaced, never swallowed");
  assert.match(String((errors[0] as Error).message), /directory/i);
  assert.equal(host.live.size, 0, "no half-registered pills survive");
  assert.equal(host.openSubscriptions(), 0, "the local agent listener is closed");
  assert.equal(pulseStoreCount(), 0);

  // Late directory traffic must not resurrect a plugin that gave up.
  host.emit({ kind: "upsert", agent: { id: "agent-3", workspaceId: "ws-3" } });
  assert.equal(host.live.size, 0);
  await cleanup();
  assert.equal(host.live.size, 0);
});

test("a registration failure is terminal, cleaned up and reported once", async () => {
  const host = hostWith({ failRegistrationTimes: 99 });
  const errors: unknown[] = [];
  const cleanup = createPulselinePills(host, { ui, onBootstrapError: (error) => errors.push(error) });
  await host.settleList();
  await host.settleList();

  assert.equal(errors.length, 1);
  assert.match(String((errors[0] as Error).message), /registration refused/);
  assert.equal(host.live.size, 0);
  assert.equal(host.openSubscriptions(), 0);
  assert.equal(pulseStoreCount(), 0);
  await cleanup();
});

test("a partial registration failure still leaves nothing half-mounted", async () => {
  const host = hostWith({ failRegistrationTimes: 3 });
  const errors: unknown[] = [];
  const cleanup = createPulselinePills(host, { ui, onBootstrapError: (error) => errors.push(error) });
  await host.settleList();
  await host.settleList();

  // Two attempts, first pill of each refused: the second attempt registers the rest.
  assert.equal(errors.length, 1);
  assert.equal(host.live.size, 0, "teardown removed whatever had been registered");
  assert.equal(host.created.every((record) => record.removed), true);
  await cleanup();
});

test("bootstrap failure leaves the cleanup function safe to call twice", async () => {
  const host = hostWith({ failListTimes: 99 });
  const cleanup = createPulselinePills(host, { ui, onBootstrapError: () => undefined });
  await host.settleList();
  await host.settleList();
  await cleanup();
  await cleanup();
  assert.equal(host.live.size, 0);
  assert.equal(host.openSubscriptions(), 0);
});
