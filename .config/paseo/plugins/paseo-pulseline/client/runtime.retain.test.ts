import { describe, expect, it } from "vitest";
import type { RegistryTimelineEvent } from "./controller";
import { createPulselineRuntime } from "./runtime";

describe("runtime store retention", () => {
  it("keeps live-only blocks and facts across unmount and remount", async () => {
    // Given
    let emit: ((event: RegistryTimelineEvent) => void) | undefined;
    let fetches = 0;
    const runtime = createPulselineRuntime({
      label: "Pulseline",
      agent: { provider: "opencode", activeTurn: null },
      timeline: () => ({
        subscribe: (handler) => {
          emit = handler;
          return Object.assign(() => { emit = undefined; }, { ready: Promise.resolve() });
        },
        refetch: async () => {
          fetches += 1;
          return { epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, entries: [], error: null };
        },
      }),
      schedule: () => () => {},
      onSnapshot: () => {},
    });
    const first = runtime.subscribe(() => {});
    await Promise.resolve();
    await Promise.resolve();
    emit?.({ agentId: "agent", epoch: "e", seq: 1, timestamp: "2026-09-12T00:00:00.000Z", event: { type: "turn_started", provider: "opencode", turnId: "turn" } });
    emit?.({ agentId: "agent", epoch: "e", seq: 2, timestamp: "2026-09-12T00:00:01.000Z", event: { type: "timeline", provider: "opencode", turnId: "turn", item: { type: "tool_call", callId: "c1", name: "bash", status: "running", error: null, detail: { type: "shell", command: "ls" } } } });
    emit?.({ agentId: "agent", epoch: "e", seq: 3, timestamp: "2026-09-12T00:00:04.000Z", event: { type: "timeline", provider: "opencode", turnId: "turn", item: { type: "tool_call", callId: "c1", name: "bash", status: "completed", error: null, detail: { type: "shell", command: "ls", output: "ok" } } } });
    const before = runtime.getSnapshot();
    expect(before.blocks.length).toBeGreaterThan(0);
    expect(before.metrics.toolTotalDurationMs?.value).toBe(3_000);

    // When
    first();
    const second = runtime.subscribe(() => {});
    await Promise.resolve();
    await Promise.resolve();

    // Then
    const after = runtime.getSnapshot();
    expect(fetches).toBe(2);
    expect(after.blocks.map((block) => block.id)).toEqual(before.blocks.map((block) => block.id));
    expect(after.metrics.toolTotalDurationMs?.value).toBe(3_000);
    second();
  });
});

it("2: coalesced tail ranges replace live reasoning/text chunks without inflating text rate on repeated remount", async () => {
  let emit!: (event: RegistryTimelineEvent) => void;
  let fetched = 0;
  const runtime = createPulselineRuntime({ label: "", agent: { provider: "codex", activeTurn: null }, schedule: () => () => {}, onSnapshot: () => {}, timeline: () => ({
    subscribe: handler => { emit = handler; return Object.assign(() => {}, { ready: Promise.resolve() }); },
    refetch: async () => ({ epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, error: null, entries: ++fetched === 1 ? [] : [
      { provider: "codex", turnId: "t", timestamp: new Date(2000).toISOString(), seqStart: 1, seqEnd: 2, item: { type: "reasoning" as const, text: "aabb" } },
      { provider: "codex", turnId: "t", timestamp: new Date(4000).toISOString(), seqStart: 3, seqEnd: 4, item: { type: "assistant_message" as const, text: "1234567890" } },
    ] }),
  }) });
  let unmount = runtime.subscribe(() => {}); await Promise.resolve(); await Promise.resolve();
  for (const [seq, item] of [[1, { type: "reasoning", text: "aa" }], [2, { type: "reasoning", text: "bb" }], [3, { type: "assistant_message", text: "12345" }], [4, { type: "assistant_message", text: "67890" }]] as const)
    emit({ agentId: "a", epoch: "e", seq, timestamp: new Date(seq * 1000).toISOString(), event: { type: "timeline", provider: "codex", turnId: "t", item } });
  const rate = runtime.getSnapshot().metrics.textRateCharsPerSecond;
  expect(runtime.getSnapshot().blocks).toHaveLength(3);
  const reasoningId = runtime.getSnapshot().blocks[0]!.id;
  for (let i = 0; i < 3; i++) {
    unmount(); unmount = runtime.subscribe(() => {}); await Promise.resolve(); await Promise.resolve();
    expect(runtime.getSnapshot().blocks).toHaveLength(2);
    expect(runtime.getSnapshot().blocks[0]!.id).toBe(reasoningId);
    expect(runtime.getSnapshot().blocks.map(block => block.text)).toEqual(["aabb", "1234567890"]);
    expect(runtime.getSnapshot().metrics.textRateCharsPerSecond).toEqual(rate);
  }
  unmount(); runtime.dispose();
});
