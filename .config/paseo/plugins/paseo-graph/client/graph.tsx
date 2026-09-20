import { type PluginSurfaceProps, usePaseo } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  PanResponder,
  Pressable,
  Text,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";

/* ------------------------------------------------------------------ model */

type NodeKind = "project" | "workspace" | "agent";

interface GraphNode {
  id: string;
  kind: NodeKind;
  refId: string;
  label: string;
  sublabel: string;
  status: string;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: "contains" | "spawn";
}

interface WorkspaceInfo {
  id: string;
  projectId: string;
  projectName: string;
  label: string;
  status: string;
  kind: string;
}

interface ProjectInfo {
  id: string;
  name: string;
  key: string | null;
  rootPath: string | null;
}

/**
 * The live catalogue can repeat an id across cursor pages, which would emit
 * duplicate React keys. Last write wins.
 */
function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) byId.set(item.id, item);
  return [...byId.values()];
}

interface AgentInfo {
  id: string;
  label: string;
  provider: string;
  status: string;
  workspaceId: string | null;
  parentId: string | null;
  archived: boolean;
  projectKey: string | null;
  projectRoot: string | null;
}

/**
 * Paseo records agent parentage as an ordinary label rather than a snapshot
 * field, which is why `agents.list()` looks like it has no parent link.
 */
const PARENT_AGENT_ID_LABEL = "paseo.parent-agent-id";

function parentFromLabels(labels: Record<string, string> | undefined): string | null {
  const raw = labels?.[PARENT_AGENT_ID_LABEL];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

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

const projectNodeId = (id: string) => `project:${id}`;
const workspaceNodeId = (id: string) => `workspace:${id}`;
const agentNodeId = (id: string) => `agent:${id}`;

/**
 * Paseo never records "this workspace was created by that agent", and a parent
 * sitting elsewhere does not prove it: an agent can be started in any existing
 * workspace. Only the recorded parent-agent link is drawn.
 */
function buildGraph(
  rawWorkspaces: WorkspaceInfo[],
  rawAgents: AgentInfo[],
  projects: ProjectInfo[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const workspaces = dedupeById(rawWorkspaces);
  const agents = dedupeById(rawAgents);
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const seenProjects = new Set<string>();
  const agentById = new Map<string, AgentInfo>();
  const knownWorkspaces = new Set(workspaces.map((workspace) => workspace.id));

  const addProjectNode = (projectId: string, name: string) => {
    if (seenProjects.has(projectId)) return;
    seenProjects.add(projectId);
    nodes.set(projectNodeId(projectId), {
      id: projectNodeId(projectId),
      kind: "project",
      refId: projectId,
      label: name,
      sublabel: "project",
      status: "project",
    });
  };

  for (const workspace of workspaces) {
    addProjectNode(workspace.projectId, workspace.projectName);
    nodes.set(workspaceNodeId(workspace.id), {
      id: workspaceNodeId(workspace.id),
      kind: "workspace",
      refId: workspace.id,
      label: workspace.label,
      sublabel: workspace.kind,
      status: workspace.status,
    });
    edges.push({
      id: `c:${workspace.projectId}:${workspace.id}`,
      from: projectNodeId(workspace.projectId),
      to: workspaceNodeId(workspace.id),
      kind: "contains",
    });
  }

  // Every project the daemon knows, including ones whose workspaces are all
  // archived - otherwise their agents would have nothing to hang from.
  const projectIdByKey = new Map<string, string>();
  const projectIdByRoot = new Map<string, string>();
  for (const project of projects) {
    addProjectNode(project.id, project.name);
    if (project.key) projectIdByKey.set(project.key, project.id);
    if (project.rootPath) projectIdByRoot.set(project.rootPath, project.id);
  }

  for (const agent of agents) {
    agentById.set(agent.id, agent);
    nodes.set(agentNodeId(agent.id), {
      id: agentNodeId(agent.id),
      kind: "agent",
      refId: agent.id,
      label: agent.label,
      sublabel: agent.provider,
      status: agent.archived ? "archived" : agent.status,
    });
  }

  for (const agent of agents) {
    const parent = agent.parentId ? agentById.get(agent.parentId) : undefined;

    if (agent.workspaceId && knownWorkspaces.has(agent.workspaceId)) {
      edges.push({
        id: `c:${agent.workspaceId}:${agent.id}`,
        from: workspaceNodeId(agent.workspaceId),
        to: agentNodeId(agent.id),
        kind: "contains",
      });
    } else {
      // The daemon only lists active workspaces, so an archived agent's
      // workspace is usually gone. Its project is still known by key, which
      // keeps the agent attached instead of floating free.
      // Two exact lookups, no guessing: the project key the agent reports, then
      // its repository root. Either identifies the project outright.
      const projectId =
        (agent.projectKey ? projectIdByKey.get(agent.projectKey) : undefined) ??
        (agent.projectRoot ? projectIdByRoot.get(agent.projectRoot) : undefined);
      if (projectId && seenProjects.has(projectId)) {
        edges.push({
          id: `c:${projectId}:${agent.id}`,
          from: projectNodeId(projectId),
          to: agentNodeId(agent.id),
          kind: "contains",
        });
      }
    }

    if (!parent) continue;
    edges.push({
      id: `s:${parent.id}:${agent.id}`,
      from: agentNodeId(parent.id),
      to: agentNodeId(agent.id),
      kind: "spawn",
    });
  }

  const dedupedEdges = new Map<string, GraphEdge>();
  for (const edge of edges) dedupedEdges.set(edge.id, edge);
  return { nodes: [...nodes.values()], edges: [...dedupedEdges.values()] };
}

/**
 * The subscriptions carry every change that matters; this only catches what a
 * dropped or reconnected stream would have lost.
 */
const BACKSTOP_POLL_MS = 20000;

/** A parent chain longer than this is corrupt data, not a deep subagent tree. */
const SIGNAL_MAX_DEPTH = 32;

interface SignalChains {
  /** Distance from the running chat, in hops. */
  edges: Map<string, number>;
  nodes: Map<string, number>;
}

/**
 * What a signal touches for every running chat: the whole chain from the
 * project at the top, through its workspace and each parent agent, down to the
 * chat itself - edges and the nodes they join. Subagents nest arbitrarily
 * deep, so the chain is walked rather than assumed to be a fixed number of
 * hops. The number kept per entry is its distance from the chat, which is what
 * later gives the crest its direction. An edge at depth d runs from the node
 * at depth d + 1 to the node at depth d, so both scales agree.
 *
 * Only incoming edges are followed, so the walk can only ever go upwards: a
 * project has none, which is where it stops.
 */
function signalChains(edges: GraphEdge[], activeNodeIds: ReadonlySet<string>): SignalChains {
  const chains: SignalChains = { edges: new Map(), nodes: new Map() };
  if (activeNodeIds.size === 0) return chains;

  const incoming = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const list = incoming.get(edge.to);
    if (list) list.push(edge);
    else incoming.set(edge.to, [edge]);
  }
  const record = (map: Map<string, number>, id: string, depth: number) => {
    const known = map.get(id);
    if (known === undefined || depth < known) map.set(id, depth);
  };

  for (const start of activeNodeIds) {
    record(chains.nodes, start, 0);
    const queue: Array<{ id: string; depth: number }> = [{ id: start, depth: 0 }];
    const visited = new Set<string>([start]);
    while (queue.length > 0) {
      const current = queue.pop();
      if (current === undefined) break;
      if (current.depth >= SIGNAL_MAX_DEPTH) continue;
      for (const edge of incoming.get(current.id) ?? []) {
        record(chains.edges, edge.id, current.depth);
        record(chains.nodes, edge.from, current.depth + 1);
        if (visited.has(edge.from)) continue;
        visited.add(edge.from);
        queue.push({ id: edge.from, depth: current.depth + 1 });
      }
    }
  }
  return chains;
}

type PaseoApi = ReturnType<typeof usePaseo>;

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

async function fetchAllWorkspaces(paseo: PaseoApi): Promise<RawWorkspace[]> {
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

async function fetchAllAgents(paseo: PaseoApi, includeArchived: boolean): Promise<RawAgentEntry[]> {
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

/* -------------------------------------------------------------------- live */

/**
 * The daemon streams these already, for the host's own UI. The SDK's
 * `subscribe` is a listener on that existing stream, not a new connection, so
 * one listener covers every node in the graph: no per-agent subscription, no
 * extra traffic, and no polling interval to shorten.
 */
interface AgentUpdateLike {
  kind: "upsert" | "remove";
  agent?: { id?: string; status?: string };
  agentId?: string;
}

interface WorkspaceUpdateLike {
  kind: "upsert" | "remove";
  workspace?: { id?: string };
  id?: string;
}

type StructuralNotice = (id: string | undefined, kind: "upsert" | "remove") => void;

const EMPTY_STATUS: ReadonlyMap<string, string> = new Map();

/**
 * Live agent status, keyed by agent id. A running turn can emit many updates
 * carrying the same status, so repeats are dropped here rather than one render
 * further on - returning the previous map makes React skip the render outright.
 */
function useLiveAgentStatus(paseo: PaseoApi, notice: StructuralNotice): ReadonlyMap<string, string> {
  const [statuses, setStatuses] = useState<ReadonlyMap<string, string>>(EMPTY_STATUS);
  const noticeRef = useRef(notice);
  noticeRef.current = notice;

  useEffect(() => {
    // A host older than the SDK this compiles against has no stream to join.
    // The catalogue poll still carries status, just later.
    if (typeof paseo.agents?.subscribe !== "function") return;
    return paseo.agents.subscribe((raw: unknown) => {
      const update = raw as AgentUpdateLike;
      if (update.kind === "remove") {
        const removed = update.agentId;
        if (!removed) return;
        setStatuses((prev) => {
          if (!prev.has(removed)) return prev;
          const next = new Map(prev);
          next.delete(removed);
          return next;
        });
        noticeRef.current(removed, "remove");
        return;
      }
      const id = update.agent?.id;
      const status = update.agent?.status;
      if (!id || typeof status !== "string") return;
      setStatuses((prev) => (prev.get(id) === status ? prev : new Map(prev).set(id, status)));
      noticeRef.current(id, "upsert");
    });
  }, [paseo]);

  return statuses;
}

/* ----------------------------------------------------------------- physics */

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const REPULSION = 324000;
/** Also the spatial grid's cell size: beyond it repulsion is under 1% of the
 * spring force, so ignoring those pairs costs nothing and saves the O(n²). */
const REPULSION_RANGE = 1600;
const REPULSION_RANGE_SQUARED = REPULSION_RANGE * REPULSION_RANGE;
const SPRING = 0.035;
const CONTAINS_LENGTH = 572;
const SPAWN_LENGTH = 900;
const GRAVITY = 0.002;
const DAMPING = 0.9;
const MAX_STEP = 22;
/** Halves how far a node travels per frame; the layout drifts into place
 * instead of snapping there. */
const MOTION_SCALE = 0.5;
const ALPHA_DECAY = 0.988;
const ALPHA_FLOOR = 0.004;

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function simulate(
  bodies: Map<string, Body>,
  nodes: GraphNode[],
  edges: GraphEdge[],
  alpha: number,
  pinned: string | null,
): void {
  // Bucket the bodies so repulsion only compares a node with its own cell and
  // the four forward neighbours. Every pair closer than one cell width is still
  // visited exactly once, and the distant ones are never touched.
  const grid = new Map<string, Body[]>();
  for (const node of nodes) {
    const body = bodies.get(node.id);
    if (!body) continue;
    const key = `${Math.floor(body.x / REPULSION_RANGE)},${Math.floor(body.y / REPULSION_RANGE)}`;
    const cell = grid.get(key);
    if (cell) cell.push(body);
    else grid.set(key, [body]);
    body.vx -= body.x * GRAVITY * alpha;
    body.vy -= body.y * GRAVITY * alpha;
  }

  const repel = (a: Body, b: Body) => {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    let distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < 0.01) {
      dx = 0.7;
      dy = -0.7;
      distanceSquared = 0.98;
    }
    if (distanceSquared > REPULSION_RANGE_SQUARED) return;
    const distance = Math.sqrt(distanceSquared);
    const force = (REPULSION / distanceSquared) * alpha;
    a.vx += (dx / distance) * force;
    a.vy += (dy / distance) * force;
    b.vx -= (dx / distance) * force;
    b.vy -= (dy / distance) * force;
  };

  const FORWARD_NEIGHBOURS = [
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];
  for (const [key, cell] of grid) {
    for (let i = 0; i < cell.length; i += 1) {
      for (let j = i + 1; j < cell.length; j += 1) repel(cell[i], cell[j]);
    }
    const [cx, cy] = key.split(",").map(Number);
    for (const [ox, oy] of FORWARD_NEIGHBOURS) {
      const other = grid.get(`${cx + ox},${cy + oy}`);
      if (!other) continue;
      for (const a of cell) for (const b of other) repel(a, b);
    }
  }

  for (const edge of edges) {
    const a = bodies.get(edge.from);
    const b = bodies.get(edge.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const rest = edge.kind === "spawn" ? SPAWN_LENGTH : CONTAINS_LENGTH;
    const force = (distance - rest) * SPRING * alpha;
    a.vx += (dx / distance) * force;
    a.vy += (dy / distance) * force;
    b.vx -= (dx / distance) * force;
    b.vy -= (dy / distance) * force;
  }

  for (const node of nodes) {
    const body = bodies.get(node.id);
    if (!body) continue;
    if (node.id === pinned) {
      body.vx = 0;
      body.vy = 0;
      continue;
    }
    body.vx *= DAMPING;
    body.vy *= DAMPING;
    body.x += clamp(body.vx, -MAX_STEP, MAX_STEP) * MOTION_SCALE;
    body.y += clamp(body.vy, -MAX_STEP, MAX_STEP) * MOTION_SCALE;
  }
}


/* ------------------------------------------------------------ radial tree */

/** World units between consecutive rings. */
const RING_STEP = 600;

/**
 * The graph is already a forest: a workspace belongs to its project, and an
 * agent hangs off its recorded parent agent when there is one, otherwise off its
 * workspace. Resolving that single primary parent gives a tree that can be laid
 * out once, deterministically, with no physics at all.
 */
function radialLayout(nodes: GraphNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> {
  const known = new Set(nodes.map((node) => node.id));
  const parent = new Map<string, string>();

  for (const edge of edges) {
    if (edge.kind !== "contains") continue;
    if (!known.has(edge.from) || !known.has(edge.to)) continue;
    if (!parent.has(edge.to)) parent.set(edge.to, edge.from);
  }
  // A subagent hangs off its parent agent, not off the shared workspace.
  for (const edge of edges) {
    if (edge.kind !== "spawn") continue;
    if (!edge.to.startsWith("agent:")) continue;
    if (!known.has(edge.from) || !known.has(edge.to)) continue;
    parent.set(edge.to, edge.from);
  }
  // Data is not guaranteed acyclic; a cycle would hang the walks below. Chains
  // already proven to reach a root are memoised, so this stays near-linear on
  // long lineages instead of quadratic.
  const rootedAt = new Set<string>();
  for (const start of [...parent.keys()]) {
    const path: string[] = [];
    const onPath = new Set<string>();
    let current: string | undefined = start;
    while (current !== undefined && !rootedAt.has(current)) {
      if (onPath.has(current)) {
        parent.delete(current);
        break;
      }
      onPath.add(current);
      path.push(current);
      current = parent.get(current);
    }
    for (const id of path) rootedAt.add(id);
  }

  const children = new Map<string, string[]>();
  for (const [child, owner] of parent) {
    const list = children.get(owner);
    if (list) list.push(child);
    else children.set(owner, [child]);
  }
  for (const list of children.values()) list.sort();

  const roots = nodes
    .filter((node) => !parent.has(node.id))
    .map((node) => node.id)
    .sort();

  // Both walks are iterative: a deep parent chain would blow the call stack,
  // and agent lineages have no depth limit.
  const weight = new Map<string, number>();
  for (const root of roots) {
    const stack: Array<{ id: string; expanded: boolean }> = [{ id: root, expanded: false }];
    while (stack.length > 0) {
      const frame = stack.pop();
      if (frame === undefined) break;
      const kids = children.get(frame.id) ?? [];
      if (!frame.expanded && kids.length > 0) {
        stack.push({ id: frame.id, expanded: true });
        for (const kid of kids) stack.push({ id: kid, expanded: false });
        continue;
      }
      weight.set(
        frame.id,
        kids.length === 0 ? 1 : kids.reduce((sum, kid) => sum + (weight.get(kid) ?? 1), 0),
      );
    }
  }
  const totalWeight = roots.reduce((sum, id) => sum + (weight.get(id) ?? 1), 0) || 1;

  const positions = new Map<string, { x: number; y: number }>();
  const pending: Array<{ id: string; depth: number; start: number; span: number }> = [];
  let rootCursor = 0;
  for (const id of roots) {
    const share = ((weight.get(id) ?? 1) / totalWeight) * Math.PI * 2;
    pending.push({ id, depth: 0, start: rootCursor, span: share });
    rootCursor += share;
  }
  while (pending.length > 0) {
    const frame = pending.pop();
    if (frame === undefined) break;
    const angle = frame.start + frame.span / 2;
    const radius = RING_STEP * (frame.depth + 1);
    positions.set(frame.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    const kids = children.get(frame.id) ?? [];
    if (kids.length === 0) continue;
    const own = weight.get(frame.id) ?? 1;
    let cursor = frame.start;
    for (const kid of kids) {
      const share = ((weight.get(kid) ?? 1) / own) * frame.span;
      pending.push({ id: kid, depth: frame.depth + 1, start: cursor, span: share });
      cursor += share;
    }
  }
  return positions;
}

/* -------------------------------------------------------------- rendering */

const RADIUS: Record<NodeKind, number> = { project: 20, workspace: 13, agent: 9 };

/** Dots grow far slower than distances, so zooming in separates nodes instead
 * of covering the screen with them. */
function nodeRadius(kind: NodeKind, scale: number): number {
  return Math.max(3, RADIUS[kind] * Math.pow(scale, 0.3));
}

const INITIAL_SCALE = 0.2;
/** `userSelect` is a web-only style; React Native's ViewStyle has no such key. */
const NO_TEXT_SELECTION = { userSelect: "none" } as unknown as ViewStyle;

const MIN_SCALE = 0.1;
const MAX_SCALE = 16;
const FIT_MARGIN = 120;

/**
 * Zooming out must never push the view back in. Framing a deep tree can leave
 * the scale below the usual floor, and clamping to that floor would enlarge the
 * graph instead of shrinking it - so the floor follows the current scale down.
 * Outside a fit the range is the ordinary MIN_SCALE..MAX_SCALE.
 */
function applyZoom(current: number, factor: number): number {
  return clamp(current * factor, Math.min(MIN_SCALE, current), MAX_SCALE);
}

interface Viewport {
  width: number;
  height: number;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Whatever scale frames the graph is the right one; a floor here would leave a
 * deep tree hanging outside the viewport. Only degenerate geometry is guarded.
 */
function fitView(bounds: Bounds, viewport: Viewport): { scale: number; pan: { x: number; y: number } } {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1);
  const usableWidth = Math.max(viewport.width - FIT_MARGIN, 1);
  const usableHeight = Math.max(viewport.height - FIT_MARGIN, 1);
  const framed = Math.min(usableWidth / spanX, usableHeight / spanY);
  const scale = Number.isFinite(framed) && framed > 0 ? Math.min(framed, MAX_SCALE) : INITIAL_SCALE;
  return {
    scale,
    pan: {
      x: (-(bounds.minX + bounds.maxX) / 2) * scale,
      y: (-(bounds.minY + bounds.maxY) / 2) * scale,
    },
  };
}

/** A hovered node can vanish on a refetch without ever emitting a leave event. */
function isHoverStale(hovered: string | null, nodes: GraphNode[]): boolean {
  if (!hovered) return false;
  return !nodes.some((node) => node.id === hovered);
}

/**
 * A wheel is not a React Native concept, so this is the raw host event. It only
 * ever fires on the web build; touch platforms have no wheel to turn.
 */
interface WheelLike {
  deltaY?: number;
  target?: unknown;
  currentTarget?: unknown;
  preventDefault?: () => void;
  nativeEvent?: { deltaY?: number; offsetX?: number; offsetY?: number };
}

/**
 * Nothing hovered: the whole graph sits back, readable but quiet. Hovered: the
 * node plus its whole lineage - every ancestor up to the project and every
 * descendant down to the last subagent - comes forward, the rest fades away.
 */
const NODE_OPACITY = { resting: 0.58, active: 1, faded: 0.08 };
const LABEL_OPACITY = { resting: 0.5, active: 1, faded: 0.1 };
const EDGE_OPACITY = {
  contains: { resting: 0.32, active: 0.9, faded: 0.06 },
  spawn: { resting: 0.42, active: 1, faded: 0.06 },
};

/**
 * A running chat sends a signal up its own chain. The crest starts at the
 * workspace and arrives at the chat, so the eye is led to where the work is
 * rather than merely told that a line changed colour.
 */
const PULSE_PERIOD_MS = 1600;
/** Phase lead per hop: what makes the crest travel instead of blinking in unison. */
const PULSE_HOP_MS = 260;
/** ~14 repaints a second. A swell this slow needs no more, and in tree mode -
 * where the simulation is parked - this is the only thing repainting at all. */
const PULSE_FRAME_MS = 70;
const PULSE_MAX_OPACITY = 0.95;
/** Thicker than the 1.5px edge, so the signal reads as the line swelling. */
const PULSE_THICKNESS = 3;
/** Below this the overlay is invisible anyway; skipping it keeps the quiet
 * half of every cycle out of the tree. */
const PULSE_MIN_VISIBLE = 0.02;

/**
 * The dot itself breathes: dimmer than resting at the trough, full strength at
 * the crest. Whatever the hover cascade already decided is the ceiling, so a
 * node faded by a hover elsewhere breathes faintly instead of flashing.
 */
const PULSE_NODE_TROUGH = 0.4;

function pulsedNodeOpacity(resting: number, faded: boolean, wave: number): number {
  const trough = resting * PULSE_NODE_TROUGH;
  const crest = faded ? resting : NODE_OPACITY.active;
  return trough + (crest - trough) * wave;
}

/**
 * A thin ring under the dot, on top of the breathing. It swells with the wave,
 * while the dot keeps its size - size means kind, and the legend says so.
 */
const HALO_EXTRA = 1.7;
const HALO_SWELL = 2.3;
const HALO_MAX_OPACITY = 0.5;

function pulseWave(timeMs: number, depth: number): number {
  const shifted = timeMs + depth * PULSE_HOP_MS;
  const phase = ((shifted % PULSE_PERIOD_MS) + PULSE_PERIOD_MS) % PULSE_PERIOD_MS;
  return 0.5 - 0.5 * Math.cos((phase / PULSE_PERIOD_MS) * Math.PI * 2);
}

/** The one deliberate literal in this file: a project dot is black in every
 * theme, so it needs an outline instead of a fill to stay visible. */
const PROJECT_COLOR = "#000000";

/** Pointer travel below this never counts as a drag. */
const TAP_SLOP = 5;

/**
 * iOS routes `accessibilityActivate` to `onAccessibilityTap`, Android delivers
 * the named action. Both are wired, plus Enter and Space on the web; a platform
 * only ever delivers one of them, so activation stays single.
 */
const ACTIVATE_ACTION = [{ name: "activate" }] as const;

function nodeColor(node: GraphNode, theme: PluginSurfaceProps["theme"]): string {
  if (node.kind === "project") return PROJECT_COLOR;
  switch (node.status) {
    case "running":
      return theme.colors.accent;
    case "attention":
    case "needs_input":
    case "initializing":
      return theme.colors.statusWarning;
    case "failed":
    case "error":
      return theme.colors.statusDanger;
    case "done":
      return theme.colors.statusSuccess;
    case "archived":
      // Dimmer than idle, otherwise the archive is indistinguishable from live work.
      return theme.colors.border;
    default:
      return theme.colors.foregroundMuted;
  }
}

interface NodeViewProps {
  node: GraphNode;
  left: number;
  top: number;
  radius: number;
  color: string;
  theme: PluginSurfaceProps["theme"];
  hovered: boolean;
  opacity: number;
  onHover: (nodeId: string | null) => void;
  onGrab: (nodeId: string) => void;
  onMove: (nodeId: string, dx: number, dy: number) => void;
  onRelease: () => void;
  onActivate: (node: GraphNode) => void;
}

/** Just the dot. Its label is drawn by the canvas-level label layer, because a
 * node view is only a few pixels across and clips anything past its edge. */
function NodeView({
  node,
  left,
  top,
  radius,
  color,
  theme,
  hovered,
  opacity,
  onHover,
  onGrab,
  onMove,
  onRelease,
  onActivate,
}: NodeViewProps) {
  // A status refetch replaces the node object every 5s. Rebuilding the responder
  // then would abandon an in-flight gesture together with its InteractionManager
  // handle, and the restarted one reports zero travel - a drag read as a tap.
  const latest = useRef({ node, onGrab, onMove, onRelease, onActivate, onHover });
  latest.current = { node, onGrab, onMove, onRelease, onActivate, onHover };

  // Travel is remembered for the whole gesture: dragging out and back lands on
  // a final delta of zero, which read as a tap and opened the node.
  const travelled = useRef(false);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => true,
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          travelled.current = false;
          latest.current.onGrab(latest.current.node.id);
        },
        onPanResponderMove: (_event, gesture) => {
          if (Math.abs(gesture.dx) >= TAP_SLOP || Math.abs(gesture.dy) >= TAP_SLOP) {
            travelled.current = true;
          }
          latest.current.onMove(latest.current.node.id, gesture.dx, gesture.dy);
        },
        onPanResponderRelease: (_event, gesture) => {
          latest.current.onRelease();
          const moved =
            travelled.current || Math.abs(gesture.dx) >= TAP_SLOP || Math.abs(gesture.dy) >= TAP_SLOP;
          travelled.current = false;
          if (!moved) latest.current.onActivate(latest.current.node);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {
          travelled.current = false;
          latest.current.onRelease();
        },
      }),
    [node.id],
  );

  // Keyboard and assistive activation never reach the responder above, so these
  // are the only paths that fire them - no pointer tap is doubled.
  const hostHandlers = useMemo(
    () =>
      ({
        onMouseEnter: () => latest.current.onHover(latest.current.node.id),
        onMouseLeave: () => latest.current.onHover(null),
        onKeyDown: (event: { key?: string; preventDefault?: () => void }) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault?.();
          latest.current.onActivate(latest.current.node);
        },
      }) as unknown as ViewProps,
    [],
  );

  return (
    <View
      {...responder.panHandlers}
      {...hostHandlers}
      accessible
      focusable
      accessibilityRole="button"
      accessibilityLabel={`${node.kind}: ${node.label}`}
      accessibilityActions={ACTIVATE_ACTION}
      onAccessibilityTap={() => latest.current.onActivate(latest.current.node)}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName !== "activate") return;
        latest.current.onActivate(latest.current.node);
      }}
      style={{
        position: "absolute",
        left: left - radius,
        top: top - radius,
        width: radius * 2,
        height: radius * 2,
        borderRadius: radius,
        backgroundColor: color,
        borderWidth: hovered ? 2 : node.kind === "project" ? 2 : 1,
        borderColor: hovered
          ? theme.colors.foreground
          : node.kind === "project"
            ? theme.colors.foregroundMuted
            : theme.colors.surface0,
        opacity,
        zIndex: hovered ? 20 : 2,
      }}
    >
      <Pressable
        accessible={false}
        focusable={false}
        onHoverIn={() => latest.current.onHover(latest.current.node.id)}
        onHoverOut={() => latest.current.onHover(null)}
        style={{ width: "100%", height: "100%", borderRadius: radius }}
      />
    </View>
  );
}


/* ----------------------------------------------------------------- legend */

interface LegendProps {
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
}

/** Size encodes what a node is, colour encodes how it is doing; the legend has
 * to say both, because neither is guessable from the graph alone. */
function Legend({ theme, compact }: LegendProps) {
  const kinds: Array<{ kind: NodeKind; label: string }> = [
    { kind: "project", label: "project" },
    { kind: "workspace", label: "workspace" },
    { kind: "agent", label: "agent" },
  ];
  const statuses: Array<{ label: string; color: string }> = [
    { label: "running", color: theme.colors.accent },
    { label: "attention", color: theme.colors.statusWarning },
    { label: "failed", color: theme.colors.statusDanger },
    { label: "done", color: theme.colors.statusSuccess },
    { label: "idle", color: theme.colors.foregroundMuted },
    { label: "archived", color: theme.colors.border },
  ];
  const caption = { color: theme.colors.foregroundMuted, fontSize: compact ? 9 : 10 };
  const group = { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 };

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: 14,
        rowGap: 6,
        paddingHorizontal: compact ? 12 : 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View style={group}>
        {kinds.map((entry) => (
          <View key={entry.kind} style={group}>
            <View
              style={{
                width: RADIUS[entry.kind],
                height: RADIUS[entry.kind],
                borderRadius: RADIUS[entry.kind] / 2,
                backgroundColor:
                  entry.kind === "project" ? PROJECT_COLOR : theme.colors.foregroundMuted,
                borderWidth: 1,
                borderColor: theme.colors.foregroundMuted,
              }}
            />
            <Text style={caption}>{entry.label}</Text>
          </View>
        ))}
      </View>

      <View style={group}>
        {statuses.map((entry) => (
          <View key={entry.label} style={group}>
            <View
              style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: entry.color }}
            />
            <Text style={caption}>{entry.label}</Text>
          </View>
        ))}
      </View>

      <View style={group}>
        <View style={group}>
          <View style={{ width: 20, height: 1.5, backgroundColor: theme.colors.foregroundMuted }} />
          <Text style={caption}>contains</Text>
        </View>
        <View style={group}>
          <View style={{ width: 20, height: 1.5, backgroundColor: theme.colors.accent }} />
          <Text style={caption}>spawned</Text>
        </View>
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- surface */

export function GraphSurface({ theme, layout, navigation }: PluginSurfaceProps) {
  const paseo = usePaseo();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(INITIAL_SCALE);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [treeLayout, setTreeLayout] = useState(true);
  const treeLayoutRef = useRef(treeLayout);
  treeLayoutRef.current = treeLayout;
  // While a drag is in flight the pointer sweeps across unrelated nodes; their
  // hover events would otherwise steal the highlight from under the gesture.
  const gestureRef = useRef(false);
  const [, setFrame] = useState(0);

  const bodiesRef = useRef(new Map<string, Body>());
  const alphaRef = useRef(1);
  const pinnedRef = useRef<string | null>(null);
  const grabOriginRef = useRef<Body | null>(null);
  const panOriginRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(INITIAL_SCALE);
  scaleRef.current = scale;
  const panRef = useRef(pan);
  panRef.current = pan;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // Structure still comes from the catalogue, but the poll no longer has to be
  // quick about it: a stream event naming an id the graph has never seen - or
  // any removal - pulls the affected list at once, and each id asks only once
  // until that answer lands.
  const queryClient = useQueryClient();
  const knownAgentsRef = useRef(new Set<string>());
  const askedAgentsRef = useRef(new Set<string>());
  const knownWorkspacesRef = useRef(new Set<string>());
  const askedWorkspacesRef = useRef(new Set<string>());

  const noticeAgent = useCallback<StructuralNotice>(
    (id, kind) => {
      if (!id) return;
      if (kind === "upsert" && knownAgentsRef.current.has(id)) return;
      if (askedAgentsRef.current.has(id)) return;
      askedAgentsRef.current.add(id);
      void queryClient.invalidateQueries({ queryKey: ["paseo-graph", "agents"] });
    },
    [queryClient],
  );

  const liveStatus = useLiveAgentStatus(paseo, noticeAgent);

  useEffect(() => {
    if (typeof paseo.workspaces?.subscribe !== "function") return;
    return paseo.workspaces.subscribe((raw: unknown) => {
      const update = raw as WorkspaceUpdateLike;
      const id = update.kind === "remove" ? update.id : update.workspace?.id;
      if (!id) return;
      if (update.kind === "upsert" && knownWorkspacesRef.current.has(id)) return;
      if (askedWorkspacesRef.current.has(id)) return;
      askedWorkspacesRef.current.add(id);
      // A project only ever becomes visible together with a workspace of its own.
      void queryClient.invalidateQueries({ queryKey: ["paseo-graph", "workspaces"] });
      void queryClient.invalidateQueries({ queryKey: ["paseo-graph", "projects"] });
    });
  }, [paseo, queryClient]);

  const workspacesQuery = useQuery({
    queryKey: ["paseo-graph", "workspaces"],
    queryFn: () => fetchAllWorkspaces(paseo),
    refetchInterval: BACKSTOP_POLL_MS,
  });
  const projectsQuery = useQuery({
    queryKey: ["paseo-graph", "projects"],
    queryFn: () => paseo.projects.list(),
    refetchInterval: BACKSTOP_POLL_MS,
  });
  const agentsQuery = useQuery({
    queryKey: ["paseo-graph", "agents", showArchived],
    queryFn: () => fetchAllAgents(paseo, showArchived),
    refetchInterval: BACKSTOP_POLL_MS,
  });

  const workspaces = useMemo<WorkspaceInfo[]>(
    () =>
      (workspacesQuery.data ?? []).map((workspace) => ({
        id: workspace.id,
        projectId: workspace.projectId,
        projectName: workspace.projectDisplayName,
        label: workspace.title ?? workspace.name,
        status: workspace.status,
        kind: workspace.workspaceKind,
      })),
    [workspacesQuery.data],
  );

  const projects = useMemo<ProjectInfo[]>(
    () =>
      (projectsQuery.data?.projects ?? []).map((project) => ({
        id: project.projectId,
        name: project.projectDisplayName,
        key: project.projectKey ?? null,
        rootPath: project.projectRootPath ?? null,
      })),
    [projectsQuery.data],
  );

  const agents = useMemo<AgentInfo[]>(
    () =>
      (agentsQuery.data ?? []).map((entry) => ({
        id: entry.agent.id,
        label: entry.agent.title ?? entry.agent.id.slice(0, 7),
        provider: entry.agent.provider,
        // The stream is ahead of the catalogue by up to a whole poll, and never
        // misses an event while this surface is mounted, so it wins outright.
        status: liveStatus.get(entry.agent.id) ?? entry.agent.status,
        workspaceId: entry.agent.workspaceId ?? null,
        parentId: parentFromLabels(entry.agent.labels),
        archived: Boolean(entry.agent.archivedAt),
        projectKey: entry.project?.projectKey ?? null,
        projectRoot:
          entry.project?.checkout?.mainRepoRoot ?? entry.project?.checkout?.cwd ?? null,
      })),
    [agentsQuery.data, liveStatus],
  );

  useEffect(() => {
    knownAgentsRef.current = new Set(agents.map((agent) => agent.id));
    askedAgentsRef.current.clear();
  }, [agents]);

  useEffect(() => {
    knownWorkspacesRef.current = new Set(workspaces.map((workspace) => workspace.id));
    askedWorkspacesRef.current.clear();
  }, [workspaces]);

  const { nodes, edges } = useMemo(
    () => buildGraph(workspaces, agents, projects),
    [workspaces, agents, projects],
  );

  useEffect(() => {
    if (isHoverStale(hovered, nodes)) setHovered(null);
  }, [hovered, nodes]);

  const activeHover = useMemo(() => {
    if (!hovered) return null;
    return nodes.some((node) => node.id === hovered) ? hovered : null;
  }, [hovered, nodes]);

  const adjacency = useMemo(() => {
    const forward = new Map<string, string[]>();
    const backward = new Map<string, string[]>();
    const push = (map: Map<string, string[]>, key: string, value: string) => {
      const list = map.get(key);
      if (list) list.push(value);
      else map.set(key, [value]);
    };
    for (const edge of edges) {
      push(forward, edge.from, edge.to);
      push(backward, edge.to, edge.from);
    }
    return { forward, backward };
  }, [edges]);

  // Highlighting cascades: every ancestor up to the project and every
  // descendant down to the last subagent, not just the immediate neighbours.
  const neighbourhood = useMemo(() => {
    if (!activeHover) return null;
    const reached = new Set<string>([activeHover]);
    const walk = (map: Map<string, string[]>) => {
      const queue = [activeHover];
      while (queue.length > 0) {
        const current = queue.pop();
        if (current === undefined) break;
        for (const next of map.get(current) ?? []) {
          if (reached.has(next)) continue;
          reached.add(next);
          queue.push(next);
        }
      }
    };
    walk(adjacency.forward);
    walk(adjacency.backward);
    return reached;
  }, [activeHover, adjacency]);

  // A chat counts as active while the daemon reports it running. Archived
  // agents carry the "archived" status instead, so they can never qualify.
  const activeNodeIds = useMemo(() => {
    const running = new Set<string>();
    for (const node of nodes) {
      if (node.kind === "agent" && node.status === "running") running.add(node.id);
    }
    return running;
  }, [nodes]);

  const signalPaths = useMemo(
    () => signalChains(edges, activeNodeIds),
    [edges, activeNodeIds],
  );
  // Depending on the count rather than the maps keeps a refetch, which rebuilds
  // them every time, from restarting the clock.
  const hasSignals = signalPaths.edges.size > 0 || signalPaths.nodes.size > 0;

  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (!hasSignals) return;
    let frame = 0;
    let painted = 0;
    const step = (time: number) => {
      if (time - painted >= PULSE_FRAME_MS) {
        painted = time;
        setPulse(time);
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [hasSignals]);

  // Keep one body per node; new nodes enter on a deterministic ring so the
  // layout does not jump between refetches.
  // A status-only refetch rebuilds node and edge objects every 5s. Only a change
  // of shape - which ids exist and how they connect - may move anything; titles
  // and statuses must never disturb a settled layout or a hand-placed node.
  const topology = useMemo(() => {
    const nodePart = nodes
      .map((node) => node.id)
      .sort()
      .join("|");
    const edgePart = edges
      .map((edge) => `${edge.id}>${edge.from}>${edge.to}>${edge.kind}`)
      .sort()
      .join("|");
    return `${nodePart}#${edgePart}`;
  }, [nodes, edges]);

  useMemo(() => {
    const bodies = bodiesRef.current;
    const live = new Set(nodes.map((node) => node.id));
    for (const id of [...bodies.keys()]) if (!live.has(id)) bodies.delete(id);
    for (const node of nodes) {
      if (bodies.has(node.id)) continue;
      const angle = hashSeed(node.id) * Math.PI * 2;
      const radius = 480 + hashSeed(`${node.id}:r`) * 1560;
      bodies.set(node.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      });
    }
    return bodies;
  }, [nodes]);

  // The loop stops dead once the layout settles instead of burning a frame
  // forever, and is woken only by a drag or a real topology change.
  const graphRef = useRef({ nodes, edges });
  graphRef.current = { nodes, edges };
  const rafRef = useRef(0);
  const runningRef = useRef(false);

  const wake = useCallback((alpha: number) => {
    if (treeLayoutRef.current) return;
    alphaRef.current = Math.max(alphaRef.current, alpha);
    if (runningRef.current) return;
    if (alphaRef.current <= ALPHA_FLOOR && !pinnedRef.current) return;
    runningRef.current = true;
    const step = () => {
      const graph = graphRef.current;
      simulate(bodiesRef.current, graph.nodes, graph.edges, alphaRef.current, pinnedRef.current);
      alphaRef.current = pinnedRef.current
        ? Math.max(alphaRef.current, 0.3)
        : alphaRef.current * ALPHA_DECAY;
      setFrame((frame) => (frame + 1) % 1000000);
      if (alphaRef.current <= ALPHA_FLOOR && !pinnedRef.current) {
        runningRef.current = false;
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    alphaRef.current = 1;
    wake(1);
  }, [topology, wake]);

  // Positions are recomputed once per topology change, then left alone. A drag
  // still edits a body directly, so manual nudges survive until the next change.
  useEffect(() => {
    if (!treeLayout) return;
    const { nodes, edges } = graphRef.current;
    const bodies = bodiesRef.current;
    for (const [id, position] of radialLayout(nodes, edges)) {
      const body = bodies.get(id);
      if (body) {
        body.x = position.x;
        body.y = position.y;
        body.vx = 0;
        body.vy = 0;
      } else {
        bodies.set(id, { ...position, vx: 0, vy: 0 });
      }
    }
    alphaRef.current = 0;
    setFrame((frame) => (frame + 1) % 1000000);
  }, [treeLayout, topology]);

  // Leaving tree mode has to restart the simulation by hand: the tree layout
  // parks alpha at zero, and nothing else would ever wake it again.
  useEffect(() => {
    if (treeLayout) return;
    wake(1);
  }, [treeLayout, wake]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
    },
    [],
  );

  const handleHover = useCallback((nodeId: string | null) => {
    if (gestureRef.current) return;
    setHovered(nodeId);
  }, []);

  const handleGrab = useCallback((nodeId: string) => {
    const body = bodiesRef.current.get(nodeId);
    if (!body) return;
    gestureRef.current = true;
    pinnedRef.current = nodeId;
    grabOriginRef.current = { ...body };
    setHovered(nodeId);
    wake(0.5);
  }, [wake]);

  const handleMove = useCallback((nodeId: string, dx: number, dy: number) => {
    const body = bodiesRef.current.get(nodeId);
    const origin = grabOriginRef.current;
    if (!body || !origin) return;
    body.x = origin.x + dx / scaleRef.current;
    body.y = origin.y + dy / scaleRef.current;
    body.vx = 0;
    body.vy = 0;
    // In tree mode no simulation frame is running to repaint the move.
    if (treeLayoutRef.current) setFrame((frame) => (frame + 1) % 1000000);
  }, []);

  const handleRelease = useCallback(() => {
    gestureRef.current = false;
    pinnedRef.current = null;
    grabOriginRef.current = null;
    wake(0.4);
  }, [wake]);

  const handleActivate = useCallback(
    (node: GraphNode) => {
      if (!navigation) return;
      if (node.kind === "workspace") navigation.openWorkspace({ workspaceId: node.refId });
      if (node.kind === "agent") navigation.openAgent({ agentId: node.refId });
    },
    [navigation],
  );

  const canvasResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          panOriginRef.current = panRef.current;
          gestureRef.current = true;
          setHovered(null);
        },
        onPanResponderMove: (_event, gesture) => {
          setPan({ x: panOriginRef.current.x + gesture.dx, y: panOriginRef.current.y + gesture.dy });
        },
        onPanResponderRelease: () => {
          gestureRef.current = false;
        },
        onPanResponderTerminate: () => {
          gestureRef.current = false;
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );

  // Zoom about the cursor when it sits over empty canvas; a node under the
  // pointer reports offsets relative to itself, so those fall back to centre.
  const handleWheel = useCallback((event: WheelLike) => {
    const deltaY = event.deltaY ?? event.nativeEvent?.deltaY ?? 0;
    if (!deltaY) return;
    event.preventDefault?.();
    const current = scaleRef.current;
    const next = applyZoom(current, Math.exp(-deltaY * 0.0015));
    if (next === current) return;
    const ratio = next / current;
    const overCanvas = event.target !== undefined && event.target === event.currentTarget;
    const anchorX = overCanvas ? (event.nativeEvent?.offsetX ?? 0) : sizeRef.current.width / 2;
    const anchorY = overCanvas ? (event.nativeEvent?.offsetY ?? 0) : sizeRef.current.height / 2;
    const offsetX = anchorX - sizeRef.current.width / 2;
    const offsetY = anchorY - sizeRef.current.height / 2;
    const currentPan = panRef.current;
    setPan({
      x: offsetX - (offsetX - currentPan.x) * ratio,
      y: offsetY - (offsetY - currentPan.y) * ratio,
    });
    setScale(next);
  }, []);

  const wheelHandler = useMemo(
    () => ({ onWheel: handleWheel }) as unknown as ViewProps,
    [handleWheel],
  );

  // "reset" frames the whole graph rather than jumping back to a fixed zoom,
  // so the right scale never has to be guessed from a constant.
  const fitToContent = useCallback(() => {
    const bodies = bodiesRef.current;
    const viewport = sizeRef.current;
    if (bodies.size === 0 || !viewport.width || !viewport.height) {
      setPan({ x: 0, y: 0 });
      setScale(INITIAL_SCALE);
      return;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const body of bodies.values()) {
      if (body.x < minX) minX = body.x;
      if (body.x > maxX) maxX = body.x;
      if (body.y < minY) minY = body.y;
      if (body.y > maxY) maxY = body.y;
    }
    const framed = fitView({ minX, maxX, minY, maxY }, viewport);
    setScale(framed.scale);
    setPan(framed.pan);
  }, []);

  const centerX = size.width / 2 + pan.x;
  const centerY = size.height / 2 + pan.y;
  const bodies = bodiesRef.current;
  const showLabels = scale >= 0.05;

  // Agents the graph could not attach to a workspace or a project.
  const looseAgents = useMemo(() => {
    const attached = new Set(edges.map((edge) => edge.to));
    return nodes.filter((node) => node.kind === "agent" && !attached.has(node.id)).length;
  }, [nodes, edges]);
  const loading = workspacesQuery.isPending || agentsQuery.isPending || projectsQuery.isPending;
  const error = workspacesQuery.error ?? agentsQuery.error ?? projectsQuery.error;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: layout.compact ? 12 : 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Text style={{ color: theme.colors.foreground, fontSize: layout.compact ? 15 : 17, flex: 1 }}>
          {`${nodes.length} nodes · ${edges.length} links${activeNodeIds.size > 0 ? ` · ${activeNodeIds.size} active` : ""}${looseAgents > 0 ? ` · ${looseAgents} loose` : ""}`}
        </Text>
        {[
          { label: "−", action: () => setScale((value) => applyZoom(value, 1 / 1.25)) },
          { label: "+", action: () => setScale((value) => applyZoom(value, 1.25)) },
          { label: "fit", action: fitToContent },
          {
            label: "tree",
            action: () => setTreeLayout((value) => !value),
            active: treeLayout,
          },
          {
            label: "archive",
            action: () => setShowArchived((value) => !value),
            active: showArchived,
          },
        ].map((control) => (
          <Pressable
            key={control.label}
            accessibilityRole="button"
            accessibilityLabel={control.label}
            onPress={control.action}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor:
                "active" in control && control.active ? theme.colors.accent : theme.colors.surface2,
            }}
          >
            <Text
              style={{
                color:
                  "active" in control && control.active
                    ? theme.colors.accentForeground
                    : theme.colors.foreground,
                fontSize: 13,
              }}
            >
              {control.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Legend theme={theme} compact={layout.compact} />

      <View
        {...canvasResponder.panHandlers}
        {...wheelHandler}
        onLayout={onLayout}
        style={{ flex: 1, overflow: "hidden", ...NO_TEXT_SELECTION }}
      >
        {edges.map((edge) => {
          const a = bodies.get(edge.from);
          const b = bodies.get(edge.to);
          if (!a || !b) return null;
          const ax = centerX + a.x * scale;
          const ay = centerY + a.y * scale;
          const bx = centerX + b.x * scale;
          const by = centerY + b.y * scale;
          const dx = bx - ax;
          const dy = by - ay;
          const length = Math.sqrt(dx * dx + dy * dy);
          const thickness = 1.5;
          const opacities = EDGE_OPACITY[edge.kind];
          const edgeInCascade =
            neighbourhood !== null && neighbourhood.has(edge.from) && neighbourhood.has(edge.to);
          const edgeOpacity = neighbourhood
            ? edgeInCascade
              ? opacities.active
              : opacities.faded
            : opacities.resting;
          const angle = `${Math.atan2(dy, dx)}rad`;
          // The signal rides on top of the edge rather than recolouring it, so
          // no theme colour has to be parsed or interpolated to fade between
          // the two. It dims with the rest of the graph when something else is
          // hovered, or a hover would leave stale signals blazing.
          const signalDepth = signalPaths.edges.get(edge.id);
          const signalOpacity =
            signalDepth === undefined
              ? 0
              : pulseWave(pulse, signalDepth) *
                PULSE_MAX_OPACITY *
                (neighbourhood && !edgeInCascade ? 0.1 : 1);
          return (
            <Fragment key={edge.id}>
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: (ax + bx) / 2 - length / 2,
                  top: (ay + by) / 2 - thickness / 2,
                  width: length,
                  height: thickness,
                  backgroundColor:
                    edge.kind === "spawn" ? theme.colors.accent : theme.colors.foregroundMuted,
                  opacity: edgeOpacity,
                  transform: [{ rotateZ: angle }],
                }}
              />
              {signalOpacity > PULSE_MIN_VISIBLE ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: (ax + bx) / 2 - length / 2,
                    top: (ay + by) / 2 - PULSE_THICKNESS / 2,
                    width: length,
                    height: PULSE_THICKNESS,
                    borderRadius: PULSE_THICKNESS / 2,
                    backgroundColor: theme.colors.accent,
                    opacity: signalOpacity,
                    transform: [{ rotateZ: angle }],
                  }}
                />
              ) : null}
            </Fragment>
          );
        })}

        {hasSignals
          ? nodes.map((node) => {
              const depth = signalPaths.nodes.get(node.id);
              if (depth === undefined) return null;
              const body = bodies.get(node.id);
              if (!body) return null;
              const wave = pulseWave(pulse, depth);
              const opacity =
                wave * HALO_MAX_OPACITY * (neighbourhood && !neighbourhood.has(node.id) ? 0.1 : 1);
              if (opacity <= PULSE_MIN_VISIBLE) return null;
              const size = (nodeRadius(node.kind, scale) + HALO_EXTRA + wave * HALO_SWELL) * 2;
              return (
                <View
                  key={`halo:${node.id}`}
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: centerX + body.x * scale - size / 2,
                    top: centerY + body.y * scale - size / 2,
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: theme.colors.accent,
                    opacity,
                    // Under the dots, which sit at 2, and over the edges.
                    zIndex: 1,
                  }}
                />
              );
            })
          : null}

        {nodes.map((node) => {
          const body = bodies.get(node.id);
          if (!body) return null;
          const near = neighbourhood?.has(node.id) ?? false;
          const resting = neighbourhood
            ? near
              ? NODE_OPACITY.active
              : NODE_OPACITY.faded
            : NODE_OPACITY.resting;
          const depth = hasSignals ? signalPaths.nodes.get(node.id) : undefined;
          const opacity =
            depth === undefined
              ? resting
              : pulsedNodeOpacity(resting, neighbourhood !== null && !near, pulseWave(pulse, depth));
          return (
            <NodeView
              key={node.id}
              node={node}
              left={centerX + body.x * scale}
              top={centerY + body.y * scale}
              radius={nodeRadius(node.kind, scale)}
              color={nodeColor(node, theme)}
              theme={theme}
              hovered={activeHover === node.id}
              opacity={opacity}
              onHover={handleHover}
              onGrab={handleGrab}
              onMove={handleMove}
              onRelease={handleRelease}
              onActivate={handleActivate}
            />
          );
        })}

        {showLabels
          ? nodes.map((node) => {
              const body = bodies.get(node.id);
              if (!body) return null;
              const near = neighbourhood?.has(node.id) ?? false;
              const isHovered = activeHover === node.id;
              const radius = nodeRadius(node.kind, scale);
              return (
                <View
                  key={`label:${node.id}`}
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: centerX + body.x * scale - 90,
                    top: centerY + body.y * scale + radius + 3,
                    width: 180,
                    alignItems: "center",
                    opacity: neighbourhood
                      ? near
                        ? LABEL_OPACITY.active
                        : LABEL_OPACITY.faded
                      : LABEL_OPACITY.resting,
                    zIndex: isHovered ? 21 : 3,
                  }}
                >
                  <Text
                    numberOfLines={2}
                    style={{
                      textAlign: "center",
                      fontSize: node.kind === "project" ? 12 : 10,
                      color: theme.colors.foreground,
                      textShadowColor: theme.colors.surface0,
                      textShadowOffset: { width: 0, height: 0 },
                      textShadowRadius: 4,
                      userSelect: "none",
                    }}
                  >
                    {node.label}
                  </Text>
                  {isHovered ? (
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 10, color: theme.colors.foregroundMuted, userSelect: "none" }}
                    >
                      {`${node.kind} · ${node.sublabel} · ${node.status}`}
                    </Text>
                  ) : null}
                </View>
              );
            })
          : null}

        {loading || error || nodes.length === 0 ? (
          <View style={{ position: "absolute", left: 0, right: 0, top: 24, alignItems: "center" }}>
            <Text style={{ color: error ? theme.colors.statusDanger : theme.colors.foregroundMuted }}>
              {error ? String(error) : loading ? "Loading graph…" : "No workspaces yet"}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
