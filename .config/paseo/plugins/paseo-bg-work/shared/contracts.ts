import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const bgItemSchema = z.object({
  pid: z.number().int(),
  pgid: z.number().int(),
  agentId: z.string(),
  /** Human-readable command: the payload a harness wrapper evals, else the raw command line. */
  command: z.string(),
  /** Commands of direct child processes, e.g. the real `gh run watch` under a wrapper shell. */
  children: z.array(z.string()),
  elapsedSec: z.number(),
  cpu: z.number(),
  /** Regular file the process writes stdout to, when there is one (Claude task output). */
  outputPath: z.string().nullable(),
  /** The process was reparented to launchd/init: its provider process is gone. */
  orphan: z.boolean(),
});
export type BgItem = z.infer<typeof bgItemSchema>;

export const bgAgentSchema = z.object({
  agentId: z.string(),
  workspaceId: z.string().nullable(),
  status: z.string().nullable(),
  title: z.string().nullable(),
  archived: z.boolean(),
  items: z.array(bgItemSchema),
});
export type BgAgent = z.infer<typeof bgAgentSchema>;

export const snapshotRpc = defineRpc({
  name: "bgwork.snapshot",
  input: z.object({}),
  output: z.object({
    at: z.string(),
    agents: z.array(bgAgentSchema),
    error: z.string().nullable(),
  }),
});

export const tailRpc = defineRpc({
  name: "bgwork.tail",
  input: z.object({ pid: z.number().int(), bytes: z.number().int().min(256).max(65536).optional() }),
  output: z.object({
    path: z.string().nullable(),
    text: z.string(),
    reason: z.string().nullable(),
  }),
});

export const stopRpc = defineRpc({
  name: "bgwork.stop",
  input: z.object({ pid: z.number().int() }),
  output: z.object({ stopped: z.boolean(), forced: z.boolean(), reason: z.string().nullable() }),
});

/** Agent statuses during which a live child is foreground work, not left-behind background work. */
export const FOREGROUND_STATUSES: readonly string[] = ["running", "initializing"];
