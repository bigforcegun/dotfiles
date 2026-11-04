export interface StripWheelEvent {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaMode: number;
  readonly ctrlKey?: boolean;
  readonly cancelable?: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

interface StripScrollNode {
  scrollLeft: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly style?: { setProperty(name: string, value: string): void; removeProperty(name: string): void; getPropertyValue(name: string): string };
  addEventListener(type: "wheel", listener: (event: StripWheelEvent) => void, options: { passive: false }): void;
  removeEventListener(type: "wheel", listener: (event: StripWheelEvent) => void): void;
}

/** Pixels, lines (16px), pages (viewport width); keep the dominant native X delta. */
export function stripWheelOffset(left: number, width: number, viewport: number,
  deltaX: number, deltaY: number, mode: number): number {
  const delta = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY;
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? viewport : 1);
  return Number.isFinite(pixels) ? Math.max(0, Math.min(Math.max(0, width - viewport), left + pixels)) : left;
}

/** RN-web's scrollable node only; native nodes do not implement DOM wheel listeners. */
export function attachStripWheel(value: unknown): () => void {
  if (!value || typeof value !== "object" || !("addEventListener" in value)
    || !("removeEventListener" in value) || !("scrollLeft" in value)) return () => {};
  const node = value as StripScrollNode;
  const previousScrollbarWidth = node.style?.getPropertyValue("scrollbar-width");
  // showsHorizontalScrollIndicator=false also supplies RN-web's WebKit scrollbar rule.
  node.style?.setProperty("scrollbar-width", "none");
  const listener = (event: StripWheelEvent) => {
    if (event.ctrlKey || event.cancelable === false || (!event.deltaX && !event.deltaY)) return;
    event.preventDefault();
    event.stopPropagation(); // Includes edges: do not chain into the outer popover.
    node.scrollLeft = stripWheelOffset(node.scrollLeft, node.scrollWidth, node.clientWidth,
      event.deltaX, event.deltaY, event.deltaMode);
  };
  node.addEventListener("wheel", listener, { passive: false });
  return () => {
    node.removeEventListener("wheel", listener);
    if (previousScrollbarWidth) node.style?.setProperty("scrollbar-width", previousScrollbarWidth);
    else node.style?.removeProperty("scrollbar-width");
  };
}
