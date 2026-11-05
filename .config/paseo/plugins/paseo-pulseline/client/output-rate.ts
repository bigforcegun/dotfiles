import type { AgentUsage } from "@getpaseo/protocol/agent-types";

export type OutputUsageScope = "turn" | "steps" | "cumulative";
export interface OutputRate {
  readonly value: number;
  readonly approximate: true;
  readonly turnId: string;
  readonly turn: "current turn" | "last turn";
  readonly tokens: number;
  readonly source: "provider turn output" | "observed OpenCode steps (lower bound)";
  readonly durationMs: number;
}
interface TurnOutput {
  provider: string;
  start: number;
  end?: number;
  tokens?: number | undefined;
  completed?: boolean;
  lastStep?: number;
  observedStart: boolean;
}

export function outputUsageScope(provider: string): OutputUsageScope | undefined {
  // Pinned v0.14.0 adapter evidence and SDK scope are documented in DESIGN.md.
  if (provider === "claude" || provider === "codex") return "turn";
  if (provider === "opencode") return "steps";
  return undefined;
}

// Explicit cumulative support: never guess scope from monotonically increasing counts.
export function turnOutputTokens(scope: OutputUsageScope, output: number, previous?: number): number | undefined {
  if (!Number.isFinite(output) || output < 0) return undefined;
  if (scope !== "cumulative") return output;
  return previous !== undefined && output >= previous ? output - previous : undefined;
}

/** Lives with one descriptor's runtime, survives view unmount, resets on epoch replacement. */
export class TurnOutputRates {
  #epoch: string | undefined;
  #lastCompleted: { id: string; turn: TurnOutput } | undefined;
  readonly #turns = new Map<string, TurnOutput>();
  readonly #cumulative = new Map<string, number>();

  reset(epoch: string): void {
    this.#epoch = epoch; this.#turns.clear(); this.#cumulative.clear(); this.#lastCompleted = undefined;
  }

  epoch(epoch: string): void {
    if (this.#epoch !== undefined && this.#epoch !== epoch) {
      this.#turns.clear();
      this.#lastCompleted = undefined;
      this.#cumulative.clear();
    }
    this.#epoch = epoch;
  }

  start(id: string | undefined, provider: string, timestamp: number, observedStart = true): void {
    if (!id || !Number.isFinite(timestamp)) return;
    const existing = this.#turns.get(id);
    if (existing) {
      // Catalog state may arrive before the live start event. Upgrade coverage without clearing usage.
      if (observedStart && !existing.completed) {
        existing.observedStart = true;
        existing.start = Math.min(existing.start, timestamp);
      }
      return;
    }
    this.#turns.set(id, { provider, start: timestamp, observedStart });
  }

  usage(id: string | undefined, provider: string, usage: AgentUsage | undefined, completed: boolean,
    timestamp: number, scope = outputUsageScope(provider)): void {
    if (!id) return;
    const turn = this.#turns.get(id);
    if (!turn || turn.provider !== provider || turn.completed) return;
    const output = usage?.outputTokens;
    if (scope && output !== undefined && Number.isFinite(output) && output >= 0) {
      if (scope === "steps") {
        // OpenCode emits one usage_updated per step-finish; completion repeats the final step.
        if (!completed && turn.observedStart) {
          turn.tokens = (turn.tokens ?? 0) + output;
          turn.lastStep = output;
        } else if (completed && (turn.tokens === undefined || turn.lastStep !== output)) {
          turn.tokens = (turn.tokens ?? 0) + output;
        }
      } else {
        turn.tokens = turnOutputTokens(scope, output, this.#cumulative.get(provider));
      }
    }
    if (completed) {
      turn.end = timestamp;
      turn.completed = true;
      if (turn.tokens !== undefined && timestamp > turn.start && (!this.#lastCompleted || timestamp >= this.#lastCompleted.turn.end!)) this.#lastCompleted = { id, turn };
      if (scope === "cumulative") {
        if (output !== undefined && Number.isFinite(output) && output >= 0) this.#cumulative.set(provider, output);
        else this.#cumulative.delete(provider);
      }
    }
  }

  failed(id: string | undefined): void {
    const turn = id ? this.#turns.get(id) : undefined;
    if (turn) this.#cumulative.delete(turn.provider);
    if (id) this.#turns.delete(id);
  }

  retain(ids: ReadonlySet<string>): void {
    for (const id of this.#turns.keys()) if (!ids.has(id)) this.#turns.delete(id);
    if (this.#lastCompleted && !this.#turns.has(this.#lastCompleted.id)) {
      this.#lastCompleted = undefined;
      for (const [id, turn] of this.#turns) if (turn.completed && turn.tokens !== undefined && turn.end! > turn.start && (!this.#lastCompleted || turn.end! >= this.#lastCompleted.turn.end!)) this.#lastCompleted = { id, turn };
    }
  }

  rate(activeId: string | undefined, now: number): OutputRate | undefined {
    const measure = (id: string, turn: TurnOutput, current: boolean): OutputRate | undefined => {
      const durationMs = (current ? now : turn.end ?? turn.start) - turn.start;
      if (turn.tokens === undefined || !Number.isFinite(durationMs) || durationMs <= 0) return undefined;
      return { value: turn.tokens * 1000 / durationMs, approximate: true, turnId: id,
        turn: current ? "current turn" : "last turn", tokens: turn.tokens, durationMs, source: turn.provider === "opencode" ? "observed OpenCode steps (lower bound)" : "provider turn output" };
    };
    const active = activeId ? this.#turns.get(activeId) : undefined;
    if (active && !active.completed) {
      const live = measure(activeId!, active, true);
      if (live) return live;
    }
    if (this.#lastCompleted) return measure(this.#lastCompleted.id, this.#lastCompleted.turn, false);
    return undefined;
  }
}
