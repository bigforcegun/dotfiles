// Reviewer defect: clear() cancelled the timers but left every guard promise
// pending, so a permanently hanging history request kept its awaiting
// continuation alive across mount/unmount cycles.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createDeadlineKeeper } from "./deadline.ts";
import { createFakeAgent, createManualClock } from "./fake-agent.ts";
import { at } from "./fixtures.ts";
import { createPulseStore } from "./store.ts";

function settlement<Value>(promise: Promise<Value>): { read(): string } {
  let state = "pending";
  void promise.then(
    () => (state = "resolved"),
    () => (state = "rejected"),
  );
  return { read: () => state };
}

async function flush(): Promise<void> {
  for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => setImmediate(resolve));
}

test("clear settles every outstanding guard instead of leaving it pending", async () => {
  const clock = createManualClock(0);
  const keeper = createDeadlineKeeper(clock.schedule, clock.cancel);
  const guarded = keeper.run(new Promise<never>(() => {}), 1_000);
  const observed = settlement(guarded);
  await flush();
  assert.equal(observed.read(), "pending", "it is pending while the work hangs");

  keeper.clear();
  await flush();

  assert.notEqual(observed.read(), "pending", "a cleared guard must not keep its continuation");
  assert.equal(observed.read(), "rejected");
  assert.equal(keeper.armed(), 0);
  assert.equal(clock.pending(), 0);
});

test("a cleared guard never raises an unhandled rejection", async () => {
  const seen: unknown[] = [];
  const onUnhandled = (reason: unknown) => seen.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const clock = createManualClock(0);
    const keeper = createDeadlineKeeper(clock.schedule, clock.cancel);
    // Deliberately drop the returned promise: nobody awaits this one.
    keeper.run(new Promise<never>(() => {}), 1_000);
    keeper.clear();
    await flush();
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  assert.deepEqual(seen, [], "clear() must not leak a rejection nobody asked for");
});

test("repeated mount and unmount over a hanging history leaves nothing suspended", async () => {
  const clock = createManualClock(Date.parse(at(20)));
  const agent = createFakeAgent("agent-1", { hangRefetch: true });
  const loads: Promise<unknown>[] = [];

  for (let cycle = 0; cycle < 5; cycle += 1) {
    const store = createPulseStore({
      agentId: "agent-1",
      handle: agent.handle,
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
      requestTimeoutMs: 20_000,
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(clock.pending(), 1, `cycle ${cycle}: one deadline armed`);
    loads.push(store.whenIdle());
    store.stop();
    assert.equal(clock.pending(), 0, `cycle ${cycle}: timers cleared`);
  }

  const outcomes = await Promise.race([
    Promise.all(loads).then(() => "all-settled"),
    new Promise((resolve) => setTimeout(() => resolve("still-pending"), 50)),
  ]);
  assert.equal(outcomes, "all-settled", "every load continuation resumed and finished");
  assert.equal(agent.refetchCalls(), 5, "one hanging request per cycle, none retried after stop");
});

test("a settled request still disarms itself", async () => {
  const clock = createManualClock(0);
  const keeper = createDeadlineKeeper(clock.schedule, clock.cancel);
  assert.equal(await keeper.run(Promise.resolve("ok"), 1_000), "ok");
  assert.equal(keeper.armed(), 0);
  assert.equal(clock.pending(), 0);
});

test("an expired deadline rejects and disarms", async () => {
  const clock = createManualClock(0);
  const keeper = createDeadlineKeeper(clock.schedule, clock.cancel);
  const guarded = keeper.run(new Promise<never>(() => {}), 1_000);
  clock.advance(1_000);
  await assert.rejects(guarded, /timed out/);
  assert.equal(keeper.armed(), 0);
  assert.equal(clock.pending(), 0);
});
