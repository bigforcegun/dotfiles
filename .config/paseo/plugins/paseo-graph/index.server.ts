import type { PluginServerContext } from "@getpaseo/plugin/server";
import { closeSubagentConnection, listSubagents } from "./server/subagents";
import { listNativeSubagents } from "./shared/subagents";

export default function contribute(server: PluginServerContext) {
  server.handle(listNativeSubagents, listSubagents);
  return closeSubagentConnection;
}
