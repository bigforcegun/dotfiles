---
targets:
  - '*'
description: MongoDB via the toolchain proxy
---
Scope `/toolchain` to MongoDB: `retrieve_tools` with `query: "mongodb <English action from $ARGUMENTS>"`.

Several Mongo servers may answer — pick by database or context, ask only if ambiguous. Walk down before querying: databases → collections → schema and indexes → `find` with an explicit `limit`. Writes and drops need my confirmation.
