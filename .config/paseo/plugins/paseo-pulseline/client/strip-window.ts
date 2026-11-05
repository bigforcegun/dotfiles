/** Gap between neighbouring bars; 2px keeps same-kind neighbours distinct. */
export const STRIP_BAR_GAP = 2;
export const STRIP_COLUMN_PITCH = 12;
export const STRIP_COLUMN_WIDTH = STRIP_COLUMN_PITCH - STRIP_BAR_GAP;
export function stripExtent(count: number): number { return Math.max(0, count * STRIP_COLUMN_PITCH - STRIP_BAR_GAP); }
export function stripWindow(count: number, offset: number, viewport: number) {
  offset = Math.max(0, Math.min(offset, Math.max(0, stripExtent(count) - viewport)));
  const screens = Math.max(1, Math.ceil(viewport / STRIP_COLUMN_PITCH));
  const first = Math.max(0, Math.floor(offset / STRIP_COLUMN_PITCH) - screens * 2);
  const end = Math.min(count, Math.ceil((offset + viewport) / STRIP_COLUMN_PITCH) + screens * 2);
  return { first, end, leading: first * STRIP_COLUMN_PITCH, trailing: Math.max(0, stripExtent(count) - end * STRIP_COLUMN_PITCH) };
}
export function prependOffset(oldOffset: number, prependedCount: number): number { return oldOffset + prependedCount * STRIP_COLUMN_PITCH; }
