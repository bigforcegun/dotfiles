// Cross-contract baseline handed over by the Task 3 reviewer: formatting, the full
// metric row order, and the footer's exact structure.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDetailModel, type DetailRow } from "./detail-model.ts";
import {
  BAR_WIDTH,
  FOOTER_HEIGHT,
  barHeightPx,
} from "./detail-tree.ts";
import {
  FAKE_COLORS,
  descendants,
  footerOf,
  isSeparator,
  renderDetail,
  type FakeNode,
} from "./fake-render.ts";
import { formatCount, formatMoney, formatRate } from "./format.ts";
import { derivePulseMetrics, type PulseMetrics } from "./metrics.ts";
import { initialPulseState, type PulseModelState } from "./model.ts";
import { at } from "./fixtures.ts";

test("counts compact exactly at the agreed boundaries", () => {
  assert.deepEqual(
    [999, 1_000, 1_250, 9_999, 10_000].map(formatCount),
    ["999", "1k", "1.3k", "10.0k", "10k"],
  );
});

test("rates stay raw with one decimal", () => {
  assert.deepEqual(
    [999, 1_000, 1_250, 9_999, 10_000].map((value) => `${formatRate(value)}/s`),
    ["999.0/s", "1000.0/s", "1250.0/s", "9999.0/s", "10000.0/s"],
  );
});

test("money keeps two decimals and rounds half up", () => {
  assert.equal(formatMoney(1.235), "$1.24");
  assert.equal(formatMoney(0.4), "$0.40");
});

/**
 * The reviewer's full-metric fixture. Its inputs are metric values (tool average
 * and tool total are independent observations there), so the row contract is
 * asserted over the metrics object; model-derived metrics keep their own tests.
 */
const FULL_METRICS: PulseMetrics = {
  inputTokens: { value: 999, approx: false },
  outputTokens: { value: 1_500, approx: false },
  cachedInputTokens: { value: 12_345, approx: false },
  outputTokensPerSecond: { value: 1_500 / 3_599, approx: false },
  textCharsPerSecond: { value: 9.94, approx: true },
  turnSeconds: { value: 7_507, approx: false },
  chatSeconds: { value: 3_599, approx: true },
  toolCount: { value: 12, approx: false },
  toolAvgSeconds: { value: 4.19, approx: true },
  toolTotalSeconds: { value: 3_600, approx: true },
  costUsd: { value: 1.235, approx: false },
};

function fullState(): PulseModelState {
  return {
    ...initialPulseState,
    historyLoaded: true,
    usage: { contextWindowUsedTokens: 1_500, contextWindowMaxTokens: 128_000 },
  };
}

test("the full fixture renders the agreed rows, in order, without text labels", () => {
  const model = buildDetailModel(fullState(), FULL_METRICS);
  assert.deepEqual(
    model.rows.map((row) => [row.glyph, row.value]),
    [
      ["↓", "999"],
      ["↑", "1.5k"],
      ["◇", "12.3k"],
      ["⚡", "0.4/s"],
      ["↯", "~9.9/s"],
      ["🏁", "125:07"],
      ["Σ", "~59:59"],
      ["🔧", "12"],
      ["⏱", "~4.2s"],
      ["⌛", "~60:00"],
      ["◇", "1.5k/128k"],
      ["$", "$1.24"],
    ],
  );
  const rendered = renderDetail(model).children[2] as FakeNode;
  assert.equal(rendered.children.length, model.rows.length);
  for (const [index, node] of rendered.children.entries()) {
    const row = model.rows[index] as DetailRow;
    assert.deepEqual(
      node.children.map((child) => [child.type, child.text]),
      [["Text", row.glyph], ["Text", row.value]],
      "a row draws its glyph and its value, never its name",
    );
  }
});

test("an active turn swaps the flag for the speech glyph", () => {
  const active = { ...fullState(), activeTurn: { turnId: "t", startedAt: at(0) } };
  const model = buildDetailModel(active, FULL_METRICS);
  assert.equal(model.rows.find((row) => row.label === "Turn")?.glyph, "💬");
});

test("a missing datum drops its row, and a half-known context keeps a question mark", () => {
  const partial: PulseModelState = {
    ...initialPulseState,
    historyLoaded: true,
    usage: { contextWindowUsedTokens: 1_500 },
  };
  const model = buildDetailModel(partial, derivePulseMetrics(partial, Date.parse(at(30))));
  assert.deepEqual(model.rows.map((row) => [row.glyph, row.value]), [["◇", "1.5k/?"]]);

  const other: PulseModelState = {
    ...initialPulseState,
    historyLoaded: true,
    usage: { contextWindowMaxTokens: 128_000 },
  };
  assert.deepEqual(
    buildDetailModel(other, derivePulseMetrics(other, Date.parse(at(30)))).rows.map((r) => r.value),
    ["?/128k"],
  );
});

test("the output rate needs output tokens and a non-zero chat span", () => {
  const noChat: PulseModelState = {
    ...initialPulseState,
    historyLoaded: true,
    usage: { outputTokens: 1_500 },
  };
  const model = buildDetailModel(noChat, derivePulseMetrics(noChat, Date.parse(at(30))));
  assert.equal(model.rows.some((row) => row.glyph === "⚡"), false);
});

test("a model with no metrics says so", () => {
  const model = buildDetailModel(
    { ...initialPulseState, historyLoaded: true },
    derivePulseMetrics(initialPulseState, Date.parse(at(30))),
  );
  assert.deepEqual(model.rows, []);
  assert.equal(model.emptyMetricsText, "No metrics yet");
});

/** Three finished bars: enough to see separators, and to see none trailing. */
function segmentedState(): PulseModelState {
  return {
    ...fullState(),
    blocks: [
      { key: "b1", kind: "text", startedAt: at(0), endedAt: at(1), pending: false },
      { key: "b2", kind: "tool", startedAt: at(1), endedAt: at(2), pending: false },
      { key: "b3", kind: "write", startedAt: at(2), endedAt: at(3), pending: false },
    ],
  };
}

test("the rendered footer is the last child and mirrors the segment model", () => {
  const model = buildDetailModel(segmentedState(), FULL_METRICS);
  const root = renderDetail(model);
  const footer = footerOf(root);
  const segments = model.footer.segments;

  assert.equal(model.footer.placement, "last");
  assert.deepEqual(
    root.children.map((child) => child.type),
    ["Text", "View", "View", "View"],
    "status, divider, metric rows, then the footer",
  );
  assert.equal(root.children.at(-1), footer);
  assert.equal(segments.length, 3, "the fixture draws three bars");
  assert.equal(footer.props.accessibilityLabel, "Agent activity pulse");
  assert.deepEqual(footer.style, {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    height: FOOTER_HEIGHT,
    minHeight: FOOTER_HEIGHT,
  });
  assert.equal(FOOTER_HEIGHT, 68, "one fixed baseline for every bar");

  const wrappers = footer.children.filter((node) => !isSeparator(node));
  const separators = footer.children.filter(isSeparator);
  assert.equal(wrappers.length, segments.length);
  assert.equal(separators.length, segments.length - 1, "separators sit between bars");
  assert.equal(isSeparator(footer.children.at(-1) as FakeNode), false, "no trailing separator");

  for (const [index, segment] of segments.entries()) {
    const wrapper = footer.children[index * 2] as FakeNode;
    assert.deepEqual(wrapper.style, {
      flexDirection: "row",
      width: BAR_WIDTH,
    });
    assert.equal(wrapper.children.length, 1, "a wrapper holds exactly one bar");
    const bar = wrapper.children[0] as FakeNode;
    assert.equal(bar.props.accessibilityLabel, segment.kind);
    assert.deepEqual(bar.style, {
      flex: 1,
      borderRadius: 2,
      height: barHeightPx(segment.height),
      backgroundColor: FAKE_COLORS[segment.token],
      opacity: 1,
    });
    const separator = footer.children[index * 2 + 1];
    if (index === segments.length - 1) {
      assert.equal(separator, undefined);
    } else {
      assert.deepEqual(separator?.style, {
        width: 1,
        alignSelf: "stretch",
        backgroundColor: FAKE_COLORS.surface0,
      });
    }
  }

  for (const node of descendants(root)) {
    for (const key of Object.keys(node.style)) {
      assert.equal(/^margin/.test(key), false, `spacing is a view, not ${key}`);
    }
  }
});

test("neighbouring buckets are drawn far enough apart to tell apart", () => {
  // The model's eight glyph buckets are two units apart; drawn, that must not
  // collapse into a couple of pixels.
  const steps = [4, 6, 8, 10, 12, 14, 16, 18].map(barHeightPx);
  assert.deepEqual(steps, [8, 16, 24, 32, 40, 48, 56, 64]);
  for (const [index, height] of steps.slice(1).entries()) {
    assert.ok(height - (steps[index] as number) >= 8, "one glyph step is at least 8 px");
  }
  assert.ok(BAR_WIDTH <= 6, "bars are narrow and constant: volume decides height, not width");
});
