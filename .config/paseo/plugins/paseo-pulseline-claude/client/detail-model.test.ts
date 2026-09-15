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

function rows(model: ReturnType<typeof buildDetailModel>, sectionId: string) {
  return model.sections.find((section) => section.id === sectionId)?.rows ?? [];
}

test("tokens, cache, context and cost are grouped and unmarked", () => {
  const model = build([{ type: "agent", status: "idle", activeTurn: null, usage: USAGE_FULL }]);
  const usage = rows(model, "usage");
  assert.deepEqual(
    usage.map((row) => row.label),
    ["Input", "Output", "Cache read", "Context", "Cost"],
  );
  for (const row of usage) {
    assert.equal(row.approx, false, row.label);
    assert.equal(row.value.startsWith("~"), false, row.value);
  }
  assert.equal(usage[0]?.value, "18k");
  assert.equal(usage[3]?.value, "124k / 200k (62%)");
  assert.equal(usage[4]?.value, "$0.42");
});

test("observed timings are grouped separately and always tilde-marked", () => {
  const model = build([
    { type: "agent", status: "running", activeTurn: { turnId: "t", startedAt: at(20) } },
  ]);
  const timing = rows(model, "timing");
  assert.ok(timing.length > 0);
  for (const row of timing) {
    assert.equal(row.approx, true, row.label);
    assert.match(row.value, /^~/, row.value);
  }
  assert.deepEqual(
    timing.map((row) => row.label),
    ["Turn", "Chat", "Tools", "Tool average", "Tool total", "Text rate"],
  );
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
  assert.ok(rows(model, "usage").length > 0);
  assert.equal(rows(model, "timing").length, 0, "no observed timings to report yet");
});

test("an empty idle model says so instead of printing zeros", () => {
  const loaded = reducePulse(initialPulseState, { type: "history", epoch: "e", entries: [] });
  const model = buildDetailModel(loaded, derivePulseMetrics(loaded, NOW));
  assert.equal(model.empty, true);
  assert.equal(model.sections.length, 0);
  assert.match(model.status, /No activity/i);
});

test("a gapped history is disclosed rather than hidden", () => {
  const model = build([], conversation("claude")).sections;
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
  assert.equal(model.some((section) => section.id === "activity"), true);
});

test("the activity group counts blocks by kind", () => {
  const activity = rows(build([]), "activity");
  const byLabel = Object.fromEntries(activity.map((row) => [row.label, row.value]));
  assert.equal(byLabel["Tools"], "3");
  assert.equal(byLabel["Errors"], "1");
  assert.equal(byLabel["Messages"], "2");
});
