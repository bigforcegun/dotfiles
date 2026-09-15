---
name: project-init
description: >-
  Bootstrap a repository for agent work: git, a rulesync preset with its MCP
  profile, the gitignore entries for generated agent configs, and the `.agents/`
  context corpus. Use when the user is setting up a new project or asks to add
  agent tooling to an existing one — "заинить проект", "поставь сюда rulesync",
  "настрой репозиторий под агентов", "project init", "добавь пресет" — or when
  work needs `.agents/` or `.rulesync/` in a repository that has neither.
targets:
  - '*'
disable-model-invocation: true
codexcli:
  policy:
    allow_implicit_invocation: false
---

# Project init

Four independent steps. Each one is idempotent: check first, skip what is already
there, and report what was skipped rather than silently redoing it. The user may want
only one of them — do not run the rest uninvited.

Run everything from the repository root.

## 1. Git

If there is no `.git`, ask before running `git init` — the directory may be a
subdirectory of an existing repository, and a nested repo is a mess to undo.

## 2. Rulesync preset

```
dot-agents-ctl init-rulesync              # lists the available profiles
dot-agents-ctl init-rulesync <profile>
```

Profiles come straight from the dotfiles repository and differ mainly by which
mcpproxy endpoint they wire up. Ask the user which one fits rather than inferring it
from the code — the answer is about who the work is for, not what language it is in.

The command copies `rulesync.jsonc` and the profile's `.rulesync/` into the repository
root, never overwriting an existing file. Anything already present is reported as
kept. The repository owns its `.rulesync/` afterwards and can grow project-specific
rules, commands, and MCP servers in it.

## 3. Gitignore for generated configs

Rulesync writes native agent configs into the repository. Those are build output, not
source. Append this block to `.gitignore` if it is not already there:

```gitignore
# rulesync generated

.agents/skills/
.claude/
.claude/**
.cursor/
.cursor/**
.codexcli/
.codexcli/**
.codex/
.codex/**
opencode.jsonc
AGENTS.md
CLAUDE.md
.mcp.json
.mcp.jsonc
```

`.agents/skills/` is generated and belongs here. `.agents/contexts/` is **source** and
must stay tracked — never widen this to `.agents/`.

## 4. Agent context corpus

```
dot-agents-ctl init --templates <the dot-agents-context skill>/templates
```

Creates `.agents/contexts/`, a hub note named after the repository, and the rulebook.
Adds only what is missing. Details of the corpus itself live in the
`dot-agents-context` skill; this step just brings it into existence.

## 5. Generate — only when asked

`rulesync generate` turns `.rulesync/` into the native configs for every target. The
preset carries `delete: true`, so it removes target files it does not recognise. Tell
the user it is the next step; run it only if they say so.

## Finishing

Report what was created, what was kept, and what was skipped. If step 4 ran,
`dot-agents-ctl check` should exit 0 — say so plainly if it does not.
