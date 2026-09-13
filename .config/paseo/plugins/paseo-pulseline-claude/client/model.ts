// Pure reducer over normalized inputs. Every observation is recorded with the
// timestamp the daemon supplied; nothing here reads a clock or a provider name.
import { blockFromEntry, turnBlock } from "./blocks.ts";
import type {
  PulseActiveTurn,
  PulseBlock,
  PulseTimelineEntry,
  PulseTurnPhase,
  PulseUsage,
} from "./types.ts";

export const MAX_PULSE_BLOCKS = 48;

export interface PulseModelState {
  readonly epoch: string | null;
  readonly blocks: readonly PulseBlock[];
  readonly historyLoaded: boolean;
  /** History was declared loaded only because the daemon never answered. */
  readonly historyFailed: boolean;
  readonly needsRefetch: boolean;
  readonly lastSeq: number | null;
  readonly gap: boolean;
  readonly truncated: boolean;
  readonly status: string | null;
  readonly busy: boolean;
  readonly activeTurn: PulseActiveTurn | null;
  readonly turnStartedAt: string | null;
  readonly lastTurnMs: number | null;
  readonly usage: PulseUsage | null;
  readonly toolDurationsMs: readonly number[];
  /** Text accounting is scoped to one turn; a rate across turns is meaningless. */
  readonly turnTextId: string | null;
  readonly turnTextChars: number;
  readonly turnTextFirstAt: string | null;
  readonly turnTextLastAt: string | null;
}

export type PulseInput =
  | {
      type: "history";
      epoch: string;
      entries: readonly PulseTimelineEntry[];
      gap?: boolean;
      /** The page is synthetic: every bounded attempt failed. */
      failed?: boolean;
    }
  | { type: "live"; entry: PulseTimelineEntry; epoch?: string | undefined }
  | {
      type: "turn";
      phase: PulseTurnPhase;
      at: string;
      turnId?: string | undefined;
      usage?: PulseUsage | undefined;
      epoch?: string | undefined;
    }
  | { type: "replacement"; epoch: string }
  | { type: "usage"; usage: PulseUsage }
  | { type: "incomplete" }
  | {
      type: "agent";
      status: string | null;
      activeTurn: PulseActiveTurn | null;
      usage?: PulseUsage | undefined;
    };

export const initialPulseState: PulseModelState = {
  epoch: null,
  blocks: [],
  historyLoaded: false,
  historyFailed: false,
  needsRefetch: false,
  lastSeq: null,
  gap: false,
  truncated: false,
  status: null,
  busy: false,
  activeTurn: null,
  turnStartedAt: null,
  lastTurnMs: null,
  usage: null,
  toolDurationsMs: [],
  turnTextId: null,
  turnTextChars: 0,
  turnTextFirstAt: null,
  turnTextLastAt: null,
};

type Draft = {
  -readonly [Key in keyof PulseModelState]: PulseModelState[Key];
};

function draft(state: PulseModelState): Draft {
  return { ...state, blocks: [...state.blocks], toolDurationsMs: [...state.toolDurationsMs] };
}

function pushBlock(next: Draft, block: PulseBlock): void {
  const blocks = next.blocks as PulseBlock[];
  blocks.push(block);
  if (blocks.length > MAX_PULSE_BLOCKS) {
    blocks.splice(0, blocks.length - MAX_PULSE_BLOCKS);
    next.truncated = true;
  }
}

function applyEntry(next: Draft, entry: PulseTimelineEntry): void {
  if (typeof next.lastSeq === "number" && entry.seq <= next.lastSeq) return;
  next.lastSeq = Math.max(next.lastSeq ?? 0, entry.seq);
  const block = blockFromEntry(entry);
  if (!block) return;

  const blocks = next.blocks as PulseBlock[];
  const index = blocks.findIndex((candidate) => candidate.key === block.key);
  if (index >= 0) {
    const previous = blocks[index] as PulseBlock;
    // A tool's terminal row updates its block in place. The observed duration is
    // recorded only when this client also saw the row that started it.
    if (previous.pending && !block.pending) {
      const durationMs = Date.parse(block.startedAt) - Date.parse(previous.startedAt);
      if (Number.isFinite(durationMs) && durationMs >= 0) {
        (next.toolDurationsMs as number[]).push(durationMs);
      }
    }
    blocks[index] = {
      ...previous,
      kind: block.kind,
      label: block.label ?? previous.label,
      weight: Math.max(previous.weight, block.weight),
      endedAt: block.endedAt,
      pending: block.pending,
    };
  } else {
    pushBlock(next, block);
  }

  if (block.kind === "text") {
    const text = entry.item["text"];
    const chars = typeof text === "string" ? text.length : 0;
    const turnId = entry.turnId ?? null;
    if (next.turnTextId !== turnId) {
      next.turnTextId = turnId;
      next.turnTextChars = chars;
      next.turnTextFirstAt = entry.timestamp;
    } else {
      next.turnTextChars += chars;
      next.turnTextFirstAt ??= entry.timestamp;
    }
    next.turnTextLastAt = entry.timestamp;
  }
}

function mergeUsage(current: PulseUsage | null, incoming?: PulseUsage): PulseUsage | null {
  if (!incoming) return current;
  return { ...(current ?? {}), ...incoming };
}

export function reducePulse(state: PulseModelState, input: PulseInput): PulseModelState {
  // An observation stamped with a superseded epoch describes a timeline this
  // model no longer holds. Dropping it beats blending two histories.
  if (
    (input.type === "live" || input.type === "turn") &&
    input.epoch !== undefined &&
    state.epoch !== null &&
    input.epoch !== state.epoch
  ) {
    return state;
  }
  const next = draft(state);
  switch (input.type) {
    case "history": {
      next.epoch = input.epoch;
      next.gap = state.gap || Boolean(input.gap);
      next.historyLoaded = true;
      next.historyFailed = Boolean(input.failed);
      next.needsRefetch = false;
      for (const entry of input.entries) applyEntry(next, entry);
      return next;
    }
    case "live": {
      applyEntry(next, input.entry);
      return next;
    }
    case "turn": {
      if (input.phase === "started") {
        next.activeTurn = { turnId: input.turnId, startedAt: input.at };
        next.turnStartedAt = input.at;
        next.busy = true;
        return next;
      }
      pushBlock(next, turnBlock(input.phase, input.turnId, input.at));
      next.usage = mergeUsage(next.usage, input.usage);
      // A terminal only closes the turn it names. A late completion for an older
      // turn records its outcome without stopping the one currently running.
      const active = state.activeTurn;
      const identified = input.turnId !== undefined && active?.turnId !== undefined;
      if (identified && active.turnId !== input.turnId) return next;
      if (next.turnStartedAt) {
        const elapsed = Date.parse(input.at) - Date.parse(next.turnStartedAt);
        next.lastTurnMs = Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
      }
      next.activeTurn = null;
      next.turnStartedAt = null;
      next.busy = false;
      return next;
    }
    case "replacement": {
      // The daemon invalidated this agent's history; keep only agent-level facts.
      return {
        ...initialPulseState,
        epoch: input.epoch,
        needsRefetch: true,
        status: state.status,
        busy: state.busy,
        activeTurn: state.activeTurn,
        turnStartedAt: state.turnStartedAt,
        usage: state.usage,
      };
    }
    case "usage": {
      next.usage = mergeUsage(next.usage, input.usage);
      return next;
    }
    case "incomplete": {
      if (state.gap) return state;
      next.gap = true;
      return next;
    }
    case "agent": {
      next.status = input.status;
      next.activeTurn = input.activeTurn;
      next.busy = input.status === "running" || input.activeTurn !== null;
      next.usage = mergeUsage(next.usage, input.usage);
      if (input.activeTurn?.startedAt) next.turnStartedAt = input.activeTurn.startedAt;
      if (!input.activeTurn && input.status !== "running") next.turnStartedAt = null;
      return next;
    }
  }
}
