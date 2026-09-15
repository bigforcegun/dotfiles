---
name: dot-agents-context
description: >-
  Read, create, or update a workstream context in this repository's `.agents/`
  corpus through the `dot-agents-ctl` CLI, or set that corpus up in a repository
  that has none. Use when the user asks to load, resume, open, start, archive, or
  update a context — "загрузи контекст", "новый контекст", "на чём остановились",
  "заархивируй", "что у нас есть по X" — or when work should be recorded into
  `.agents/` for a later session. Do not use for ordinary file editing that
  happens to touch `.agents/`.
targets:
  - '*'
disable-model-invocation: true
codexcli:
  policy:
    allow_implicit_invocation: false
---

# Agent contexts

One workstream is one folder under `.agents/contexts/`. Its entry note holds the
state; `[[links]]` hold the structure. There is no generated index — the corpus is
whatever links back to the hub note.

`dot-agents-ctl` operates on `./.agents` in the current directory; run it from the
repository root. Templates live in `templates/` next to this file — pass their paths
where the commands below ask for them.

## The corpus is missing

`.agents/` does not exist, or a command says so.

```
dot-agents-ctl init --templates <this skill>/templates
```

Adds only what is missing — the folder, a hub note named after the repository, the
rulebook — and leaves anything already present alone. Safe to re-run.

## The corpus is old

`.agents/` exists but `check` reports frontmatter, naming, or link problems. Read
`MIGRATION.md` next to this file and follow it. Rare: once per repository.

## Everyday work

| Intent | Command |
|---|---|
| Load a known context | `dot-agents-ctl load <slug>` |
| Find the right one | `dot-agents-ctl list [--status active]` |
| Resume the latest | `dot-agents-ctl list --status active` — top row |
| Start a new one | `dot-agents-ctl new <slug> --title T --purpose P --next N --template <this skill>/templates/context.md` |
| Record progress | `dot-agents-ctl set <slug> --next "..."` |
| Change state | `dot-agents-ctl set <slug> --status paused\|blocked\|done\|archived` |
| Verify | `dot-agents-ctl check` |

Slugs are bare — no date prefix, even though folders carry one.

Notes inside a context are written with normal file tools, and each one must be linked
from the entry note. An unlinked note is not a loose end, it is lost.

## Two things `check` cannot tell you

**Run `list` before `new`.** The validator catches a duplicate slug; it cannot catch a
third context about the same subject under a different name. A near-duplicate is worse
than a missing context. Ask the user for purpose and next step if the conversation has
not already made them obvious.

**`load` gives you the entry note, and that is usually the whole answer.** Follow its
links only when the task actually needs them. Never read the corpus to answer one
question.

## Everything else

`dot-agents-ctl check` is the authority on the schema. Run it after touching anything
under `.agents/`; it exits non-zero and names both the file and the fix. The
conventions it enforces are written in the rulebook inside the corpus — read that
rather than restating them from memory.
