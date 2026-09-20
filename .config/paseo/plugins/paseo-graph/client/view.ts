import { type ViewStyle } from "react-native";
import { type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { type GraphNode, type NodeKind } from "./model";
import { clamp } from "./physics";

/**
 * How the canvas looks and what maps to what: dot sizes, layer order, opacity
 * tables, the zoom range, and the arithmetic that frames the graph in a
 * viewport. No component here - just the numbers and the functions over them.
 */

export const RADIUS: Record<NodeKind, number> = { project: 20, workspace: 13, agent: 9 };

/** Below this a dot stops being a target you can hit with a pointer. */
const MIN_DOT_RADIUS = 3;

/** Well under 1: dots grow far slower than distances, so zooming in separates
 * nodes instead of covering the screen with them. */
const RADIUS_ZOOM_EXPONENT = 0.3;

export function nodeRadius(kind: NodeKind, scale: number): number {
  return Math.max(MIN_DOT_RADIUS, RADIUS[kind] * Math.pow(scale, RADIUS_ZOOM_EXPONENT));
}

/**
 * Every layer the canvas stacks, in one table - the only way to see the order
 * at a glance. Edges and the signal halo sit under the dots; a hovered node and
 * its label jump above everything so neither is clipped by a neighbour.
 */
export const LAYER = {
  halo: 1,
  node: 2,
  label: 3,
  hoveredNode: 20,
  hoveredLabel: 21,
} as const;

/** Faded by a hover elsewhere, a signal keeps only this much of its strength -
 * present, but never competing with what the pointer is pointing at. */
export const SIGNAL_FADED_FACTOR = 0.1;

/** Hairline: an edge is context, not content. */
export const EDGE_THICKNESS = 1.5;

/**
 * A label is a fixed-width centred block under its dot, so lines wrap the same
 * way whatever the zoom - the dot moves, the text box does not resize.
 */
export const LABEL_WIDTH = 180;

/** Clear of the dot's own edge. */
export const LABEL_GAP = 3;

export const LABEL_FONT_SIZE = { project: 12, other: 10 };

/** A soft halo of the canvas colour, so a label stays legible over an edge. */
export const LABEL_SHADOW_RADIUS = 4;

export const LABEL_SHADOW_OFFSET = { width: 0, height: 0 };

/** Ring around a dot: heavier when hovered or when it is a project. */
export const NODE_BORDER_WIDTH = { resting: 1, emphasised: 2 };

/** Clear of the toolbar and the legend above it. */
export const OVERLAY_TOP = 24;

export const INITIAL_SCALE = 0.2;

/** `userSelect` is a web-only style; React Native's ViewStyle has no such key. */
export const NO_TEXT_SELECTION = { userSelect: "none" } as unknown as ViewStyle;

/** One press of the zoom buttons. */
export const ZOOM_BUTTON_STEP = 1.25;

/** Wheel delta to zoom factor, through exp(): one notch is a small nudge, a
 * fast flick still crosses the range without ever overshooting past zero. */
export const WHEEL_ZOOM_SENSITIVITY = 0.0015;

/** Under this scale labels would overlap into noise, so they are dropped
 * outright rather than drawn unreadably. */
export const LABEL_VISIBILITY_SCALE = 0.05;

const MIN_SCALE = 0.1;

const MAX_SCALE = 16;

const FIT_MARGIN = 120;

/**
 * Zooming out must never push the view back in. Framing a deep tree can leave
 * the scale below the usual floor, and clamping to that floor would enlarge the
 * graph instead of shrinking it - so the floor follows the current scale down.
 * Outside a fit the range is the ordinary MIN_SCALE..MAX_SCALE.
 */
export function applyZoom(current: number, factor: number): number {
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
export function fitView(bounds: Bounds, viewport: Viewport): { scale: number; pan: { x: number; y: number } } {
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
export function isHoverStale(hovered: string | null, nodes: GraphNode[]): boolean {
  if (!hovered) return false;
  return !nodes.some((node) => node.id === hovered);
}

/**
 * A wheel is not a React Native concept, so this is the raw host event. It only
 * ever fires on the web build; touch platforms have no wheel to turn.
 */
export interface WheelLike {
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
export const NODE_OPACITY = { resting: 0.58, active: 1, faded: 0.08 };

export const LABEL_OPACITY = { resting: 0.5, active: 1, faded: 0.1 };

export const EDGE_OPACITY = {
  contains: { resting: 0.32, active: 0.9, faded: 0.06 },
  spawn: { resting: 0.42, active: 1, faded: 0.06 },
};

/** The one deliberate literal in this file: a project dot is black in every
 * theme, so it needs an outline instead of a fill to stay visible. */
export const PROJECT_COLOR = "#000000";

/** Pointer travel below this never counts as a drag. */

export function nodeColor(node: GraphNode, theme: PluginSurfaceProps["theme"]): string {
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
