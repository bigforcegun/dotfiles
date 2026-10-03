// Convergence contract handed down by the Task 3 reviewer: both plugins must emit
// the same tuples for the same fixture. Geometry is per kind, not per token count.
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderPulseLabel } from "./label.ts";
import { initialPulseState, reducePulse, type PulseModelState } from "./model.ts";
import {
  KIND_WEIGHTS,
  PULSE_FALLBACK_SEGMENT,
  buildPulseSegments,
  type PulseSegment,
} from "./pulse-segments.ts";
import { at, entry, toolCall } from "./fixtures.ts";

type Tuple = [string, number, string, string, boolean, boolean];

function tuple(segment: PulseSegment): Tuple {
  return [segment.kind, segment.height, segment.token, segment.glyph, segment.active, segment.separator];
}

function stateOf(items: Record<string, unknown>[], busy = false): PulseModelState {
  let state = reducePulse(initialPulseState, { type: "history", epoch: "e", entries: [] });
  items.forEach((item, index) => {
    state = reducePulse(state, { type: "live", entry: entry(index + 1, index, item as never) });
  });
  if (busy) {
    state = reducePulse(state, {
      type: "agent",
      status: "running",
      activeTurn: { turnId: "t", startedAt: at(0) },
    });
  }
  return state;
}

/** One row per kind, in the order the contract lists them. */
function allKinds(): PulseModelState {
  let state = stateOf([
    { type: "assistant_message", text: "answer" },
    { type: "reasoning", text: "thinking" },
    toolCall("c-read", "read", "completed") as unknown as Record<string, unknown>,
    toolCall("c-write", "write", "completed") as unknown as Record<string, unknown>,
    toolCall("c-tool", "shell", "completed") as unknown as Record<string, unknown>,
    toolCall("c-err", "shell", "failed") as unknown as Record<string, unknown>,
  ]);
  state = reducePulse(state, { type: "turn", phase: "completed", turnId: "t", at: at(7) });
  state = reducePulse(state, {
    type: "live",
    entry: entry(9, 9, { type: "notification", level: "info", message: "note" } as never),
  });
  return state;
}

test("kind decides the colour and the order; volume decides the height", () => {
  const segments = buildPulseSegments(allKinds(), { width: 8, phase: 0 });
  assert.deepEqual(
    segments.map((segment) => [segment.kind, segment.token, segment.active, segment.separator]),
    [
      ["text", "foreground", false, true],
      ["reasoning", "accent", false, true],
      ["read", "foregroundMuted", false, true],
      ["write", "accent", false, true],
      ["tool", "statusWarning", false, true],
      ["error", "statusDanger", false, true],
      ["success", "statusSuccess", false, true],
      ["other", "border", false, false],
    ],
  );
  assert.match(renderPulseLabel(allKinds(), { width: 8, phase: 0 }), /^[⣀⣤⣶⣿]{8}$/);
});

test("height follows the block's own volume, not its kind", () => {
  const short = buildPulseSegments(stateOf([{ type: "assistant_message", text: "hi" }]), {
    width: 4,
    phase: 0,
  });
  const long = buildPulseSegments(
    stateOf([{ type: "assistant_message", text: "x".repeat(12_000) }]),
    { width: 4, phase: 0 },
  );
  assert.equal(short[0]?.height, 4, "two characters land in the bottom bucket");
  assert.equal(long[0]?.height, 18, "3000 tokens land in the top bucket");
  assert.equal(short[0]?.kind, long[0]?.kind, "same kind, two volumes, two heights");

  // Two passive blocks of the same kind must not collapse into one height.
  const mixed = buildPulseSegments(
    stateOf([
      { type: "assistant_message", text: "hi" },
      { type: "assistant_message", text: "y".repeat(1_200) },
    ]),
    { width: 4, phase: 0 },
  );
  assert.deepEqual(mixed.map((segment) => segment.height), [4, 12]);
});

function activeFixture(busy = true): PulseModelState {
  let state = stateOf([
    { type: "assistant_message", text: "answer" },
    toolCall("c-run", "shell", "running") as unknown as Record<string, unknown>,
  ]);
  state = reducePulse(state, { type: "turn", phase: "completed", turnId: "t", at: at(5) });
  state = reducePulse(state, {
    type: "live",
    entry: entry(8, 8, { type: "notification", level: "info", message: "n" } as never),
  });
  if (busy) {
    state = reducePulse(state, {
      type: "agent",
      status: "running",
      activeTurn: { turnId: "t2", startedAt: at(8) },
    });
  }
  return state;
}

test("the active tail is pinned last and beats one step above its own volume", () => {
  const base = buildPulseSegments(activeFixture(), { width: 3, phase: 0 }).at(-1);
  const beat = buildPulseSegments(activeFixture(), { width: 3, phase: 1 }).at(-1);
  assert.equal(base?.kind, "tool");
  assert.equal(base?.active, true);
  assert.equal(beat?.height, (base?.height as number) + 2, "exactly one step, never two");
  for (const phase of [0, 1]) {
    const segments = buildPulseSegments(activeFixture(), { width: 3, phase });
    assert.equal(segments.at(-1)?.active, true, `phase ${phase}: the tail is the active one`);
    for (const segment of segments.slice(0, -1)) assert.equal(segment.active, false);
  }
});

test("the beat is clamped at the top bucket", () => {
  const loud = buildPulseSegments(
    stateOf(
      [
        {
          type: "tool_call",
          callId: "c",
          name: "shell",
          status: "running",
          error: null,
          detail: { type: "shell", command: "x", output: "o".repeat(40_000) },
        },
      ],
      true,
    ),
    { width: 1, phase: 1 },
  ).at(-1);
  assert.equal(loud?.height, 18, "bucket 7 has nowhere left to climb");
});

test("a single-slot pulse keeps the active tail, and idles at its own height", () => {
  assert.equal(renderPulseLabel(activeFixture(), { width: 1, phase: 1 }), "⣤");
  assert.equal(renderPulseLabel(activeFixture(false), { width: 1, phase: 1 }), "⣀");
  // Same small payload either way: the beat is what lifts the active cell a level.
  assert.equal(buildPulseSegments(activeFixture(), { width: 1, phase: 1 }).at(-1)?.active, true);
  assert.equal(buildPulseSegments(activeFixture(false), { width: 1, phase: 1 }).at(-1)?.active, false);
});

test("an empty model exposes the fallback segment for the footer", () => {
  assert.deepEqual(tuple(PULSE_FALLBACK_SEGMENT), ["other", 4, "border", "▁", false, false]);
});

test("a zero budget yields no segments at all", () => {
  assert.deepEqual(buildPulseSegments(allKinds(), { width: 0, phase: 0 }), []);
  assert.deepEqual(buildPulseSegments(initialPulseState, { width: 0, phase: 0 }), []);
});

test("segment keys stay stable across widths and phases", () => {
  const wide = buildPulseSegments(allKinds(), { width: 8, phase: 0 }).map((s) => s.key);
  const narrow = buildPulseSegments(allKinds(), { width: 3, phase: 2 }).map((s) => s.key);
  assert.deepEqual(narrow, wide.slice(-3));
  assert.equal(new Set(wide).size, wide.length);
});

test("separators are positional: every visible segment but the last carries one", () => {
  const visible = buildPulseSegments(activeFixture(), { width: 3, phase: 0 });
  assert.deepEqual(
    visible.map((segment) => [segment.kind, segment.separator]),
    [
      ["success", true],
      ["other", true],
      ["tool", false],
    ],
    "the trailing segment never draws a separator, whatever its kind",
  );
});

test("a sole active segment carries no separator", () => {
  const solo = buildPulseSegments(activeFixture(), { width: 1, phase: 1 });
  assert.equal(solo.length, 1);
  assert.equal(solo[0]?.active, true);
  assert.equal(solo[0]?.separator, false, "nothing follows it, so nothing separates it");
});

test("the idle eight-kind row separates all but its last segment", () => {
  assert.deepEqual(
    buildPulseSegments(allKinds(), { width: 8, phase: 0 }).map((segment) => segment.separator),
    [true, true, true, true, true, true, true, false],
  );
});

test("the standalone fallback stays unseparated", () => {
  assert.equal(PULSE_FALLBACK_SEGMENT.separator, false);
});

// --- OC baseline: empty state, phase cycle, weights -------------------------

test("an empty idle model still draws one neutral bar", () => {
  const segments = buildPulseSegments(initialPulseState, { width: 8, phase: 0 });
  assert.deepEqual(
    segments.map((s) => [s.kind, s.height, s.weight, s.token, s.glyph, s.active, s.separator]),
    [["other", 4, 1, "border", "▁", false, false]],
  );
  assert.equal(renderPulseLabel(initialPulseState, { width: 8, phase: 0 }), "⣀");
});

test("an empty busy model draws the active reasoning placeholder", () => {
  const busy = reducePulse(initialPulseState, {
    type: "agent",
    status: "running",
    activeTurn: { turnId: "t", startedAt: at(0) },
  });
  assert.deepEqual(
    buildPulseSegments(busy, { width: 8, phase: 0 }).map((s) => [
      s.kind,
      s.height,
      s.weight,
      s.token,
      s.glyph,
      s.active,
      s.separator,
    ]),
    [["reasoning", 4, 2, "accent", "▁", true, false]],
  );
  assert.equal(renderPulseLabel(busy, { width: 8, phase: 0 }), "⣀");
});

test("only two phases exist and they alternate base / base+1", () => {
  const heights = [0, 1, 2, 3, 4, 5].map(
    (phase) => buildPulseSegments(activeFixture(), { width: 1, phase }).at(-1)?.height,
  );
  const [base, beat] = heights as [number, number];
  assert.equal(beat, base + 2, "one bucket up");
  assert.deepEqual(heights, [base, beat, base, beat, base, beat], "phase 2 is phase 0 again");
});

test("passive segments never move with the phase", () => {
  const first = buildPulseSegments(activeFixture(), { width: 3, phase: 0 }).slice(0, -1);
  for (const phase of [1]) {
    const later = buildPulseSegments(activeFixture(), { width: 3, phase }).slice(0, -1);
    assert.deepEqual(
      later.map((s) => [s.kind, s.height]),
      first.map((s) => [s.kind, s.height]),
      `phase ${phase}`,
    );
  }
});

test("each kind carries its layout weight", () => {
  assert.deepEqual(KIND_WEIGHTS, {
    text: 3,
    reasoning: 2,
    read: 1,
    write: 2,
    tool: 2,
    error: 2,
    success: 2,
    other: 1,
  });
  assert.deepEqual(
    buildPulseSegments(allKinds(), { width: 8, phase: 0 }).map((s) => s.weight),
    [3, 2, 1, 2, 2, 2, 2, 1],
  );
});
