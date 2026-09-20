---
targets:
  - '*'
description: Jira and Confluence via the toolchain proxy
---
Scope `/toolchain` to Atlassian: `retrieve_tools` with `query: "jira confluence <English action from $ARGUMENTS>"`.

Resolve `cloudId` first — every Jira and Confluence tool requires it. Read issues and pages before editing them, and quote the issue key in `intent_reason`.
