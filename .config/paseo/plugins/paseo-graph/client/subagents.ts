import { useEffect, useMemo, useRef, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import {
  type NativeSubagent,
  NativeSubagentSchema,
  SUBAGENT_BATCH_LIMIT,
  listNativeSubagents,
} from "../shared/subagents";
import { type PaseoApi } from "./data";

/**
 * Native subagents come from two places. The daemon streams every change to
 * every subagent over one event subscription, but never replays what already
 * exists; the server half of this plugin fills that gap with a snapshot. The
 * snapshot is slow in proportion to the catalogue, so it runs in batches behind
 * the graph rather than in front of it: the canvas draws at once and subagents
 * appear as each batch answers.
 */

const SUBAGENT_EVENT = "agent.provider_subagents.update";

interface SubagentUpdateLike {
  payload?: {
    kind?: "upsert" | "timeline" | "remove";
    subagent?: unknown;
    parentAgentId?: string;
    subagentId?: string;
  };
}

export interface SubagentScan {
  done: number;
  total: number;
  failed: number;
}

const EMPTY: ReadonlyMap<string, NativeSubagent> = new Map();

const subagentKey = (parentAgentId: string, id: string) => `${parentAgentId}:${id}`;

/** The stream and the snapshot race; whichever saw the later state wins. */
function mergeNewer(
  prev: ReadonlyMap<string, NativeSubagent>,
  incoming: readonly NativeSubagent[],
): ReadonlyMap<string, NativeSubagent> {
  let next: Map<string, NativeSubagent> | null = null;
  for (const subagent of incoming) {
    const key = subagentKey(subagent.parentAgentId, subagent.id);
    const current = (next ?? prev).get(key);
    if (current && current.updatedAt >= subagent.updatedAt) continue;
    next ??= new Map(prev);
    next.set(key, subagent);
  }
  return next ?? prev;
}

/**
 * `parentIds` must list only agents the daemon already holds in memory. Asking
 * about a closed agent makes the daemon resume it from persistence just to
 * answer, and an archived one is refused outright.
 */
export function useNativeSubagents(
  paseo: PaseoApi,
  enabled: boolean,
  parentIds: readonly string[],
): { subagents: ReadonlyMap<string, NativeSubagent>; scan: SubagentScan | null } {
  const [subagents, setSubagents] = useState(EMPTY);
  const [scan, setScan] = useState<SubagentScan | null>(null);
  const listSubagents = useRpc(listNativeSubagents);
  const listRef = useRef(listSubagents);
  listRef.current = listSubagents;
  // Parents already asked in this enabled session. Cleared on disable, so a
  // re-enable starts from a clean snapshot.
  const scannedRef = useRef(new Set<string>());
  // Bumped on disable: an answer still in flight from before must not land in
  // a map that was just emptied.
  const generationRef = useRef(0);
  // Bumped per scan: only the newest scan may report progress or finish it.
  const scanTokenRef = useRef(0);

  useEffect(() => {
    if (enabled) return;
    generationRef.current += 1;
    scannedRef.current.clear();
    // oxlint-disable-next-line set-state-in-effect -- dropping state the toggle just disowned
    setSubagents(EMPTY);
    setScan(null);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || typeof paseo.observeEvents !== "function") return;
    const observation = paseo.observeEvents([SUBAGENT_EVENT]);
    const unsubscribe = observation.subscribe({
      snapshot: () => {},
      update: (message: unknown) => {
        const payload = (message as SubagentUpdateLike).payload;
        if (payload?.kind === "upsert") {
          const parsed = NativeSubagentSchema.safeParse(payload.subagent);
          if (parsed.success) setSubagents((prev) => mergeNewer(prev, [parsed.data]));
          return;
        }
        if (payload?.kind === "remove" && payload.parentAgentId && payload.subagentId) {
          const key = subagentKey(payload.parentAgentId, payload.subagentId);
          setSubagents((prev) => {
            if (!prev.has(key)) return prev;
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        }
        // `timeline` rows are the subagent talking; the graph only draws who
        // exists and how they are doing, which `upsert` already carries.
      },
    });
    return () => {
      unsubscribe();
      void observation.release().catch(() => {});
    };
  }, [paseo, enabled]);

  // A backstop poll rebuilds the id array every time; only a different set of
  // parents is a reason to scan again.
  const parentKey = useMemo(() => [...parentIds].sort().join("|"), [parentIds]);

  useEffect(() => {
    if (!enabled || parentKey === "") return;
    const scanned = scannedRef.current;
    const pending = parentKey.split("|").filter((id) => !scanned.has(id));
    if (pending.length === 0) return;
    for (const id of pending) scanned.add(id);

    const generation = generationRef.current;
    scanTokenRef.current += 1;
    const token = scanTokenRef.current;
    const batches: string[][] = [];
    for (let i = 0; i < pending.length; i += SUBAGENT_BATCH_LIMIT) {
      batches.push(pending.slice(i, i + SUBAGENT_BATCH_LIMIT));
    }
    // An object, not a flag: the loop reads it across awaits, and only the
    // cleanup below ever writes it.
    const run = { cancelled: false };
    let next = 0;
    // oxlint-disable-next-line set-state-in-effect -- progress of the work this effect starts
    setScan({ done: 0, total: pending.length, failed: 0 });

    void (async () => {
      for (; next < batches.length && !run.cancelled; next += 1) {
        const batch = batches[next] as string[];
        let found: NativeSubagent[] = [];
        let failed = 0;
        try {
          const result = await listRef.current({ parentAgentIds: batch });
          found = result.subagents;
          failed = result.failed.length;
        } catch {
          failed = batch.length;
        }
        if (generation !== generationRef.current) return;
        setSubagents((prev) => mergeNewer(prev, found));
        if (token !== scanTokenRef.current) continue;
        setScan((prev) =>
          prev
            ? { ...prev, done: prev.done + batch.length, failed: prev.failed + failed }
            : prev,
        );
      }
      // A cancelled scan whose last batch still landed is finished too, unless
      // a newer scan has taken over the progress line.
      if (token === scanTokenRef.current) setScan(null);
    })();

    return () => {
      run.cancelled = true;
      // Batches never sent go back in the pool, so the scan that replaces this
      // one - a new parent joined, say - picks them up instead of losing them.
      // The batch in flight still lands; `next` has not moved past it yet, so
      // it is skipped here.
      for (const batch of batches.slice(next + 1)) {
        for (const id of batch) scanned.delete(id);
      }
    };
  }, [enabled, parentKey]);

  return { subagents, scan };
}
