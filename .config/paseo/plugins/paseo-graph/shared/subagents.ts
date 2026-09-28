import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * Native subagents: children a provider spawns inside one agent session - a
 * Claude `Task`, an OpenCode `@librarian`. The daemon tracks them per parent,
 * but the plugin SDK only streams their changes; the list itself sits behind a
 * daemon request the SDK does not expose. So the snapshot is taken on the
 * server side of the plugin, over its own daemon connection.
 */

/** Only the fields the graph reads. The daemon's descriptor carries more. */
export const NativeSubagentSchema = z.object({
  id: z.string(),
  parentAgentId: z.string(),
  parentSubagentId: z.string().nullable().optional(),
  provider: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  status: z.string(),
  updatedAt: z.string(),
  subtitle: z.string().nullable().optional(),
});

export type NativeSubagent = z.infer<typeof NativeSubagentSchema>;

/**
 * One call covers a small batch of parents, not the whole catalogue: the
 * client walks the batches itself, so the graph fills in as answers land and a
 * closed surface simply stops asking.
 */
export const SUBAGENT_BATCH_LIMIT = 25;

export const listNativeSubagents = defineRpc({
  name: "subagents.list",
  input: z.object({
    parentAgentIds: z.array(z.string()).min(1).max(SUBAGENT_BATCH_LIMIT),
  }),
  output: z.object({
    subagents: z.array(NativeSubagentSchema),
    failed: z.array(z.object({ parentAgentId: z.string(), error: z.string() })),
  }),
});
