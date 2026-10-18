// Non-visual smoke driver. Drives the real registry with a fake host: descriptor
// contract, history bootstrap, live lifecycle, store reaction and teardown.
//
// The icon and popover components cannot be loaded here — React Native has no
// node renderer — so this driver injects stand-ins with the same contract and
// `client/ui-audit.test.ts` asserts the entry wires the real ones.
import { createFakeHost } from "./client/fake-host.ts";
import { PULSELINE_PILL_LABEL, PULSELINE_PILL_TITLE } from "./client/descriptor.ts";
import { PROVIDERS, USAGE_FULL, at, conversation, toolCall } from "./client/fixtures.ts";
import { createManualClock } from "./client/fake-agent.ts";
import { createPulselinePills } from "./client/registry.ts";
import { acquirePulseStore, getPulseStore, pulseStoreCount } from "./client/store-registry.ts";
import { createPulseStore } from "./client/store.ts";

const failures: string[] = [];
function check(label: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${String(actual)} (expected ${String(expected)})`);
  if (!ok) failures.push(label);
}
function report(label: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${detail}`);
  if (!ok) failures.push(label);
}

const ui = { Icon: () => null, Content: () => null };
const host = createFakeHost({
  agents: [
    { id: "agent-claude", workspaceId: "ws-1" },
    { id: "agent-opencode", workspaceId: "ws-2" },
    { id: "agent-no-workspace" },
    { id: "agent-archived", workspaceId: "ws-1", archivedAt: at(-3600) },
  ],
  agentStates: {
    "agent-claude": {
      history: [
        { epoch: "epoch-1", entries: conversation("claude") },
        { epoch: "epoch-2", entries: conversation("claude").slice(0, 3) },
      ],
    },
    "agent-opencode": { history: [{ epoch: "epoch-1", entries: conversation("opencode") }] },
  },
});

const bootstrapErrors: unknown[] = [];
const cleanup = createPulselinePills(host, {
  ui,
  onBootstrapError: (error) => bootstrapErrors.push(error),
});
await host.settleList();
await host.agent("agent-claude").settleHistory();
await host.agent("agent-opencode").settleHistory();

console.log("-- descriptor contract --");
const first = host.created[0];
const second = host.created[1];
check("pills registered", host.live.size, 2);
check("accessible title", first?.contribution.button.title, PULSELINE_PILL_TITLE);
report("custom icon component", typeof first?.contribution.button.icon === "function", "function");
check("icon is the injected component", first?.contribution.button.icon, ui.Icon);
check("behavior kind", first?.contribution.button.behavior.kind, "popover");
report(
  "popover carries the injected Content",
  (first?.contribution.button.behavior as { Content?: unknown }).Content === ui.Content,
  "identical reference",
);
report(
  "behavior instance shared, never rebuilt per pill",
  first?.contribution.button.behavior === second?.contribution.button.behavior,
  "one instance",
);

console.log("-- label state (before mount) --");
for (const record of host.created) {
  console.log(`     ${record.contribution.agentId}: ${record.label}`);
}
report(
  "cold pills carry the neutral idle mark, never the plugin name",
  host.created.every((record) => record.label === PULSELINE_PILL_LABEL),
  `label=${String(host.created[0]?.label)}`,
);

console.log("-- bootstrap --");
check("bootstrap errors on the happy path", bootstrapErrors.length, 0);

console.log("-- cold registration --");
check("stores before any pill mounts", pulseStoreCount(), 0);
check("timeline subscriptions while nothing is mounted", host.agent("agent-claude").timelineSubscriptions(), 0);
check("history fetches while nothing is mounted", host.agent("agent-claude").refetchCalls(), 0);
check("idle label stays stable", host.created[1]?.label, PULSELINE_PILL_LABEL);

console.log("-- one mounted pill --");
const clock = createManualClock(Date.parse(at(20)));
const lease = acquirePulseStore("agent-claude", () =>
  createPulseStore({
    agentId: "agent-claude",
    handle: host.agent("agent-claude").handle,
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
  }),
);
await host.agent("agent-claude").settleHistory();
check("stores after one mount", pulseStoreCount(), 1);
check("mounted timeline subscriptions", host.agent("agent-claude").timelineSubscriptions(), 1);
check("mounted history fetches", host.agent("agent-claude").refetchCalls(), 1);
check("the other agent stays cold", host.agent("agent-opencode").timelineSubscriptions(), 0);
check("the other agent fetched nothing", host.agent("agent-opencode").refetchCalls(), 0);

console.log("-- live lifecycle --");
const claude = host.agent("agent-claude");
const behaviorBefore = first?.contribution.button.behavior;
for (const [seq, status] of [
  [20, "running"],
  [21, "completed"],
] as const) {
  claude.emitTimeline({
    agentId: "agent-claude",
    timestamp: at(20 + seq),
    seq,
    epoch: "epoch-1",
    event: { type: "timeline", item: toolCall("call-live", "write", status) },
  });
}
claude.emitTimeline({
  agentId: "agent-claude",
  timestamp: at(60),
  event: { type: "turn_completed", turnId: "turn-1", usage: USAGE_FULL },
});
const live = host.created[0]?.label ?? "";
report("live events reached the label", /^[⣀⣤⣶⣿]+$/.test(live) && live.length > 0, live);
report("no metrics ride in the pill", !/[↓↑◇⛁$~]/.test(live), live);
report("behavior survived every update", first?.contribution.button.behavior === behaviorBefore, "stable");

console.log("-- shared store --");
report(
  "mounted label is pulse-only",
  /^[⣀⣤⣶⣿]+$/.test(host.created[0]?.label ?? "") &&
    host.created[0]?.label !== PULSELINE_PILL_LABEL,
  String(host.created[0]?.label),
);
report(
  "no provider or variant text reaches the pill",
  !/plc|Pulseline|Claude/i.test(host.created[0]?.label ?? ""),
  String(host.created[0]?.label),
);
report(
  "updates patch the label only",
  host.created.every((record) => record.patches.every((patch) => Object.keys(patch).join() === "label")),
  `${host.created[0]?.patches.length} patches`,
);
report(
  "labels stay inside the runtime budget",
  host.created.every((record) => (record.label ?? "").length <= 44),
  `${(host.created[0]?.label ?? "").length} chars`,
);
const shared = getPulseStore("agent-claude");
report("popover sees the loaded model", shared?.getView().state.historyLoaded === true, "loaded");
report(
  "popover sees the live tool block",
  shared?.getView().state.blocks.some((block) => block.key === "tool:call-live") === true,
  "tool:call-live",
);
let reactions = 0;
const stopWatching = shared?.subscribe(() => {
  reactions += 1;
});
claude.emitTimeline({
  agentId: "agent-claude",
  timestamp: at(70),
  seq: 30,
  epoch: "epoch-1",
  event: { type: "timeline", item: { type: "reasoning", text: "one more thought" } },
});
report("subscribers react to new rows", reactions > 0, `${reactions} notifications`);
stopWatching?.();

console.log("-- directory churn --");
host.emit({ kind: "remove", agentId: "agent-opencode" });
check("pills after removal", host.live.size, 1);
check("timeline subscriptions of the removed agent", host.agent("agent-opencode").timelineSubscriptions(), 0);

console.log("-- unmount --");
lease.release();
check("stores after unmount", pulseStoreCount(), 0);
check("timeline subscriptions after unmount", claude.timelineSubscriptions(), 0);
check("agent subscriptions after unmount", claude.agentSubscriptions(), 0);
check("timers after unmount", clock.pending(), 0);
check("label falls back when nothing is mounted", host.created[0]?.label, PULSELINE_PILL_LABEL);

console.log("-- cleanup receipt --");
await cleanup();
check("pills after cleanup", host.live.size, 0);
check("stores after cleanup", pulseStoreCount(), 0);
check("agent-directory subscriptions", host.openSubscriptions(), 0);
for (const provider of PROVIDERS) {
  const agentId = provider === "claude" ? "agent-claude" : "agent-opencode";
  check(`timeline subscriptions (${agentId})`, host.agent(agentId).timelineSubscriptions(), 0);
  check(`agent subscriptions (${agentId})`, host.agent(agentId).agentSubscriptions(), 0);
}
check("every registration removed", host.created.every((record) => record.removed), true);
host.emit({ kind: "upsert", agent: { id: "agent-post-cleanup", workspaceId: "ws-4" } });
check("post-cleanup events ignored", host.live.size, 0);

console.log("-- bootstrap failure path --");
const brokenHost = createFakeHost({
  agents: [{ id: "agent-broken", workspaceId: "ws-1" }],
  failListTimes: 99,
});
const brokenErrors: unknown[] = [];
const brokenCleanup = createPulselinePills(brokenHost, {
  ui,
  onBootstrapError: (error) => brokenErrors.push(error),
});
await brokenHost.settleList();
await brokenHost.settleList();
check("listing attempts are bounded", brokenHost.listCalls(), 2);
check("terminal failure reported once", brokenErrors.length, 1);
check("no pills survive a terminal failure", brokenHost.live.size, 0);
check("local directory listener closed", brokenHost.openSubscriptions(), 0);
await brokenCleanup();

if (failures.length > 0) {
  console.error(`smoke failed: ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("smoke passed");
}
