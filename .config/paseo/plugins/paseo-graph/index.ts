import type { PluginContext } from "@getpaseo/plugin";
import { GraphSurface } from "./main.client";

export default function contribute(plugin: PluginContext) {
  plugin.addSurface("graph", GraphSurface);
  plugin.addSidebarItem({
    id: "graph",
    title: "Graph",
    icon: "Waypoints",
    surface: "graph",
  });
  plugin.addCommandCenterItem({
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
