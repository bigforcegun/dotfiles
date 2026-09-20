---
targets:
  - '*'
description: Redash queries via the toolchain proxy
---
Scope `/toolchain` to Redash: `retrieve_tools` with `query: "redash query <English action from $ARGUMENTS>"`.

Prefer an existing saved query and its latest result over authoring a new one. Report which query id produced the numbers.
