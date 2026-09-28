import { type GraphEdge, type GraphNode } from "./model";
import { RING_STEP, radialLayout } from "./layout";

/**
 * Focus: one node pulled out of the whole graph. What stays is the node, every
 * ancestor it hangs from, and everything below it; the rest of the graph is
 * hidden rather than faded, so nothing unrelated competes for space or for the
 * physics. The subtree is laid out afresh around the node at the ordinary ring
 * spacing, and the ancestors stand in a column above it, out of the way.
 */

export interface FocusScope {
  focusId: string;
  /** Ancestor id to its distance above the focus: 1 for a direct parent. */
  ancestors: Map<string, number>;
  descendants: Set<string>;
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Breadth-first both ways over the full graph, so each ancestor gets its
 * nearest distance. Visited sets keep a cyclic lineage from looping. */
export function focusScope(focusId: string, edges: GraphEdge[]): FocusScope {
  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  for (const edge of edges) {
    push(forward, edge.from, edge.to);
    push(backward, edge.to, edge.from);
  }

  const descendants = new Set<string>();
  const below = [focusId];
  for (let i = 0; i < below.length; i += 1) {
    for (const next of forward.get(below[i] as string) ?? []) {
      if (next === focusId || descendants.has(next)) continue;
      descendants.add(next);
      below.push(next);
    }
  }

  const ancestors = new Map<string, number>();
  let level = [focusId];
  for (let depth = 1; level.length > 0; depth += 1) {
    const nextLevel: string[] = [];
    for (const id of level) {
      for (const parent of backward.get(id) ?? []) {
        // A node both above and below the focus is a cycle; below wins, since
        // that is where the layout can place it.
        if (parent === focusId || ancestors.has(parent) || descendants.has(parent)) continue;
        ancestors.set(parent, depth);
        nextLevel.push(parent);
      }
    }
    level = nextLevel;
  }

  return { focusId, ancestors, descendants };
}

export function inScope(scope: FocusScope, id: string): boolean {
  return id === scope.focusId || scope.descendants.has(id) || scope.ancestors.has(id);
}

export function focusLayout(
  scope: FocusScope,
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, { x: number; y: number }> {
  const inSubtree = (id: string) => id === scope.focusId || scope.descendants.has(id);
  const positions = radialLayout(
    nodes.filter((node) => inSubtree(node.id)),
    edges.filter((edge) => inSubtree(edge.from) && inSubtree(edge.to)),
    { centerRoots: true },
  );

  // The column starts one ring clear of the subtree's outermost ring.
  let reach = 0;
  for (const { x, y } of positions.values()) reach = Math.max(reach, Math.hypot(x, y));

  const byLevel = new Map<number, string[]>();
  for (const [id, level] of scope.ancestors) {
    const list = byLevel.get(level);
    if (list) list.push(id);
    else byLevel.set(level, [id]);
  }
  for (const [level, ids] of byLevel) {
    ids.sort();
    ids.forEach((id, index) => {
      positions.set(id, {
        x: (index - (ids.length - 1) / 2) * RING_STEP,
        y: -(reach + RING_STEP * level),
      });
    });
  }
  return positions;
}
