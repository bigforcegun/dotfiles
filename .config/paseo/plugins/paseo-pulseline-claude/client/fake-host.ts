// Test double for the host surface this plugin actually uses. Stage 2 keeps it
// hand-written: the real PluginClientContext is far wider than the registry needs,
// and `createPulselinePills` accepts the narrow `PulselineHost` view instead.
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createFakeAgent, type FakeAgent, type FakeAgentState } from "./fake-agent.ts";
import type {
  PulselineAgent,
  PulselineAgentUpdate,
  PulselineComposerPill,
  PulselineHost,
} from "./registry.ts";

export interface FakeRegistrationRecord {
  readonly contribution: PulselineComposerPill;
  /** Latest label the plugin published through `update`. */
  label: string | undefined;
  /** Every patch the plugin published, in order. */
  readonly patches: Record<string, unknown>[];
  updates: number;
  removed: boolean;
}

export interface FakeHost extends PulselineHost {
  /** Registrations the host still considers mounted. */
  readonly live: Map<string, FakeRegistrationRecord>;
  /** Every registration ever created, in order. */
  readonly created: FakeRegistrationRecord[];
  readonly openSubscriptions: () => number;
  readonly listCalls: () => number;
  emit(update: PulselineAgentUpdate): void;
  /** The fake handle behind `paseo.agents.ref(id)`, created on first use. */
  agent(agentId: string): FakeAgent;
  readonly refs: () => number;
  readonly listOptions: () => readonly unknown[];
  /** Raw host promises still pending; the plugin cannot cancel these. */
  readonly pendingListPromises: () => number;
  /** Resolves the pending `agents.list()` bootstrap. */
  settleList(): Promise<void>;
  asPluginClientContext(): PluginClientContext;
}

export interface FakeHostOptions {
  agents?: readonly PulselineAgent[];
  /** Split the bootstrap listing into pages to exercise cursor paging. */
  pageSize?: number;
  /** Hold `agents.list()` until `settleList()` runs. */
  deferList?: boolean;
  /** Seed state for the handles `paseo.agents.ref(id)` returns. */
  agentStates?: Record<string, FakeAgentState>;
  /** Reject the first N `agents.list()` calls. */
  failListTimes?: number;
  /** Throw from the first N `addComposerPill()` calls. */
  failRegistrationTimes?: number;
  /** Never answer `agents.list()`: reproduces a daemon that stops responding. */
  hangList?: boolean;
}

function targetKey(pill: PulselineComposerPill): string {
  return `${pill.workspaceId}::${pill.agentId}::${pill.id}`;
}

export function createFakeHost(options: FakeHostOptions = {}): FakeHost {
  const agents = options.agents ?? [];
  const pageSize = options.pageSize ?? agents.length + 1;
  const live = new Map<string, FakeRegistrationRecord>();
  const created: FakeRegistrationRecord[] = [];
  const handlers = new Set<(update: PulselineAgentUpdate) => void>();
  const handles = new Map<string, FakeAgent>();
  const seenListOptions: unknown[] = [];
  let listCalls = 0;
  let listFailures = options.failListTimes ?? 0;
  let pendingList = 0;
  let registrationFailures = options.failRegistrationTimes ?? 0;
  let release: (() => void) | undefined;
  const gate = options.deferList
    ? new Promise<void>((resolve) => {
        release = resolve;
      })
    : Promise.resolve();

  const host: FakeHost = {
    live,
    created,
    openSubscriptions: () => handlers.size,
    listCalls: () => listCalls,
    emit(update) {
      for (const handler of [...handlers]) handler(update);
    },
    agent(agentId) {
      const existing = handles.get(agentId);
      if (existing) return existing;
      const created = createFakeAgent(agentId, options.agentStates?.[agentId] ?? {});
      handles.set(agentId, created);
      return created;
    },
    refs: () => handles.size,
    listOptions: () => seenListOptions,
    pendingListPromises: () => pendingList,
    async settleList() {
      release?.();
      await gate;
      // Drain the registry's sequential paging loop: keep yielding until it
      // stops asking for pages, so assertions never race a pending await.
      let previous = -1;
      while (previous !== listCalls) {
        previous = listCalls;
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    asPluginClientContext() {
      // The registry only reaches for `addComposerPill` and `paseo.agents`.
      return host as unknown as PluginClientContext;
    },
    addComposerPill(contribution) {
      if (registrationFailures > 0) {
        registrationFailures -= 1;
        throw new Error(`registration refused: ${contribution.agentId}`);
      }
      const key = targetKey(contribution);
      if (live.has(key)) {
        throw new Error(`Duplicate composer pill registration: ${key}`);
      }
      const record: FakeRegistrationRecord = {
        contribution,
        label: contribution.button.label,
        patches: [],
        updates: 0,
        removed: false,
      };
      live.set(key, record);
      created.push(record);
      return {
        update(patch) {
          if (record.removed) return;
          record.patches.push({ ...patch });
          if (patch.label !== undefined) record.label = patch.label;
          record.updates += 1;
        },
        remove() {
          if (record.removed) return;
          record.removed = true;
          live.delete(key);
        },
      };
    },
    paseo: {
      agents: {
        async list(listOptions) {
          listCalls += 1;
          seenListOptions.push(listOptions);
          await gate;
          if (options.hangList) {
            pendingList += 1;
            await new Promise<void>(() => {});
          }
          if (listFailures > 0) {
            listFailures -= 1;
            throw new Error("agent directory unavailable");
          }
          const cursor = listOptions?.page?.cursor;
          const start = cursor ? Number(cursor) : 0;
          const limit = listOptions?.page?.limit ?? pageSize;
          const slice = agents.slice(start, start + Math.min(limit, pageSize));
          const next = start + slice.length;
          const hasMore = next < agents.length;
          return {
            entries: slice.map((agent) => ({ agent })),
            pageInfo: { nextCursor: hasMore ? String(next) : null, hasMore },
          };
        },
        subscribe(handler) {
          handlers.add(handler);
          return () => {
            handlers.delete(handler);
          };
        },
      },
    },
  };
  return host;
}
