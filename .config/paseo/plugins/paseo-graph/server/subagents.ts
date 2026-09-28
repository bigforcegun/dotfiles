/// <reference types="node" />
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
// `internal` for a reason: the public SDK has no subagent list yet. This is the
// one import to drop once `PaseoApi` grows one.
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { type NativeSubagent, NativeSubagentSchema, listNativeSubagents } from "../shared/subagents";

/**
 * The plugin's own `paseo` handle rides a private IPC session that cannot be
 * shared, so the snapshot opens a second, ordinary client against the daemon's
 * local listener. One connection, opened on first use and kept for the life of
 * the plugin process.
 */

const FALLBACK_LISTEN = "127.0.0.1:6767";

/** Parents asked at once. The daemon answers each from memory; this only keeps
 * one batch from queueing dozens of requests on the socket in one burst. */
const CONCURRENCY = 4;

const REQUEST_TIMEOUT_MS = 15000;

/** `PASEO_GRAPH_DAEMON_URL` wins; otherwise the listener the daemon itself was
 * configured with, which is what `paseo daemon status` reports as `listen`. */
async function daemonUrl(): Promise<string> {
  const override = process.env.PASEO_GRAPH_DAEMON_URL;
  if (override) return override;
  const home = process.env.PASEO_HOME ?? path.join(homedir(), ".paseo");
  let listen = FALLBACK_LISTEN;
  try {
    const config = JSON.parse(await readFile(path.join(home, "config.json"), "utf8")) as {
      daemon?: { listen?: unknown };
    };
    if (typeof config.daemon?.listen === "string") listen = config.daemon.listen;
  } catch {
    // No readable config: the stock listener is the only sensible guess.
  }
  if (!/^[\w.-]+:\d+$/.test(listen)) {
    throw new Error(`daemon listens on "${listen}"; set PASEO_GRAPH_DAEMON_URL to a ws:// URL`);
  }
  return `ws://${listen}/ws`;
}

let connecting: Promise<DaemonClient> | null = null;

function connection(): Promise<DaemonClient> {
  connecting ??= (async () => {
    const client = new DaemonClient({
      url: await daemonUrl(),
      clientId: "paseo-graph-subagents",
      clientType: "cli",
      reconnect: { enabled: true },
    });
    await client.connect();
    return client;
  })().catch((error: unknown) => {
    // A failed dial must not be cached, or the next toggle could never retry.
    connecting = null;
    throw error;
  });
  return connecting;
}

export async function closeSubagentConnection(): Promise<void> {
  const pending = connecting;
  connecting = null;
  if (!pending) return;
  const client = await pending.catch(() => null);
  await client?.close();
}

export async function listSubagents({
  parentAgentIds,
}: RpcInput<typeof listNativeSubagents>): Promise<RpcOutput<typeof listNativeSubagents>> {
  const client = await connection();
  const subagents: NativeSubagent[] = [];
  const failed: Array<{ parentAgentId: string; error: string }> = [];
  const queue = [...parentAgentIds];

  const worker = async () => {
    for (let parentAgentId = queue.shift(); parentAgentId !== undefined; parentAgentId = queue.shift()) {
      try {
        const result = await client.listProviderSubagents(parentAgentId, { timeout: REQUEST_TIMEOUT_MS });
        if (result.error) {
          failed.push({ parentAgentId, error: result.error });
          continue;
        }
        for (const raw of result.subagents) {
          // The daemon's descriptor is a superset; parsing keeps the RPC output
          // to what the schema promises instead of whatever the daemon adds next.
          const parsed = NativeSubagentSchema.safeParse(raw);
          if (parsed.success) subagents.push(parsed.data);
        }
      } catch (error) {
        failed.push({ parentAgentId, error: error instanceof Error ? error.message : String(error) });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, parentAgentIds.length) }, worker));
  return { subagents, failed };
}
