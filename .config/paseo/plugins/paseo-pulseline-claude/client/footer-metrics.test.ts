// Reviewer items (2) and (3): the empty footer and the output-rate metric.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDetailModel } from "./detail-model.ts";
import { footerOf, isSeparator, renderDetail, type FakeNode } from "./fake-render.ts";
import { derivePulseMetrics } from "./metrics.ts";
import { initialPulseState, reducePulse } from "./model.ts";
import { at } from "./fixtures.ts";

test("an empty idle model still renders the footer, last and full width", () => {
  const loaded = reducePulse(initialPulseState, { type: "history", epoch: "e", entries: [] });
  const model = buildDetailModel(loaded, derivePulseMetrics(loaded, Date.parse(at(30))));

  assert.equal(model.footer.placement, "last");
  assert.equal(model.footer.width, 36);
  assert.equal(model.footer.accessibilityLabel, "Agent activity pulse");
  assert.deepEqual(
    model.footer.segments.map((segment) => [
      segment.kind,
      segment.height,
      segment.weight,
      segment.token,
      segment.glyph,
      segment.active,
      segment.separator,
    ]),
    [["other", 4, 1, "border", "▁", false, false]],
    "the empty state is one placeholder bar, not a sentence",
  );

  const root = renderDetail(model);
  const footer = footerOf(root);
  assert.equal(footer.props.accessibilityLabel, "Agent activity pulse");
  assert.equal(footer.style.width, "100%", "the footer spans the popover");
  assert.equal(footer.children.length, 1, "one placeholder bar, no separator");
  assert.equal(isSeparator(footer.children[0] as FakeNode), false);
  assert.equal(
    (footer.children[0] as FakeNode).children[0]?.props.accessibilityLabel,
    "other",
  );
  // The empty state says "No metrics yet" once, above the footer, and nothing else.
  assert.deepEqual(
    root.children.map((child) => child.text),
    ["No activity yet", "", "No metrics yet", ""],
  );
});

test("output rate joins the timing group in the agreed order", () => {
  let state = reducePulse(initialPulseState, {
    type: "history",
    epoch: "e",
    entries: [],
  });
  // 1500 output tokens over a 3 599 000 ms chat, with an observed 12.34 chars/s.
  state = {
    ...state,
    blocks: [
      { key: "a", kind: "text", startedAt: at(0), endedAt: at(0), pending: false },
      { key: "b", kind: "text", startedAt: at(3599), endedAt: at(3599), pending: false },
    ],
    usage: { outputTokens: 1_500 },
    lastTurnMs: 10_000,
    turnTextId: "t1",
    turnTextChars: 1_234,
    turnTextFirstAt: at(0),
    turnTextLastAt: at(100),
  };
  const metrics = derivePulseMetrics(state, Date.parse(at(3_600)));
  const model = buildDetailModel(state, metrics);
  const timing = model.rows.filter((row) => ["🏁", "Σ", "⚡", "↯"].includes(row.glyph));
  assert.deepEqual(timing.map((row) => row.glyph), ["⚡", "↯", "🏁", "Σ"]);

  const byGlyph = Object.fromEntries(timing.map((row) => [row.glyph, row.value]));
  assert.equal(byGlyph["⚡"], "0.4/s", "1500 output tokens over 3599 s");
  assert.equal(byGlyph["↯"], "~12.3/s", "12.34 chars/s rounds to one decimal and stays approximate");
  assert.equal(byGlyph["Σ"], "~59:59");
});

test("the output rate is omitted when either side of it is missing", () => {
  const state = reducePulse(initialPulseState, {
    type: "agent",
    status: "idle",
    activeTurn: null,
    usage: { outputTokens: 1_500 },
  });
  const metrics = derivePulseMetrics(state, Date.parse(at(30)));
  assert.equal(metrics.outputTokensPerSecond, undefined, "no observed chat span, no rate");
  const model = buildDetailModel(state, metrics);
  assert.equal(model.rows.some((row) => row.glyph === "⚡"), false);
});
