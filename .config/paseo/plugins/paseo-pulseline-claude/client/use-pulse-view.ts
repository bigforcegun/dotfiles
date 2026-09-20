import { usePaseo } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { leasePulseStore } from "./lease.ts";
import { getPulseStore, subscribeToPulseStores } from "./store-registry.ts";
import type { PulselineAgentHandle, PulseView } from "./store.ts";

/**
 * The mount/unmount body of the hook, exported so the lifetime it gives a mounted
 * component is testable without a React renderer.
 */
export function openPulseLease(
  agentId: string | null,
  getHandle: () => PulselineAgentHandle,
): (() => void) | undefined {
  if (!agentId) return undefined;
  const lease = leasePulseStore(agentId, getHandle);
  return () => lease.release();
}

/**
 * Reads the agent's pulse while this component is mounted. The lease is what
 * starts the timeline subscription and the history fetch, so an agent nobody is
 * looking at never reaches the daemon — and a mounted pill owns exactly one
 * runtime whether or not its popover is open.
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
    if (!agentId) return undefined;
    // `id` is the narrowed value, so the lease needs no type assertion.
    const id = agentId;
    return openPulseLease(id, () => paseoRef.current.agents.ref(id));
  }, [agentId]);

  const subscribe = useCallback((onChange: () => void) => subscribeToPulseStores(onChange), []);
  const snapshot = useCallback(
    () => (agentId ? (getPulseStore(agentId)?.getView() ?? null) : null),
    [agentId],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
