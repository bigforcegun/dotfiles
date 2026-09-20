import type { AgentUsage } from "@getpaseo/protocol/agent-types";
import type { PaseoAgentListOptions } from "@getpaseo/client";
import type { PluginButton, PluginButtonRegistration, PluginComposerPillContribution } from "@getpaseo/plugin/client";
import type { RegistryTimelineSource } from "./controller";
import { createAbandonment } from "./abandon";
import { buildComposerPulseLabel, createPulselinePresentation, type PulselinePresentation } from "./pill";
import { PULSE_INTERVAL_MS, type ScheduleRefresh } from "./runtime";

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

export interface RegistryCleanup {
  (): void;
  pendingWaits(): number;
}

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
  const timer = setInterval(callback, PULSE_INTERVAL_MS);
  return () => clearInterval(timer);
};

export function createPulselineRegistry(
  host: RegistryHost,
  schedule: ScheduleRefresh = scheduleRefresh,
  observePresentation: ObservePresentation = () => {},
): RegistryCleanup {
  const mounted = new Map<string, MountedAgent>();
  const changedDuringInitialList = new Set<string>();
  const abandonment = createAbandonment();
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
      onSnapshot: (snapshot) => publishLabel(buildComposerPulseLabel(snapshot)),
    });
    const button = {
      title: DISPLAY_NAME,
      label: buildComposerPulseLabel(presentation.getSnapshot()),
      Label: presentation.Label,
      icon: presentation.Icon,
      behavior: { kind: "popover", Content: presentation.Content },
    } satisfies PluginButton & { readonly Label: typeof presentation.Label };
    const registration = host.addComposerPill({
      id: REGISTRATION_ID,
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      button,
    });
    let published = buildComposerPulseLabel(presentation.getSnapshot());
    publishLabel = (label) => {
      if (label === published) return;
      published = label;
      registration.update({ label });
    };
    publishLabel(buildComposerPulseLabel(presentation.getSnapshot()));
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
  const finishInitialList = () => {
    initialListPending = false;
    changedDuringInitialList.clear();
  };
  const listInitial = (cursor?: string, first = true): void => {
    if (stopped) return;
    abandonment.race(
      host.paseo.agents.list({
        filter: { includeArchived: false },
        page: cursor ? { limit: PAGE_LIMIT, cursor } : { limit: PAGE_LIMIT },
        ...(first ? { subscribe: { subscriptionId: DIRECTORY_SUBSCRIPTION_ID } } : {}),
      }),
      {
        value(page) {
          if (stopped) return;
          for (const { agent } of page.entries) {
            if (!changedDuringInitialList.has(agent.id)) sync(agent);
          }
          const nextCursor = page.pageInfo.nextCursor;
          if (page.pageInfo.hasMore && nextCursor) listInitial(nextCursor, false);
          else finishInitialList();
        },
        error: finishInitialList,
      },
    );
  };
  listInitial();

  return Object.assign(
    () => {
      if (stopped) return;
      stopped = true;
      abandonment.abandon();
      unsubscribe();
      for (const agentId of [...mounted.keys()]) remove(agentId);
    },
    { pendingWaits: abandonment.pendingCount },
  );
}
