// A lease keyed on the agent, not on the caller's objects.
//
// The composer-button host rebuilds its PaseoApi facade on every render
// (packages/app/src/plugins/buttons/view.tsx:399 constructs it inline, unlike the
// memoized panel host at workspace-panels/panel.tsx:56-59). Anything keyed on that
// object identity restarts the store once per render, which is how a single open
// popover turned into 462 timeline fetches in six seconds.
import { acquirePulseStore, type PulseLease } from "./store-registry.ts";
import { createPulseStore, type PulselineAgentHandle } from "./store.ts";

export function leasePulseStore(
  agentId: string,
  getHandle: () => PulselineAgentHandle,
): PulseLease {
  // The factory runs only when no store exists yet for this agent.
  return acquirePulseStore(agentId, () => createPulseStore({ agentId, handle: getHandle() }));
}
