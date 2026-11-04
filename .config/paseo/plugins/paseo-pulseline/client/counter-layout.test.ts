import { expect, it } from "vitest";
import { COUNTER_SCALE, counterLayout } from "./counter-layout";

it.each(["—", "999", "1.3k", "~12.3k", "~999k+", "~12:04", "00:04", "~99m+", "~150/s", "~999k+/s", "100%", "~100%", "<$0.01", "$1.24", "~$1.24", "$99+", "~$99+", "$0.01", "~$0.01"])("fits scaled counter %s into one sixth of the minimum inner width", original => {
  const counter = counterLayout(original);
  expect(COUNTER_SCALE).toBe(4 / 3);
  expect(counter.iconSize).toBe(10 * COUNTER_SCALE);
  expect(counter.fontSize).toBe(9 * COUNTER_SCALE);
  expect(counter.value.length).toBeLessThanOrEqual(3);
  expect(counter.value).not.toContain("…");
  // Monospace glyph budget with conservative .65em width; 240px inner / 6 slots.
  expect(counter.value.length * counter.fontSize * .65 + counter.iconSize + 2).toBeLessThanOrEqual(240 / 6);
});

it("retains approximation and uses compact seconds/minutes/cent formats without inventing zero", () => {
  expect(counterLayout("~12:04").value).toBe("~9+");
  expect(counterLayout("00:04").value).toBe("4s");
  expect(counterLayout("<$0.01").value).toBe("<1¢");
  expect(counterLayout("$0.01").value).toBe("1¢");
  expect(counterLayout("~99m+").value).toBe("~9+");
  expect(counterLayout("—").value).toBe("—");
  expect(counterLayout("~12.3k").value).toBe("~9+");
});


it("uses one value font and one icon size at all slot widths and formats only the text", () => {
  const values = ["—", "397k", "~12:04", "$0.81", "~$0.81", "~<$0.01", "~150/s"];
  for (const width of [40, 60]) {
    const layouts = values.map(value => counterLayout(value, width));
    expect(new Set(layouts.map(layout => layout.fontSize))).toEqual(new Set([9 * COUNTER_SCALE]));
    expect(new Set(layouts.map(layout => layout.iconSize))).toEqual(new Set([10 * COUNTER_SCALE]));
    for (const layout of layouts) expect(layout.value.length * layout.fontSize * .65 + layout.iconSize + 2).toBeLessThanOrEqual(width);
  }
  expect(counterLayout("397k", 60).value).toBe("397k");
  expect(counterLayout("02:04", 60).value).toBe("2m");
  expect(counterLayout("$0.81").value).toBe("81¢");
  expect(counterLayout("~$0.81").value).toBe("81¢");
});
