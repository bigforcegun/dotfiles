---
targets:
  - '*'
description: Clean browser automation via the toolchain proxy
---
Scope `/toolchain` to browser automation: `retrieve_tools` with `query: "browser page <English action from $ARGUMENTS>"`.

Two browser servers return identical tool names at identical scores — only the `server` field separates them. Take the clean one; `*-personal` belongs to `/toolchain:browser-personal`. Picking by rank is a coin flip into my live session.

`destructiveHint: true` on navigate/click/type is transport noise on a throwaway session — drive it without asking, confirm only before outward effect: submit, post, pay, authorise. Use `browser_find` over `browser_snapshot` when you only need a ref.
