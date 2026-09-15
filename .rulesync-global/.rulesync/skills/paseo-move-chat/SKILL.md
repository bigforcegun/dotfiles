---
name: paseo-move-chat
description: >-
  Move a Paseo agent (chat) into another workspace, or recover one that vanished
  from the UI after a failed move. Covers "перенеси чат в воркспейс", "собери чаты
  в один воркспейс", "чат пропал после переноса", "move agent to workspace". Runs
  dry by default; mutations need an explicit go-ahead. Paseo chats only; for
  OpenCode sessions use oc-session-transfer.
targets:
  - '*'
disable-model-invocation: true
codexcli:
  policy:
    allow_implicit_invocation: false
---

# Paseo: move a chat between workspaces

Paseo has no move operation — not in the CLI, not in the daemon protocol. Do not go looking
again. Use the script, it is the whole recipe; it checks the daemon version itself and warns
when it is outside the range the recipe was verified against.

Paths below are relative to this skill's directory — run them from there, or prefix with it.
Call via `python3`; the exec bit does not survive every generator.

```bash
python3 scripts/move_chat.py <agent-id-prefix> <workspace-id|name>          # dry-run, the default
python3 scripts/move_chat.py <agent-id-prefix> <workspace-id|name> --apply  # mutates
```

Also accepts `--force` (see below) and `--host <daemon-host>` for a non-default daemon.
`--host` only redirects the *mutations*; the agent record, the workspace list and the
transcript are still read locally, so the script refuses `--host` unless `PASEO_HOME` also
points at that daemon's state. That pairing is what keeps the eval stand hermetic — you will
not normally need either.

**Never reach for `--apply` on your own initiative.** Run the dry-run, show the user the
mode / agent / source / target it resolved, wait for an explicit go-ahead. Other agents may
be live in the workspaces you are about to touch, and a move archives before it imports.

## Reading the dry-run

- **`mode=REHOME`** — same cwd. Same agent id, just relocated. No tail.
- **`mode=CLONE`** — different cwd, which cannot be changed. The transcript is copied under
  a new sessionId, so you get a *second* chat with the same history and a new id. The
  original stays put as the backup — ask before archiving it, never clean up unprompted.
  Tell the moved agent its working directory changed, or it keeps editing the old checkout.
- **`FAIL: workspace '...': N matches`** — ambiguous name. Re-run with the `wks_…` id.
- **`FAIL: agent is <status>`** — the chat is not idle. Archiving a live agent is untested:
  stop it and rerun. `--force` exists, but reach for it only if the user says so.
- **`provider=codex` + CLONE** — refused, no recipe exists. For `opencode`, move the session
  on the opencode server first (`POST /experimental/control-plane/move-session`), then rerun.

## If it breaks

Backups land in a private `paseo-move-*` directory under the system temp dir; the path is
printed on every `--apply`. A failed import is rolled back automatically — REHOME re-imports
the agent where it was, CLONE puts the evicted transcript back and deletes the half-written
clone. If a rollback also fails the script says exactly what it could not undo, and for
REHOME prints the rerun that un-archives the agent. An agent that is archived and invisible
is recovered by running this same script against the workspace it should live in.

Never edit `~/.paseo/` state files and never restart the daemon — a restart kills every live
session, including yours.

If the failure is not covered above, if the script warns about an untested Paseo version, or
if you are about to change the script itself, read `references/internals.md` first: the
daemon-side gates, why the recipe is shaped this way, and the four files to re-check after an
upgrade. It also documents `references/eval_run.py`, the hermetic test stand to run after
any change to the script.
