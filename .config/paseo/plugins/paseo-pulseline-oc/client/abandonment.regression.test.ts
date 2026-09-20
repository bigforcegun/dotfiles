import type { PaseoAgentListOptions } from "@getpaseo/client";
import type { PluginButtonRegistration, PluginComposerPillContribution } from "@getpaseo/plugin/client";
import process from "node:process";
import { setImmediate } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { createAbandonment } from "./abandon";
import {
  createTimelineController,
  type RegistryTimelineEvent,
  type RegistryTimelinePage,
  type RegistryTimelineSource,
} from "./controller";
import { createPulselineRegistry, type RegistryAgentUpdate, type RegistryHost } from "./registry";
import { TimelineStore } from "./store";

vi.mock("react-native", () => ({
  StyleSheet: { create: <Styles extends object>(styles: Styles) => styles },
  Text: "Text",
  View: "View",
}));

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
  readonly reject: (error: Error) => void;
  readonly settled: () => boolean;
}

function deferred<Value>(): Deferred<Value> {
  let settled = false;
  let resolvePromise = (_value: Value) => {};
  let rejectPromise = (_error: Error) => {};
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve(value) {
      settled = true;
      resolvePromise(value);
    },
    reject(error) {
      settled = true;
      rejectPromise(error);
    },
    settled: () => settled,
  };
}

function pendingWaits(owner: object): number {
  if (!("pendingWaits" in owner) || typeof owner.pendingWaits !== "function") return -1;
  const count = owner.pendingWaits();
  return typeof count === "number" ? count : -1;
}

function weakHandler(promise: Promise<never>, abandonment: ReturnType<typeof createAbandonment>): WeakRef<object> {
  const target = { calls: 0 };
  const reference = new WeakRef(target);
  abandonment.race(promise, {
    value: () => { target.calls += 1; },
    error: () => { target.calls += 1; },
  });
  return reference;
}

class PendingTimeline implements RegistryTimelineSource {
  readonly ready: Deferred<void>;
  readonly refetches: Deferred<RegistryTimelinePage>[] = [];
  readonly #hangRefetch: boolean;
  #handler: ((event: RegistryTimelineEvent) => void) | undefined;

  constructor(ready: Deferred<void>, hangRefetch: boolean) {
    this.ready = ready;
    this.#hangRefetch = hangRefetch;
  }

  subscribe(handler: (event: RegistryTimelineEvent) => void) {
    this.#handler = handler;
    return Object.assign(
      () => {
        this.#handler = undefined;
      },
      { ready: this.ready.promise },
    );
  }

  refetch(): Promise<RegistryTimelinePage> {
    if (!this.#hangRefetch) {
      return Promise.resolve({
        epoch: "e",
        reset: false,
        gap: false,
        hasOlder: false,
        startCursor: null,
        entries: [],
        error: null,
      });
    }
    const request = deferred<RegistryTimelinePage>();
    this.refetches.push(request);
    return request.promise;
  }
}

function pendingListHost(list: Promise<never>): RegistryHost {
  return {
    paseo: { agents: {
      list: (_options?: PaseoAgentListOptions) => list,
      subscribe: (_handler: (update: RegistryAgentUpdate) => void) => () => {},
      ref: () => ({ timeline: new PendingTimeline(deferred<void>(), false) }),
    } },
    addComposerPill(_contribution: PluginComposerPillContribution): PluginButtonRegistration {
      return { update() {}, remove() {} };
    },
  };
}

describe("plugin-owned abandonment", () => {
  it.skipIf(typeof global.gc !== "function")("releases twenty plugin handler targets while raw reactions remain pending", async () => {
    // Given
    const abandonment = createAbandonment();
    const waits = Array.from({ length: 20 }, () => deferred<never>());
    const handlers = waits.map(({ promise }) => weakHandler(promise, abandonment));
    expect(abandonment.pendingCount()).toBe(20);

    // When
    abandonment.abandon();
    for (let cycle = 0; cycle < 5; cycle += 1) {
      global.gc?.();
      await setImmediate();
    }

    // Then
    const alive = handlers.filter((reference) => reference.deref() !== undefined).length;
    expect(alive).toBe(0);
    expect(abandonment.pendingCount()).toBe(0);
    expect(waits.every((wait) => !wait.settled())).toBe(true);
    console.log(`F2_WEAKREF handlers=20 alive=${alive} pending=${abandonment.pendingCount()} raw.cancelled=0`);
  });

  it("settles twenty permanently pending readiness waits on stop", async () => {
    // Given
    const waits = Array.from({ length: 20 }, () => deferred<void>());
    const controllers = waits.map((ready) =>
      createTimelineController(new PendingTimeline(ready, false), new TimelineStore("test"), () => {}),
    );
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    try {
      expect(controllers.reduce((total, controller) => total + pendingWaits(controller), 0)).toBe(20);

      // When
      for (const controller of controllers) controller.stop();
      await setImmediate();

      // Then
      expect(waits.every((wait) => !wait.settled())).toBe(true);
      expect(controllers.reduce((total, controller) => total + pendingWaits(controller), 0)).toBe(0);
      for (const wait of waits) wait.reject(new Error("late readiness rejection"));
      await setImmediate();
      expect(unhandled).toEqual([]);
      console.log("F2_ABANDON ready.before=20 ready.after=0 raw.cancelled=0 late.unhandled=0");
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("settles twenty permanently pending refetch waits on stop", async () => {
    // Given
    const sources = Array.from({ length: 20 }, () => {
      const ready = deferred<void>();
      const source = new PendingTimeline(ready, true);
      const controller = createTimelineController(source, new TimelineStore("test"), () => {});
      ready.resolve();
      return { source, controller };
    });
    await setImmediate();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    try {
      expect(sources.every(({ source }) => source.refetches.length === 1)).toBe(true);
      expect(sources.reduce((total, { controller }) => total + pendingWaits(controller), 0)).toBe(20);

      // When
      for (const { controller } of sources) controller.stop();
      await setImmediate();

      // Then
      expect(sources.every(({ source }) => !source.refetches[0]?.settled())).toBe(true);
      expect(sources.reduce((total, { controller }) => total + pendingWaits(controller), 0)).toBe(0);
      for (const { source } of sources) source.refetches[0]?.reject(new Error("late refetch rejection"));
      await setImmediate();
      expect(unhandled).toEqual([]);
      console.log("F2_ABANDON refetch.before=20 refetch.after=0 raw.cancelled=0 late.unhandled=0");
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("settles twenty permanently pending directory-list waits on cleanup", async () => {
    // Given
    const lists = Array.from({ length: 20 }, () => deferred<never>());
    const cleanups = lists.map((list) => createPulselineRegistry(pendingListHost(list.promise), () => () => {}));
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    try {
      expect(cleanups.reduce((total, cleanup) => total + pendingWaits(cleanup), 0)).toBe(20);

      // When
      for (const cleanup of cleanups) cleanup();
      await setImmediate();

      // Then
      expect(lists.every((list) => !list.settled())).toBe(true);
      expect(cleanups.reduce((total, cleanup) => total + pendingWaits(cleanup), 0)).toBe(0);
      for (const list of lists) list.reject(new Error("late list rejection"));
      await setImmediate();
      expect(unhandled).toEqual([]);
      console.log("F2_ABANDON list.before=20 list.after=0 raw.cancelled=0 late.unhandled=0");
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
