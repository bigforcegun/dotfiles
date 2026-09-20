// Both button surfaces receive the same discriminated target context
// (packages/plugin/src/client/buttons.ts:5-9). A composer pill is always an agent
// target; a header button is not, and must not lease anything.
export interface PulseTarget {
  readonly context: string;
  readonly agentId?: string | undefined;
  readonly workspaceId?: string | undefined;
}

export function resolvePulseAgentId(target: PulseTarget): string | null {
  return target.context === "agent" && typeof target.agentId === "string" ? target.agentId : null;
}
