import { type GraphEdge } from "./model";

/**
 * Which parts of the graph a running chat lights up: the chain from its project
 * down to the chat itself, with each entry's distance from the chat. The pulse
 * layer turns those distances into a travelling crest.
 */

/** A parent chain longer than this is corrupt data, not a deep subagent tree. */
const SIGNAL_MAX_DEPTH = 32;

interface SignalChains {
  /** Distance from the running chat, in hops. */
  edges: Map<string, number>;
  nodes: Map<string, number>;
}

/** Keep the shortest distance seen for an id; a node reachable from two
 * running chats belongs to the nearer one. */
function record(map: Map<string, number>, id: string, depth: number): void {
  const known = map.get(id);
  if (known === undefined || depth < known) map.set(id, depth);
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
export function signalChains(edges: GraphEdge[], activeNodeIds: ReadonlySet<string>): SignalChains {
  const chains: SignalChains = { edges: new Map(), nodes: new Map() };
  if (activeNodeIds.size === 0) return chains;

  const incoming = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const list = incoming.get(edge.to);
    if (list) list.push(edge);
    else incoming.set(edge.to, [edge]);
  }
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
