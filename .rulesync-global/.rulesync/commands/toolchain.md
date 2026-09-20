---
targets:
  - '*'
description: "Toolchain proxy: discover a tool, then call it"
---
Serve $ARGUMENTS through the connected toolchain proxy — the MCP server exposing `retrieve_tools`, `call_tool_read`/`write`/`destructive`, `read_cache` and `upstream_servers`. Identify it by that interface, not by its name: the name is per-project config and each proxy is bound to one profile. Several connected → pick by the task, ask if ambiguous. Never call an upstream tool directly, never fall back to web search or local files.

1. `retrieve_tools` — BM25 over English tool names and descriptions. Query in tool vocabulary (`search issue`, `list collections`), not in my wording: a Russian query scores nothing and returns zero. Pass `read_only_only: true` while the task is read-only.
2. Zero hits means the query missed, not that the capability is absent. Retry with other English terms, then with a server name, before reporting absence. Hits from an unrelated `server` are the same miss wearing a result: a service outside the profile returns a neighbour’s tools, not an error. Never answer from a neighbour.
3. Pick by `annotations` and `inputSchema`, not by rank — the top hit for a read request is often a write tool.
4. Call through the hit's own `call_with` (`call_tool_read` / `call_tool_write` / `call_tool_destructive`) with `name: "<server>:<tool>"`, plus `intent_reason` and `intent_data_sensitivity`.
5. Truncated response → `read_cache` with the returned key; do not repeat the call.
6. Confirm with me before any `call_tool_destructive`.

Which servers exist is a runtime fact. Read it from the hits or from `upstream_servers` (`operation: list`), never from memory.
