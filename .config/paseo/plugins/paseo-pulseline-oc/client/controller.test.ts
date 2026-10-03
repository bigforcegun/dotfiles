import { setImmediate } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import {
  createTimelineController,
  type RegistryTimelineEvent,
  type RegistryTimelinePage,
  type RegistryTimelineSource,
} from "./controller";
import { TimelineStore } from "./store";

function timelinePage(input: Partial<RegistryTimelinePage> & Pick<RegistryTimelinePage, "epoch" | "entries">): RegistryTimelinePage {
  return {
    epoch: input.epoch,
    entries: input.entries,
    reset: input.reset ?? false,
    gap: input.gap ?? false,
    hasOlder: input.hasOlder ?? false,
    startCursor: input.startCursor ?? null,
    error: input.error ?? null,
  };
}

class FakeTimeline implements RegistryTimelineSource {
  readonly requests: Array<{ readonly direction?: string; readonly cursor?: { readonly epoch: string; readonly seq: number } }> = [];
  readonly handlers = new Set<(event: RegistryTimelineEvent) => void>();
  readonly responses: Array<Promise<RegistryTimelinePage>> = [];
  removals = 0;

  subscribe(handler: (event: RegistryTimelineEvent) => void) {
    this.handlers.add(handler);
    return Object.assign(
      () => {
        if (this.handlers.delete(handler)) this.removals += 1;
      },
      { ready: Promise.resolve() },
    );
  }

  refetch(options?: { readonly direction?: "tail" | "before"; readonly cursor?: { readonly epoch: string; readonly seq: number } }) {
    this.requests.push({
      ...(options?.direction ? { direction: options.direction } : {}),
      ...(options?.cursor ? { cursor: options.cursor } : {}),
    });
    const response = this.responses.shift();
    return response ?? Promise.reject(new Error("missing fake timeline page"));
  }

  emit(event: RegistryTimelineEvent): void {
    for (const handler of this.handlers) handler(event);
  }
}

describe("timeline controller", () => {
  it("buffers live events while paginating history and records a gap", async () => {
    // Given
    const source = new FakeTimeline();
    let resolveTail: (page: RegistryTimelinePage) => void = () => {
      throw new Error("tail resolver was not initialized");
    };
    source.responses.push(new Promise((resolve) => { resolveTail = resolve; }));
    source.responses.push(Promise.resolve(timelinePage({
      epoch: "epoch-1",
      gap: true,
      entries: [{ provider: "opencode", timestamp: "2026-09-12T00:00:01.000Z", seqStart: 1, seqEnd: 1, item: { type: "assistant_message", text: "history" } }],
    })));
    const store = new TimelineStore("Pulseline · OpenCode");
    createTimelineController(source, store, vi.fn());

    // When
    source.emit({ agentId: "agent-1", epoch: "epoch-1", seq: 3, timestamp: "2026-09-12T00:00:03.000Z", event: { type: "timeline", provider: "opencode", item: { type: "reasoning", text: "live" } } });
    resolveTail(timelinePage({
      epoch: "epoch-1",
      hasOlder: true,
      startCursor: { epoch: "epoch-1", seq: 2 },
      entries: [{ provider: "opencode", timestamp: "2026-09-12T00:00:02.000Z", seqStart: 2, seqEnd: 2, item: { type: "user_message", text: "prompt" } }],
    }));
    await setImmediate();

    // Then
    expect(source.requests).toEqual([
      { direction: "tail" },
      { direction: "before", cursor: { epoch: "epoch-1", seq: 2 } },
    ]);
    expect(store.snapshot().blocks.map(({ kind }) => kind)).toEqual(["text", "reasoning"]);
    expect(store.snapshot().gap).toBe(true);
  });

  it("replaces the epoch and refetches a clean tail", async () => {
    // Given
    const source = new FakeTimeline();
    source.responses.push(Promise.resolve(timelinePage({ epoch: "old", entries: [{ provider: "claude", timestamp: "2026-09-12T00:00:01.000Z", seqStart: 1, seqEnd: 1, item: { type: "assistant_message", text: "old" } }] })));
    source.responses.push(Promise.resolve(timelinePage({ epoch: "new", reset: true, entries: [{ provider: "claude", timestamp: "2026-09-12T00:00:02.000Z", seqStart: 2, seqEnd: 2, item: { type: "reasoning", text: "new" } }] })));
    const store = new TimelineStore("Pulseline · OpenCode");
    createTimelineController(source, store, vi.fn());
    await setImmediate();

    // When
    source.emit({ agentId: "agent-1", event: { type: "replacement", epoch: "new" } });
    await setImmediate();

    // Then
    expect(source.requests).toEqual([{ direction: "tail" }, { direction: "tail" }]);
    expect(store.snapshot().blocks.map(({ kind }) => kind)).toEqual(["reasoning"]);
    expect(store.snapshot().epoch).toBe("new");
  });

  it("ignores late async work and events after cleanup", async () => {
    // Given
    const source = new FakeTimeline();
    let resolvePage: (page: RegistryTimelinePage) => void = () => {
      throw new Error("page resolver was not initialized");
    };
    source.responses.push(new Promise((resolve) => { resolvePage = resolve; }));
    const store = new TimelineStore("Pulseline · OpenCode");
    const onChange = vi.fn();
    const controller = createTimelineController(source, store, onChange);

    // When
    controller.stop();
    resolvePage(timelinePage({ epoch: "late", entries: [{ provider: "claude", timestamp: "2026-09-12T00:00:01.000Z", seqStart: 1, seqEnd: 1, item: { type: "assistant_message", text: "late" } }] }));
    source.emit({ agentId: "agent-1", epoch: "late", seq: 2, timestamp: "2026-09-12T00:00:02.000Z", event: { type: "timeline", provider: "claude", item: { type: "assistant_message", text: "later" } } });
    await setImmediate();

    // Then
    expect(store.snapshot().blocks).toEqual([]);
    expect(source.requests).toEqual([]);
    expect(source.removals).toBe(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("caps a three-hundred-page history and marks the retained tail incomplete", async () => {
    // Given
    const source = new FakeTimeline();
    for (let pageNumber = 1; pageNumber <= 300; pageNumber += 1) {
      source.responses.push(Promise.resolve(timelinePage({
        epoch: "e",
        hasOlder: pageNumber < 300,
        startCursor: pageNumber < 300 ? { epoch: "e", seq: 301 - pageNumber } : null,
        entries: [{
          provider: "opencode",
          timestamp: new Date(pageNumber * 1_000).toISOString(),
          seqStart: pageNumber,
          seqEnd: pageNumber,
          item: { type: "assistant_message", text: `page-${pageNumber}` },
        }],
      })));
    }
    const store = new TimelineStore("Pulseline · OpenCode");

    // When
    createTimelineController(source, store, vi.fn());
    for (let index = 0; index < 10; index += 1) await setImmediate();

    // Then
    expect(source.requests).toHaveLength(8);
    expect(store.snapshot().blocks).toHaveLength(8);
    expect(store.snapshot().blocks.at(-1)?.text).toBe("page-8");
    expect(store.snapshot().gap).toBe(true);
    console.log(`F2_BOUNDS history.inputPages=300 requests=${source.requests.length} retained=${store.snapshot().blocks.length} gap=${store.snapshot().gap}`);
  });
});
