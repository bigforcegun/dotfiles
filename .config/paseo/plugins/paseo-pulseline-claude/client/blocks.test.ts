import assert from "node:assert/strict";
import { test } from "node:test";
import { blockFromEntry, classifyItem, turnBlock } from "./blocks.ts";
import { PROVIDERS, conversation, entry, toolCall } from "./fixtures.ts";

test("classification is identical for every provider", () => {
  for (const provider of PROVIDERS) {
    const kinds = conversation(provider).map((item) => blockFromEntry(item)?.kind ?? null);
    assert.deepEqual(
      kinds,
      [
        null, // user_message never draws an assistant pulse block
        "reasoning",
        "text",
        "read",
        "read",
        "write",
        "error",
        "other",
        "other",
        "other",
        "text",
      ],
      `provider ${provider}`,
    );
  }
});

test("tool detail kinds map to read/write/tool", () => {
  const mapping: Record<string, string> = {
    read: "read",
    search: "read",
    fetch: "read",
    edit: "write",
    write: "write",
    shell: "tool",
    sub_agent: "tool",
    plan: "tool",
    worktree_setup: "tool",
    unknown: "tool",
  };
  for (const [detail, expected] of Object.entries(mapping)) {
    const classified = classifyItem(toolCall(`call-${detail}`, detail, "completed"));
    assert.equal(classified?.kind, expected, detail);
  }
});

test("a failed tool is an error regardless of its detail kind", () => {
  for (const detail of ["read", "edit", "shell"]) {
    assert.equal(classifyItem(toolCall("c", detail, "failed"))?.kind, "error", detail);
  }
});

test("a canceled tool keeps its detail kind and is not an error", () => {
  assert.equal(classifyItem(toolCall("c", "read", "canceled"))?.kind, "read");
});

test("other carries the reason as metadata", () => {
  const reasons: [Record<string, unknown>, string][] = [
    [{ type: "notification", level: "info", message: "hi" }, "notification"],
    [{ type: "compaction", status: "completed" }, "compaction"],
    [{ type: "todo", items: [] }, "todo"],
    [{ type: "plugin", kind: "x", version: 1, data: null }, "plugin"],
    [{ type: "definitely-not-a-known-type" }, "unknown"],
  ];
  for (const [item, reason] of reasons) {
    const classified = classifyItem(item as never);
    assert.equal(classified?.kind, "other", reason);
    assert.equal(classified?.reason, reason);
  }
});

test("an error item is an error block", () => {
  assert.equal(classifyItem({ type: "error", message: "nope" } as never)?.kind, "error");
});

test("turn outcomes become success and error blocks", () => {
  assert.equal(turnBlock("completed", "turn-1", "2026-09-12T10:00:20.000Z").kind, "success");
  assert.equal(turnBlock("failed", "turn-1", "2026-09-12T10:00:20.000Z").kind, "error");
  assert.equal(turnBlock("canceled", "turn-1", "2026-09-12T10:00:20.000Z").kind, "other");
});

test("tool blocks are keyed by callId so a lifecycle never doubles", () => {
  const running = blockFromEntry(entry(4, 3, toolCall("call-read", "read", "running")));
  const done = blockFromEntry(entry(5, 5, toolCall("call-read", "read", "completed")));
  assert.equal(running?.key, done?.key);
  assert.equal(running?.pending, true);
  assert.equal(done?.pending, false);
});

test("classification carries the kind, not a size", () => {
  const small = blockFromEntry(entry(1, 0, { type: "assistant_message", text: "ok" }));
  const large = blockFromEntry(entry(2, 1, { type: "assistant_message", text: "x".repeat(4000) }));
  assert.ok(small && large);
  assert.equal(small.kind, large.kind, "height comes from the kind table in pulse-segments.ts");
  assert.equal("height" in small, false, "blocks no longer carry a content-derived height");
});
