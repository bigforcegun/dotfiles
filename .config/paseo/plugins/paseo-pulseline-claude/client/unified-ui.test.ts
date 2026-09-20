// Task 2 observable contract: pulse-only label, null icon, icon-led metrics and a
// full-width pulse footer rendered last, all fed by one local segment model.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PULSELINE_PILL_TITLE, buildPillLabel, pulselineButton } from "./descriptor.ts";
import { buildDetailModel } from "./detail-model.ts";
import { barHeightPx } from "./detail-tree.ts";
import { footerOf, isSeparator, renderDetail } from "./fake-render.ts";
import { buildPulseDot } from "./pulse-dot.ts";
import { PULSE_IDLE_LABEL, labelGlyph, renderPulseLabel } from "./label.ts";
import { derivePulseMetrics } from "./metrics.ts";
import { initialPulseState, reducePulse } from "./model.ts";
import { buildPulseSegments } from "./pulse-segments.ts";
import { PROVIDERS, USAGE_FULL, at, conversation } from "./fixtures.ts";

const NOW = Date.parse(at(30));
const ui = { Icon: () => null, Content: () => null };

function read(file: string): string {
  return readFileSync(new URL(`./${file}`, import.meta.url).pathname, "utf8");
}

function loaded(provider: (typeof PROVIDERS)[number] = "claude") {
  return reducePulse(initialPulseState, {
    type: "history",
    epoch: "e",
    entries: conversation(provider),
  });
}

test("the visible label carries pulse glyphs only", () => {
  const label = buildPillLabel(loaded(), derivePulseMetrics(loaded(), NOW));
  assert.match(label, /^[⣀⣤⣶⣿]+$/, label);
  assert.equal(/plc|Pulseline|Claude/i.test(label), false, "no variant or provider text");
  assert.equal(/[↓↑◇⛁$~]/.test(label), false, "no metrics ride in the pill");
});

test("the label and the footer come from the same segment model", () => {
  const state = loaded();
  const segments = buildPulseSegments(state, { width: 40, phase: 0 });
  const label = renderPulseLabel(state, { width: 40, phase: 0 });
  // Same segments, one glyph each; the pill folds the eight model steps into the
  // four lower blocks that share a baseline in the host font.
  assert.equal(label, segments.map(labelGlyph).join(""));
  assert.equal(label.length, segments.length, "contiguous: one block per segment, no spacing");
  assert.match(label, /^[⣀⣤⣶⣿]+$/, "narrow braille cells, all sharing one bottom edge");
});

test("a narrow label keeps the newest and active glyphs", () => {
  const busy = reducePulse(loaded(), {
    type: "agent",
    status: "running",
    activeTurn: { turnId: "t", startedAt: at(20) },
  });
  const wide = renderPulseLabel(busy, { width: 40, phase: 1 });
  const narrow = renderPulseLabel(busy, { width: 8, phase: 1 });
  assert.equal(narrow.length, 8);
  assert.equal(narrow, wide.slice(-8), "narrowing drops the oldest, never the newest");
  assert.equal(narrow.at(-1), wide.at(-1), "the active tail survives");
});

test("an idle empty model falls back to a neutral mark, never to the plugin name", () => {
  const label = buildPillLabel(initialPulseState, derivePulseMetrics(initialPulseState, NOW));
  assert.equal(label, "⣀");
  assert.equal(/Pulseline|plc/i.test(label), false);
  assert.ok(label.length > 0, "an empty label would make the host fall back to the title");
});

test("a busy model with nothing drawn yet shows the busy dot", () => {
  const busy = reducePulse(initialPulseState, {
    type: "agent",
    status: "running",
    activeTurn: { turnId: "t", startedAt: at(20) },
  });
  assert.equal(buildPillLabel(busy, derivePulseMetrics(busy, NOW)), "⣀");
});

test("the descriptor keeps its accessible title and a colour-bearing dot icon", () => {
  const button = pulselineButton(ui, { label: "⣀⣀" });
  assert.equal(button.title, PULSELINE_PILL_TITLE);
  assert.equal(typeof button.icon, "function");
  const source = read("pulse-icon.tsx");
  assert.match(source, /borderRadius/, "the mandatory 16x16 slot draws a round dot");
  assert.match(source, /theme\.colors\[dot\.token\]/, "and it is tinted by the theme");
  assert.match(source, /usePulseView\(/, "and it still owns the per-agent lease");
});

test("detail metrics are icon-led and ordered chat, timing, tools", () => {
  const state = reducePulse(loaded(), {
    type: "agent",
    status: "running",
    activeTurn: { turnId: "t", startedAt: at(20) },
    usage: USAGE_FULL,
  });
  const model = buildDetailModel(state, derivePulseMetrics(state, NOW));
  const glyphs = model.rows.map((row) => row.glyph);
  assert.deepEqual(glyphs.slice(0, 3), ["↓", "↑", "◇"]);
  assert.ok(glyphs.includes("💬"), "an active turn uses the speech glyph");
  assert.ok(glyphs.includes("Σ"));
  assert.ok(glyphs.includes("🔧"));
  assert.ok(glyphs.includes("⏱"));
  assert.ok(glyphs.includes("⌛"));
  for (const row of model.rows) assert.ok(row.glyph.length > 0, row.value);
});

test("a finished turn swaps the speech glyph for the flag", () => {
  let state = reducePulse(loaded(), { type: "turn", phase: "started", turnId: "t", at: at(1) });
  state = reducePulse(state, { type: "turn", phase: "completed", turnId: "t", at: at(9) });
  const model = buildDetailModel(state, derivePulseMetrics(state, NOW));
  const glyphs = model.rows.map((row) => row.glyph);
  assert.ok(glyphs.includes("🏁"));
  assert.equal(glyphs.includes("💬"), false);
});

test("durations render as MM:SS and tool average as decimal seconds", () => {
  const state = reducePulse(loaded(), {
    type: "agent",
    status: "idle",
    activeTurn: null,
    usage: USAGE_FULL,
  });
  const model = buildDetailModel(state, derivePulseMetrics(state, NOW));
  const rows = new Map(model.rows.map((row) => [row.glyph, row.value]));
  assert.match(rows.get("Σ") ?? "", /^~?\d{2,}:\d{2}$/, rows.get("Σ"));
  assert.match(rows.get("⌛") ?? "", /^~?\d{2,}:\d{2}$/, rows.get("⌛"));
  assert.match(rows.get("⏱") ?? "", /^~?\d+\.\d+s$/, rows.get("⏱"));
  assert.equal(rows.get("$"), "$0.42");
  assert.equal(rows.get("↓"), "18k");
});

test("the detail model exposes the pulse footer last and full width", () => {
  const state = loaded();
  const model = buildDetailModel(state, derivePulseMetrics(state, NOW));
  assert.equal(model.footer.placement, "last");
  assert.deepEqual(
    model.footer.segments.map((segment) => segment.glyph),
    buildPulseSegments(state, { width: model.footer.width, phase: 0 }).map(
      (segment) => segment.glyph,
    ),
  );
  const root = renderDetail(model);
  const footer = footerOf(root);
  assert.equal(
    footer.props.accessibilityLabel,
    model.footer.accessibilityLabel,
    "the last child is the pulse footer",
  );
  assert.equal(footer.style.width, "100%", "the footer spans the popover");
  assert.deepEqual(
    footer.children.filter((node) => !isSeparator(node)).map((wrapper) => [
      wrapper.children[0]?.props.accessibilityLabel,
      wrapper.children[0]?.style.height,
    ]),
    model.footer.segments.map((segment) => [segment.kind, barHeightPx(segment.height)]),
  );
});
