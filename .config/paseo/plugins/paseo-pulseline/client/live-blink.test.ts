import { expect, it } from "vitest";
import { buildComposerPulseLabel, buildHistoryView, PULSE_GLYPHS, PULSE_LABEL_WIDTH, statusHeader, activePulseBlock } from "./pulse-view";
import type { PulseBlock, PulseHeightIndex } from "./model";
import { TimelineStore } from "./store";

it.each([0, 1, 2, 3, 4, 5, 6, 7] as const)("composer busy glyph always changes for bucket %i; idle and popover heights retain their contract", heightIndex => {
  const passive: PulseBlock = { id: "passive", kind: "text", order: 0, timestamp: 0, heightIndex: 0, volumeTokens: 1 };
  const active: PulseBlock = { id: "active", kind: "reasoning", order: 1, timestamp: 1, heightIndex, volumeTokens: 1 };
  const snapshot = { label: "", gap: false, metrics: {}, blocks: [passive, active], busy: true };
  const labels = ([0, 1, 2] as const).map(pulsePhase => buildComposerPulseLabel({ ...snapshot, pulsePhase }));
  expect(labels[0]).not.toBe(labels[1]);
  expect(labels[0]).toBe(labels[2]);
  expect(labels.every(label => label.length === PULSE_LABEL_WIDTH)).toBe(true);
  expect(labels[0]!.slice(0, -1)).toBe(labels[1]!.slice(0, -1));
  if ([5, 6, 7].includes(heightIndex)) expect(labels[1]!.at(-1)).toBe(PULSE_GLYPHS[2]);
  const idle = ([0, 1, 2] as const).map(pulsePhase => buildComposerPulseLabel({ ...snapshot, busy: false, pulsePhase }));
  expect(new Set(idle).size).toBe(1);
  const bars = ([0, 1] as const).map(pulsePhase => buildHistoryView({ ...snapshot, pulsePhase }).segments.at(-1)!);
  const heights = [4, 6, 8, 10, 12, 14, 16, 18];
  expect(bars.map(bar => bar.height)).toEqual([heights[heightIndex], heights[Math.min(7, heightIndex + 1)]]);
});

it("status header follows the exact live same-call completion / next-tool / next-turn sequence", () => {
  const store = new TimelineStore(""); store.finishBootstrap();
  let seq = 0;
  const started = (turnId: string) => store.ingestLive({ seq: ++seq, timestamp: seq * 1000, event: { type: "turn_started", provider: "codex", turnId } });
  const tool = (callId: string, name: string, status: "running" | "completed") => store.ingestLive({ seq: ++seq, timestamp: seq * 1000, event: { type: "timeline", provider: "codex", turnId: "t", item: { type: "tool_call", callId, name, detail: { type: "shell", command: "x" }, status, error: null } } });
  started("t"); expect(statusHeader(store.snapshot())).toBe("Working");
  tool("c1", "Bash", "running"); const running = store.snapshot();
  expect(statusHeader(running)).toBe("Running Bash");
  tool("c1", "Bash", "completed"); const completed = store.snapshot();
  expect(completed).not.toBe(running); expect(completed.blocks).not.toBe(running.blocks);
  expect(activePulseBlock(completed)?.metadata).toMatchObject({ status: "completed" });
  expect(statusHeader(completed)).toBe("Working");
  const { activityBlock: _indexed, ...fallback } = completed;
  expect(statusHeader(fallback)).toBe("Working");
  tool("c2", "Read", "running"); expect(statusHeader(store.snapshot())).toBe("Running Read");
  tool("c2", "Read", "completed"); expect(statusHeader(store.snapshot())).toBe("Working");
  store.ingestLive({ seq: ++seq, timestamp: seq * 1000, event: { type: "turn_completed", provider: "codex", turnId: "t" } });
  expect(statusHeader(store.snapshot())).toBe("Idle");
  started("next"); expect(statusHeader(store.snapshot())).toBe("Working");
});
