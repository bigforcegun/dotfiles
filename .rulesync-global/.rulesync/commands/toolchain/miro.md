---
targets:
  - '*'
description: Miro boards via the toolchain proxy
---
Scope `/toolchain` to Miro: `retrieve_tools` with `query: "miro board <English action from $ARGUMENTS>"`.

Resolve the board id, then read the existing items before adding any. Board edits are visible to the team — confirm before creating or moving items.
