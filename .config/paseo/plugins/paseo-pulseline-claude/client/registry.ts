// Composer-pill registry for Pulseline · Claude.
//
// Discovery, eligibility and registration only. Registration is deliberately
// cold: no per-agent daemon work happens here, because a directory of ninety
// agents would otherwise mean ninety subscriptions and ninety history fetches.
// A store is leased by the mounted icon or popover instead; this module only
// publishes the label of agents that already have one.
import type { PluginCleanup } from "@getpaseo/plugin";
import { createAbandonment } from "./abandon.ts";
import type { PluginButtonRegistration } from "@getpaseo/plugin/client";
import {
  PULSELINE_PILL_LABEL,
  PULSELINE_PILL_TITLE,
  pulselineButton,
  type PulselineUiParts,
} from "./descriptor.ts";
import { getPulseStore, subscribeToPulseStores } from "./store-registry.ts";

/** Registration namespace for every contribution this plugin owns. */
export const PULSELINE_NAMESPACE = "pulseline-claude";
export const PULSELINE_PILL_ID = `${PULSELINE_NAMESPACE}-pill`;
/** Names this plugin's daemon-side agent-directory subscription. */
export const PULSELINE_SUBSCRIPTION_ID = PULSELINE_NAMESPACE;
export { PULSELINE_PILL_LABEL, PULSELINE_PILL_TITLE };

/** Bootstrap page size; the host caps a directory page at 200 entries. */
const LIST_PAGE_LIMIT = 200;
/** One listing failure is worth retrying; a second means the directory is down. */
const BOOTSTRAP_ATTEMPTS = 2;

/** The agent fields eligibility needs. Structurally satisfied by the SDK snapshot. */
export interface PulselineAgent {
  readonly id: string;
  readonly workspaceId?: string | undefined;
  readonly archivedAt?: string | null | undefined;
  /** Present on real snapshots; Pulseline is provider-neutral and ignores it. */
  readonly provider?: string | undefined;
}

export type PulselineAgentUpdate =
  | { readonly kind: "upsert"; readonly agent: PulselineAgent }
  | { readonly kind: "remove"; readonly agentId: string };

export interface PulselineComposerPill {
  readonly id: string;
  readonly workspaceId: string;
  readonly agentId: string;
  readonly button: {
    readonly title: string;
    readonly icon: unknown;
    readonly label?: string | undefined;
    readonly behavior: { readonly kind: string };
  };
}

export interface PulselineAgentPage {
  readonly entries: readonly { readonly agent: PulselineAgent }[];
  readonly pageInfo: { readonly nextCursor: string | null; readonly hasMore: boolean };
}

export interface PulselineListOptions {
  readonly filter?: { readonly includeArchived?: boolean };
  readonly page?: { readonly limit: number; readonly cursor?: string };
  /** Pairs the local `agents.subscribe` listener with a daemon directory subscription. */
  readonly subscribe?: { readonly subscriptionId: string };
}

/**
 * The slice of `PluginClientContext` this registry uses. The entry passes the real
 * context here, so typecheck proves the host still satisfies this view.
 */
export interface PulselineHost {
  addComposerPill(contribution: PulselineComposerPill): PluginButtonRegistration;
  readonly paseo: {
    readonly agents: {
      list(options?: PulselineListOptions): Promise<PulselineAgentPage>;
      subscribe(handler: (update: PulselineAgentUpdate) => void): () => void;
    };
  };
}

export interface PulselineRegistryOptions {
  /** Icon and popover content Paseo renders inside its own pill chrome. */
  ui: PulselineUiParts;
  /**
   * Terminal bootstrap failure. Paseo's client contract calls the contribution
   * synchronously and demands a cleanup function back
   * (packages/app/src/plugins/evaluate.ts:396-403), so a failure discovered after
   * setup returns cannot fail the load. It is reported here instead of swallowed.
   */
  onBootstrapError?(error: unknown): void;
  /** Bounded retry for a failing directory listing. */
  bootstrapAttempts?: number;
}

/** Provider-neutral: any non-archived agent that belongs to a workspace. */
export function isPulselineEligible(agent: PulselineAgent): boolean {
  if (agent.archivedAt) return false;
  return typeof agent.workspaceId === "string" && agent.workspaceId.length > 0;
}

interface MountedPill {
  readonly workspaceId: string;
  readonly registration: PluginButtonRegistration;
  published: string;
}

function pillFor(
  ui: PulselineUiParts,
  workspaceId: string,
  agentId: string,
): PulselineComposerPill {
  return {
    id: PULSELINE_PILL_ID,
    workspaceId,
    agentId,
    button: pulselineButton(ui, { label: PULSELINE_PILL_LABEL }),
  };
}

export function createPulselinePills(
  host: PulselineHost,
  options: PulselineRegistryOptions,
): PluginCleanup {
  const mounted = new Map<string, MountedPill>();
  /** Agents a live event already decided; a slower bootstrap page must not undo it. */
  const decided = new Set<string>();
  /** Settles our own listing waits when the plugin goes away. */
  const abandonment = createAbandonment();
  let stopped = false;

  function unmount(agentId: string): void {
    const pill = mounted.get(agentId);
    if (!pill) return;
    mounted.delete(agentId);
    pill.registration.remove();
  }

  function mount(agent: PulselineAgent): void {
    if (stopped) return;
    if (!isPulselineEligible(agent)) {
      unmount(agent.id);
      return;
    }
    const workspaceId = agent.workspaceId as string;
    const existing = mounted.get(agent.id);
    if (existing?.workspaceId === workspaceId) return;
    // A pill belongs to one workspace+agent target, and the host rejects a
    // duplicate id in the same target: always release before re-registering.
    unmount(agent.id);
    const registration = host.addComposerPill(pillFor(options.ui, workspaceId, agent.id));
    if (stopped) {
      registration.remove();
      return;
    }
    mounted.set(agent.id, { workspaceId, registration, published: PULSELINE_PILL_LABEL });
    publish(agent.id);
  }

  /**
   * Registration is cold: the label is the plugin name until a mounted icon or
   * popover leases a store for that agent. Only then does the daemon see work.
   */
  function publish(agentId: string): void {
    const pill = mounted.get(agentId);
    if (!pill) return;
    const store = getPulseStore(agentId);
    // The store already rendered the animated label for the current phase; taking
    // it verbatim keeps the pill and the popover on the same frame.
    const label = store?.getView().label ?? PULSELINE_PILL_LABEL;
    if (label === pill.published) return;
    pill.published = label;
    // Label only: resupplying the behavior would close an open popover.
    pill.registration.update({ label });
  }

  const unwatchStores = subscribeToPulseStores(() => {
    for (const agentId of [...mounted.keys()]) publish(agentId);
  });

  // Subscribe before listing so no directory change slips through the bootstrap gap.
  const unsubscribe = host.paseo.agents.subscribe((update) => {
    if (stopped) return;
    decided.add(update.kind === "remove" ? update.agentId : update.agent.id);
    if (update.kind === "remove") unmount(update.agentId);
    else mount(update.agent);
  });

  function teardown(): void {
    if (stopped) return;
    stopped = true;
    abandonment.abandon();
    unwatchStores();
    unsubscribe();
    for (const agentId of [...mounted.keys()]) unmount(agentId);
    mounted.clear();
    decided.clear();
  }

  async function listOnce(): Promise<void> {
    let cursor: string | undefined;
    let first = true;
    do {
      const page = await abandonment.race(
        host.paseo.agents.list({
        filter: { includeArchived: false },
        page: cursor ? { limit: LIST_PAGE_LIMIT, cursor } : { limit: LIST_PAGE_LIMIT },
        // The daemon only streams agent_update to a session that asked for the
        // directory; the SDK's `agents.subscribe` is a local listener on top.
          ...(first ? { subscribe: { subscriptionId: PULSELINE_SUBSCRIPTION_ID } } : {}),
        }),
      );
      first = false;
      if (stopped) return;
      for (const entry of page.entries) {
        if (decided.has(entry.agent.id)) continue; // a newer live event already ruled
        mount(entry.agent);
      }
      cursor = page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;
    } while (cursor && !stopped);
  }

  /**
   * The bootstrap is awaited work, not a detached promise: a directory that never
   * answers must not leave a plugin that looks loaded and contributes nothing.
   */
  const bootstrap = (async () => {
    const attempts = Math.max(1, options.bootstrapAttempts ?? BOOTSTRAP_ATTEMPTS);
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts && !stopped; attempt += 1) {
      try {
        await listOnce();
        return;
      } catch (error) {
        lastError = error;
      }
    }
    if (stopped) return;
    teardown();
    options.onBootstrapError?.(
      lastError ?? new Error("Pulseline could not read the agent directory"),
    );
  })();

  return () => {
    // Teardown abandons our own waits, so the bootstrap continuation resumes even
    // when the host's listing never settles. Awaiting it is therefore safe, and a
    // terminal failure was already reported through onBootstrapError before this.
    teardown();
    const ignore = (): undefined => undefined;
    return bootstrap.then(ignore, ignore);
  };
}
