import type {
  PluginAgentPanelProps,
  PluginButtonContentProps,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import { View } from "react-native";
import { BgWorkList, isBackground } from "./client/list";
import { snapshotRpc } from "./shared/contracts";

const PANEL_ID = "bg-work";
const PILL_ID = "bg-work";
const POLL_MS = 3000;

function Panel({ theme, layout, params }: PluginAgentPanelProps) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <BgWorkList theme={theme} compact={layout.compact} agentId={params.agentId} showOrphans />
    </View>
  );
}

function PillContent(props: PluginButtonContentProps) {
  if (props.context !== "agent") return null;
  return (
    <View style={{ minWidth: 320, maxWidth: 560 }}>
      <BgWorkList theme={props.theme} compact={props.layout.compact} agentId={props.agentId} showOrphans={false} />
    </View>
  );
}

export default function contribute(client: PluginClientContext) {
  const removePanel = client.addAgentPanel({
    id: PANEL_ID,
    title: "Background work",
    icon: "Activity",
    locations: ["explorer", "workspace"],
    Component: Panel,
  });
  const removeCommand = client.addCommandCenterItem({
    id: "open-bg-work",
    title: "Open background work",
    icon: "Activity",
    context: "agent",
    onSelect({ openPanel }) {
      openPanel(PANEL_ID);
    },
  });

  // One pill per agent with live background work; label tracks the count.
  const pills = new Map<string, { workspaceId: string; label: string; registration: PluginButtonRegistration }>();
  let stopped = false;
  let inFlight = false;

  const poll = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const { agents } = await client.rpc(snapshotRpc, {});
      if (stopped) return;
      const wanted = new Map<string, { workspaceId: string; label: string }>();
      for (const agent of agents) {
        if (!agent.workspaceId || agent.archived || agent.items.length === 0 || !isBackground(agent)) continue;
        wanted.set(agent.agentId, { workspaceId: agent.workspaceId, label: `${agent.items.length} bg` });
      }
      for (const [agentId, pill] of pills) {
        const next = wanted.get(agentId);
        if (!next || next.workspaceId !== pill.workspaceId) {
          pill.registration.remove();
          pills.delete(agentId);
        }
      }
      for (const [agentId, next] of wanted) {
        const current = pills.get(agentId);
        if (current) {
          if (current.label !== next.label) {
            current.registration.update({ label: next.label });
            current.label = next.label;
          }
          continue;
        }
        const registration = client.addComposerPill({
          id: PILL_ID,
          workspaceId: next.workspaceId,
          agentId,
          button: {
            title: "Background work",
            icon: "Activity",
            label: next.label,
            behavior: { kind: "popover", Content: PillContent },
          },
        });
        pills.set(agentId, { ...next, registration });
      }
    } catch (error) {
      console.error("[paseo-bg-work] poll failed", error);
    } finally {
      inFlight = false;
    }
  };

  void poll();
  const timer = setInterval(() => void poll(), POLL_MS);

  return () => {
    stopped = true;
    clearInterval(timer);
    for (const pill of pills.values()) pill.registration.remove();
    pills.clear();
    removeCommand();
    removePanel();
  };
}
