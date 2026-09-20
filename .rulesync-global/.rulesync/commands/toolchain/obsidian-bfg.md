---
targets:
  - '*'
description: My Obsidian vault via the toolchain proxy
---
Scope `/toolchain` to my Obsidian notes: `retrieve_tools` with `query: "obsidian note vault <English action from $ARGUMENTS>"`. Not a secret manager — the `vault_*` prefix is Obsidian's own.

Personal notes, sensitivity `private`: quote what I asked for, never dump a whole note into the transcript. Write tools are off by config — say so instead of routing around it. `command_execute` runs arbitrary Obsidian commands; confirm first.

Narrow before reading: `search_simple` or `vault_list` → `vault_get_document_map` → `vault_read` scoped to a heading or block.
