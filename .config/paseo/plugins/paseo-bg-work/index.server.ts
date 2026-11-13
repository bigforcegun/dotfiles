import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import { collectItems, stopItem, tailFile } from "./server/procs";
import { type BgAgent, type BgItem, snapshotRpc, stopRpc, tailRpc } from "./shared/contracts";

interface AgentMeta {
  workspaceId: string | null;
  status: string | null;
  title: string | null;
  archived: boolean;
}

async function agentMeta(agentId: string, { paseo }: PluginHandlerContext): Promise<AgentMeta> {
  try {
    const handle = paseo.agents.ref(agentId);
    await handle.refresh();
    const snapshot = handle.current();
    return {
      workspaceId: handle.workspaceId,
      status: handle.status,
      title: snapshot?.title ?? null,
      archived: handle.archivedAt !== null,
    };
  } catch {
    return { workspaceId: null, status: null, title: null, archived: false };
  }
}

async function findItem(pid: number): Promise<{ item: BgItem; procs: Awaited<ReturnType<typeof collectItems>>["procs"] } | null> {
  const { items, procs } = await collectItems();
  const item = items.find((candidate) => candidate.pid === pid);
  return item ? { item, procs } : null;
}

export default function contribute(server: PluginServerContext) {
  server.handle(snapshotRpc, async (_input, context) => {
    try {
      const { items } = await collectItems();
      const byAgent = new Map<string, BgItem[]>();
      for (const item of items) {
        const list = byAgent.get(item.agentId) ?? [];
        list.push(item);
        byAgent.set(item.agentId, list);
      }
      const agents: BgAgent[] = await Promise.all(
        [...byAgent].map(async ([agentId, agentItems]) => ({
          agentId,
          ...(await agentMeta(agentId, context)),
          items: agentItems,
        })),
      );
      return { at: new Date().toISOString(), agents, error: null };
    } catch (error) {
      console.error("[paseo-bg-work] snapshot failed", error);
      return { at: new Date().toISOString(), agents: [], error: String(error) };
    }
  });

  // Both mutating and reading RPCs only accept pids that are currently agent background work,
  // so a stale or forged pid can never reach an unrelated process.
  server.handle(tailRpc, async ({ pid, bytes }) => {
    const found = await findItem(pid);
    if (!found) return { path: null, text: "", reason: "process is gone or is not agent background work" };
    const path = found.item.outputPath;
    if (!path) return { path: null, text: "", reason: "stdout is not a file (pty or pipe); no tail available" };
    return { path, text: await tailFile(path, bytes ?? 16384), reason: null };
  });

  server.handle(stopRpc, async ({ pid }) => {
    const found = await findItem(pid);
    if (!found) return { stopped: false, forced: false, reason: "process is gone or is not agent background work" };
    const { forced } = await stopItem(found.item, found.procs);
    return { stopped: true, forced, reason: null };
  });

  return () => {};
}
