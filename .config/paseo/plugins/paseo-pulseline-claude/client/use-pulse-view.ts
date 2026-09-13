import { usePaseo } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { leasePulseStore } from "./lease.ts";
import { getPulseStore, subscribeToPulseStores } from "./store-registry.ts";
import type { PulselineAgentHandle, PulseView } from "./store.ts";

/**
 * Reads the agent's pulse while this component is mounted. The lease is what
 * starts the timeline subscription and the history fetch, so an agent nobody is
 * looking at never reaches the daemon.
 *
 * The api object is read through a ref on purpose: the button host builds a new
 * facade every render, and keying the effect on it would restart the store — and
 * its history fetch — on every frame.
 */
export function usePulseView(agentId: string | null): PulseView | null {
  const paseo = usePaseo();
  const paseoRef = useRef(paseo);
  paseoRef.current = paseo;

  useEffect(() => {
    if (!agentId) return;
    const lease = leasePulseStore(
      agentId,
      () => paseoRef.current.agents.ref(agentId) as PulselineAgentHandle,
    );
    return () => lease.release();
  }, [agentId]);

  const subscribe = useCallback((onChange: () => void) => subscribeToPulseStores(onChange), []);
  const snapshot = useCallback(
    () => (agentId ? (getPulseStore(agentId)?.getView() ?? null) : null),
    [agentId],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
