// The composer pulse as fixed-width glyph cells: the same symbols the fallback
// string draws, one `Text` each, per-kind colour, and a beat confined to the tail.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FAKE_COLORS, FAKE_PRIMITIVES, descendants, render, type FakeNode } from "./fake-render.ts";
import { initialPulseState, type PulseModelState } from "./model.ts";
import { PULSE_LABEL_GLYPHS, PULSE_LABEL_WIDTH, renderPulseLabel } from "./label.ts";
import {
  GLYPH_FONT_SIZE,
  LABEL_HEIGHT,
  PULSE_LABEL_SPEC,
  PULSE_SLOTS,
  SLOT_WIDTH,
  pulseGlyphsTree,
} from "./pulse-glyphs.ts";
import { buildPulseSegments } from "./pulse-segments.ts";
import { at } from "./fixtures.ts";

const KINDS = ["text", "reasoning", "read", "write", "tool", "error", "success", "other"] as const;

function stateOf(count: number, busy = false): PulseModelState {
  return {
    ...initialPulseState,
    historyLoaded: true,
    busy,
    blocks: Array.from({ length: count }, (_, index) => ({
      key: `b${index}`,
      kind: KINDS[index % KINDS.length] as (typeof KINDS)[number],
      startedAt: at(index),
      endedAt: busy && index === count - 1 ? undefined : at(index + 1),
      heightIndex: index % 8,
      pending: busy && index === count - 1,
    })),
  };
}

function draw(state: PulseModelState, phase = 0): FakeNode {
  const segments = buildPulseSegments(state, { width: PULSE_SLOTS, phase });
  return render(pulseGlyphsTree(segments, FAKE_COLORS, FAKE_PRIMITIVES, { phase }));
}

const SLOT_STYLE = {
  width: SLOT_WIDTH,
  fontSize: GLYPH_FONT_SIZE,
  lineHeight: LABEL_HEIGHT,
  textAlign: "center",
  includeFontPadding: false,
};

test("the container is a fixed box that clips, and cells sit on its bottom edge", () => {
  const root = draw(stateOf(5));
  assert.deepEqual(root.style, {
    width: PULSE_SLOTS * SLOT_WIDTH,
    height: LABEL_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-end",
    overflow: "hidden",
  });
  assert.equal(root.props.accessibilityLabel, "Agent activity pulse");
});

test("capacity and vocabulary are the plain string's, so both paths agree", () => {
  assert.equal(PULSE_SLOTS, PULSE_LABEL_WIDTH, "the component draws the same pulse length");
  assert.deepEqual(PULSE_LABEL_SPEC.glyphs, PULSE_LABEL_GLYPHS);
  assert.deepEqual([...PULSE_LABEL_GLYPHS], ["⣀", "⣤", "⣶", "⣿"]);
  assert.deepEqual(PULSE_LABEL_SPEC, {
    glyphs: PULSE_LABEL_GLYPHS,
    capacity: 12,
    slotWidth: 8,
    fontSize: 12,
    lineHeight: 16,
  });
});

test("the drawn glyphs are exactly the fallback string, cell for cell", () => {
  for (const state of [stateOf(5), stateOf(12), stateOf(40), stateOf(6, true)]) {
    const drawn = draw(state)
      .children.map((node) => node.text)
      .join("");
    assert.equal(drawn, renderPulseLabel(state, { width: PULSE_SLOTS }));
  }
});

test("the cell count and every cell's box are constant, whatever the model holds", () => {
  for (const count of [0, 1, 5, 40]) {
    const root = draw(stateOf(count));
    assert.equal(root.children.length, PULSE_SLOTS, `${count} blocks still fill the capacity`);
    for (const cell of root.children) {
      assert.equal(cell.type, "Text", "every cell is a Text child");
      const { color, opacity, ...box } = cell.style;
      assert.deepEqual(box, SLOT_STYLE, "only colour and opacity vary between cells");
    }
  }
});

test("each glyph carries its kind's theme colour", () => {
  const state = stateOf(8);
  const segments = buildPulseSegments(state, { width: PULSE_SLOTS, phase: 0 });
  const drawn = draw(state).children.filter((cell) => cell.text !== "");
  assert.equal(drawn.length, segments.length);
  assert.deepEqual(
    drawn.map((cell) => cell.style.color),
    segments.map((segment) => FAKE_COLORS[segment.token]),
  );
  assert.ok(new Set(drawn.map((cell) => cell.style.color)).size > 1, "colours differ by kind");
});

test("a phase changes only the final cell, and only its glyph and opacity", () => {
  // Tails at two volumes: a low one whose glyph steps up, a top one that saturates.
  for (const count of [3, 6]) {
    const busy = stateOf(count, true);
    const before = draw(busy, 0);
    const after = draw(busy, 1);

    assert.deepEqual(before.style, after.style, "the container never resizes");
    assert.equal(before.children.length, after.children.length);
    assert.deepEqual(
      before.children.slice(0, -1),
      after.children.slice(0, -1),
      "every cell but the tail is identical",
    );

    const tailBefore = before.children.at(-1) as FakeNode;
    const tailAfter = after.children.at(-1) as FakeNode;
    const { opacity: opacityBefore, ...boxBefore } = tailBefore.style;
    const { opacity: opacityAfter, ...boxAfter } = tailAfter.style;
    assert.deepEqual(boxBefore, boxAfter, "the beating cell keeps its box and colour");
    assert.equal(tailBefore.text.length, tailAfter.text.length, "one glyph, before and after");
    assert.notEqual(opacityBefore, opacityAfter, "the tail visibly beats at every volume");
  }
});

test("nothing in the tree can reflow: no flex, no margins, no padding", () => {
  for (const node of descendants(draw(stateOf(6, true), 1))) {
    for (const key of Object.keys(node.style)) {
      assert.equal(/^(margin|padding)/.test(key), false, `${key} would move a neighbour`);
      assert.equal(/^(flex|flexGrow|flexShrink|flexBasis)$/.test(key), false, `${key} is elastic`);
    }
  }
});
