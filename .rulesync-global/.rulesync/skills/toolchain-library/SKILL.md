---
name: toolchain-library
description: >-
  Use for personal-library requests: моя библиотека, книголиба, booklib, endless
  library, endless-library, «найди книгу» or «найди литературу». Search
  connected endless-library, not web or local repositories.
targets:
  - '*'
---
# Toolchain Library

Use the connected Toolchain MCP as follows; do not use web search or local
repositories:

1. Discover the required tool with `retrieve_tools` using
   `{ "query": "endless-library <tool-name>", "limit": 10 }`. Do **not**
   pass `read_only_only` or `exclude_destructive`.
2. Route the returned tool through the standard read-call mechanism:
   - `search_semantic` with `{ "query": "...", "limit": 10 }`;
   - `search_lexical` with `{ "query": "...", "limit": 10 }`.
3. Route `get_chunk`, `get_section`, or `expand_hit_context` the same way for
   a result's context.

- Exact title, quote, or identifier → `search_lexical`.
- Topic, question, or recommendation → `search_semantic`.
- Need context → `get_chunk`, `get_section`, or `expand_hit_context`.
- If unavailable, say so; do not choose another source unless asked.
