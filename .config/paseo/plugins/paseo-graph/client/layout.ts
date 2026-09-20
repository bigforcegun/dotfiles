import { type GraphEdge, type GraphNode } from "./model";

/**
 * The deterministic alternative to the physics: the graph is already a forest,
 * so it can be laid out once on concentric rings with no simulation at all.
 */

/** World units between consecutive rings. */
const RING_STEP = 600;

/**
 * The graph is already a forest: a workspace belongs to its project, and an
 * agent hangs off its recorded parent agent when there is one, otherwise off its
 * workspace. Resolving that single primary parent gives a tree that can be laid
 * out once, deterministically, with no physics at all.
 */
export function radialLayout(nodes: GraphNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> {
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
