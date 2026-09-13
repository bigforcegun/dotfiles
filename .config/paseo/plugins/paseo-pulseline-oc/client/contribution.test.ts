import type {
  PluginButtonRegistration,
  PluginComposerPillContribution,
} from "@getpaseo/plugin/client";
import process from "node:process";
import { setImmediate } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { createPulselineRegistry, type RegistryAgentUpdate } from "./registry";
import type { PulselinePresentation } from "./pill";

vi.mock("react-native", () => ({
  StyleSheet: { create: <Styles extends object>(styles: Styles) => styles },
  Text: "Text",
  View: "View",
}));

function agent(input: {
  readonly id: string;
  readonly provider: string;
  readonly workspaceId?: string;
  readonly archivedAt?: string;
  readonly activeTurn?: { readonly turnId: string; readonly startedAt: string | null } | null;
}) {
  return input;
}

type TestAgent = ReturnType<typeof agent>;
type TestAgentPage = {
  readonly entries: readonly { readonly agent: TestAgent }[];
  readonly pageInfo: { readonly hasMore: boolean; readonly nextCursor: string | null };
};

function fakeClient(
  agents: readonly TestAgent[],
  list = async (): Promise<TestAgentPage> => ({
    entries: agents.map((entry) => ({ agent: entry })),
    pageInfo: { hasMore: false, nextCursor: null },
  }),
) {
  const active = new Set<string>();
  const contributions: PluginComposerPillContribution[] = [];
  const removals: string[] = [];
  const updates: Array<Partial<PluginComposerPillContribution["button"]>> = [];
  const unsubscribe = vi.fn();
  let onUpdate: ((update: RegistryAgentUpdate) => void) | undefined;

  return {
    active,
    contributions,
    removals,
    updates,
    unsubscribe,
    client: {
      paseo: {
        agents: {
          list,
          subscribe(handler: (update: RegistryAgentUpdate) => void) {
            onUpdate = handler;
            return unsubscribe;
          },
          ref() {
            return {
              timeline: {
                subscribe() {
                  return Object.assign(() => {}, { ready: Promise.resolve() });
                },
                async refetch() {
                  return {
                    epoch: "test-epoch",
                    reset: false,
                    gap: false,
                    hasOlder: false,
                    startCursor: null,
                    entries: [],
                    error: null,
                  };
                },
              },
            };
          },
        },
      },
      addComposerPill(contribution: PluginComposerPillContribution): PluginButtonRegistration {
        const key = `${contribution.workspaceId}:${contribution.agentId}:${contribution.id}`;
        contributions.push(contribution);
        active.add(key);
        return {
          update(patch) { updates.push(patch); },
          remove() {
            if (active.delete(key)) removals.push(key);
          },
        };
      },
    },
    emit(update: RegistryAgentUpdate) {
      onUpdate?.(update);
    },
  };
}

describe("Pulseline client contribution", () => {
  it("registers a uniquely labelled accessible pill per eligible agent", async () => {
    // Given
    const fixture = fakeClient([
      agent({ id: "claude-1", provider: "claude", workspaceId: "workspace-1" }),
      agent({ id: "opencode-1", provider: "opencode", workspaceId: "workspace-2" }),
      agent({
        id: "archived-1",
        provider: "claude",
        workspaceId: "workspace-3",
        archivedAt: "2026-09-12T01:00:00.000Z",
      }),
      agent({ id: "unplaced-1", provider: "opencode" }),
    ]);

    // When
    const cleanup = createPulselineRegistry(fixture.client, () => () => {});
    await Promise.resolve();

    // Then
    expect(fixture.contributions).toHaveLength(2);
    expect(fixture.contributions.map(({ agentId }) => agentId)).toEqual([
      "claude-1",
      "opencode-1",
    ]);
    expect(fixture.contributions.every(({ id }) => id === "paseo-pulseline-oc-pulseline")).toBe(
      true,
    );
    expect(fixture.contributions.every(({ button }) => button.title === "Pulseline · OpenCode")).toBe(true);
    expect(fixture.contributions.every(({ button }) => button.label === "Pulseline · OpenCode")).toBe(true);
    cleanup();
  });

  it("registers a custom icon and anchored popover content", async () => {
    // Given
    const fixture = fakeClient([
      agent({ id: "opencode-1", provider: "opencode", workspaceId: "workspace-1" }),
    ]);

    // When
    const cleanup = createPulselineRegistry(fixture.client, () => () => {});
    await Promise.resolve();

    // Then
    const button = fixture.contributions[0]?.button;
    expect(typeof button?.icon).toBe("function");
    expect(button?.behavior.kind).toBe("popover");
    if (button?.behavior.kind === "popover") {
      expect(typeof button.behavior.Content).toBe("function");
    }
    cleanup();
  });

  it("publishes label-only updates without replacing popover behavior", async () => {
    // Given
    const fixture = fakeClient([
      agent({ id: "opencode-1", provider: "opencode", workspaceId: "workspace-1" }),
    ]);
    let presentation: PulselinePresentation | undefined;
    const cleanup = createPulselineRegistry(
      fixture.client,
      () => () => {},
      (item) => { presentation = item; },
    );
    await Promise.resolve();
    const mounted = presentation;
    expect(mounted).toBeDefined();
    if (!mounted) return;
    const unmount = mounted.subscribe(() => {});
    const behavior = fixture.contributions[0]?.button.behavior;

    // When
    fixture.emit({
      kind: "upsert",
      agent: agent({
        id: "opencode-1",
        provider: "opencode",
        workspaceId: "workspace-1",
        activeTurn: { turnId: "turn-1", startedAt: null },
      }),
    });

    // Then
    expect(behavior?.kind).toBe("popover");
    expect(fixture.updates.at(-1)).toEqual({ label: "Pulseline · OpenCode · busy" });
    expect(fixture.updates.every((patch) => Object.keys(patch).join() === "label")).toBe(true);
    expect(fixture.contributions[0]?.button.behavior).toBe(behavior);
    unmount();
    cleanup();
  });

  it("removes every registration and subscription during cleanup", async () => {
    // Given
    const fixture = fakeClient([
      agent({ id: "claude-1", provider: "claude", workspaceId: "workspace-1" }),
      agent({ id: "opencode-1", provider: "opencode", workspaceId: "workspace-2" }),
    ]);
    const cleanup = createPulselineRegistry(fixture.client, () => () => {});
    await Promise.resolve();

    // When
    cleanup();
    cleanup();

    // Then
    expect(fixture.unsubscribe).toHaveBeenCalledOnce();
    expect(fixture.removals).toHaveLength(2);
    expect(fixture.active.size).toBe(0);
  });

  it("contains a late initial-list rejection after cleanup", async () => {
    // Given
    let rejectList: (reason: Error) => void = () => {
      throw new Error("list promise was not initialized");
    };
    const list = new Promise<TestAgentPage>((_resolve, reject) => {
      rejectList = reject;
    });
    const fixture = fakeClient([], () => list);
    const unhandledReasons: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandledReasons.push(reason);
    process.on("unhandledRejection", onUnhandled);

    try {
      const cleanup = createPulselineRegistry(fixture.client, () => () => {});
      cleanup();

      // When
      rejectList(new Error("directory unavailable"));
      await setImmediate();
      cleanup();

      // Then
      expect(unhandledReasons).toEqual([]);
      expect(fixture.unsubscribe).toHaveBeenCalledOnce();
      expect(fixture.contributions).toEqual([]);
      expect(fixture.active.size).toBe(0);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
