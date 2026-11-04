/** Shared value/icon scale; change to 1.5 to enlarge both together. */
export const COUNTER_SCALE = 4 / 3;

export function counterLayout(original: string, slotWidth = 40): { value: string; fontSize: number; iconSize: number } {
  const fontSize = 9 * COUNTER_SCALE;
  const iconSize = 10 * COUNTER_SCALE;
  const capacity = Math.max(2, Math.floor((slotWidth - iconSize - 2) / (fontSize * .65)));
  let approximate = original.startsWith("~") ? "~" : "";
  let room = capacity - approximate.length;
  let value = original.replace(/^~/, "").replace(/\/s$/, "");
  if (value === "<$0.01") value = "<1¢";
  else if (/^\$0\.\d+$/.test(value) && Number(value.slice(1)) > 0) value = `${Math.round(Number(value.slice(1)) * 100)}¢`;
  // Currency symbols/inequalities keep their units; approximation stays in the tooltip.
  if (approximate && /¢$/.test(value) && value.length <= capacity && value.length > room) {
    approximate = ""; room = capacity;
  }
  const clock = /^(\d+):(\d{2})$/.exec(value);
  if (clock) value = Number(clock[1]) > 0 ? `${Number(clock[1])}m` : `${Number(clock[2])}s`;
  if (value.length > room) {
    const decimal = /^(\$?)(\d+)\.\d+([a-z%]?)$/.exec(value);
    if (decimal) value = `${decimal[1]}${decimal[2]}${decimal[3]}`;
  }
  if (value.length > room) {
    const numeric = /^(\$?)(\d+)([a-z%]?)(\+?)$/.exec(value);
    if (numeric) {
      const currency = room >= 3 ? numeric[1] ?? "" : "";
      const unit = room >= 3 && !currency && numeric[3] !== "%" ? numeric[3] ?? "" : "";
      const digits = Math.max(1, room - currency.length - unit.length - 1);
      value = `${currency}${"9".repeat(digits)}${unit}+`;
    }
  }
  // The current metric vocabulary fits above. An unknown future format remains
  // available in its tooltip rather than being cut off with an ellipsis.
  if (value.length > room) value = "—";
  return { value: approximate + value, fontSize, iconSize };
}
