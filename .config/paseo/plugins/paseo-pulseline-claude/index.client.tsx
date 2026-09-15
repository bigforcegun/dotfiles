import type { PluginClientContext } from "@getpaseo/plugin/client";
import { PulseDetail } from "./client/pulse-detail.tsx";
import { PulseIcon } from "./client/pulse-icon.tsx";
import { createPulselinePills } from "./client/registry.ts";

export default function contribute(client: PluginClientContext) {
  // Passing the real context proves it still satisfies the registry's host view.
  return createPulselinePills(client, {
    ui: { Icon: PulseIcon, Content: PulseDetail },
    // Paseo calls this contribution synchronously and requires a cleanup function
    // back (packages/app/src/plugins/evaluate.ts:396-403), so a directory failure
    // found after setup cannot fail the load. Report it rather than swallow it.
    onBootstrapError(error) {
      console.error("[paseo-pulseline-claude] agent directory bootstrap failed", error);
    },
  });
}
