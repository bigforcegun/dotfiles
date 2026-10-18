import type { PulseBlock } from "./model";

export const MAX_BUFFERED_LIVE_EVENTS = 256;
export const MAX_RETAINED_BLOCKS = 200;

export function setBoundedBlock(
  blocks: Map<string, PulseBlock>,
  block: PulseBlock,
  activeTurnId: string | undefined,
): boolean {
  const current = blocks.get(block.id);
  if (!current || block.order >= current.order) blocks.set(block.id, block);
  if (blocks.size <= MAX_RETAINED_BLOCKS) return false;

  const ordered = [...blocks.values()].sort((left, right) => left.order - right.order);
  const retained = ordered.slice(-MAX_RETAINED_BLOCKS);
  const active = activeTurnId ? ordered.findLast((entry) => entry.turnId === activeTurnId) : undefined;
  if (active && !retained.includes(active)) retained[0] = active;

  blocks.clear();
  for (const entry of retained.sort((left, right) => left.order - right.order)) blocks.set(entry.id, entry);
  return true;
}
