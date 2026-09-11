---
targets:
  - '*'
description: "Paseo workflow: check, redirect, or continue work"
---
Read $ARGUMENTS as: the first word is the mode -- `check`, `redirect`, or `cancel` -- and the rest names the target worker and the instruction. Default to `check` when no arguments are given. Resolve the target worker from this conversation, or from `paseo ls` if it is not in context.

- check: Summarize what the subagents are doing and flag anything blocked.
- redirect: Tell the named worker to carry out the instruction and rerun its focused checks.
- cancel: Cancel the named worker's current turn, but keep the agent so I can redirect it.
