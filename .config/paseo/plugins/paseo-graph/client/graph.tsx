import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  PanResponder,
  Pressable,
  Text,
  View,
  type ViewProps,
} from "react-native";
import { type PluginSurfaceProps, usePaseo } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BACKSTOP_POLL_MS, fetchAllAgents, fetchAllWorkspaces } from "./data";
import { radialLayout } from "./layout";
import { Legend } from "./legend";
import { canvas, makeStyles } from "./styles";
import { type StructuralNotice, type WorkspaceUpdateLike, useLiveAgentStatus } from "./live";
import {
  type AgentInfo,
  type GraphNode,
  type ProjectInfo,
  type WorkspaceInfo,
  buildGraph,
  parentFromLabels,
} from "./model";
import { NodeView } from "./node-view";
import {
  ALPHA_DECAY,
  ALPHA_FLOOR,
  type Body,
  FRAME_COUNTER_MODULO,
  PINNED_ALPHA,
  WAKE_ALPHA_GRAB,
  WAKE_ALPHA_RELEASE,
  simulate,
  syncBodies,
} from "./physics";
import {
  HALO_EXTRA,
  HALO_MAX_OPACITY,
  HALO_SWELL,
  PULSE_FRAME_MS,
  PULSE_MAX_OPACITY,
  PULSE_MIN_VISIBLE,
  PULSE_THICKNESS,
  pulseWave,
  pulsedNodeOpacity,
} from "./pulse";
import { signalChains } from "./signals";
import {
  EDGE_OPACITY,
  EDGE_THICKNESS,
  INITIAL_SCALE,
  LABEL_FONT_SIZE,
  LABEL_GAP,
  LABEL_OPACITY,
  LABEL_SHADOW_OFFSET,
  LABEL_SHADOW_RADIUS,
  LABEL_VISIBILITY_SCALE,
  LABEL_WIDTH,
  LAYER,
  NODE_OPACITY,
  NO_TEXT_SELECTION,
  OVERLAY_TOP,
  SIGNAL_FADED_FACTOR,
  WHEEL_ZOOM_SENSITIVITY,
  type WheelLike,
  ZOOM_BUTTON_STEP,
  applyZoom,
  fitView,
  isHoverStale,
  nodeColor,
  nodeRadius,
} from "./view";

/**
 * The surface: pulls the catalogue, joins it to the live stream, drives either
 * layout, and draws the result. Everything it draws with lives in a sibling
 * module; what stays here is the state that ties them together.
 */

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

  // Clearing the id, not just masking it: a node that vanishes and returns
  // under the same id would otherwise light up again with the pointer
  // elsewhere. Only fires when a hovered node actually disappears.
  useEffect(() => {
    // oxlint-disable-next-line set-state-in-effect -- stale-id cleanup, not derived state
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
    // oxlint-disable-next-line immutability -- `walk` reads its argument; it only writes `reached`
    walk(adjacency.forward);
    // oxlint-disable-next-line immutability -- same
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

  // A status-only refetch rebuilds node and edge objects on every backstop
  // poll. Only a change of shape - which ids exist and how they connect - may
  // move anything; titles and statuses must never disturb a settled layout or a
  // hand-placed node.
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

  // Not useMemo: this mutates a ref rather than computing a value, and an
  // interrupted render would leave bodies rebuilt for a node set that never
  // reached the screen. Not an effect either - the very first paint reads these
  // bodies, and an effect runs too late for that. Syncing against the last node
  // list seen during render is the one place that is both early enough and
  // re-entrant, because the sync itself is idempotent.
  const bodiesSyncedFor = useRef<GraphNode[] | null>(null);
  if (bodiesSyncedFor.current !== nodes) {
    bodiesSyncedFor.current = nodes;
    syncBodies(bodiesRef.current, nodes);
  }

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
        ? Math.max(alphaRef.current, PINNED_ALPHA)
        : alphaRef.current * ALPHA_DECAY;
      setFrame((frame) => (frame + 1) % FRAME_COUNTER_MODULO);
      if (alphaRef.current <= ALPHA_FLOOR && !pinnedRef.current) {
        runningRef.current = false;
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  // `topology` is a trigger, not an input: nothing here reads it, but a change
  // of shape is exactly when the simulation has to be woken again.
  useEffect(() => {
    alphaRef.current = 1;
    wake(1);
    // oxlint-disable-next-line exhaustive-effect-dependencies -- deliberate trigger
  }, [topology, wake]);

  // Positions are recomputed once per topology change, then left alone. A drag
  // still edits a body directly, so manual nudges survive until the next change.
  useEffect(() => {
    if (!treeLayout) return;
    // The ref, not the render-scope values: this effect must lay out the graph
    // the topology key was computed from, not whatever arrived since.
    const { nodes: laidOutNodes, edges: laidOutEdges } = graphRef.current;
    const bodies = bodiesRef.current;
    for (const [id, position] of radialLayout(laidOutNodes, laidOutEdges)) {
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
    // oxlint-disable-next-line set-state-in-effect -- forces the repaint that the ref mutation above cannot
    setFrame((frame) => (frame + 1) % FRAME_COUNTER_MODULO);
    // `topology` is a trigger here too - see above.
    // oxlint-disable-next-line exhaustive-effect-dependencies -- deliberate trigger
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
    wake(WAKE_ALPHA_GRAB);
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
    if (treeLayoutRef.current) setFrame((frame) => (frame + 1) % FRAME_COUNTER_MODULO);
  }, []);

  const handleRelease = useCallback(() => {
    gestureRef.current = false;
    pinnedRef.current = null;
    grabOriginRef.current = null;
    wake(WAKE_ALPHA_RELEASE);
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
    const next = applyZoom(current, Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY));
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
  const showLabels = scale >= LABEL_VISIBILITY_SCALE;

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

  // Everything that only changes with the theme is built once here. The arrays
  // are the same shape every render, so they are memoised alongside the sheet
  // rather than rebuilt inside the JSX.
  const styles = useMemo(() => makeStyles(theme, layout.compact), [theme, layout.compact]);
  const activeButton = useMemo(() => [styles.button, styles.buttonActive], [styles]);
  const activeButtonLabel = useMemo(
    () => [styles.buttonLabel, styles.buttonLabelActive],
    [styles],
  );
  // `userSelect` is web-only, so it cannot go through StyleSheet.create.
  const canvasStyle = useMemo(() => [canvas.root, NO_TEXT_SELECTION], []);
  const overlayStyle = useMemo(() => [canvas.overlay, { top: OVERLAY_TOP }], []);

  return (
    <View style={styles.surface}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle}>
          {`${nodes.length} nodes · ${edges.length} links${activeNodeIds.size > 0 ? ` · ${activeNodeIds.size} active` : ""}${looseAgents > 0 ? ` · ${looseAgents} loose` : ""}`}
        </Text>
        {[
          { label: "−", action: () => setScale((value) => applyZoom(value, 1 / ZOOM_BUTTON_STEP)) },
          { label: "+", action: () => setScale((value) => applyZoom(value, ZOOM_BUTTON_STEP)) },
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
        ].map((control) => {
          const active = "active" in control && control.active;
          return (
            <Pressable
              key={control.label}
              accessibilityRole="button"
              accessibilityLabel={control.label}
              onPress={control.action}
              style={active ? activeButton : styles.button}
            >
              <Text style={active ? activeButtonLabel : styles.buttonLabel}>{control.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Legend theme={theme} compact={layout.compact} />

      <View
        {...canvasResponder.panHandlers}
        {...wheelHandler}
        onLayout={onLayout}
        style={canvasStyle}
      >
        {/*
          Every style below is positional: left, top, width and transform come
          straight out of the simulation and are genuinely different on every
          frame. There is no previous object to reuse and nothing to memoise
          against, so the rule is off for the canvas layer only - the chrome
          around it still goes through the style sheet.
        */}
        {/* oxlint-disable react-perf/jsx-no-new-object-as-prop */}
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
          const thickness = EDGE_THICKNESS;
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
                (neighbourhood && !edgeInCascade ? SIGNAL_FADED_FACTOR : 1);
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
                wave *
                HALO_MAX_OPACITY *
                (neighbourhood && !neighbourhood.has(node.id) ? SIGNAL_FADED_FACTOR : 1);
              if (opacity <= PULSE_MIN_VISIBLE) return null;
              const haloSize = (nodeRadius(node.kind, scale) + HALO_EXTRA + wave * HALO_SWELL) * 2;
              return (
                <View
                  key={`halo:${node.id}`}
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: centerX + body.x * scale - haloSize / 2,
                    top: centerY + body.y * scale - haloSize / 2,
                    width: haloSize,
                    height: haloSize,
                    borderRadius: haloSize / 2,
                    backgroundColor: theme.colors.accent,
                    opacity,
                    zIndex: LAYER.halo,
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
                    left: centerX + body.x * scale - LABEL_WIDTH / 2,
                    top: centerY + body.y * scale + radius + LABEL_GAP,
                    width: LABEL_WIDTH,
                    alignItems: "center",
                    opacity: neighbourhood
                      ? near
                        ? LABEL_OPACITY.active
                        : LABEL_OPACITY.faded
                      : LABEL_OPACITY.resting,
                    zIndex: isHovered ? LAYER.hoveredLabel : LAYER.label,
                  }}
                >
                  <Text
                    numberOfLines={2}
                    style={{
                      textAlign: "center",
                      fontSize:
                        node.kind === "project" ? LABEL_FONT_SIZE.project : LABEL_FONT_SIZE.other,
                      color: theme.colors.foreground,
                      textShadowColor: theme.colors.surface0,
                      textShadowOffset: LABEL_SHADOW_OFFSET,
                      textShadowRadius: LABEL_SHADOW_RADIUS,
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
          <View style={overlayStyle}>
            <Text style={error ? styles.overlayError : styles.overlayText}>
              {error ? String(error) : loading ? "Loading graph…" : "No workspaces yet"}
            </Text>
          </View>
        ) : null}
        {/* oxlint-enable react-perf/jsx-no-new-object-as-prop */}
      </View>
    </View>
  );
}
