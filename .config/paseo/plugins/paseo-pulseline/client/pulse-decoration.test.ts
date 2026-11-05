import { expect, it } from "vitest";
import { buildHistoryView, buildPulseView, pulseSegmentIcon, pulseLegend, PULSE_LABEL_WIDTH } from "./pulse-view";
import type { TimelineSnapshot } from "./store";
import type { PulseBlock } from "./model";

const empty: TimelineSnapshot = { busy: false, gap: false, blocks: [], metrics: {}, label: "" };
const block: PulseBlock = { id: "a", kind: "reasoning", order: 1, timestamp: 1, volumeTokens: 65, heightIndex: 2 };

it("animates the selected running tool with composer phase without changing chronological order", () => {
  const blocks: PulseBlock[] = [block, { ...block, id: "tool", order: 2, kind: "tool", metadata: { type: "tool", name: "Run", detail: "shell", status: "running" } }, { ...block, id: "tail", order: 3 }];
  const snapshots = ([0, 1, 2] as const).map(pulsePhase => ({ ...empty, busy: true, blocks, pulsePhase }));
  const views = snapshots.map(buildHistoryView);
  expect(views.map(view => view.segments.map(item => item.id))).toEqual(Array.from({ length: 3 }, () => ["a", "tool", "tail"]));
  expect(views[0]?.segments.filter(item => item.id !== "tool")).toEqual(views[1]?.segments.filter(item => item.id !== "tool"));
  expect(views[0]?.segments).toEqual(views[2]?.segments);
  expect(views.map(view => view.segments[1]?.height)).toEqual([8, 10, 8]);
  expect(views.map(view => view.segments[1]?.opacity)).toEqual([0.8, 1, 0.8]);
  for (const snapshot of snapshots) expect(buildHistoryView(snapshot).segments[1]?.opacity).toBe(buildPulseView(snapshot).segments.at(-1)?.opacity);
  expect(buildHistoryView({ ...snapshots[0]!, busy: false }).segments).toEqual(buildHistoryView({ ...snapshots[1]!, busy: false }).segments);
});

it("keeps all eight volume buckets and clamps an active maximum to the existing height", () => {
  const blocks = Array.from({ length: 8 }, (_, index) => ({ ...block, id: String(index), order: index, heightIndex: index as PulseBlock["heightIndex"] }));
  const idle = buildHistoryView({ ...empty, blocks }).segments;
  expect(idle.map(item => item.height * 2)).toEqual([8, 12, 16, 20, 24, 28, 32, 36]);
  expect(buildHistoryView({ ...empty, blocks, busy: true, pulsePhase: 1 }).segments.at(-1)?.height).toBe(18);
});

it.each([
  ["reasoning", undefined, "Brain"], ["text", undefined, "MessageSquare"], ["read", "read", "FileText"],
  ["write", "edit", "Pencil"], ["write", "write", "Pencil"], ["tool", "shell", "Terminal"],
  ["read", "search", "Search"], ["read", "fetch", "Globe"], ["tool", "sub_agent", "Bot"],
  ["tool", "unknown", "Wrench"], ["error", "shell", "AlertTriangle"],
] as const)("maps %s / %s to %s", (kind, detail, icon) => {
  const metadata = detail ? { type: "tool" as const, name: "Example", detail, status: "completed" } : undefined;
  const item = buildHistoryView({ ...empty, blocks: [{ ...block, kind, ...(metadata ? { metadata } : {}) }] }).segments[0]!;
  expect(pulseSegmentIcon(item)).toBe(icon);
});

it("maps compaction and task metadata and lists only observed legend kinds", () => {
  const blocks: PulseBlock[] = [block, { ...block, id: "repeat" }, { ...block, id: "compact", kind: "other", metadata: { type: "compaction" } }, { ...block, id: "task", kind: "tool", metadata: { type: "tool", name: "Task", detail: "unknown", status: "running" } }];
  const segments = buildHistoryView({ ...empty, blocks }).segments;
  expect(pulseSegmentIcon(segments[2]!)).toBe("Archive");
  expect(pulseSegmentIcon(segments[3]!)).toBe("Bot");
  expect(pulseLegend(segments)).toEqual([{ label: "reasoning", color: "accent" }, { label: "compaction", color: "border" }, { label: "running", color: "statusWarning" }]);
});

it("uses the single composer capacity constant for normal and nonfinite limits", () => {
  const blocks = Array.from({ length: 30 }, (_, order) => ({ ...block, id: String(order), order }));
  expect(PULSE_LABEL_WIDTH).toBe(12);
  expect(buildPulseView({ ...empty, blocks }).segments).toHaveLength(PULSE_LABEL_WIDTH);
  expect(buildPulseView({ ...empty, blocks }, Number.POSITIVE_INFINITY).segments).toHaveLength(PULSE_LABEL_WIDTH);
});
