// Volume model: the thresholds, the payload sources, and the honest fallback.
import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateItemTokens, heightIndexForTokens } from "./volume.ts";
import type { PulseTimelineItem } from "./types.ts";

test("the bucket thresholds are the original table", () => {
  const boundaries = [16, 17, 64, 65, 128, 129, 256, 257, 512, 513, 1_024, 1_025, 2_048, 2_049];
  assert.deepEqual(
    boundaries.map(heightIndexForTokens),
    [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
  );
  assert.equal(heightIndexForTokens(0), 0);
  assert.equal(heightIndexForTokens(undefined), 0, "no payload sits at the bottom");
  assert.equal(heightIndexForTokens(1_000_000), 7);
});

test("text and reasoning are measured by their text", () => {
  const item = (type: string, text: string): PulseTimelineItem => ({ type, text });
  assert.equal(estimateItemTokens(item("assistant_message", "x".repeat(400))), 100);
  assert.equal(estimateItemTokens(item("reasoning", "y".repeat(40))), 10);
  assert.equal(estimateItemTokens(item("assistant_message", "")), undefined);
});

test("a tool is measured by its output, its error and the rest of its payload", () => {
  const shell: PulseTimelineItem = {
    type: "tool_call",
    callId: "c",
    name: "shell",
    status: "completed",
    error: null,
    detail: { type: "shell", command: "ls", output: "o".repeat(2_000) },
  };
  assert.equal(heightIndexForTokens(estimateItemTokens(shell)), 4, "500 tokens");

  const failed: PulseTimelineItem = { ...shell, status: "failed", error: "e".repeat(600) };
  assert.ok(
    (estimateItemTokens(failed) as number) > (estimateItemTokens(shell) as number),
    "the error text counts too",
  );

  const running: PulseTimelineItem = {
    type: "tool_call",
    callId: "c",
    name: "shell",
    status: "running",
    error: null,
    detail: { type: "shell", command: "ls" },
  };
  assert.equal(estimateItemTokens(running), undefined, "nothing produced yet, nothing claimed");
  assert.equal(heightIndexForTokens(estimateItemTokens(running)), 0);
});

test("a compaction reports real tokens, not a payload", () => {
  assert.equal(estimateItemTokens({ type: "compaction", status: "completed", preTokens: 900 }), 900);
  assert.equal(estimateItemTokens({ type: "compaction", status: "loading" }), undefined);
});

test("file paths and commands are metadata, not volume", () => {
  const read: PulseTimelineItem = {
    type: "tool_call",
    callId: "c",
    name: "read",
    status: "completed",
    error: null,
    detail: { type: "read", filePath: "/a/very/long/path/that/should/not/count.ts" },
  };
  assert.equal(estimateItemTokens(read), undefined);
});
