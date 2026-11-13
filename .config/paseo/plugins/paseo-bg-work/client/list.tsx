import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { type BgAgent, type BgItem, FOREGROUND_STATUSES, snapshotRpc, stopRpc, tailRpc } from "../shared/contracts";

export const SNAPSHOT_KEY = ["paseo-bg-work", "snapshot"] as const;
const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

export function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  return h < 48 ? `${h}h ${Math.floor((sec % 3600) / 60)}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function isBackground(agent: BgAgent): boolean {
  return agent.status === null || !FOREGROUND_STATUSES.includes(agent.status);
}

function useStyles(theme: PluginTheme, compact: boolean) {
  return useMemo(
    () => ({
      root: { gap: compact ? 8 : 10, padding: compact ? 10 : 12 },
      heading: { color: theme.colors.foreground, fontSize: 13, fontWeight: "600" as const },
      muted: { color: theme.colors.foregroundMuted, fontSize: 12 },
      card: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 10,
        gap: 6,
        backgroundColor: theme.colors.surface1,
      },
      command: { color: theme.colors.foreground, fontFamily: MONO, fontSize: 12 },
      row: { flexDirection: "row" as const, gap: 8, alignItems: "center" as const, flexWrap: "wrap" as const },
      button: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
      },
      buttonText: { color: theme.colors.foreground, fontSize: 12 },
      danger: { borderColor: theme.colors.statusDanger },
      dangerText: { color: theme.colors.statusDanger, fontSize: 12 },
      tail: {
        maxHeight: 260,
        borderRadius: 6,
        padding: 8,
        backgroundColor: theme.colors.surface0,
      },
      tailText: { color: theme.colors.foregroundMuted, fontFamily: MONO, fontSize: 11 },
    }),
    [theme, compact],
  );
}

type Styles = ReturnType<typeof useStyles>;

export function useSnapshot() {
  const snapshot = useRpc(snapshotRpc);
  return useQuery({ queryKey: SNAPSHOT_KEY, queryFn: () => snapshot({}), refetchInterval: 3000 });
}

function Tail({ pid, styles }: { pid: number; styles: Styles }) {
  const tail = useRpc(tailRpc);
  const query = useQuery({
    queryKey: ["paseo-bg-work", "tail", pid],
    queryFn: () => tail({ pid, bytes: 16384 }),
    refetchInterval: 2000,
  });
  if (query.isPending) return <Text style={styles.muted}>Loading output…</Text>;
  if (query.isError) return <Text style={styles.dangerText}>{String(query.error)}</Text>;
  const { text, reason, path } = query.data;
  if (reason) return <Text style={styles.muted}>{reason}</Text>;
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.muted} numberOfLines={1}>{path}</Text>
      <ScrollView style={styles.tail}>
        <Text style={styles.tailText} selectable>{text.length > 0 ? text : "(empty)"}</Text>
      </ScrollView>
    </View>
  );
}

function ItemCard({ item, styles }: { item: BgItem; styles: Styles }) {
  const [showTail, setShowTail] = useState(false);
  const [armed, setArmed] = useState(false);
  const stop = useRpc(stopRpc);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => stop({ pid: item.pid }),
    onSettled: () => {
      setArmed(false);
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
  const meta = [
    `pid ${item.pid}`,
    formatElapsed(item.elapsedSec),
    item.cpu > 0 ? `${item.cpu.toFixed(1)}% cpu` : null,
    item.orphan ? "orphan" : null,
  ].filter(Boolean).join(" · ");
  const kids = item.children.filter((c) => !item.command.includes(c.split(" ")[0] ?? "\u0000"));
  return (
    <View style={styles.card}>
      <Text style={styles.command} numberOfLines={showTail ? undefined : 4} selectable>{item.command}</Text>
      {kids.length > 0 ? <Text style={styles.muted} numberOfLines={2}>↳ {kids.join(" ; ")}</Text> : null}
      <Text style={styles.muted}>{meta}</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showTail ? "Hide output" : "Show output"}
          style={styles.button}
          onPress={() => setShowTail((v) => !v)}
        >
          <Text style={styles.buttonText}>{showTail ? "Hide output" : "Output"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={armed ? "Confirm stop" : "Stop process"}
          disabled={mutation.isPending}
          style={[styles.button, armed ? styles.danger : null]}
          onPress={() => (armed ? mutation.mutate() : setArmed(true))}
        >
          <Text style={armed ? styles.dangerText : styles.buttonText}>
            {mutation.isPending ? "Stopping…" : armed ? "Confirm stop" : "Stop"}
          </Text>
        </Pressable>
        {armed && !mutation.isPending ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel stop" style={styles.button} onPress={() => setArmed(false)}>
            <Text style={styles.buttonText}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>
      {mutation.data && !mutation.data.stopped ? <Text style={styles.dangerText}>{mutation.data.reason}</Text> : null}
      {mutation.isError ? <Text style={styles.dangerText}>{String(mutation.error)}</Text> : null}
      {showTail ? <Tail pid={item.pid} styles={styles} /> : null}
    </View>
  );
}

export function BgWorkList({
  theme,
  compact,
  agentId,
  showOrphans,
}: {
  theme: PluginTheme;
  compact: boolean;
  agentId: string;
  showOrphans: boolean;
}) {
  const styles = useStyles(theme, compact);
  const query = useSnapshot();
  if (query.isPending) return <View style={styles.root}><Text style={styles.muted}>Scanning processes…</Text></View>;
  if (query.isError) return <View style={styles.root}><Text style={styles.dangerText}>{String(query.error)}</Text></View>;
  const { agents, error } = query.data;
  const mine = agents.find((a) => a.agentId === agentId);
  const orphans = showOrphans
    ? agents
        .filter((a) => a.agentId !== agentId)
        .flatMap((a) => (a.archived || a.status === null ? a.items : a.items.filter((i) => i.orphan)))
    : [];
  const foreground = mine !== undefined && !isBackground(mine);
  return (
    <ScrollView contentContainerStyle={styles.root}>
      {error ? <Text style={styles.dangerText}>{error}</Text> : null}
      <Text style={styles.heading}>Background work{mine ? ` (${mine.items.length})` : ""}</Text>
      {foreground ? (
        <Text style={styles.muted}>Agent turn is running: these processes may be its foreground commands.</Text>
      ) : null}
      {mine && mine.items.length > 0 ? (
        mine.items.map((item) => <ItemCard key={item.pid} item={item} styles={styles} />)
      ) : (
        <Text style={styles.muted}>No live processes left behind by this agent.</Text>
      )}
      {orphans.length > 0 ? (
        <>
          <Text style={styles.heading}>Orphans ({orphans.length})</Text>
          <Text style={styles.muted}>Processes whose agent is archived, deleted, or whose provider died.</Text>
          {orphans.map((item) => <ItemCard key={item.pid} item={item} styles={styles} />)}
        </>
      ) : null}
    </ScrollView>
  );
}
