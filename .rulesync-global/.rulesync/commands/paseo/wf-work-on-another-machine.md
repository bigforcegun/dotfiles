---
targets:
  - '*'
description: "Paseo workflow: work on another machine"
---
Read $ARGUMENTS as: the first token is the remote host, everything after it is the task.

Use the Paseo CLI with that remote host and the workspace I supplied. Launch an agent there for that task, inspect its output, and summarize the findings here. Use the CLI's global `--host` option for that destination.
