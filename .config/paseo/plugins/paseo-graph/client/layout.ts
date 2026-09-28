import { type GraphEdge, type GraphNode } from "./model";

/**
 * The deterministic alternative to the physics: the graph is already a forest,
 * so it can be laid out once on concentric rings with no simulation at all.
 */

/** World units between consecutive rings, at the least. */
export const RING_STEP = 600;

/** Closest two neighbours on one ring may sit, in world units. A ring whose
 * busiest stretch is tighter than this is pushed outward until it is not -
 * but only a ring that holds agents: projects and workspaces are the map's
 * centre and stay on their fixed rings, however lopsided the weights. */
const MIN_NEIGHBOUR_ARC = 60;

/** An agent ring this crowded alternates its nodes across rows instead of
 * queueing them on one arc: forty subagents would otherwise need their own
 * orbit. Rows alternate round the whole ring, not per fan, so the last leaf of
 * one fan and the first of the next never share a row. */
const LEAF_ROWS = 3;
const LEAF_ROW_MIN_SIBLINGS = 6;
/** Radial gap between those rows. */
const LEAF_ROW_STEP = 140;

/** The arc a project or workspace is owed on its fixed ring, whatever its
 * weight: a project with one agent still needs room for its own dot. */
const MIN_HUB_ARC = 160;

/**
 * Splits `span` between siblings in proportion to weight, except that nobody
 * gets less than `minEach`: those below it are lifted to it, and the rest
 * share what is left in proportion again. When even equal shares fall below
 * the floor, equal shares are the best there is.
 */
function spread(weights: readonly number[], span: number, minEach: number): number[] {
  const floor = Math.min(minEach, span / Math.max(1, weights.length));
  const lifted = new Set<number>();
  for (;;) {
    const free = span - floor * lifted.size;
    const freeWeight = weights.reduce((sum, w, i) => (lifted.has(i) ? sum : sum + w), 0) || 1;
    let changed = false;
    for (let i = 0; i < weights.length; i += 1) {
      if (!lifted.has(i) && ((weights[i] as number) / freeWeight) * free < floor) {
        lifted.add(i);
        changed = true;
      }
    }
    if (changed) continue;
    return weights.map((w, i) => (lifted.has(i) ? floor : (w / freeWeight) * free));
  }
}

/**
 * The graph is already a forest: a workspace belongs to its project, and an
 * agent hangs off its recorded parent agent when there is one, otherwise off its
 * workspace. Resolving that single primary parent gives a tree that can be laid
 * out once, deterministically, with no physics at all.
 */
export function radialLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  // Off: roots sit on the first ring, spread round the origin. On: a lone root
  // sits at the origin itself, with its children on the first ring - the shape
  // a focused subtree wants.
  { centerRoots = false }: { centerRoots?: boolean } = {},
): Map<string, { x: number; y: number }> {
  const known = new Set(nodes.map((node) => node.id));
  const parent = new Map<string, string>();

  for (const edge of edges) {
    if (edge.kind !== "contains") continue;
    if (!known.has(edge.from) || !known.has(edge.to)) continue;
    if (!parent.has(edge.to)) parent.set(edge.to, edge.from);
  }
  // A subagent hangs off its parent agent, not off the shared workspace. A
  // native subagent has no workspace edge at all, so this is its only parent.
  for (const edge of edges) {
    if (edge.kind !== "spawn") continue;
    if (!edge.to.startsWith("agent:") && !edge.to.startsWith("subagent:")) continue;
    if (!known.has(edge.from) || !known.has(edge.to)) continue;
    parent.set(edge.to, edge.from);
  }
  // Data is not guaranteed acyclic; a cycle would hang the walks below. Chains
  // already proven to reach a root are memoised, so this stays near-linear on
  // long lineages instead of quadratic.
  const rootedAt = new Set<string>();
  // oxlint-disable-next-line no-useless-spread -- the walk below deletes from `parent`
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

  // Angles first: they depend only on weights. Radii come after, once every
  // ring knows how crowded its tightest stretch is.
  const kindOf = new Map(nodes.map((node) => [node.id, node.kind]));
  // The angular floor a set of siblings on ring `depth` is owed. Only hubs get
  // one: agents and subagents have elastic rings that make their own room.
  const minAngle = (ids: readonly string[], depth: number) => {
    const radius = RING_STEP * (depth + (centerRoots ? 0 : 1));
    const hubs = ids.every((id) => {
      const kind = kindOf.get(id);
      return kind === "project" || kind === "workspace";
    });
    return hubs && radius > 0 ? MIN_HUB_ARC / radius : 0;
  };
  const placed = new Map<string, { angle: number; depth: number; row: number }>();
  const pending: Array<{ id: string; depth: number; start: number; span: number; row: number }> =
    [];
  let rootCursor = 0;
  const rootShares = spread(
    roots.map((id) => weight.get(id) ?? 1),
    Math.PI * 2,
    minAngle(roots, 0),
  );
  roots.forEach((id, index) => {
    const share = rootShares[index] as number;
    pending.push({ id, depth: 0, start: rootCursor, span: share, row: 0 });
    rootCursor += share;
  });
  while (pending.length > 0) {
    const frame = pending.pop();
    if (frame === undefined) break;
    placed.set(frame.id, {
      angle: frame.start + frame.span / 2,
      depth: frame.depth,
      row: frame.row,
    });
    const kids = children.get(frame.id) ?? [];
    if (kids.length === 0) continue;
    const shares = spread(
      kids.map((kid) => weight.get(kid) ?? 1),
      frame.span,
      minAngle(kids, frame.depth + 1),
    );
    let cursor = frame.start;
    for (const [index, kid] of kids.entries()) {
      const share = shares[index] as number;
      pending.push({ id: kid, depth: frame.depth + 1, start: cursor, span: share, row: 0 });
      cursor += share;
    }
  }

  const elastic = new Set<number>();
  for (const [id, { depth }] of placed) {
    const kind = kindOf.get(id);
    if (kind === "agent" || kind === "subagent") elastic.add(depth);
  }
  const ringMembers = new Map<number, string[]>();
  for (const [id, { depth }] of placed) {
    const list = ringMembers.get(depth);
    if (list) list.push(id);
    else ringMembers.set(depth, [id]);
  }
  for (const [depth, ids] of ringMembers) {
    if (!elastic.has(depth) || ids.length < LEAF_ROW_MIN_SIBLINGS) continue;
    ids.sort((a, b) => (placed.get(a)?.angle ?? 0) - (placed.get(b)?.angle ?? 0));
    ids.forEach((id, index) => {
      const entry = placed.get(id);
      if (entry) entry.row = index % LEAF_ROWS;
    });
  }

  // Per ring, the smallest angle between neighbours on the same row. Rows of a
  // staggered fan are radially apart, so only same-row neighbours can collide.
  const byRing = new Map<string, number[]>();
  for (const { angle, depth, row } of placed.values()) {
    const key = `${depth}:${row}`;
    const list = byRing.get(key);
    if (list) list.push(angle);
    else byRing.set(key, [angle]);
  }
  const tightest = new Map<number, number>();
  const deepestRow = new Map<number, number>();
  for (const { depth, row } of placed.values()) {
    deepestRow.set(depth, Math.max(deepestRow.get(depth) ?? 0, row));
  }
  for (const [key, angles] of byRing) {
    if (angles.length < 2) continue;
    angles.sort((a, b) => a - b);
    let gap = Math.PI * 2 - ((angles.at(-1) as number) - (angles[0] as number));
    for (let i = 1; i < angles.length; i += 1) {
      gap = Math.min(gap, (angles[i] as number) - (angles[i - 1] as number));
    }
    const depth = Number(key.split(":")[0]);
    tightest.set(depth, Math.min(tightest.get(depth) ?? Math.PI * 2, gap));
  }
  const maxDepth = Math.max(0, ...[...placed.values()].map((entry) => entry.depth));
  const ringRadius: number[] = [];
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const base = RING_STEP * (depth + (centerRoots ? 0 : 1));
    // A ring never moves inward, and never closer than a step past the ring
    // inside it - counting that ring's outermost leaf row.
    const floor =
      depth === 0
        ? base
        : Math.max(
            base,
            (ringRadius[depth - 1] as number) +
              RING_STEP +
              LEAF_ROW_STEP * (deepestRow.get(depth - 1) ?? 0),
          );
    const gap = elastic.has(depth) ? tightest.get(depth) : undefined;
    // A lone centred root stays at the origin whatever the crowding.
    const crowded = gap !== undefined && gap > 0 ? MIN_NEIGHBOUR_ARC / gap : 0;
    ringRadius.push(depth === 0 && centerRoots ? 0 : Math.max(floor, crowded));
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [id, { angle, depth, row }] of placed) {
    const radius = (ringRadius[depth] as number) + row * LEAF_ROW_STEP;
    positions.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return positions;
}
