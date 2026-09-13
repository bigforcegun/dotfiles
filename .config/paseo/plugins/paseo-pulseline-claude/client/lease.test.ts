// Production storm: 462 fetch_agent_timeline_request in six seconds, p50 3.2s.
// Cause: the composer-button host rebuilds its PaseoApi facade on every render
// (packages/app/src/plugins/buttons/view.tsx:399 — no useMemo, unlike
// workspace-panels/panel.tsx:56-59), so an effect keyed on that object tears the
// store down and rebuilds it on every render. The lease must key on the agent.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createFakeAgent } from "./fake-agent.ts";
import { conversation } from "./fixtures.ts";
import { leasePulseStore } from "./lease.ts";
import { pulseStoreCount } from "./store-registry.ts";

function agentWithHistory() {
  return createFakeAgent("agent-1", {
    history: Array.from({ length: 6 }, () => ({
      epoch: "e",
      entries: conversation("claude"),
    })),
  });
}

test("re-rendering with a fresh api object does not restart the store", async () => {
  const agent = agentWithHistory();
  const first = leasePulseStore("agent-1", () => agent.handle);
  await agent.settleHistory();
  assert.equal(agent.refetchCalls(), 1);

  // Ten renders, each handing the hook a brand-new facade.
  const leases = Array.from({ length: 10 }, () => leasePulseStore("agent-1", () => agent.handle));
  await agent.settleHistory();

  assert.equal(pulseStoreCount(), 1, "one store for one agent, whatever the render count");
  assert.equal(agent.refetchCalls(), 1, "no extra history fetch per render");
  assert.equal(agent.timelineSubscriptions(), 1);

  for (const lease of leases) lease.release();
  assert.equal(pulseStoreCount(), 1, "the original lease still holds it");
  first.release();
  assert.equal(pulseStoreCount(), 0);
  assert.equal(agent.timelineSubscriptions(), 0);
});

test("the handle factory is only consulted when a store is actually built", async () => {
  const agent = agentWithHistory();
  let calls = 0;
  const first = leasePulseStore("agent-1", () => {
    calls += 1;
    return agent.handle;
  });
  const second = leasePulseStore("agent-1", () => {
    calls += 1;
    return agent.handle;
  });
  await agent.settleHistory();
  assert.equal(calls, 1, "the second lease reuses the live store");
  first.release();
  second.release();
  assert.equal(pulseStoreCount(), 0);
});

test("the mounted hook keys its lease on the agent, never on the api object", () => {
  const source = readFileSync(new URL("./use-pulse-view.ts", import.meta.url).pathname, "utf8");
  const deps = source.match(/\}, \[([^\]]*)\]\);/g) ?? [];
  const effectDeps = deps.find((entry: string) => entry.includes("agentId"));
  assert.ok(effectDeps, "the lease effect exists");
  assert.equal(
    /paseo/.test(effectDeps as string),
    false,
    "a per-render api object must not be an effect dependency",
  );
  assert.match(source, /useRef\(/, "the api is read through a ref instead");
  assert.match(source, /leasePulseStore\(/);
});
