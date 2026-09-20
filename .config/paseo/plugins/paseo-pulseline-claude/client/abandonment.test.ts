// Reviewer item (4): the plugin owns its waits. A host promise that never settles
// may stay pending — we cannot cancel it — but no plugin-side continuation,
// subscription, timer or unhandled rejection may survive cleanup/stop.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAbandonment } from "./abandon.ts";
import { createFakeAgent, createManualClock } from "./fake-agent.ts";
import { createFakeHost } from "./fake-host.ts";
import { at, conversation } from "./fixtures.ts";
import { createPulselinePills } from "./registry.ts";
import { createPulseStore } from "./store.ts";

const ui = { Icon: () => null, Content: () => null };
const CYCLES = 20;

async function flush(): Promise<void> {
  for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setImmediate(resolve));
}

function watchUnhandled() {
  const seen: unknown[] = [];
  const listener = (reason: unknown) => seen.push(reason);
  process.on("unhandledRejection", listener);
  return {
    seen,
    stop() {
      process.off("unhandledRejection", listener);
    },
  };
}

async function settledCount(promises: Promise<unknown>[]): Promise<number> {
  let settled = 0;
  for (const promise of promises) {
    const outcome = await Promise.race([
      promise.then(
        () => "settled",
        () => "settled",
      ),
      new Promise((resolve) => setTimeout(() => resolve("pending"), 20)),
    ]);
    if (outcome === "settled") settled += 1;
  }
  return settled;
}

test("abandonment settles outstanding waits and swallows the late raw rejection", async () => {
  const watcher = watchUnhandled();
  try {
    const abandonment = createAbandonment();
    let rejectRaw: ((reason: unknown) => void) | undefined;
    const raw = new Promise<never>((_resolve, reject) => {
      rejectRaw = reject;
    });
    const outer = abandonment.race(raw);
    assert.equal(abandonment.outstanding(), 1);

    abandonment.abandon();
    await assert.rejects(outer);
    assert.equal(abandonment.outstanding(), 0);

    rejectRaw?.(new Error("host answered long after we left"));
    await flush();
    assert.deepEqual(watcher.seen, [], "a late raw rejection has a terminal handler");
  } finally {
    watcher.stop();
  }
});

test("twenty never-settling agents.list cycles leave no plugin-side residue", async () => {
  const watcher = watchUnhandled();
  const cleanups: Promise<unknown>[] = [];
  let host!: ReturnType<typeof createFakeHost>;
  try {
    for (let cycle = 0; cycle < CYCLES; cycle += 1) {
      host = createFakeHost({ agents: [{ id: "agent-1", workspaceId: "ws-1" }], hangList: true });
      const cleanup = createPulselinePills(host, { ui });
      await flush();
      assert.equal(host.openSubscriptions(), 1, `cycle ${cycle}: directory listener open`);
      cleanups.push(Promise.resolve(cleanup()));
      assert.equal(host.openSubscriptions(), 0, `cycle ${cycle}: directory listener closed`);
    }
    assert.equal(await settledCount(cleanups), CYCLES, "every bootstrap continuation resumed");
    await flush();
    assert.deepEqual(watcher.seen, []);
    assert.equal(host.pendingListPromises(), 1, "the host's own promise is still pending per host");
  } finally {
    watcher.stop();
  }
});

test("twenty never-settling readiness cycles leave no plugin-side residue", async () => {
  const watcher = watchUnhandled();
  const idles: Promise<unknown>[] = [];
  const clock = createManualClock(Date.parse(at(20)));
  const agent = createFakeAgent("agent-1", {
    neverReady: true,
    history: Array.from({ length: CYCLES }, () => ({ epoch: "e", entries: conversation("claude") })),
  });
  try {
    for (let cycle = 0; cycle < CYCLES; cycle += 1) {
      const store = createPulseStore({
        agentId: "agent-1",
        handle: agent.handle,
        now: clock.now,
        schedule: clock.schedule,
        cancel: clock.cancel,
      });
      await flush();
      assert.equal(agent.timelineSubscriptions(), 1, `cycle ${cycle}: timeline open`);
      assert.equal(agent.agentSubscriptions(), 1, `cycle ${cycle}: agent open`);
      idles.push(store.whenIdle());
      store.stop();
      assert.equal(agent.timelineSubscriptions(), 0, `cycle ${cycle}: timeline closed`);
      assert.equal(agent.agentSubscriptions(), 0, `cycle ${cycle}: agent closed`);
      assert.equal(clock.pending(), 0, `cycle ${cycle}: no timers left`);
    }
    assert.equal(await settledCount(idles), CYCLES, "every readiness continuation resumed");
    await flush();
    assert.deepEqual(watcher.seen, []);
    assert.equal(agent.pendingReadyPromises(), CYCLES, "the host's ready promises stay pending");
  } finally {
    watcher.stop();
  }
});
