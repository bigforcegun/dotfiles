import { type GraphEdge, type GraphNode } from "./model";

/**
 * The force-directed layout: repulsion through a spatial grid, springs along
 * the edges, gravity towards the origin. Pure - it mutates the bodies it is
 * handed and touches nothing else.
 */

export interface Body {
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

/**
 * A cell's two coordinates packed into one number, so the hot loop neither
 * builds a key string nor parses one back. The bias lifts negative cells above
 * zero; the span leaves room for a cell index of +-2^20, which a body would
 * have to sit 1.6 billion world units out to exceed - gravity never lets it.
 */
const GRID_BIAS = 1 << 20;

const GRID_SPAN = 1 << 21;

const gridKey = (cx: number, cy: number): number =>
  (cx + GRID_BIAS) * GRID_SPAN + (cy + GRID_BIAS);

/** The four forward neighbours of a cell, flat: dx, dy, dx, dy. Every pair
 * within one cell width is still visited exactly once, and walking a flat array
 * of numbers allocates nothing per frame - this runs 60 times a second. */
const FORWARD_NEIGHBOURS = [1, 0, -1, 1, 0, 1, 1, 1];

/** Two bodies at the same point have no direction to push apart along, so one
 * is invented: a fixed diagonal nudge, its length chosen to sit just inside the
 * threshold that triggered it. */
const COINCIDENT_EPSILON_SQUARED = 0.01;

const COINCIDENT_NUDGE = 0.7;

const COINCIDENT_NUDGE_SQUARED = 0.98;

/** A spring of zero length has no direction either; this floors the divisor. */
const MIN_SPRING_LENGTH = 0.001;

const SPRING = 0.035;

const CONTAINS_LENGTH = 572;

const SPAWN_LENGTH = 900;

const GRAVITY = 0.002;

const DAMPING = 0.9;

const MAX_STEP = 22;

/** Halves how far a node travels per frame; the layout drifts into place
 * instead of snapping there. */
const MOTION_SCALE = 0.5;

export const ALPHA_DECAY = 0.988;

export const ALPHA_FLOOR = 0.004;

/** A held node keeps the simulation this warm: enough for its neighbours to
 * follow the drag, not so much that the rest of the graph reshuffles. */
export const PINNED_ALPHA = 0.3;

/** Energy injected when a drag starts, and the smaller nudge on release that
 * lets the neighbourhood settle without restarting the whole layout. */
export const WAKE_ALPHA_GRAB = 0.5;

export const WAKE_ALPHA_RELEASE = 0.4;

/** The frame counter only ever has to change to force a repaint; wrapping keeps
 * it away from the integer range where increments stop being exact. */
export const FRAME_COUNTER_MODULO = 1000000;

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** A new node enters on a deterministic ring, so the layout does not jump
 * between refetches. Seeded from the id: the same node always lands in the
 * same place. */
const ENTRY_RING_MIN = 480;

const ENTRY_RING_SPREAD = 1560;

/**
 * Keep exactly one body per node: drop the ones whose node is gone, place the
 * ones that just appeared, leave every settled position untouched. Idempotent,
 * which is what makes it safe to call during render.
 */
export function syncBodies(bodies: Map<string, Body>, nodes: GraphNode[]): void {
  const live = new Set(nodes.map((node) => node.id));
  // Snapshot the keys: the loop deletes from the map it is walking.
  // oxlint-disable-next-line no-useless-spread -- the spread is the snapshot
  for (const id of [...bodies.keys()]) if (!live.has(id)) bodies.delete(id);
  for (const node of nodes) {
    if (bodies.has(node.id)) continue;
    const angle = hashSeed(node.id) * Math.PI * 2;
    const radius = ENTRY_RING_MIN + hashSeed(`${node.id}:r`) * ENTRY_RING_SPREAD;
    bodies.set(node.id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    });
  }
}

export function simulate(
  bodies: Map<string, Body>,
  nodes: GraphNode[],
  edges: GraphEdge[],
  alpha: number,
  pinned: string | null,
): void {
  // Bucket the bodies so repulsion only compares a node with its own cell and
  // the four forward neighbours. Every pair closer than one cell width is still
  // visited exactly once, and the distant ones are never touched.
  const grid = new Map<number, Body[]>();
  const cells: Array<{ cx: number; cy: number; bodies: Body[] }> = [];
  for (const node of nodes) {
    const body = bodies.get(node.id);
    if (!body) continue;
    const cx = Math.floor(body.x / REPULSION_RANGE);
    const cy = Math.floor(body.y / REPULSION_RANGE);
    const cell = grid.get(gridKey(cx, cy));
    if (cell) {
      cell.push(body);
    } else {
      const created = [body];
      grid.set(gridKey(cx, cy), created);
      cells.push({ cx, cy, bodies: created });
    }
    body.vx -= body.x * GRAVITY * alpha;
    body.vy -= body.y * GRAVITY * alpha;
  }

  const repel = (a: Body, b: Body) => {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    let distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < COINCIDENT_EPSILON_SQUARED) {
      dx = COINCIDENT_NUDGE;
      dy = -COINCIDENT_NUDGE;
      distanceSquared = COINCIDENT_NUDGE_SQUARED;
    }
    if (distanceSquared > REPULSION_RANGE_SQUARED) return;
    const distance = Math.sqrt(distanceSquared);
    const force = (REPULSION / distanceSquared) * alpha;
    a.vx += (dx / distance) * force;
    a.vy += (dy / distance) * force;
    b.vx -= (dx / distance) * force;
    b.vy -= (dy / distance) * force;
  };

  for (const { cx, cy, bodies: cell } of cells) {
    for (let i = 0; i < cell.length; i += 1) {
      const a = cell[i] as Body;
      for (let j = i + 1; j < cell.length; j += 1) repel(a, cell[j] as Body);
    }
    for (let n = 0; n < FORWARD_NEIGHBOURS.length; n += 2) {
      const other = grid.get(
        gridKey(cx + (FORWARD_NEIGHBOURS[n] as number), cy + (FORWARD_NEIGHBOURS[n + 1] as number)),
      );
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
    const distance = Math.sqrt(dx * dx + dy * dy) || MIN_SPRING_LENGTH;
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
