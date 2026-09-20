import { useEffect, useRef, useState } from "react";
import { type PaseoApi } from "./data";

/**
 * The daemon's change stream. The host already runs it for its own UI, so
 * subscribing here adds a listener rather than a connection.
 */

/**
 * The daemon streams these already, for the host's own UI. The SDK's
 * `subscribe` is a listener on that existing stream, not a new connection, so
 * one listener covers every node in the graph: no per-agent subscription, no
 * extra traffic, and no polling interval to shorten.
 */
interface AgentUpdateLike {
  kind: "upsert" | "remove";
  agent?: { id?: string; status?: string };
  agentId?: string;
}

export interface WorkspaceUpdateLike {
  kind: "upsert" | "remove";
  workspace?: { id?: string };
  id?: string;
}

export type StructuralNotice = (id: string | undefined, kind: "upsert" | "remove") => void;

const EMPTY_STATUS: ReadonlyMap<string, string> = new Map();

/**
 * Live agent status, keyed by agent id. A running turn can emit many updates
 * carrying the same status, so repeats are dropped here rather than one render
 * further on - returning the previous map makes React skip the render outright.
 */
export function useLiveAgentStatus(paseo: PaseoApi, notice: StructuralNotice): ReadonlyMap<string, string> {
  const [statuses, setStatuses] = useState<ReadonlyMap<string, string>>(EMPTY_STATUS);
  const noticeRef = useRef(notice);
  noticeRef.current = notice;

  useEffect(() => {
    // A host older than the SDK this compiles against has no stream to join.
    // The catalogue poll still carries status, just later.
    if (typeof paseo.agents?.subscribe !== "function") return;
    return paseo.agents.subscribe((raw: unknown) => {
      const update = raw as AgentUpdateLike;
      if (update.kind === "remove") {
        const removed = update.agentId;
        if (!removed) return;
        setStatuses((prev) => {
          if (!prev.has(removed)) return prev;
          const next = new Map(prev);
          next.delete(removed);
          return next;
        });
        noticeRef.current(removed, "remove");
        return;
      }
      const id = update.agent?.id;
      const status = update.agent?.status;
      if (!id || typeof status !== "string") return;
      setStatuses((prev) => (prev.get(id) === status ? prev : new Map(prev).set(id, status)));
      noticeRef.current(id, "upsert");
    });
  }, [paseo]);

  return statuses;
}
