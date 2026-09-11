---
targets:
  - '*'
description: "Paseo workflow: keep an agent working with a heartbeat"
---
Read $ARGUMENTS as: the task, optionally preceded by `every <interval>` and `expire after <duration>`. Default to every 10 minutes, expiring after two hours.

Use Paseo to create a heartbeat at that cadence. Continue the task in small steps, run the focused checks after each step, and delete the heartbeat when the work is complete. Set it to expire as given.
