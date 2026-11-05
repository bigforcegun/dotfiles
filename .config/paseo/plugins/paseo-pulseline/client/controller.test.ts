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
    const store = new TimelineStore("Pulseline");
    const controller = createTimelineController(source, store, vi.fn());

    // When
    source.emit({ agentId: "agent-1", epoch: "epoch-1", seq: 3, timestamp: "2026-09-12T00:00:03.000Z", event: { type: "timeline", provider: "opencode", item: { type: "reasoning", text: "live" } } });
    resolveTail(timelinePage({
      epoch: "epoch-1",
      hasOlder: true,
      startCursor: { epoch: "epoch-1", seq: 2 },
      entries: [{ provider: "opencode", timestamp: "2026-09-12T00:00:02.000Z", seqStart: 2, seqEnd: 2, item: { type: "user_message", text: "prompt" } }],
    }));
    await setImmediate();
    await vi.waitFor(() => expect(source.requests).toHaveLength(2), { interval: 1 });

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
    const store = new TimelineStore("Pulseline");
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

  it("keeps the history and refetches the tail when the subscription is restored", async () => {
    // Given
    const source = new FakeTimeline();
    source.responses.push(Promise.resolve(timelinePage({ epoch: "epoch-1", entries: [{ provider: "claude", timestamp: "2026-09-12T00:00:01.000Z", seqStart: 1, seqEnd: 1, item: { type: "assistant_message", text: "before" } }] })));
    source.responses.push(Promise.resolve(timelinePage({ epoch: "epoch-1", entries: [{ provider: "claude", timestamp: "2026-09-12T00:00:03.000Z", seqStart: 3, seqEnd: 3, item: { type: "assistant_message", text: "after" } }] })));
    const store = new TimelineStore("Pulseline");
    createTimelineController(source, store, vi.fn());
    await setImmediate();

    // When
    source.emit({ agentId: "agent-1", subscriptionId: "sub-2", event: { type: "subscription_restored" } });
    await setImmediate();

    // Then
    expect(source.requests).toEqual([{ direction: "tail" }, { direction: "tail" }]);
    expect(store.snapshot().epoch).toBe("epoch-1");
    expect(store.snapshot().blocks.map(({ text }) => text)).toEqual(["before", "after"]);
    // Whatever arrived while demand was down is unrecoverable, so say so.
    expect(store.snapshot().gap).toBe(true);
  });

  it("marks the timeline incomplete when the subscription errors, without refetching", async () => {
    // Given
    const source = new FakeTimeline();
    source.responses.push(Promise.resolve(timelinePage({ epoch: "epoch-1", entries: [{ provider: "claude", timestamp: "2026-09-12T00:00:01.000Z", seqStart: 1, seqEnd: 1, item: { type: "assistant_message", text: "kept" } }] })));
    const store = new TimelineStore("Pulseline");
    const onChange = vi.fn();
    createTimelineController(source, store, onChange);
    await setImmediate();
    const changesBefore = onChange.mock.calls.length;

    // When
    source.emit({ agentId: "agent-1", event: { type: "error", error: "observation released" } });
    await setImmediate();

    // Then
    expect(source.requests).toEqual([{ direction: "tail" }]);
    expect(store.snapshot().blocks.map(({ text }) => text)).toEqual(["kept"]);
    expect(store.snapshot().gap).toBe(true);
    expect(onChange.mock.calls.length).toBeGreaterThan(changesBefore);
  });

  it("ignores late async work and events after cleanup", async () => {
    // Given
    const source = new FakeTimeline();
    let resolvePage: (page: RegistryTimelinePage) => void = () => {
      throw new Error("page resolver was not initialized");
    };
    source.responses.push(new Promise((resolve) => { resolvePage = resolve; }));
    const store = new TimelineStore("Pulseline");
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

  it("loads all three hundred history pages without a page cap", async () => {
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
    const store = new TimelineStore("Pulseline");

    // When
    const controller = createTimelineController(source, store, vi.fn());
    await setImmediate();
    await vi.waitFor(() => expect(source.requests).toHaveLength(300), { interval: 1, timeout: 3000 });

    // Then
    expect(source.requests).toHaveLength(300);
    expect(store.snapshot().blocks).toHaveLength(300);
    expect(store.snapshot().blocks.at(-1)?.text).toBe("page-300");
    expect(store.snapshot().gap).toBe(false);
    console.log(`F2_BOUNDS history.inputPages=300 requests=${source.requests.length} retained=${store.snapshot().blocks.length} gap=${store.snapshot().gap}`);
  });
});


it("continues across gap pages, stops repeated cursors and exposes lifecycle flags", async () => {
  const source = new FakeTimeline();
  const cursor = { epoch: "e", seq: 1 };
  source.responses.push(Promise.resolve(timelinePage({ epoch: "e", gap: true, hasOlder: true, startCursor: cursor, entries: [] })));
  source.responses.push(Promise.resolve(timelinePage({ epoch: "e", hasOlder: true, startCursor: cursor, entries: [] })));
  const store = new TimelineStore("");
  const controller = createTimelineController(source, store, vi.fn());
  expect(store.snapshot().historyLoaded).toBe(false);
  await setImmediate();
  await vi.waitFor(() => expect(source.requests).toHaveLength(2), { interval: 1 });
  expect(source.requests).toHaveLength(2);
  expect(store.snapshot()).toMatchObject({ historyLoaded: true, historyFailed: false, gap: true });
  controller.stop();
});

it("exposes a failed history load instead of an empty successful history", async () => {
  const source = new FakeTimeline();
  source.responses.push(Promise.reject(new Error("unavailable")));
  const store = new TimelineStore("");
  const controller = createTimelineController(source, store, vi.fn());
  await setImmediate();
  expect(store.snapshot()).toMatchObject({ historyLoaded: true, historyFailed: true, gap: true });
  controller.stop();
});
