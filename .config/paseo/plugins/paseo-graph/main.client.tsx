import { type PluginSurfaceProps, usePaseo } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

interface AgentInfo {
  id: string;
  label: string;
  provider: string;
  status: string;
  workspaceId: string | null;
  parentId: string | null;
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
  workspaces: WorkspaceInfo[],
  agents: AgentInfo[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenProjects = new Map<string, string>();
  const agentById = new Map<string, AgentInfo>();
  const knownWorkspaces = new Set(workspaces.map((workspace) => workspace.id));

  for (const workspace of workspaces) {
    if (!seenProjects.has(workspace.projectId)) {
      seenProjects.set(workspace.projectId, workspace.projectName);
      nodes.push({
        id: projectNodeId(workspace.projectId),
        kind: "project",
        refId: workspace.projectId,
        label: workspace.projectName,
        sublabel: "project",
        status: "project",
      });
    }
    nodes.push({
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

  for (const agent of agents) {
    agentById.set(agent.id, agent);
    nodes.push({
      id: agentNodeId(agent.id),
      kind: "agent",
      refId: agent.id,
      label: agent.label,
      sublabel: agent.provider,
      status: agent.status,
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

  const deduped = new Map<string, GraphEdge>();
  for (const edge of edges) deduped.set(edge.id, edge);
  return { nodes, edges: [...deduped.values()] };
}

type PaseoApi = ReturnType<typeof usePaseo>;

/** The daemon rejects page.limit above 200, so both lists are walked by cursor. */
const PAGE_LIMIT = 200;
const MAX_PAGES = 20;

interface PageInfo {
  hasMore?: boolean;
  nextCursor?: string | null;
}

async function fetchAllWorkspaces(paseo: PaseoApi): Promise<RawWorkspace[]> {
  const all: RawWorkspace[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await paseo.workspaces.list({ page: { limit: PAGE_LIMIT, cursor } });
    all.push(...((result.entries ?? []) as RawWorkspace[]));
    const info = result.pageInfo as PageInfo | undefined;
    if (!info?.hasMore || !info.nextCursor) break;
    cursor = info.nextCursor;
  }
  return all;
}

async function fetchAllAgents(paseo: PaseoApi): Promise<RawAgentEntry[]> {
  const all: RawAgentEntry[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await paseo.agents.list({ page: { limit: PAGE_LIMIT, cursor } });
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

const REPULSION = 81000;
const REPULSION_RANGE_SQUARED = 1560 * 1560;
const SPRING = 0.035;
const CONTAINS_LENGTH = 286;
const SPAWN_LENGTH = 450;
const GRAVITY = 0.004;
const DAMPING = 0.82;
const MAX_STEP = 22;
/** Halves how far a node travels per frame; the layout drifts into place
 * instead of snapping there. */
const MOTION_SCALE = 0.5;
const ALPHA_DECAY = 0.992;
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
  for (let i = 0; i < nodes.length; i += 1) {
    const a = bodies.get(nodes[i].id);
    if (!a) continue;
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = bodies.get(nodes[j].id);
      if (!b) continue;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < 0.01) {
        dx = 0.7;
        dy = -0.7;
        distanceSquared = 0.98;
      }
      if (distanceSquared > REPULSION_RANGE_SQUARED) continue;
      const distance = Math.sqrt(distanceSquared);
      const force = (REPULSION / distanceSquared) * alpha;
      a.vx += (dx / distance) * force;
      a.vy += (dy / distance) * force;
      b.vx -= (dx / distance) * force;
      b.vy -= (dy / distance) * force;
    }
    a.vx -= a.x * GRAVITY * alpha;
    a.vy -= a.y * GRAVITY * alpha;
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

const INITIAL_SCALE = 4.8;
/** `userSelect` is a web-only style; React Native's ViewStyle has no such key. */
const NO_TEXT_SELECTION = { userSelect: "none" } as unknown as ViewStyle;

const MIN_SCALE = 0.2;
const MAX_SCALE = 10;

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

function nodeColor(node: GraphNode, theme: PluginSurfaceProps["theme"]): string {
  if (node.kind === "project") return theme.colors.accent;
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
        borderColor: hovered ? theme.colors.foreground : theme.colors.surface0,
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

/* ---------------------------------------------------------------- surface */

export function GraphSurface({ theme, layout, navigation }: PluginSurfaceProps) {
  const paseo = usePaseo();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(INITIAL_SCALE);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
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
    queryKey: ["paseo-graph", "agents"],
    queryFn: () => fetchAllAgents(paseo),
    refetchInterval: 5000,
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

  const agents = useMemo<AgentInfo[]>(
    () =>
      (agentsQuery.data ?? []).map((entry) => ({
        id: entry.agent.id,
        label: entry.agent.title ?? entry.agent.id.slice(0, 7),
        provider: entry.agent.provider,
        status: entry.agent.status,
        workspaceId: entry.agent.workspaceId ?? null,
        parentId: parentFromLabels(entry.agent.labels),
      })),
    [agentsQuery.data],
  );

  const { nodes, edges } = useMemo(() => buildGraph(workspaces, agents), [workspaces, agents]);

  const neighbourhood = useMemo(() => {
    if (!hovered) return null;
    const near = new Set<string>([hovered]);
    for (const edge of edges) {
      if (edge.from === hovered) near.add(edge.to);
      if (edge.to === hovered) near.add(edge.from);
    }
    return near;
  }, [hovered, edges]);

  // Keep one body per node; new nodes enter on a deterministic ring so the
  // layout does not jump between refetches.
  useMemo(() => {
    const bodies = bodiesRef.current;
    const live = new Set(nodes.map((node) => node.id));
    for (const id of [...bodies.keys()]) if (!live.has(id)) bodies.delete(id);
    for (const node of nodes) {
      if (bodies.has(node.id)) continue;
      const angle = hashSeed(node.id) * Math.PI * 2;
      const radius = 240 + hashSeed(`${node.id}:r`) * 780;
      bodies.set(node.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      });
    }
    alphaRef.current = 1;
    return bodies;
  }, [nodes]);

  useEffect(() => {
    let raf = 0;
    const step = () => {
      if (alphaRef.current > ALPHA_FLOOR || pinnedRef.current) {
        simulate(bodiesRef.current, nodes, edges, alphaRef.current, pinnedRef.current);
        alphaRef.current = pinnedRef.current
          ? Math.max(alphaRef.current, 0.3)
          : alphaRef.current * ALPHA_DECAY;
        setFrame((frame) => (frame + 1) % 1000000);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [nodes, edges]);

  const handleGrab = useCallback((nodeId: string) => {
    const body = bodiesRef.current.get(nodeId);
    if (!body) return;
    pinnedRef.current = nodeId;
    grabOriginRef.current = { ...body };
    setHovered(nodeId);
    alphaRef.current = Math.max(alphaRef.current, 0.5);
  }, []);

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
    pinnedRef.current = null;
    grabOriginRef.current = null;
    alphaRef.current = Math.max(alphaRef.current, 0.4);
  }, []);

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
        },
        onPanResponderMove: (_event, gesture) => {
          setPan({ x: panOriginRef.current.x + gesture.dx, y: panOriginRef.current.y + gesture.dy });
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

  const recenter = useCallback(() => {
    setPan({ x: 0, y: 0 });
    setScale(INITIAL_SCALE);
    alphaRef.current = 1;
  }, []);

  const centerX = size.width / 2 + pan.x;
  const centerY = size.height / 2 + pan.y;
  const bodies = bodiesRef.current;
  const showLabels = scale >= 0.15;
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
          { label: "reset", action: recenter },
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
              backgroundColor: theme.colors.surface2,
            }}
          >
            <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>{control.label}</Text>
          </Pressable>
        ))}
      </View>

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
          const thickness = edge.kind === "spawn" ? 2.5 : 1.5;
          const opacities = EDGE_OPACITY[edge.kind];
          const touchesHover = edge.from === hovered || edge.to === hovered;
          const edgeOpacity = neighbourhood
            ? touchesHover
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
              radius={Math.max(4, RADIUS[node.kind] * scale)}
              color={nodeColor(node, theme)}
              theme={theme}
              hovered={hovered === node.id}
              opacity={neighbourhood ? (near ? NODE_OPACITY.active : NODE_OPACITY.faded) : NODE_OPACITY.resting}
              onHover={setHovered}
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
              const isHovered = hovered === node.id;
              const radius = Math.max(4, RADIUS[node.kind] * scale);
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
