import { setImmediate } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import {
  createTimelineController,
  type RegistryTimelineEvent,
  type RegistryTimelinePage,
  type RegistryTimelineSource,
} from "./controller";
import { TimelineStore, type TimelinePage } from "./store";

function page(input: Partial<TimelinePage> & Pick<TimelinePage, "epoch" | "entries">): TimelinePage {
  return { epoch: input.epoch, entries: input.entries, reset: input.reset ?? false, gap: input.gap ?? false, hasOlder: input.hasOlder ?? false, startCursor: input.startCursor ?? null };
}

function sourcePage(input: Partial<RegistryTimelinePage> & Pick<RegistryTimelinePage, "epoch" | "entries">): RegistryTimelinePage {
  return { epoch: input.epoch, entries: input.entries, reset: input.reset ?? false, gap: input.gap ?? false, hasOlder: input.hasOlder ?? false, startCursor: input.startCursor ?? null, error: input.error ?? null };
}

class ManualTimeline implements RegistryTimelineSource {
  readonly requests: Array<{ readonly direction?: "tail" | "before" }> = [];
  readonly responses: Array<Promise<RegistryTimelinePage>> = [];
  ready: Promise<void> = Promise.resolve();
  #handler: ((event: RegistryTimelineEvent) => void) | undefined;

  subscribe(handler: (event: RegistryTimelineEvent) => void) {
    this.#handler = handler;
    return Object.assign(() => { this.#handler = undefined; }, { ready: this.ready });
  }

  refetch(options?: { readonly direction?: "tail" | "before" }) {
    this.requests.push(options?.direction ? { direction: options.direction } : {});
    return this.responses.shift() ?? Promise.reject(new Error("missing page"));
  }

  emit(event: RegistryTimelineEvent): void {
    this.#handler?.(event);
  }
}

describe("timeline regressions", () => {
  it("requests one tail when replacement precedes subscription readiness", async () => {
    // Given
    const source = new ManualTimeline();
    let ready = () => {};
    source.ready = new Promise((resolve) => { ready = resolve; });
    source.responses.push(Promise.resolve(sourcePage({ epoch: "new", reset: true, entries: [] })));
    const store = new TimelineStore("Pulseline · OpenCode");
    createTimelineController(source, store, () => {});

    // When
    source.emit({ agentId: "agent-1", event: { type: "replacement", epoch: "new" } });
    await setImmediate();
    ready();
    await setImmediate();

    // Then
    expect(source.requests).toEqual([{ direction: "tail" }]);
    expect(store.snapshot().epoch).toBe("new");
  });

  it("retains the tail and marks incomplete metrics when an older page fails", async () => {
    // Given
    const source = new ManualTimeline();
    source.responses.push(Promise.resolve(sourcePage({
      epoch: "e",
      hasOlder: true,
      startCursor: { epoch: "e", seq: 3 },
      entries: [{ provider: "opencode", timestamp: "2026-09-12T00:00:03.000Z", seqStart: 3, seqEnd: 3, item: { type: "tool_call", callId: "tool-1", name: "Read", detail: { type: "read", filePath: "a" }, status: "completed", error: null } }],
    })));
    source.responses.push(Promise.reject(new Error("older unavailable")));
    const store = new TimelineStore("Pulseline · OpenCode");

    // When
    createTimelineController(source, store, () => {});
    await setImmediate();

    // Then
    expect(store.snapshot().blocks.map(({ id }) => id)).toEqual(["tool:tool-1"]);
    expect(store.snapshot().gap).toBe(true);
    expect(store.snapshot().metrics).toEqual(expect.objectContaining({ toolCount: { value: 1, approximate: true } }));
  });

  it("rejects lower live sequences within one epoch", () => {
    // Given
    const store = new TimelineStore("Pulseline · OpenCode");
    store.ingestLive({ epoch: "e", seq: 5, timestamp: 5_000, event: { type: "timeline", provider: "opencode", item: { type: "assistant_message", text: "new" } } });

    // When
    store.ingestLive({ epoch: "e", seq: 4, timestamp: 4_000, event: { type: "timeline", provider: "opencode", item: { type: "assistant_message", text: "stale" } } });

    // Then
    expect(store.snapshot().blocks.map(({ text }) => text)).toEqual(["new"]);
  });

  it("rejects a live sequence below loaded history high-water", () => {
    // Given
    const store = new TimelineStore("Pulseline · OpenCode");
    store.ingestPage(page({ epoch: "e", entries: [{ provider: "opencode", timestamp: 100_000, seqStart: 100, seqEnd: 100, item: { type: "assistant_message", text: "history" } }] }));
    const before = store.snapshot();

    // When
    store.ingestLive({ epoch: "e", seq: 99, timestamp: 99_000, event: { type: "turn_started", provider: "opencode", turnId: "stale-turn" } });

    // Then
    expect(store.snapshot()).toEqual(before);
    expect(store.snapshot()).toMatchObject({ busy: false });
  });

  it("drops unepoched buffered events when a replacement starts a generation", () => {
    // Given
    const store = new TimelineStore("Pulseline · OpenCode");
    store.beginBootstrap();
    store.ingestLive({ seq: 1, timestamp: 1_000, event: { type: "timeline", provider: "opencode", item: { type: "assistant_message", text: "old-buffered" } } });

    // When
    store.replaceEpoch("new");
    store.ingestPage(page({ epoch: "new", reset: true, entries: [{ provider: "opencode", timestamp: 2_000, seqStart: 2, seqEnd: 2, item: { type: "assistant_message", text: "new-history" } }] }));
    store.finishBootstrap();

    // Then
    expect(store.snapshot().blocks.map(({ text }) => text)).toEqual(["new-history"]);
  });

  it("keeps a newer completed tool when an older running page arrives later", () => {
    // Given
    const store = new TimelineStore("Pulseline · OpenCode");
    store.ingestPage(page({ epoch: "e", entries: [{ provider: "opencode", timestamp: 4_000, seqStart: 4, seqEnd: 4, item: { type: "tool_call", callId: "tool-1", name: "Edit", detail: { type: "edit", filePath: "a" }, status: "completed", error: null } }] }));

    // When
    store.ingestPage(page({ epoch: "e", entries: [{ provider: "opencode", timestamp: 3_000, seqStart: 3, seqEnd: 3, item: { type: "tool_call", callId: "tool-1", name: "Edit", detail: { type: "edit", filePath: "a" }, status: "running", error: null } }] }));

    // Then
    expect(store.snapshot().blocks[0]).toMatchObject({ id: "tool:tool-1", order: 4, metadata: { status: "completed" } });
  });

  it("replaces authoritative agent usage instead of retaining stale fields", () => {
    // Given
    const store = new TimelineStore("Pulseline · OpenCode");
    store.updateAgent({ provider: "opencode", lastUsage: { inputTokens: 10, outputTokens: 5 } });

    // When
    store.updateAgent({ provider: "opencode", lastUsage: { outputTokens: 7 } });

    // Then
    expect(store.snapshot().metrics.inputTokens).toBeUndefined();
    expect(store.snapshot().metrics.outputTokens).toEqual({ value: 7 });
  });

  it("merges only fields present in a completion usage update", () => {
    // Given
    const store = new TimelineStore("Pulseline · OpenCode");
    store.updateAgent({ provider: "opencode", lastUsage: { inputTokens: 10, outputTokens: 5 } });

    // When
    store.ingestLive({ epoch: "e", seq: 1, timestamp: 1_000, event: { type: "turn_completed", provider: "opencode", turnId: "turn-1", usage: { outputTokens: 7 } } });

    // Then
    expect(store.snapshot().metrics).toEqual(expect.objectContaining({ inputTokens: { value: 10 }, outputTokens: { value: 7 } }));
  });

  it("reports only canonical chat, tool and rate aggregates with provenance", () => {
    // Given
    const store = new TimelineStore("Pulseline · OpenCode");
    store.ingestLive({ epoch: "e", seq: 1, timestamp: 1_000, event: { type: "turn_started", provider: "opencode", turnId: "turn-1" } });
    store.ingestLive({ epoch: "e", seq: 2, timestamp: 1_200, event: { type: "timeline", provider: "opencode", turnId: "turn-1", item: { type: "tool_call", callId: "tool-1", name: "Read", detail: { type: "read", filePath: "a" }, status: "running", error: null } } });
    store.ingestLive({ epoch: "e", seq: 3, timestamp: 1_700, event: { type: "timeline", provider: "opencode", turnId: "turn-1", item: { type: "tool_call", callId: "tool-1", name: "Read", detail: { type: "read", filePath: "a" }, status: "completed", error: null } } });
    store.ingestLive({ epoch: "e", seq: 4, timestamp: 2_000, event: { type: "timeline", provider: "opencode", turnId: "turn-1", item: { type: "assistant_message", text: "four" } } });

    // When
    store.ingestLive({ epoch: "e", seq: 5, timestamp: 3_000, event: { type: "turn_completed", provider: "opencode", turnId: "turn-1" } });

    // Then
    expect(store.snapshot().metrics).toEqual(expect.objectContaining({
      chatDurationMs: { value: 2_000, approximate: true },
      toolCount: { value: 1 },
      toolTotalDurationMs: { value: 500, approximate: true },
      toolAverageDurationMs: { value: 500, approximate: true },
      textRateCharsPerSecond: { value: 2, approximate: true },
    }));
  });
});
