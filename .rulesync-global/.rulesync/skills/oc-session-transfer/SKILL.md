---
name: oc-session-transfer
description: >-
  Use ONLY when the user asks to list, find, export, import, move, rehome, or
  transfer an OpenCode session (найди сессию, импортируй, экспортируй, перенеси
  сессию); always route through oc-session.
targets:
  - '*'
disable-model-invocation: true
codexcli:
  policy:
    allow_implicit_invocation: false
---
# OpenCode session transfer

Use `oc-session` only. Do not call `opencode export`, `opencode import`, or the OpenCode database directly.

- List projects: `oc-session projects`
- Find a session: `oc-session find <project> <id-or-title>`
- Export/import an archive: `oc-session export` / `oc-session import`
- Transfer between projects: `oc-session rehome <source> <id-or-title> <target>`

`rehome` relocates the existing session with its current ID; it is not a clone. If a project or session is ambiguous, show the candidates and ask the user to choose.
