import type { AgentUsage } from "@getpaseo/protocol/agent-types";
import type { PaseoAgentListOptions } from "@getpaseo/client";
import type { PluginButtonRegistration, PluginComposerPillContribution } from "@getpaseo/plugin/client";
import type { RegistryTimelineSource } from "./controller";
import { createPulselinePresentation, type PulselinePresentation } from "./pill";
import type { ScheduleRefresh } from "./runtime";

export type { ScheduleRefresh } from "./runtime";

export interface RegistryAgent {
  readonly id: string;
  readonly provider: string;
  readonly workspaceId?: string | undefined;
  readonly archivedAt?: string | null | undefined;
  readonly activeTurn?: { readonly turnId: string; readonly startedAt: string | null } | null | undefined;
  readonly lastUsage?: AgentUsage | undefined;
}

export type RegistryAgentUpdate =
  | { readonly kind: "upsert"; readonly agent: RegistryAgent }
  | { readonly kind: "remove"; readonly agentId: string };

export interface RegistryHost {
  addComposerPill(contribution: PluginComposerPillContribution): PluginButtonRegistration;
  readonly paseo: {
    readonly agents: {
      list(options?: PaseoAgentListOptions): Promise<{
        readonly entries: readonly { readonly agent: RegistryAgent }[];
        readonly pageInfo: { readonly hasMore: boolean; readonly nextCursor: string | null };
      }>;
      subscribe(handler: (update: RegistryAgentUpdate) => void): () => void;
      ref(agentId: string): { readonly timeline: RegistryTimelineSource };
    };
  };
}

export type ObservePresentation = (presentation: PulselinePresentation) => void;

interface MountedAgent {
  readonly workspaceId: string;
  readonly registration: PluginButtonRegistration;
  readonly presentation: PulselinePresentation;
}

const DISPLAY_NAME = "Pulseline · OpenCode";
const PILL_LABEL = DISPLAY_NAME;
const REGISTRATION_ID = "paseo-pulseline-oc-pulseline";
const DIRECTORY_SUBSCRIPTION_ID = "paseo-pulseline-oc";
const PAGE_LIMIT = 200;

const scheduleRefresh: ScheduleRefresh = (callback) => {
  const timer = setInterval(callback, 1_000);
  return () => clearInterval(timer);
};

export function createPulselineRegistry(
  host: RegistryHost,
  schedule: ScheduleRefresh = scheduleRefresh,
  observePresentation: ObservePresentation = () => {},
): () => void {
  const mounted = new Map<string, MountedAgent>();
  const changedDuringInitialList = new Set<string>();
  let initialListPending = true;
  let stopped = false;

  const remove = (agentId: string) => {
    const current = mounted.get(agentId);
    if (!current) return;
    mounted.delete(agentId);
    current.presentation.dispose();
    current.registration.remove();
  };

  const sync = (agent: RegistryAgent) => {
    if (stopped || agent.archivedAt || !agent.workspaceId) {
      remove(agent.id);
      return;
    }
    const current = mounted.get(agent.id);
    if (current?.workspaceId === agent.workspaceId) {
      current.presentation.updateAgent(agent);
      return;
    }
    remove(agent.id);
    let publishLabel = (_label: string) => {};
    const presentation = createPulselinePresentation({
      label: PILL_LABEL,
      agent,
      timeline: () => host.paseo.agents.ref(agent.id).timeline,
      schedule,
      onSnapshot: ({ label }) => publishLabel(label),
    });
    const registration = host.addComposerPill({
      id: REGISTRATION_ID,
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      button: {
        title: DISPLAY_NAME,
        label: presentation.getSnapshot().label,
        icon: presentation.Icon,
        behavior: { kind: "popover", Content: presentation.Content },
      },
    });
    let published = presentation.getSnapshot().label;
    publishLabel = (label) => {
      if (label === published) return;
      published = label;
      registration.update({ label });
    };
    publishLabel(presentation.getSnapshot().label);
    mounted.set(agent.id, { workspaceId: agent.workspaceId, registration, presentation });
    observePresentation(presentation);
  };

  const unsubscribe = host.paseo.agents.subscribe((update) => {
    if (initialListPending) {
      changedDuringInitialList.add(update.kind === "upsert" ? update.agent.id : update.agentId);
    }
    switch (update.kind) {
      case "upsert":
        sync(update.agent);
        break;
      case "remove":
        remove(update.agentId);
        break;
    }
  });
  const listInitial = async () => {
    let cursor: string | undefined;
    let first = true;
    while (!stopped) {
      const page = await host.paseo.agents.list({
        filter: { includeArchived: false },
        page: cursor ? { limit: PAGE_LIMIT, cursor } : { limit: PAGE_LIMIT },
        ...(first ? { subscribe: { subscriptionId: DIRECTORY_SUBSCRIPTION_ID } } : {}),
      });
      for (const { agent } of page.entries) {
        if (!changedDuringInitialList.has(agent.id)) sync(agent);
      }
      const nextCursor = page.pageInfo.nextCursor;
      if (!page.pageInfo.hasMore || !nextCursor) return;
      cursor = nextCursor;
      first = false;
    }
  };
  void listInitial().then(
    () => {
      initialListPending = false;
      changedDuringInitialList.clear();
    },
    () => {
      initialListPending = false;
      changedDuringInitialList.clear();
    },
  );

  return () => {
    if (stopped) return;
    stopped = true;
    unsubscribe();
    for (const agentId of [...mounted.keys()]) remove(agentId);
  };
}
