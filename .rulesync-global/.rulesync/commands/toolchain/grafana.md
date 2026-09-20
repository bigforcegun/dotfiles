---
targets:
  - '*'
description: Grafana metrics and logs via the toolchain proxy
---
Scope `/toolchain` to Grafana: `retrieve_tools` with `query: "grafana <English action from $ARGUMENTS>"`.

Resolve the datasource uid before querying it. Ask for the time range if I left it unstated rather than assuming one, and report the range you used with the result.
