import { expect, it, vi } from "vitest";
import { attachStripWheel, stripWheelOffset, type StripWheelEvent } from "./strip-wheel";

it.each([
  [100, 0, 40, 0, 140], [100, 0, -40, 0, 60], [100, 50, 0, 0, 150],
  [100, 50, 10, 0, 150], [100, 10, 50, 0, 150], [100, 0, 2, 1, 132],
  [100, 0, 1, 2, 300], [100, 0, -1000, 0, 0], [750, 0, 100, 0, 800],
])("maps wheel x=%s dx=%s dy=%s mode=%s to %s", (left, dx, dy, mode, expected) => {
  expect(stripWheelOffset(left, 1000, 200, dx, dy, mode)).toBe(expected);
});

it("installs a non-passive listener, hides the native bar, contains edge scroll and cleans up", () => {
  let listener: ((event: StripWheelEvent) => void) | undefined;
  const style = new Map<string, string>();
  const node = { scrollLeft: 100, scrollWidth: 1000, clientWidth: 200,
    style: { setProperty: (key: string, value: string) => { style.set(key, value); }, removeProperty: (key: string) => { style.delete(key); }, getPropertyValue: (key: string) => style.get(key) ?? "" },
    addEventListener: vi.fn((_type: string, callback: (event: StripWheelEvent) => void) => { listener = callback; }),
    removeEventListener: vi.fn(),
  };
  const cleanup = attachStripWheel(node);
  expect(node.addEventListener).toHaveBeenCalledWith("wheel", expect.any(Function), { passive: false });
  expect(style.get("scrollbar-width")).toBe("none");
  const event = { deltaX: 0, deltaY: 50, deltaMode: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  listener!(event);
  expect(node.scrollLeft).toBe(150);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(event.stopPropagation).toHaveBeenCalledOnce();
  node.scrollLeft = 800; listener!(event);
  expect(node.scrollLeft).toBe(800);
  expect(event.preventDefault).toHaveBeenCalledTimes(2);
  cleanup();
  expect(node.removeEventListener).toHaveBeenCalledWith("wheel", listener);
  expect(style.has("scrollbar-width")).toBe(false);
});

it("preserves pinch zoom and native surfaces without DOM wheel support", () => {
  expect(() => attachStripWheel(17)()).not.toThrow();
  let listener: ((event: StripWheelEvent) => void) | undefined;
  const node = { scrollLeft: 0, scrollWidth: 1000, clientWidth: 200,
    addEventListener: (_type: string, callback: (event: StripWheelEvent) => void) => { listener = callback; }, removeEventListener: () => {},
  };
  const cleanup = attachStripWheel(node);
  const event = { deltaX: 0, deltaY: 50, deltaMode: 0, ctrlKey: true, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  listener!(event);
  expect(node.scrollLeft).toBe(0);
  expect(event.preventDefault).not.toHaveBeenCalled();
  cleanup();
});
