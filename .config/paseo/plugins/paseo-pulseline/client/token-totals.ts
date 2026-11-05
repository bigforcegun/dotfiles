import type { AgentUsage } from "@getpaseo/protocol/agent-types";
import type { PulseMetrics } from "./model";
import { outputUsageScope, type OutputUsageScope } from "./output-rate";
const fields = ["inputTokens", "outputTokens", "cachedInputTokens"] as const;
type Counts = Partial<Record<typeof fields[number], number>>;
interface TurnCounts { counts: Counts; last: Counts; completed: boolean; scope: OutputUsageScope }
/** Live observation ledger. History text is never converted into reported token usage. */
export class TokenTotals {
  readonly #turns = new Map<string, TurnCounts>();
  readonly #totals: Counts = {};
  readonly #baseline: Counts = {};
  since: number | undefined;
  start(timestamp: number): void { this.since ??= timestamp; }
  reset(): void { this.#turns.clear(); for (const key of fields) { delete this.#totals[key]; delete this.#baseline[key]; } this.since = undefined; }
  observe(id: string | undefined, provider: string, usage: AgentUsage | undefined, completed: boolean, timestamp: number, scope = outputUsageScope(provider)): void {
    if (!id || !scope) return;
    let turn = this.#turns.get(id);
    if (turn?.completed) return;
    if (!turn) { turn = { counts: {}, last: {}, completed: false, scope }; this.#turns.set(id, turn); }
    for (const field of fields) {
      const reported = usage?.[field];
      if (reported === undefined || !Number.isFinite(reported) || reported < 0) continue;
      this.since ??= timestamp;
      const old = turn.counts[field];
      let next: number | undefined;
      if (scope === "cumulative") next = this.#baseline[field] !== undefined && reported >= this.#baseline[field]! ? reported - this.#baseline[field]! : undefined;
      else if (scope === "steps") next = completed && turn.last[field] === reported ? old : (old ?? 0) + reported;
      else next = reported;
      turn.last[field] = reported;
      if (next !== undefined) { turn.counts[field] = next; this.#totals[field] = (this.#totals[field] ?? 0) + next - (old ?? 0); }
      if (completed && scope === "cumulative") this.#baseline[field] = reported;
    }
    if (completed) {
      turn.completed = true;
      // Seq high-water handles old wire replay; retain recent IDs for terminal/catalog echoes.
      if (this.#turns.size > 5000) this.#turns.delete(this.#turns.keys().next().value!);
    }
  }
  metrics(): PulseMetrics {
    return Object.fromEntries(fields.flatMap(field => this.#totals[field] === undefined ? [] : [[field, { value: this.#totals[field], approximate: true }]]));
  }
}
