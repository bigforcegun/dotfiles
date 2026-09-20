import { usePaseo } from "@getpaseo/plugin/client";

/**
 * Reading the catalogue. Both lists are cursor-paged over an immutable sort, so
 * a row cannot move between pages and vanish from the walk.
 */

/**
 * The SDK's list payloads are zod-inferred across a bundled protocol copy, so
 * their element types collapse to `any` here. These describe the fields this
 * surface actually reads, verified against the daemon's fetch_workspaces /
 * fetch_agents response schemas.
 */
interface RawWorkspace {
  id: string;
  projectId: string;
  projectDisplayName: string;
  name: string;
  title?: string | null;
  status: string;
  workspaceKind: string;
}

interface RawAgentEntry {
  agent: {
    id: string;
    provider: string;
    status: string;
    title: string | null;
    workspaceId?: string;
    labels?: Record<string, string>;
    archivedAt?: string | null;
  };
  project?: {
    projectKey?: string;
    checkout?: { cwd?: string; mainRepoRoot?: string | null };
  };
}

/**
 * The subscriptions carry every change that matters; this only catches what a
 * dropped or reconnected stream would have lost.
 */
export const BACKSTOP_POLL_MS = 20000;

/** A parent chain longer than this is corrupt data, not a deep subagent tree. */

export type PaseoApi = ReturnType<typeof usePaseo>;

/** The daemon rejects page.limit above 200, so both lists are walked by cursor. */
const PAGE_LIMIT = 200;

/**
 * Cursor paging is only consistent over an ordering that cannot change while
 * the walk is in flight. The mutable defaults (activity_at / updated_at) would
 * let a row move between pages and vanish from the result; so would `name`,
 * which the user can edit. The daemon breaks ties on the immutable id.
 */
const WORKSPACE_SORT = [{ key: "project_id", direction: "asc" }] as const;

const AGENT_SORT = [{ key: "created_at", direction: "asc" }] as const;

/** Guards against a daemon that keeps handing back the same or no cursor. */
function nextCursor(info: PageInfo | undefined, seen: Set<string>, label: string): string | null {
  if (!info?.hasMore) return null;
  const cursor = info.nextCursor;
  if (!cursor) throw new Error(`${label}: hasMore with no cursor`);
  if (seen.has(cursor)) throw new Error(`${label}: repeated cursor ${cursor}`);
  seen.add(cursor);
  return cursor;
}

interface PageInfo {
  hasMore?: boolean;
  nextCursor?: string | null;
}

export async function fetchAllWorkspaces(paseo: PaseoApi): Promise<RawWorkspace[]> {
  const workspaces: RawWorkspace[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (;;) {
    const result = await paseo.workspaces.list({
      sort: [...WORKSPACE_SORT],
      page: { limit: PAGE_LIMIT, cursor },
    });
    workspaces.push(...((result.entries ?? []) as RawWorkspace[]));
    const next = nextCursor(result.pageInfo as PageInfo | undefined, seen, "workspaces.list");
    if (next === null) break;
    cursor = next;
  }
  return workspaces;
}

export async function fetchAllAgents(paseo: PaseoApi, includeArchived: boolean): Promise<RawAgentEntry[]> {
  const all: RawAgentEntry[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (;;) {
    const result = await paseo.agents.list({
      sort: [...AGENT_SORT],
      page: { limit: PAGE_LIMIT, cursor },
      ...(includeArchived ? { filter: { includeArchived: true } } : {}),
    });
    all.push(...((result.entries ?? []) as RawAgentEntry[]));
    const next = nextCursor(result.pageInfo as PageInfo | undefined, seen, "agents.list");
    if (next === null) break;
    cursor = next;
  }
  return all;
}
