// Agreed formatting rules. Counts stay integers or become compact `k`; applicable
// rates carry one decimal; money keeps two; turn/chat/tool-total use unbounded
// `MM:SS` like the original formatter; tool average stays decimal seconds.
// Original: .config/opencode/plugins/chat-pulse-line/pulse-line.js:351 and :369.

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "?";
  if (value < 1_000) return String(Math.round(value));
  const scaled = (value / 1_000).toFixed(1);
  // A whole number of thousands drops its decimal; 9 999 stays 10.0k so the
  // reader can tell it apart from a flat 10 000.
  return `${value % 1_000 === 0 ? scaled.replace(/\.0$/, "") : scaled}k`;
}

/** Unbounded minutes on purpose: `125:07` is a valid two-hour turn. */
export function formatClock(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "?";
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatToolAverage(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "?";
  return `${(milliseconds / 1_000).toFixed(1)}s`;
}

export function formatRate(value: number): string {
  if (!Number.isFinite(value)) return "?";
  return value.toFixed(1);
}

export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "?";
  // Half-up on the cent, so 1.235 is 1.24 and not a binary-rounding surprise.
  const cents = Math.round(value * 100 + Number.EPSILON * 100) / 100;
  return `$${cents.toFixed(2)}`;
}
