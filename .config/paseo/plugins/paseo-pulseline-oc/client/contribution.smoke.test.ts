import process from "node:process";
import type { PluginButton, PluginButtonRegistration, PluginComposerPillContribution } from "@getpaseo/plugin/client";
import { expect, it, vi } from "vitest";
import { createPulselineRegistry, type RegistryAgent, type RegistryAgentUpdate, type ScheduleRefresh } from "./registry";
import type { RegistryTimelineEvent } from "./controller";
import type { PulselinePresentation } from "./pill";

vi.mock("react-native", () => ({
  StyleSheet: { create: <Styles extends object>(styles: Styles) => styles },
  Text: "Text",
  View: "View",
}));

it("drives history and live timeline state through cleanup with binary observables", async () => {
  vi.useFakeTimers();
  let catalogSubscribed = false;
  let timelineSubscribed = false;
  let catalogHandler: ((update: RegistryAgentUpdate) => void) | undefined;
  let timelineHandler: ((event: RegistryTimelineEvent) => void) | undefined;
  const active = new Set<string>();
  const labels: string[] = [];
  const updates: Array<Partial<PluginButton>> = [];
  let descriptor: PluginButton | undefined;
  let presentation: PulselinePresentation | undefined;
  const client = {
    paseo: {
      agents: {
        async list() {
          return { entries: [{ agent: { id: "smoke-agent", provider: "opencode", workspaceId: "smoke-workspace" } }], pageInfo: { hasMore: false, nextCursor: null } };
        },
        subscribe(handler: (update: RegistryAgentUpdate) => void) {
          catalogSubscribed = true;
          catalogHandler = handler;
          return () => { catalogSubscribed = false; };
        },
        ref() {
          return {
            timeline: {
              subscribe(handler: (event: RegistryTimelineEvent) => void) {
                timelineSubscribed = true;
                timelineHandler = handler;
                return Object.assign(() => { timelineSubscribed = false; }, { ready: Promise.resolve() });
              },
              async refetch() {
                return {
                  epoch: "smoke-epoch",
                  reset: false,
                  gap: false,
                  hasOlder: false,
                  startCursor: null,
                  error: null,
                  entries: [{
                    provider: "opencode",
                    timestamp: "2026-09-12T00:00:01.000Z",
                    seqStart: 1,
                    seqEnd: 1,
                    item: { type: "assistant_message" as const, text: "history" },
                  }],
                };
              },
            },
          };
        },
      },
    },
    addComposerPill(contribution: PluginComposerPillContribution): PluginButtonRegistration {
      const key = `${contribution.id}:${contribution.agentId}`;
      active.add(key);
      descriptor = contribution.button;
      labels.push(contribution.button.label ?? contribution.button.title);
      return {
        update(patch: Partial<PluginButton>) {
          updates.push(patch);
          if (patch.label) labels.push(patch.label);
        },
        remove() { active.delete(key); },
      };
    },
  };

  const cleanup = createPulselineRegistry(
    client,
    (callback) => {
      const timer = setInterval(callback, 1_000);
      return () => clearInterval(timer);
    },
    (item) => { presentation = item; },
  );
  await Promise.resolve();
  const mounted = presentation;
  expect(mounted).toBeDefined();
  if (!mounted) return;
  const unmount = mounted.subscribe(() => {});
  await Promise.resolve();
  await Promise.resolve();
  timelineHandler?.({
    agentId: "smoke-agent",
    epoch: "smoke-epoch",
    seq: 2,
    timestamp: "2026-09-12T00:00:02.000Z",
    event: { type: "timeline", provider: "opencode", item: { type: "reasoning", text: "live" } },
  });
  const behavior = descriptor?.behavior;

  expect({
    registration: active.size === 1,
    descriptor: descriptor?.title === "Pulseline · OpenCode" && descriptor.label === "⣀",
    icon: typeof descriptor?.icon === "function",
    popover: behavior?.kind === "popover" && typeof behavior.Content === "function",
    history: mounted.getSnapshot().blocks.some(({ text }) => text === "history"),
    live: labels.at(-1) === "⣀⣀",
    labelOnly: updates.length > 0 && updates.every((patch) => Object.keys(patch).join() === "label"),
    behaviorStable: descriptor?.behavior === behavior,
    catalogSubscribed,
    timelineSubscribed,
    timer: vi.getTimerCount() === 1,
  }).toEqual({ registration: true, descriptor: true, icon: true, popover: true, history: true, live: true, labelOnly: true, behaviorStable: true, catalogSubscribed: true, timelineSubscribed: true, timer: true });

  unmount();
  cleanup();
  cleanup();
  const updatesAfterCleanup = updates.length;
  catalogHandler?.({ kind: "remove", agentId: "smoke-agent" });
  timelineHandler?.({
    agentId: "smoke-agent",
    epoch: "smoke-epoch",
    seq: 3,
    timestamp: "2026-09-12T00:00:03.000Z",
    event: { type: "timeline", provider: "opencode", item: { type: "assistant_message", text: "late" } },
  });
  expect({
    registrationsReleased: active.size === 0,
    catalogReleased: !catalogSubscribed,
    timelineReleased: !timelineSubscribed,
    timersReleased: vi.getTimerCount() === 0,
    updatesStopped: updates.length === updatesAfterCleanup,
  }).toEqual({ registrationsReleased: true, catalogReleased: true, timelineReleased: true, timersReleased: true, updatesStopped: true });
  process.stdout.write("SMOKE descriptor=1 popover=1 reaction=1 behavior.stable=1 cleanup.registration=1 cleanup.catalog=1 cleanup.timeline=1 cleanup.timer=1 cleanup.update=1\n");
  vi.useRealTimers();
});

it("keeps ninety cold descriptors at zero timeline work and bounds one mounted runtime", async () => {
  // Given
  const agents: readonly RegistryAgent[] = Array.from({ length: 90 }, (_, index) => ({
    id: `agent-${index}`,
    provider: "opencode",
    workspaceId: `workspace-${index}`,
  }));
  const descriptors = new Set<string>();
  const presentations: PulselinePresentation[] = [];
  let catalogHandler: ((update: RegistryAgentUpdate) => void) | undefined;
  let refs = 0;
  let subscriptions = 0;
  let activeSubscriptions = 0;
  let refetches = 0;
  let scheduleCalls = 0;
  let activeTimers = 0;
  const schedule: ScheduleRefresh = () => {
    scheduleCalls += 1;
    activeTimers += 1;
    return () => { activeTimers -= 1; };
  };
  const client = {
    paseo: { agents: {
      async list() { return { entries: agents.map((agent) => ({ agent })), pageInfo: { hasMore: false, nextCursor: null } }; },
      subscribe(handler: (update: RegistryAgentUpdate) => void) {
        catalogHandler = handler;
        return () => { catalogHandler = undefined; };
      },
      ref() {
        refs += 1;
        return { timeline: {
          subscribe() {
            subscriptions += 1;
            activeSubscriptions += 1;
            return Object.assign(() => { activeSubscriptions -= 1; }, { ready: Promise.resolve() });
          },
          async refetch() {
            refetches += 1;
            return { epoch: "fanout", reset: false, gap: false, hasOlder: false, startCursor: null, error: null, entries: [] };
          },
        } };
      },
    } },
    addComposerPill(contribution: PluginComposerPillContribution): PluginButtonRegistration {
      const key = `${contribution.workspaceId}:${contribution.agentId}`;
      descriptors.add(key);
      return { update() {}, remove() { descriptors.delete(key); } };
    },
  };

  // When: register ninety eligible catalog descriptors without mounting their components.
  const cleanup = createPulselineRegistry(client, schedule, (presentation) => {
    presentations.push(presentation);
  });
  await Promise.resolve();
  await Promise.resolve();

  // Then: cold descriptors create no timeline runtime work.
  expect({ descriptors: descriptors.size, mounted: presentations.filter((item) => item.isMounted()).length, refs, subscriptions, refetches, scheduleCalls, activeSubscriptions, activeTimers }).toEqual({ descriptors: 90, mounted: 0, refs: 0, subscriptions: 0, refetches: 0, scheduleCalls: 0, activeSubscriptions: 0, activeTimers: 0 });

  // When: mount exactly one displayed pill through the same subscribe seam React uses.
  const displayed = presentations[0];
  expect(displayed).toBeDefined();
  if (!displayed) return;
  const unmount = displayed.subscribe(() => {});
  await Promise.resolve();
  await Promise.resolve();

  // Then: one mounted pill owns at most one runtime and history bootstrap.
  expect({ mounted: presentations.filter((item) => item.isMounted()).length, refs, subscriptions, refetches, scheduleCalls, activeSubscriptions, activeTimers }).toEqual({ mounted: 1, refs: 1, subscriptions: 1, refetches: 1, scheduleCalls: 1, activeSubscriptions: 1, activeTimers: 1 });

  // When: unmount, then reconnect the catalog entry without mounting it again.
  unmount();
  catalogHandler?.({ kind: "remove", agentId: "agent-0" });
  catalogHandler?.({ kind: "upsert", agent: agents[0] ?? { id: "agent-0", provider: "opencode", workspaceId: "workspace-0" } });

  // Then: all runtime work stays stopped and reconnect remains cold.
  expect({ mounted: presentations.filter((item) => item.isMounted()).length, refs, subscriptions, refetches, scheduleCalls, activeSubscriptions, activeTimers }).toEqual({ mounted: 0, refs: 1, subscriptions: 1, refetches: 1, scheduleCalls: 1, activeSubscriptions: 0, activeTimers: 0 });
  cleanup();
  process.stdout.write("FANOUT descriptors=90 cold.runtime=0 cold.timeline=0 mounted.runtime=1 mounted.timeline=1 mounted.history=1 mounted.timer=1 unmounted.timeline=0 reconnect.timeline=0\n");
});
