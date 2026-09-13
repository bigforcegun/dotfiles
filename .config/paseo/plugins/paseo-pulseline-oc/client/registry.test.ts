import { setImmediate } from "node:timers/promises";
import type { PluginButton, PluginButtonRegistration, PluginComposerPillContribution } from "@getpaseo/plugin/client";
import { describe, expect, it, vi } from "vitest";
import {
  createPulselineRegistry,
  type RegistryAgent,
  type RegistryAgentUpdate,
  type RegistryHost,
  type ScheduleRefresh,
} from "./registry";
import type { RegistryTimelineEvent, RegistryTimelinePage } from "./controller";
import { createPulselinePresentation, type PulselinePresentation } from "./pill";

vi.mock("react-native", () => ({
  StyleSheet: { create: <Styles extends object>(styles: Styles) => styles },
  Text: "Text",
  View: "View",
}));

function agent(input: Pick<RegistryAgent, "id" | "provider"> & Partial<RegistryAgent>): RegistryAgent {
  return { id: input.id, provider: input.provider, ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}), ...(input.archivedAt ? { archivedAt: input.archivedAt } : {}), ...(input.activeTurn !== undefined ? { activeTurn: input.activeTurn } : {}), ...(input.lastUsage ? { lastUsage: input.lastUsage } : {}) };
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

class FakeHost implements RegistryHost {
  readonly active = new Map<string, { readonly contribution: PluginComposerPillContribution; readonly labels: string[] }>();
  readonly created: Array<{ readonly key: string; readonly contribution: PluginComposerPillContribution; readonly labels: string[] }> = [];
  readonly timelineHandlers = new Map<string, Set<(event: RegistryTimelineEvent) => void>>();
  readonly timelineRemovals = new Map<string, number>();
  readonly pages = new Map<string, RegistryTimelinePage[]>();
  readonly catalogUnsubscribe = vi.fn();
  #catalogHandler: ((update: RegistryAgentUpdate) => void) | undefined;
  #agents: readonly RegistryAgent[];
  #listGate: Promise<void>;

  constructor(agents: readonly RegistryAgent[], listGate = Promise.resolve()) {
    this.#agents = agents;
    this.#listGate = listGate;
  }

  readonly paseo = {
    agents: {
      list: async () => {
        await this.#listGate;
        return { entries: this.#agents.map((entry) => ({ agent: entry })), pageInfo: { hasMore: false, nextCursor: null } };
      },
      subscribe: (handler: (update: RegistryAgentUpdate) => void) => {
        this.#catalogHandler = handler;
        return this.catalogUnsubscribe;
      },
      ref: (agentId: string) => ({
        timeline: {
          subscribe: (handler: (event: RegistryTimelineEvent) => void) => {
            const handlers = this.timelineHandlers.get(agentId) ?? new Set();
            handlers.add(handler);
            this.timelineHandlers.set(agentId, handlers);
            return Object.assign(
              () => {
                if (handlers.delete(handler)) this.timelineRemovals.set(agentId, (this.timelineRemovals.get(agentId) ?? 0) + 1);
              },
              { ready: Promise.resolve() },
            );
          },
          refetch: async () => this.pages.get(agentId)?.shift() ?? {
            epoch: `epoch-${agentId}`,
            reset: false,
            gap: false,
            hasOlder: false,
            startCursor: null,
            entries: [],
            error: null,
          },
        },
      }),
    },
  };

  addComposerPill(contribution: PluginComposerPillContribution): PluginButtonRegistration {
    const key = `${contribution.workspaceId}:${contribution.agentId}`;
    const labels = [contribution.button.label ?? contribution.button.title];
    const record = { key, contribution, labels };
    this.created.push(record);
    this.active.set(key, record);
    return {
      update: (patch: Partial<PluginButton>) => {
        if (patch.label) labels.push(patch.label);
      },
      remove: () => {
        this.active.delete(key);
      },
    };
  }

  emitAgent(update: RegistryAgentUpdate): void {
    this.#catalogHandler?.(update);
  }
}

describe("Pulseline registry", () => {
  it("applies identical provider-neutral lifecycle rules and cleans every resource", async () => {
    // Given
    const host = new FakeHost([
      agent({ id: "claude-1", provider: "claude", workspaceId: "workspace-1" }),
      agent({ id: "opencode-1", provider: "opencode", workspaceId: "workspace-2" }),
      agent({ id: "unplaced", provider: "claude" }),
      agent({ id: "archived", provider: "opencode", workspaceId: "workspace-3", archivedAt: "2026-09-12T00:00:00.000Z" }),
    ]);
    let scheduleCalls = 0;
    let timerStops = 0;
    const schedule: ScheduleRefresh = () => {
      scheduleCalls += 1;
      return () => { timerStops += 1; };
    };
    const cleanup = createPulselineRegistry(host, schedule);
    await setImmediate();

    // When
    host.emitAgent({ kind: "upsert", agent: agent({ id: "claude-1", provider: "opencode", workspaceId: "workspace-1" }) });
    host.emitAgent({ kind: "upsert", agent: agent({ id: "opencode-1", provider: "opencode", workspaceId: "workspace-moved" }) });
    host.emitAgent({ kind: "upsert", agent: agent({ id: "added", provider: "claude", workspaceId: "workspace-4" }) });
    host.emitAgent({ kind: "remove", agentId: "added" });
    host.emitAgent({ kind: "upsert", agent: agent({ id: "claude-1", provider: "opencode", workspaceId: "workspace-1", archivedAt: "2026-09-12T01:00:00.000Z" }) });
    cleanup();
    cleanup();

    // Then
    expect(host.created.slice(0, 2).map(({ contribution }) => contribution.agentId)).toEqual(["claude-1", "opencode-1"]);
    expect(host.created.filter(({ contribution }) => contribution.agentId === "claude-1")).toHaveLength(1);
    expect(host.created.filter(({ contribution }) => contribution.agentId === "opencode-1")).toHaveLength(2);
    expect(host.active.size).toBe(0);
    expect(host.catalogUnsubscribe).toHaveBeenCalledOnce();
    expect([...host.timelineRemovals.values()].reduce((sum, count) => sum + count, 0)).toBe(0);
    expect({ scheduleCalls, timerStops }).toEqual({ scheduleCalls: 0, timerStops: 0 });
  });

  it("updates the compact label from deterministic store fallbacks", async () => {
    // Given
    const host = new FakeHost([
      agent({ id: "agent-1", provider: "opencode", workspaceId: "workspace-1", lastUsage: { inputTokens: 12, outputTokens: 3 } }),
    ]);
    const presentations: PulselinePresentation[] = [];
    const cleanup = createPulselineRegistry(host, () => () => {}, (item) => {
      presentations.push(item);
    });
    await setImmediate();
    const mounted = presentations[0];
    expect(mounted).toBeDefined();
    if (!mounted) return;
    const unmount = mounted.subscribe(() => {});

    // When
    host.emitAgent({ kind: "upsert", agent: agent({ id: "agent-1", provider: "claude", workspaceId: "workspace-1", activeTurn: { turnId: "turn-1", startedAt: null } }) });

    // Then
    expect(host.created[0]?.labels).toContain("Pulseline · OpenCode · 15 tok");
    expect(host.created[0]?.labels.at(-1)).toBe("Pulseline · OpenCode · busy");
    unmount();
    cleanup();
  });

  it("reacts through one mounted presentation and drops its runtime on unmount", async () => {
    // Given
    const host = new FakeHost([]);
    let timerStops = 0;
    const presentation = createPulselinePresentation({
      label: "Pulseline · OpenCode",
      agent: agent({ id: "agent-1", provider: "opencode", workspaceId: "workspace-1" }),
      timeline: () => host.paseo.agents.ref("agent-1").timeline,
      schedule: () => () => { timerStops += 1; },
      onSnapshot: () => {},
    });
    const listener = vi.fn();
    const unsubscribe = presentation.subscribe(listener);
    await setImmediate();
    listener.mockClear();
    const handler = [...(host.timelineHandlers.get("agent-1") ?? [])][0];

    // When
    handler?.({
      agentId: "agent-1",
      epoch: "epoch-agent-1",
      seq: 1,
      timestamp: "2026-09-12T00:00:01.000Z",
      event: {
        type: "timeline",
        provider: "opencode",
        item: { type: "assistant_message", text: "first" },
      },
    });

    // Then
    expect(listener).toHaveBeenCalledOnce();
    expect(presentation.getSnapshot().blocks.map(({ text }) => text)).toEqual(["first"]);
    unsubscribe();
    handler?.({
      agentId: "agent-1",
      epoch: "epoch-agent-1",
      seq: 2,
      timestamp: "2026-09-12T00:00:02.000Z",
      event: {
        type: "timeline",
        provider: "opencode",
        item: { type: "assistant_message", text: "late" },
      },
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(presentation.isMounted()).toBe(false);
    expect(host.timelineRemovals.get("agent-1")).toBe(1);
    expect(timerStops).toBe(1);
    presentation.dispose();
  });

  it("keeps a live removal newer than the pending initial list", async () => {
    // Given
    const gate = deferred();
    const host = new FakeHost([
      agent({ id: "agent-1", provider: "opencode", workspaceId: "workspace-old" }),
    ], gate.promise);
    const cleanup = createPulselineRegistry(host, () => () => {});

    // When
    host.emitAgent({ kind: "remove", agentId: "agent-1" });
    gate.resolve();
    await setImmediate();

    // Then
    expect(host.active.size).toBe(0);
    cleanup();
  });

  it("keeps a live workspace move newer than the pending initial list", async () => {
    // Given
    const gate = deferred();
    const host = new FakeHost([
      agent({ id: "agent-1", provider: "opencode", workspaceId: "workspace-old" }),
    ], gate.promise);
    const cleanup = createPulselineRegistry(host, () => () => {});

    // When
    host.emitAgent({
      kind: "upsert",
      agent: agent({ id: "agent-1", provider: "opencode", workspaceId: "workspace-new" }),
    });
    gate.resolve();
    await setImmediate();

    // Then
    expect([...host.active.keys()]).toEqual(["workspace-new:agent-1"]);
    cleanup();
  });
});
