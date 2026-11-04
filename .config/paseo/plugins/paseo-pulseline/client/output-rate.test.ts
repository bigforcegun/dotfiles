import { describe, expect, it } from "vitest";
import { TurnOutputRates, outputUsageScope } from "./output-rate";
import { TimelineStore } from "./store";
import { buildPulseView } from "./pulse-view";
import { createPulselineRuntime } from "./runtime";
import type { RegistryTimelineEvent } from "./controller";

function complete(store: TimelineStore, provider = "codex", turnId = "t", outputTokens = 100, start = 1000, end = 3000) {
  store.ingestLive({ epoch: "e", timestamp: start, event: { type: "turn_started", provider, turnId } });
  store.ingestLive({ epoch: "e", timestamp: end, event: { type: "turn_completed", provider, turnId, usage: { outputTokens } } });
}
function metric(store: TimelineStore, now = 10000) {
  return buildPulseView(store.snapshot(now)).metrics.find(line => line.id === "output-rate")!;
}

describe("per-turn output rate", () => {
  it("keeps last completed turn TPS in idle rather than dividing by chat duration", () => {
    const store = new TimelineStore("");
    complete(store, "codex", "first", 500, 1000, 6000);
    complete(store, "codex", "last", 100, 20000, 22000);
    expect(metric(store).value).toBe("~50/s");
    expect(metric(store).hint).toContain("last turn (last): 100 output tokens / 2000 ms");
    expect(metric(store, 100000).value).toBe("~50/s");
  });

  it.each(["claude", "codex"])("uses %s per-turn usage directly even when values increase", provider => {
    expect(outputUsageScope(provider)).toBe("turn");
    const store = new TimelineStore("");
    complete(store, provider, "a", 100);
    complete(store, provider, "b", 300, 10000, 12000);
    expect(metric(store).value).toBe("~150/s");
  });

  it("takes a delta only for an explicitly cumulative source; never invents a first baseline", () => {
    const rates = new TurnOutputRates();
    rates.start("a", "cumulative-provider", 1000);
    rates.usage("a", "cumulative-provider", { outputTokens: 1000 }, true, 3000, "cumulative");
    expect(rates.rate(undefined, 9000)).toBeUndefined();
    rates.start("b", "cumulative-provider", 5000);
    rates.usage("b", "cumulative-provider", { outputTokens: 1300 }, true, 7000, "cumulative");
    expect(rates.rate(undefined, 9000)).toMatchObject({ value: 150, tokens: 300, durationMs: 2000, turn: "last turn" });
    rates.start("reset", "cumulative-provider", 10000);
    rates.usage("reset", "cumulative-provider", { outputTokens: 10 }, true, 12000, "cumulative");
    expect(rates.rate(undefined, 15000)?.turnId).toBe("b");
  });

  it("uses current measured usage, ticks with the same turn duration, otherwise keeps last", () => {
    const store = new TimelineStore(""); complete(store);
    store.ingestLive({ epoch: "e", timestamp: 5000, event: { type: "turn_started", provider: "codex", turnId: "new" } });
    expect(metric(store, 6000).value).toBe("~50/s");
    expect(metric(store, 6000).hint).toContain("last turn");
    store.updateAgent({ provider: "codex", activeTurn: { turnId: "new", startedAt: new Date(5000).toISOString() }, lastUsage: { outputTokens: 80 } });
    expect(metric(store, 7000).value).toBe("~40/s");
    expect(metric(store, 7000).hint).toContain("current turn (new)");
    expect(metric(store, 9000).value).toBe("~20/s");
  });

  it("sums OpenCode step-finish output once and does not add its completion echo", () => {
    const store = new TimelineStore("");
    store.updateAgent({ provider: "opencode", activeTurn: { turnId: "oc", startedAt: new Date(1000).toISOString() } });
    store.ingestLive({ epoch: "e", seq: 1, timestamp: 1000, event: { type: "turn_started", provider: "opencode", turnId: "oc" } });
    const agent = { provider: "opencode", activeTurn: { turnId: "oc", startedAt: new Date(1000).toISOString() } };
    store.updateAgent({ ...agent, lastUsage: { outputTokens: 40 } });
    store.updateAgent({ ...agent, lastUsage: { outputTokens: 40 } });
    store.updateAgent({ ...agent, lastUsage: { outputTokens: 60 } });
    store.ingestLive({ epoch: "e", seq: 4, timestamp: 5000, event: { type: "turn_completed", provider: "opencode", turnId: "oc", usage: { outputTokens: 60 } } });
    expect(metric(store).value).toBe("~25/s");
    expect(store.snapshot().outputRate?.tokens).toBe(100);
  });

  it("shows an explicitly labelled OpenCode lower bound when only completion supplies tokens", () => {
    const store = new TimelineStore(""); complete(store, "opencode", "oc", 3, 1000, 5000);
    expect(metric(store).value).toBe("~0.8/s");
    expect(metric(store).hint).toContain("lower bound");
    expect(metric(store).hint).toContain("last turn");
  });

  it("includes a different final OpenCode step when its catalog update was missed", () => {
    const store = new TimelineStore("");
    store.ingestLive({ timestamp: 1000, event: { type: "turn_started", provider: "opencode", turnId: "t" } });
    store.updateAgent({ provider: "opencode", activeTurn: { turnId: "t", startedAt: new Date(1000).toISOString() }, lastUsage: { outputTokens: 40 } });
    store.ingestLive({ timestamp: 3000, event: { type: "turn_completed", provider: "opencode", turnId: "t", usage: { outputTokens: 60 } } });
    expect(metric(store).value).toBe("~50/s");
  });

  it("keeps last measured turn through a later completion without usable usage", () => {
    const store = new TimelineStore(""); complete(store);
    store.ingestLive({ epoch: "e", timestamp: 5000, event: { type: "turn_started", provider: "codex", turnId: "new" } });
    store.ingestLive({ epoch: "e", timestamp: 7000, event: { type: "turn_completed", provider: "codex", turnId: "new" } });
    expect(metric(store).value).toBe("~50/s");
  });

  it("shows — without tokens/start/completion pairing, and permits measured zero", () => {
    const store = new TimelineStore("");
    expect(metric(store).value).toBe("—");
    store.updateAgent({ provider: "codex", lastUsage: { outputTokens: 100 } });
    expect(metric(store).value).toBe("—"); // stale agent usage cannot be attributed to a turn
    complete(store, "codex", "zero", 0);
    expect(metric(store).value).toBe("~0/s");
    const missingStart = new TimelineStore("");
    missingStart.ingestLive({ timestamp: 3000, event: { type: "turn_completed", provider: "codex", turnId: "unknown", usage: { outputTokens: 20 } } });
    expect(metric(missingStart).value).toBe("—");
  });

  it("preserves measured TPS across view remount/refetch, and clears it on epoch replacement", async () => {
    let handler: ((event: RegistryTimelineEvent) => void) | undefined;
    const runtime = createPulselineRuntime({ label: "", agent: { provider: "codex" }, schedule: () => () => {}, onSnapshot: () => {},
      timeline: () => ({ subscribe: callback => { handler = callback; return Object.assign(() => {}, { ready: Promise.resolve() }); },
        refetch: async () => ({ epoch: "e", reset: false, gap: false, hasOlder: false, startCursor: null, error: null, entries: [
          { provider: "codex", turnId: "t", timestamp: new Date(2000).toISOString(), seqStart: 2, seqEnd: 2, item: { type: "assistant_message" as const, text: "retained" } },
        ] }) }),
    });
    let unmount = runtime.subscribe(() => {}); await Promise.resolve(); await Promise.resolve();
    handler?.({ agentId: "a", epoch: "e", seq: 3, timestamp: new Date(3000).toISOString(), event: { type: "turn_started", provider: "codex", turnId: "t" } });
    handler?.({ agentId: "a", epoch: "e", seq: 4, timestamp: new Date(5000).toISOString(), event: { type: "turn_completed", provider: "codex", turnId: "t", usage: { outputTokens: 100 } } });
    expect(runtime.getSnapshot().outputRate?.value).toBe(50);
    unmount(); unmount = runtime.subscribe(() => {}); await Promise.resolve(); await Promise.resolve();
    expect(runtime.getSnapshot().outputRate?.value).toBe(50);
    handler?.({ agentId: "a", event: { type: "replacement", epoch: "new" } });
    expect(runtime.getSnapshot().outputRate).toBeUndefined();
    unmount(); runtime.dispose();
  });
});
