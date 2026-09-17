import { type PluginSurfaceProps, usePaseo } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
}

const projectNodeId = (id: string) => `project:${id}`;
const workspaceNodeId = (id: string) => `workspace:${id}`;
const agentNodeId = (id: string) => `agent:${id}`;

/**
 * Paseo never records "this workspace was created by that agent". The link is
 * recoverable anyway: a subagent whose parent sits in a different workspace can
 * only have got there because the parent spawned that workspace.
 */
function buildGraph(
  rawWorkspaces: WorkspaceInfo[],
  rawAgents: AgentInfo[],
  emptyProjects: ProjectInfo[],
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

  // Projects without any active workspace only arrive on the first page.
  for (const project of emptyProjects) addProjectNode(project.id, project.name);

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
    const spawnedItsOwnWorkspace =
      parent !== undefined && agent.workspaceId !== null && parent.workspaceId !== agent.workspaceId;

    if (agent.workspaceId && knownWorkspaces.has(agent.workspaceId)) {
      edges.push({
        id: `c:${agent.workspaceId}:${agent.id}`,
        from: workspaceNodeId(agent.workspaceId),
        to: agentNodeId(agent.id),
        kind: "contains",
      });
    }

    if (!parent) continue;
    if (spawnedItsOwnWorkspace && agent.workspaceId && knownWorkspaces.has(agent.workspaceId)) {
      // parent -> new workspace -> child; the direct parent->child edge would be redundant
      edges.push({
        id: `s:${parent.id}:${agent.workspaceId}`,
        from: agentNodeId(parent.id),
        to: workspaceNodeId(agent.workspaceId),
        kind: "spawn",
      });
    } else {
      edges.push({
        id: `s:${parent.id}:${agent.id}`,
        from: agentNodeId(parent.id),
        to: agentNodeId(agent.id),
        kind: "spawn",
      });
    }
  }

  const dedupedEdges = new Map<string, GraphEdge>();
  for (const edge of edges) dedupedEdges.set(edge.id, edge);
  return { nodes: [...nodes.values()], edges: [...dedupedEdges.values()] };
}

type PaseoApi = ReturnType<typeof usePaseo>;

/** The daemon rejects page.limit above 200, so both lists are walked by cursor. */
const PAGE_LIMIT = 200;
const MAX_PAGES = 20;

interface PageInfo {
  hasMore?: boolean;
  nextCursor?: string | null;
}

/**
 * The daemon reports projects that have no workspace alongside the first page.
 * The SDK's result type omits the field even though the payload carries it.
 */
interface RawEmptyProject {
  projectId: string;
  projectDisplayName: string;
}

interface WorkspaceCatalogue {
  workspaces: RawWorkspace[];
  emptyProjects: RawEmptyProject[];
}

async function fetchAllWorkspaces(paseo: PaseoApi): Promise<WorkspaceCatalogue> {
  const workspaces: RawWorkspace[] = [];
  let emptyProjects: RawEmptyProject[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await paseo.workspaces.list({ page: { limit: PAGE_LIMIT, cursor } });
    workspaces.push(...((result.entries ?? []) as RawWorkspace[]));
    if (page === 0) {
      emptyProjects = (result as { emptyProjects?: RawEmptyProject[] }).emptyProjects ?? [];
    }
    const info = result.pageInfo as PageInfo | undefined;
    if (!info?.hasMore || !info.nextCursor) break;
    cursor = info.nextCursor;
  }
  return { workspaces, emptyProjects };
}

async function fetchAllAgents(paseo: PaseoApi, includeArchived: boolean): Promise<RawAgentEntry[]> {
  const all: RawAgentEntry[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await paseo.agents.list({
      page: { limit: PAGE_LIMIT, cursor },
      ...(includeArchived ? { filter: { includeArchived: true } } : {}),
    });
    all.push(...((result.entries ?? []) as RawAgentEntry[]));
    const info = result.pageInfo as PageInfo | undefined;
    if (!info?.hasMore || !info.nextCursor) break;
    cursor = info.nextCursor;
  }
  return all;
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
 * node and its immediate neighbours come forward and the rest fades away.
 */
const NODE_OPACITY = { resting: 0.58, active: 1, faded: 0.08 };
const LABEL_OPACITY = { resting: 0.5, active: 1, faded: 0.1 };
const EDGE_OPACITY = {
  contains: { resting: 0.32, active: 0.9, faded: 0.06 },
  spawn: { resting: 0.42, active: 1, faded: 0.06 },
};

/** The one deliberate literal in this file: a project dot is black in every
 * theme, so it needs an outline instead of a fill to stay visible. */
const PROJECT_COLOR = "#000000";

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
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => true,
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => onGrab(node.id),
        onPanResponderMove: (_event, gesture) => onMove(node.id, gesture.dx, gesture.dy),
        onPanResponderRelease: (_event, gesture) => {
          onRelease();
          if (Math.abs(gesture.dx) < 5 && Math.abs(gesture.dy) < 5) onActivate(node);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => onRelease(),
      }),
    [node, onGrab, onMove, onRelease, onActivate],
  );

  const hoverHandlers = useMemo(
    () =>
      ({
        onMouseEnter: () => onHover(node.id),
        onMouseLeave: () => onHover(null),
      }) as unknown as ViewProps,
    [node.id, onHover],
  );

  return (
    <View
      {...responder.panHandlers}
      {...hoverHandlers}
      accessibilityRole="button"
      accessibilityLabel={`${node.kind}: ${node.label}`}
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
        onHoverIn={() => onHover(node.id)}
        onHoverOut={() => onHover(null)}
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

  const workspacesQuery = useQuery({
    queryKey: ["paseo-graph", "workspaces"],
    queryFn: () => fetchAllWorkspaces(paseo),
    refetchInterval: 5000,
  });
  const agentsQuery = useQuery({
    queryKey: ["paseo-graph", "agents", showArchived],
    queryFn: () => fetchAllAgents(paseo, showArchived),
    refetchInterval: 5000,
  });

  const workspaces = useMemo<WorkspaceInfo[]>(
    () =>
      (workspacesQuery.data?.workspaces ?? []).map((workspace) => ({
        id: workspace.id,
        projectId: workspace.projectId,
        projectName: workspace.projectDisplayName,
        label: workspace.title ?? workspace.name,
        status: workspace.status,
        kind: workspace.workspaceKind,
      })),
    [workspacesQuery.data],
  );

  const emptyProjects = useMemo<ProjectInfo[]>(
    () =>
      (workspacesQuery.data?.emptyProjects ?? []).map((project) => ({
        id: project.projectId,
        name: project.projectDisplayName,
      })),
    [workspacesQuery.data],
  );

  const agents = useMemo<AgentInfo[]>(
    () =>
      (agentsQuery.data ?? []).map((entry) => ({
        id: entry.agent.id,
        label: entry.agent.title ?? entry.agent.id.slice(0, 7),
        provider: entry.agent.provider,
        status: entry.agent.status,
        workspaceId: entry.agent.workspaceId ?? null,
        parentId: parentFromLabels(entry.agent.labels),
        archived: Boolean(entry.agent.archivedAt),
      })),
    [agentsQuery.data],
  );

  const { nodes, edges } = useMemo(
    () => buildGraph(workspaces, agents, emptyProjects),
    [workspaces, agents, emptyProjects],
  );

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

  // Keep one body per node; new nodes enter on a deterministic ring so the
  // layout does not jump between refetches.
  // A status-only refetch rebuilds node objects every 5s. Reheating on that
  // would keep the layout permanently in motion, so only a changed id set counts.
  useMemo(() => {
    const bodies = bodiesRef.current;
    const live = new Set(nodes.map((node) => node.id));
    let topologyChanged = false;
    for (const id of [...bodies.keys()]) {
      if (live.has(id)) continue;
      bodies.delete(id);
      topologyChanged = true;
    }
    for (const node of nodes) {
      if (bodies.has(node.id)) continue;
      topologyChanged = true;
      const angle = hashSeed(node.id) * Math.PI * 2;
      const radius = 480 + hashSeed(`${node.id}:r`) * 1560;
      bodies.set(node.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      });
    }
    if (topologyChanged) alphaRef.current = 1;
    return bodies;
  }, [nodes]);

  // The loop stops dead once the layout settles instead of burning a frame
  // forever, and is woken only by a drag or a real topology change.
  const graphRef = useRef({ nodes, edges });
  graphRef.current = { nodes, edges };
  const rafRef = useRef(0);
  const runningRef = useRef(false);

  const wake = useCallback((alpha: number) => {
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
    wake(alphaRef.current);
  }, [nodes, edges, wake]);

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
    const next = clamp(current * Math.exp(-deltaY * 0.0015), MIN_SCALE, MAX_SCALE);
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
    const margin = 120;
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const next = clamp(
      Math.min((viewport.width - margin) / spanX, (viewport.height - margin) / spanY),
      MIN_SCALE,
      MAX_SCALE,
    );
    setScale(next);
    setPan({ x: (-(minX + maxX) / 2) * next, y: (-(minY + maxY) / 2) * next });
  }, []);

  const centerX = size.width / 2 + pan.x;
  const centerY = size.height / 2 + pan.y;
  const bodies = bodiesRef.current;
  const showLabels = scale >= 0.05;
  const loading = workspacesQuery.isPending || agentsQuery.isPending;
  const error = workspacesQuery.error ?? agentsQuery.error;

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
          {`${nodes.length} nodes · ${edges.length} links`}
        </Text>
        {[
          { label: "−", action: () => setScale((value) => clamp(value / 1.25, MIN_SCALE, MAX_SCALE)) },
          { label: "+", action: () => setScale((value) => clamp(value * 1.25, MIN_SCALE, MAX_SCALE)) },
          { label: "fit", action: fitToContent },
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
          return (
            <View
              key={edge.id}
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
                transform: [{ rotateZ: `${Math.atan2(dy, dx)}rad` }],
              }}
            />
          );
        })}

        {nodes.map((node) => {
          const body = bodies.get(node.id);
          if (!body) return null;
          const near = neighbourhood?.has(node.id) ?? false;
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
              opacity={neighbourhood ? (near ? NODE_OPACITY.active : NODE_OPACITY.faded) : NODE_OPACITY.resting}
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
