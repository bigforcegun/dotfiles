import type { PulseBlock } from "./model";

export const MAX_BUFFERED_LIVE_EVENTS = 256;
export const MAX_RETAINED_BLOCKS = 5000;

export function setBoundedBlock(
  blocks: Map<string, PulseBlock>,
  block: PulseBlock,
  activeTurnId: string | undefined,
): boolean {
  const current = blocks.get(block.id);
  if (!current || block.order >= current.order) blocks.set(block.id, block);
  if (blocks.size <= MAX_RETAINED_BLOCKS) return false;

  // Find the oldest removable block without sorting the complete retained history.
  let protectedBlock: PulseBlock | undefined;
  if (activeTurnId) for (const entry of blocks.values()) {
    if (entry.turnId === activeTurnId && (!protectedBlock || entry.order > protectedBlock.order)) protectedBlock = entry;
  }
  let oldest: PulseBlock | undefined;
  for (const entry of blocks.values()) {
    if (entry === protectedBlock) continue;
    if (!oldest || entry.order < oldest.order) oldest = entry;
  }
  if (oldest) blocks.delete(oldest.id);
  return true;
}
