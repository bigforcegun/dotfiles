// Shared per-agent store with lease counting. A store exists only while a pill's
// icon or popover is mounted, so an idle directory costs the daemon nothing.
import type { PulseStore } from "./store.ts";

interface StoreEntry {
  readonly store: PulseStore;
  readonly unsubscribe: () => void;
  leases: number;
}

export interface PulseLease {
  readonly store: PulseStore;
  release(): void;
}

const entries = new Map<string, StoreEntry>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/**
 * Called from a mounted component. The first lease builds the store; the last
 * release stops it, closing its subscriptions and its ticker.
 */
export function acquirePulseStore(agentId: string, create: () => PulseStore): PulseLease {
  const existing = entries.get(agentId);
  const entry =
    existing ??
    (() => {
      const store = create();
      // The registry relays the store's notifications so a component subscribes once.
      const created: StoreEntry = { store, unsubscribe: store.subscribe(notify), leases: 0 };
      entries.set(agentId, created);
      return created;
    })();
  entry.leases += 1;
  if (!existing) notify();

  let released = false;
  return {
    store: entry.store,
    release() {
      if (released) return;
      released = true;
      entry.leases -= 1;
      if (entry.leases > 0) return;
      entry.unsubscribe();
      entries.delete(agentId);
      entry.store.stop();
      notify();
    },
  };
}

export function getPulseStore(agentId: string): PulseStore | null {
  return entries.get(agentId)?.store ?? null;
}

export function pulseStoreCount(): number {
  return entries.size;
}

export function subscribeToPulseStores(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
