---
targets:
  - '*'
description: "Paseo workflow: send a prompt to another agent"
---
Read $ARGUMENTS as: the first token is the target agent id, everything after it is the prompt to deliver. If no id is given, resolve the target from this conversation, or run `paseo ls` and ask me which agent to use.

Use Paseo to send that prompt to that agent id. From the CLI this is `paseo send <id> "<prompt>"`.
