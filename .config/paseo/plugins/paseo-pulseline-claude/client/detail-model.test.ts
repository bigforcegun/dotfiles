import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDetailModel } from "./detail-model.ts";
import { derivePulseMetrics } from "./metrics.ts";
import { initialPulseState, reducePulse } from "./model.ts";
import { PROVIDERS, USAGE_FULL, at, conversation, entry, toolCall } from "./fixtures.ts";

const NOW = Date.parse(at(30));

function build(inputs: Parameters<typeof reducePulse>[1][], entries = conversation("claude")) {
  let state = reducePulse(initialPulseState, { type: "history", epoch: "e", entries });
  for (const input of inputs) state = reducePulse(state, input);
  return buildDetailModel(state, derivePulseMetrics(state, NOW));
}

function glyphs(model: ReturnType<typeof buildDetailModel>) {
  return model.rows.map((row) => row.glyph);
}

function valueOf(model: ReturnType<typeof buildDetailModel>, glyph: string) {
  return model.rows.find((row) => row.glyph === glyph)?.value;
}

test("tokens, cache, context and cost are grouped and unmarked", () => {
  const model = build([{ type: "agent", status: "idle", activeTurn: null, usage: USAGE_FULL }]);
  assert.deepEqual(glyphs(model).slice(0, 3), ["↓", "↑", "◇"]);
  for (const row of model.rows.filter((entry) => ["↓", "↑", "◇", "$"].includes(entry.glyph))) {
    assert.equal(row.approx, false, row.label);
    assert.equal(row.value.startsWith("~"), false, row.value);
  }
  assert.equal(valueOf(model, "↓"), "18k");
  assert.equal(model.rows.filter((row) => row.glyph === "◇").at(-1)?.value, "124k/200k");
  assert.equal(valueOf(model, "$"), "$0.42");
});

test("observed timings are grouped separately and always tilde-marked", () => {
  const model = build([
    { type: "agent", status: "running", activeTurn: { turnId: "t", startedAt: at(20) } },
  ]);
  const approxRows = model.rows.filter((row) => row.approx);
  for (const row of approxRows) assert.match(row.value, /^~/, row.value);
  assert.deepEqual(approxRows.map((row) => row.glyph), ["↯", "Σ", "⏱", "⌛"]);
  assert.deepEqual(glyphs(model).filter((glyph) => "🔧⏱⌛".includes(glyph)), ["🔧", "⏱", "⌛"]);
});

test("both providers produce the same detail model", () => {
  const models = PROVIDERS.map((provider) =>
    JSON.stringify(
      buildDetailModel(
        reducePulse(initialPulseState, {
          type: "history",
          epoch: "e",
          entries: conversation(provider),
        }),
        derivePulseMetrics(initialPulseState, NOW),
      ),
    ),
  );
  assert.equal(models[0], models[1]);
});

test("the running tool is reported as the current activity", () => {
  const model = build(
    [{ type: "live", entry: entry(40, 20, toolCall("call-live", "search", "running")) }],
    conversation("claude"),
  );
  assert.match(model.status, /search/);
  assert.equal(model.busy, false, "an activity row is not the same as an active turn");
});

test("an active turn without blocks is a busy fallback", () => {
  const model = buildDetailModel(
    reducePulse(initialPulseState, {
      type: "agent",
      status: "running",
      activeTurn: { turnId: "t", startedAt: at(28) },
    }),
    derivePulseMetrics(initialPulseState, NOW),
  );
  assert.equal(model.busy, true);
  assert.equal(model.empty, false);
  assert.match(model.status, /Working/i);
});

test("usage without blocks still renders the token group", () => {
  const model = buildDetailModel(
    reducePulse(initialPulseState, {
      type: "agent",
      status: "idle",
      activeTurn: null,
      usage: USAGE_FULL,
    }),
    derivePulseMetrics(
      reducePulse(initialPulseState, {
        type: "agent",
        status: "idle",
        activeTurn: null,
        usage: USAGE_FULL,
      }),
      NOW,
    ),
  );
  assert.equal(model.empty, false);
  assert.ok(model.rows.length > 0);
  assert.equal(model.rows.some((row) => row.glyph === "Σ"), false, "no observed timings yet");
});

test("an empty idle model says so instead of printing zeros", () => {
  const loaded = reducePulse(initialPulseState, { type: "history", epoch: "e", entries: [] });
  const model = buildDetailModel(loaded, derivePulseMetrics(loaded, NOW));
  assert.equal(model.empty, true);
  assert.equal(model.rows.length, 0);
  assert.equal(model.emptyMetricsText, "No metrics yet");
  assert.match(model.status, /No activity/i);
});

test("a gapped history is disclosed rather than hidden", () => {
  const model = build([], conversation("claude")).rows;
  const gapped = buildDetailModel(
    reducePulse(initialPulseState, {
      type: "history",
      epoch: "e",
      entries: conversation("claude"),
      gap: true,
    }),
    derivePulseMetrics(initialPulseState, NOW),
  );
  assert.equal(gapped.incomplete, true);
  assert.equal(model.some((row) => row.glyph === "🔧"), true);
});

test("the tool rows count what the pulse shows", () => {
  const model = build([]);
  assert.equal(valueOf(model, "🔧"), "3", "three tool rows");
  assert.equal(valueOf(model, "⏱"), "~2.0s");
  assert.equal(valueOf(model, "⌛"), "~00:02");
});

test("the footer carries the pulse and comes last", () => {
  const model = build([]);
  assert.equal(model.footer.placement, "last");
  assert.ok(model.footer.segments.length > 0);
  assert.equal(model.footer.width, 36);
});
