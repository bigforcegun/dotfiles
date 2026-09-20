---
targets:
  - '*'
description: My personal book library via the toolchain proxy
---
Scope `/toolchain` to my library: `retrieve_tools` with `query: "endless-library <English action from $ARGUMENTS>"`. Without the server name the hits go to Context7 and codebase search instead.

Exact title, quote or id → `search_lexical`; topic, question or recommendation → `search_semantic`. Both require `limit`. Carry the hit's `shelf` into `get_chunk`, `get_section` or `expand_hit_context` — all three require it too. Nothing found → check `status` for the index, then say so; never fall back to web or local files.
