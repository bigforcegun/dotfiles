import type { PaseoAgentListOptions } from "@getpaseo/client";
import type { PluginButtonRegistration, PluginComposerPillContribution } from "@getpaseo/plugin/client";
import { setImmediate } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { createPulselineRegistry, type RegistryAgent, type RegistryAgentUpdate, type RegistryHost } from "./registry";

vi.mock("react-native", () => ({
  StyleSheet: { create: <Styles extends object>(styles: Styles) => styles },
  Text: "Text",
  View: "View",
}));

class PagedDirectoryHost implements RegistryHost {
  readonly agents: readonly RegistryAgent[];
  readonly listCalls: PaseoAgentListOptions[] = [];
  readonly registrations = new Set<string>();
  #directoryActive = false;
  #handler: ((update: RegistryAgentUpdate) => void) | undefined;

  constructor(agents: readonly RegistryAgent[]) {
    this.agents = agents;
  }

  readonly paseo = { agents: {
    list: async (options: PaseoAgentListOptions = {}) => {
      this.listCalls.push(options);
      if (options.subscribe) this.#directoryActive = true;
      const offset = Number(options.page?.cursor ?? 0);
      const limit = options.page?.limit ?? 200;
      const end = Math.min(offset + limit, this.agents.length);
      return {
        requestId: `page-${offset}`,
        ...(options.subscribe ? { subscriptionId: options.subscribe.subscriptionId ?? "generated" } : {}),
        entries: this.agents.slice(offset, end).map((agent) => ({ agent })),
        pageInfo: { hasMore: end < this.agents.length, nextCursor: end < this.agents.length ? String(end) : null, prevCursor: null },
      };
    },
    subscribe: (handler: (update: RegistryAgentUpdate) => void) => {
      this.#handler = handler;
      return () => { if (this.#handler === handler) this.#handler = undefined; };
    },
    ref: () => ({ timeline: {
      subscribe: () => Object.assign(() => {}, { ready: Promise.resolve() }),
      refetch: async () => ({ epoch: "cold", reset: false, gap: false, hasOlder: false, startCursor: null, entries: [], error: null }),
    } }),
  } };

  addComposerPill(contribution: PluginComposerPillContribution): PluginButtonRegistration {
    const key = `${contribution.workspaceId}:${contribution.agentId}`;
    this.registrations.add(key);
    return { update() {}, remove: () => { this.registrations.delete(key); } };
  }

  emit(update: RegistryAgentUpdate): void {
    if (this.#directoryActive) this.#handler?.(update);
  }
}

describe("Pulseline paginated directory", () => {
  it("activates the named subscription and registers every paginated agent", async () => {
    // Given
    const agents = Array.from({ length: 201 }, (_, index): RegistryAgent => ({ id: `agent-${index}`, provider: "opencode", workspaceId: `workspace-${index}` }));
    const coldHost = new PagedDirectoryHost([]);
    const coldHandler = vi.fn();
    coldHost.paseo.agents.subscribe(coldHandler);
    coldHost.emit({ kind: "remove", agentId: "absent" });
    expect(coldHandler).not.toHaveBeenCalled();
    const host = new PagedDirectoryHost(agents);

    // When
    const cleanup = createPulselineRegistry(host, () => () => {});
    await setImmediate();

    // Then
    expect(host.registrations.size).toBe(201);
    expect(host.listCalls).toEqual([
      { filter: { includeArchived: false }, page: { limit: 200 }, subscribe: { subscriptionId: "paseo-pulseline-oc" } },
      { filter: { includeArchived: false }, page: { limit: 200, cursor: "200" } },
    ]);
    cleanup();
  });
});
