import type { PulseBlock } from "./model";
import { pulseVolume, textTokenEstimate } from "./volume";

/** Display-only runs. Raw sequence identities remain in the store for paging,
 * deduplication and accounting. Gaps (including invisible user/turn events) are
 * boundaries too: adjacency in the visible strip alone is not sufficient. */
export function reasoningRuns(blocks: readonly PulseBlock[], starts: ReadonlyMap<string, number>) {
  const display: PulseBlock[] = [];
  const bySource = new Map<string, PulseBlock>();
  for (let index = 0; index < blocks.length;) {
    const first = blocks[index++]!;
    if (first.kind !== "reasoning") { display.push(first); continue; }
    const members = [first];
    let last = first;
    while (index < blocks.length) {
      const next = blocks[index]!;
      if (next.kind !== "reasoning" || next.turnId !== first.turnId ||
          (starts.get(next.id) ?? next.order) !== last.order + 1) break;
      members.push(next); last = next; index++;
    }
    const id = `reasoning:${starts.get(first.id) ?? first.order}`;
    const text = members.map(block => block.text ?? "").join("");
    const run = members.length === 1 && first.id === id ? first : {
      ...first, id, order: last.order, text, ...pulseVolume(textTokenEstimate(text)),
    };
    display.push(run);
    for (const member of members) bySource.set(member.id, run);
  }
  return { blocks: display, bySource };
}
