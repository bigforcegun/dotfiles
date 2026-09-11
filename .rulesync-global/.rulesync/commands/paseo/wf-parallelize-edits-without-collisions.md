---
targets:
  - '*'
description: "Paseo workflow: parallelize edits without collisions"
---
Split these between Paseo subagents, one agent per item: $ARGUMENTS

Create a separate workspace with worktree isolation from the repository's default branch for each item. Check my profiles for suitable implementation settings, and have each agent run the focused checks for its change. Summarize each diff when done.
