import type { PulseBlock } from "./model";

export const MAX_BUFFERED_LIVE_EVENTS = 256;
export const MAX_RETAINED_BLOCKS = 5000;

interface BlockIndex {
  readonly latestByTurn: Map<string, PulseBlock>;
  readonly running: Map<string, PulseBlock>;
  runningByTurn: Map<string | undefined, PulseBlock[]>;
  dirtyTurns: Set<string | undefined>;
  runningEntries: number;
  latestTurnId: string | undefined;
  latestTurnOrder: number;
  ordered: boolean;
  newest: PulseBlock | undefined;
}
const indexes = new WeakMap<Map<string, PulseBlock>, BlockIndex>();
function indexFor(blocks: Map<string, PulseBlock>): BlockIndex {
  let index = indexes.get(blocks);
  if (!index || blocks.size === 0) {
    index = { latestByTurn: new Map(), running: new Map(), runningByTurn: new Map(), dirtyTurns: new Set(), runningEntries: 0, latestTurnId: undefined, latestTurnOrder: -Infinity, ordered: true, newest: undefined };
    indexes.set(blocks, index);
  }
  return index;
}

export function blockActivity(blocks: Map<string, PulseBlock>, activeTurnId?: string): PulseBlock | undefined {
  const index = indexFor(blocks);
  const turnId = activeTurnId ?? index.latestTurnId;
  const tail = index.runningByTurn.get(turnId);
  if (tail) {
    if (index.dirtyTurns.delete(turnId)) tail.sort((a, b) => a.order - b.order);
    while (tail.length) {
      const block = tail.at(-1)!;
      if (index.running.get(block.id) === block) return block;
      tail.pop(); index.runningEntries--;
    }
    index.runningByTurn.delete(turnId);
  }
  const last = index.newest;
  return last?.metadata?.type === "tool" && last.metadata.status === "running" && last.turnId !== turnId ? undefined : last;
}

export function removeBoundedBlock(blocks: Map<string, PulseBlock>, id: string): void {
  const index = indexFor(blocks);
  const block = blocks.get(id);
  if (!block) return;
  blocks.delete(id); index.running.delete(id);
  if (block.turnId && index.latestByTurn.get(block.turnId) === block) index.latestByTurn.delete(block.turnId);
  if (index.newest === block) index.newest = undefined; // coalesced replacement follows immediately
}

export function setBoundedBlock(blocks: Map<string, PulseBlock>, block: PulseBlock, activeTurnId: string | undefined): boolean {
  const index = indexFor(blocks);
  const current = blocks.get(block.id);
  if (current && block.order < current.order) return false;
  if (!current && index.ordered && blocks.size >= MAX_RETAINED_BLOCKS && block.turnId !== activeTurnId && block.order < (blocks.values().next().value?.order ?? Infinity)) return true;
  index.ordered &&= !index.newest || block.order >= index.newest.order;
  // Updating a tool moves it to its new chronological position in the insertion queue.
  if (current) {
    blocks.delete(block.id);
    if (current.turnId !== block.turnId && current.turnId && index.latestByTurn.get(current.turnId) === current) index.latestByTurn.delete(current.turnId);
  }
  blocks.set(block.id, block);
  if (!index.newest || block.order >= index.newest.order) index.newest = block;
  if (block.turnId && block.order >= (index.latestByTurn.get(block.turnId)?.order ?? -Infinity)) index.latestByTurn.set(block.turnId, block);
  if (block.turnId && block.order >= index.latestTurnOrder) { index.latestTurnId = block.turnId; index.latestTurnOrder = block.order; }
  index.running.delete(block.id);
  if (block.metadata?.type === "tool" && block.metadata.status === "running") {
    index.running.set(block.id, block);
    const tail = index.runningByTurn.get(block.turnId) ?? [];
    if (block.order < (tail.at(-1)?.order ?? -Infinity)) index.dirtyTurns.add(block.turnId);
    tail.push(block); index.runningByTurn.set(block.turnId, tail); index.runningEntries++;
  }
  if (index.runningEntries > MAX_RETAINED_BLOCKS * 2) {
    index.runningByTurn.clear(); index.dirtyTurns.clear(); index.runningEntries = 0;
    for (const item of index.running.values()) {
      const tail = index.runningByTurn.get(item.turnId) ?? [];
      tail.push(item); index.runningByTurn.set(item.turnId, tail); index.runningEntries++;
      if (!index.ordered) index.dirtyTurns.add(item.turnId);
    }
  }
  if (blocks.size <= MAX_RETAINED_BLOCKS) return false;
  if (!index.ordered) {
    // Before-pages can arrive out of order. Normalize only this exceptional path;
    // monotonically ordered live inserts and updates never scan history.
    const ordered = [...blocks.values()].sort((a, b) => a.order - b.order);
    blocks.clear();
    for (const item of ordered) blocks.set(item.id, item);
    index.ordered = true;
  }
  const protectedBlock = activeTurnId ? index.latestByTurn.get(activeTurnId) : undefined;
  const iterator = blocks.values();
  let oldest = iterator.next().value;
  if (oldest === protectedBlock) oldest = iterator.next().value;
  if (oldest) {
    blocks.delete(oldest.id);
    index.running.delete(oldest.id);
    if (oldest.turnId && index.latestByTurn.get(oldest.turnId) === oldest) index.latestByTurn.delete(oldest.turnId);
  }
  return true;
}
