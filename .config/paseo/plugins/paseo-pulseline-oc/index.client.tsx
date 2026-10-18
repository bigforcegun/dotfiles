import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createPulselineRegistry } from "./client/registry";

export default function contribute(client: PluginClientContext) {
  return createPulselineRegistry(client);
}
