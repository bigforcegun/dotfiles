import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";
import { normalizeTimelineItem, type StreamEvent } from "./model";
import { buildHistoryView, pulseLegend, pulseSegmentIcon } from "./pulse-view";
import { TimelineStore } from "./store";

// The resolver imports the Lucide namespace; this independent export snapshot
// comes from the exact package in the pinned host lockfile, not from our map.
const allowed = new Set(readFileSync(new URL("./fixtures/host-lucide-icons.txt", import.meta.url), "utf8").split("\n").filter(name => name && !name.startsWith("#")));
const timeline = (item: Extract<StreamEvent, { type: "timeline" }>["item"]): StreamEvent => ({ type: "timeline", provider: "codex", turnId: "t", item });
const tool = (name: string, detail: "shell" | "read" | "edit" | "write" | "search" | "fetch" | "sub_agent" | "unknown" = "unknown"): StreamEvent => {
  const details = { shell: { type: "shell", command: "x" }, read: { type: "read", filePath: "x" }, edit: { type: "edit", filePath: "x" }, write: { type: "write", filePath: "x" }, search: { type: "search", query: "x" }, fetch: { type: "fetch", url: "https://example.com" }, sub_agent: { type: "sub_agent", log: "" }, unknown: { type: "unknown", input: null, output: null } } as const;
  return timeline({ type: "tool_call", callId: "c", name, detail: details[detail], status: "completed", error: null });
};
const cases: { name: string; event: StreamEvent; icon: string; legend?: string }[] = [
  { name: "completed turn", event: { type: "turn_completed", provider: "codex", turnId: "t" }, icon: "CircleCheck", legend: "done" },
  { name: "failed turn", event: { type: "turn_failed", provider: "codex", turnId: "t", error: "bad" }, icon: "CircleX", legend: "failed" },
  { name: "canceled turn", event: { type: "turn_canceled", provider: "codex", turnId: "t", reason: "stop" }, icon: "Ban", legend: "canceled" },
  { name: "notification", event: timeline({ type: "notification", level: "info", message: "note" }), icon: "Bell", legend: "note" },
  { name: "todo", event: timeline({ type: "todo", items: [] }), icon: "ListTodo", legend: "todo" },
  { name: "plugin", event: timeline({ type: "plugin", id: "p", pluginId: "p", kind: "x", version: 1, data: null }), icon: "Puzzle", legend: "plugin" },
  { name: "compaction", event: timeline({ type: "compaction", status: "completed" }), icon: "Archive", legend: "compaction" },
  { name: "mcp double underscore", event: tool("mcp__server__read", "read"), icon: "Plug", legend: "mcp" },
  { name: "mcp colon", event: tool("mcp:server:search", "search"), icon: "Plug", legend: "mcp" },
  { name: "unrecognized tool", event: tool("custom"), icon: "Wrench" },
  { name: "Task fallback", event: tool("Task"), icon: "Bot" },
  { name: "reasoning", event: timeline({ type: "reasoning", text: "x" }), icon: "Brain" },
  { name: "text", event: timeline({ type: "assistant_message", text: "x" }), icon: "MessageSquare" },
  ...([["read", "FileText"], ["edit", "Pencil"], ["write", "Pencil"], ["shell", "Terminal"], ["search", "Search"], ["fetch", "Globe"], ["sub_agent", "Bot"]] as const).map(([detail, icon]) => ({ name: detail, event: tool("x", detail), icon })),
  { name: "generic error", event: timeline({ type: "error", message: "x" }), icon: "AlertTriangle" },
];

it.each(cases)("live $name keeps semantic icon $icon supported by the host", ({ event, icon, legend }) => {
  const store = new TimelineStore(""); store.finishBootstrap();
  store.ingestLive({ seq: 1, timestamp: 1000, event });
  const segments = buildHistoryView(store.snapshot()).segments;
  expect(segments).toHaveLength(1);
  const actual = pulseSegmentIcon(segments[0]!);
  expect(allowed.has(actual), `host resolver must contain ${actual}`).toBe(true);
  expect(actual).toBe(icon);
  if (legend) expect(pulseLegend(segments)).toEqual([{ label: legend, color: segments[0]!.color }]);
});

it("unknown timeline items use a host-supported question icon rather than a tool wrench", () => {
  const block = normalizeTimelineItem({ provider: "codex", order: 1, timestamp: 1000, item: { type: "unknown", metadata: {} } })!;
  const segments = buildHistoryView({ busy: false, blocks: [block], gap: false, label: "", metrics: {} }).segments;
  expect(pulseSegmentIcon(segments[0]!)).toBe("CircleHelp");
  expect(allowed.has(pulseSegmentIcon(segments[0]!))).toBe(true);
});
