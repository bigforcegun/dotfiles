// Agreed formatting contract (plan: counts integer/compact k, applicable rates
// one decimal, money two decimals, turn/chat/tool-total unbounded MM:SS, tool
// average decimal seconds). Original formatters:
// .config/opencode/plugins/chat-pulse-line/pulse-line.js:351 (numbers), :369 (clock).
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatClock, formatCount, formatMoney, formatRate, formatToolAverage } from "./format.ts";

test("counts stay integers or become compact k", () => {
  assert.equal(formatCount(7), "7");
  assert.equal(formatCount(999), "999");
  assert.equal(formatCount(1_000), "1k");
  assert.equal(formatCount(2_100), "2.1k");
  assert.equal(formatCount(9_949), "9.9k");
  assert.equal(formatCount(18_000), "18k");
  assert.equal(formatCount(124_000), "124k");
});

test("durations use unbounded MM:SS", () => {
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(3_599_000), "59:59");
  assert.equal(formatClock(3_600_000), "60:00");
  assert.equal(formatClock(7_507_000), "125:07");
  assert.equal(formatClock(59_999), "00:59");
});

test("tool average keeps decimal seconds", () => {
  assert.equal(formatToolAverage(2_000), "2.0s");
  assert.equal(formatToolAverage(1_240), "1.2s");
  assert.equal(formatToolAverage(120), "0.1s");
});

test("rates round to one decimal and money keeps two", () => {
  assert.equal(formatRate(5.66), "5.7");
  assert.equal(formatRate(12), "12.0");
  assert.equal(formatMoney(0.4), "$0.40");
  assert.equal(formatMoney(12.3456), "$12.35");
});
