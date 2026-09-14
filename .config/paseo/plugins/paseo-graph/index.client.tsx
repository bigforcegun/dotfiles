import type { PluginClientContext } from "@getpaseo/plugin/client";
import { GraphSurface } from "./client/graph";

export default function contribute(client: PluginClientContext) {
  client.addSurface("graph", GraphSurface);
  client.addSidebarItem({
    id: "graph",
    title: "Graph",
    icon: "Waypoints",
    surface: "graph",
  });
  client.addCommandCenterItem({
    id: "open-graph",
    title: "Open Paseo graph",
    icon: "Waypoints",
    keywords: ["graph", "map", "workspaces", "agents"],
    context: "global",
    onSelect({ openSurface }) {
      openSurface("graph");
    },
  });
  return () => {};
}
