import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeHost } from "./fake-host.ts";
import {
  PULSELINE_PILL_ID,
  PULSELINE_PILL_LABEL,
  PULSELINE_PILL_TITLE,
  createPulselinePills,
  isPulselineEligible,
} from "./registry.ts";

const eligible = { id: "agent-1", workspaceId: "ws-1" };
const ui = { Icon: () => null, Content: () => null };
const noWorkspace = { id: "agent-2" };
const archived = { id: "agent-3", workspaceId: "ws-1", archivedAt: "2026-09-01T00:00:00.000Z" };

test("registers one placeholder pill per eligible agent from the bootstrap listing", async () => {
  const host = createFakeHost({ agents: [eligible, noWorkspace, archived] });
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();

  assert.equal(host.live.size, 1);
  const [record] = host.created;
  assert.ok(record);
  assert.deepEqual(
    {
      id: record.contribution.id,
      workspaceId: record.contribution.workspaceId,
      agentId: record.contribution.agentId,
      title: record.contribution.button.title,
      label: record.contribution.button.label,
      icon: record.contribution.button.icon,
      behavior: record.contribution.button.behavior.kind,
    },
    {
      id: PULSELINE_PILL_ID,
      workspaceId: "ws-1",
      agentId: "agent-1",
      title: PULSELINE_PILL_TITLE,
      label: PULSELINE_PILL_LABEL,
      icon: ui.Icon,
      behavior: "popover",
    },
  );
  await cleanup();
});

test("eligibility is provider-neutral: workspace required, archived excluded", () => {
  assert.equal(isPulselineEligible({ id: "a", workspaceId: "ws-1" }), true);
  assert.equal(isPulselineEligible({ id: "a", workspaceId: "ws-1", archivedAt: null }), true);
  assert.equal(isPulselineEligible({ id: "a" }), false);
  assert.equal(isPulselineEligible({ id: "a", workspaceId: "" }), false);
  assert.equal(isPulselineEligible({ id: "a", workspaceId: "ws-1", archivedAt: "x" }), false);
});

test("pages through the bootstrap listing", async () => {
  const agents = Array.from({ length: 5 }, (_, index) => ({
    id: `agent-${index}`,
    workspaceId: "ws-1",
  }));
  const host = createFakeHost({ agents, pageSize: 2 });
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();

  assert.equal(host.live.size, 5);
  assert.ok(host.listCalls() >= 3);
  await cleanup();
});

test("follows agent directory updates", async () => {
  const host = createFakeHost({ agents: [] });
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();

  host.emit({ kind: "upsert", agent: eligible });
  assert.equal(host.live.size, 1);

  host.emit({ kind: "upsert", agent: noWorkspace });
  assert.equal(host.live.size, 1);

  host.emit({ kind: "upsert", agent: archived });
  assert.equal(host.live.size, 1);

  host.emit({ kind: "remove", agentId: "agent-1" });
  assert.equal(host.live.size, 0);
  await cleanup();
});

test("archiving a registered agent removes its pill", async () => {
  const host = createFakeHost({ agents: [eligible] });
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();
  assert.equal(host.live.size, 1);

  host.emit({ kind: "upsert", agent: { ...eligible, archivedAt: "2026-09-12T00:00:00.000Z" } });
  assert.equal(host.live.size, 0);
  await cleanup();
});

test("re-registers without duplicate collisions when an agent moves workspace", async () => {
  const host = createFakeHost({ agents: [eligible] });
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();

  host.emit({ kind: "upsert", agent: { id: "agent-1", workspaceId: "ws-2" } });
  assert.equal(host.live.size, 1);
  const current = [...host.live.values()][0];
  assert.ok(current);
  assert.equal(current.contribution.workspaceId, "ws-2");
  assert.equal(host.created.length, 2);
  await cleanup();
});

test("repeated upserts of an unchanged agent keep one registration", async () => {
  const host = createFakeHost({ agents: [eligible] });
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();

  host.emit({ kind: "upsert", agent: eligible });
  host.emit({ kind: "upsert", agent: eligible });
  assert.equal(host.live.size, 1);
  assert.equal(host.created.length, 1);
  await cleanup();
});

test("cleanup removes every registration and unsubscribes", async () => {
  const agents = [eligible, { id: "agent-9", workspaceId: "ws-2" }];
  const host = createFakeHost({ agents });
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();
  assert.equal(host.live.size, 2);
  assert.equal(host.openSubscriptions(), 1);

  await cleanup();

  assert.equal(host.live.size, 0);
  assert.equal(host.openSubscriptions(), 0);
  assert.ok(host.created.every((record) => record.removed));

  host.emit({ kind: "upsert", agent: { id: "agent-late", workspaceId: "ws-3" } });
  assert.equal(host.live.size, 0);
});

test("cleanup is idempotent", async () => {
  const host = createFakeHost({ agents: [eligible] });
  const cleanup = createPulselinePills(host, { ui });
  await host.settleList();
  await cleanup();
  await cleanup();
  assert.equal(host.live.size, 0);
  assert.equal(host.openSubscriptions(), 0);
});

test("a listing that resolves after cleanup registers nothing", async () => {
  const host = createFakeHost({ agents: [eligible], deferList: true });
  const cleanup = createPulselinePills(host, { ui });
  await cleanup();
  await host.settleList();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(host.live.size, 0);
  assert.equal(host.created.length, 0);
  assert.equal(host.openSubscriptions(), 0);
});
