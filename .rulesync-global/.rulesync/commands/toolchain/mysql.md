---
targets:
  - '*'
description: MySQL via the toolchain proxy
---
Scope `/toolchain` to MySQL: `retrieve_tools` with `query: "mysql sql <English action from $ARGUMENTS>"`.

No MySQL server is guaranteed to be in the active profile — if no hit names one, say so instead of routing the query elsewhere. When present: schema before query, `LIMIT` on every select, writes only on my confirmation.
