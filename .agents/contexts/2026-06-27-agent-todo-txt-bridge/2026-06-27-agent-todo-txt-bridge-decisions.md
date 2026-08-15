# Agent todo.txt bridge — decisions

## Decision: todo.txt is the durable index, Markdown is the memory layer

Use todo.txt for concise, routable task cards. Use Markdown sidecars for rich context.

Example task line:

```txt
(A) 2026-06-27 Implement OpenCode todo bridge +dotfiles @coding id:oc1-a8f3 agent:oc1 src:opencode status:active sidecar:notes/oc1-a8f3.md
```

Sidecar shape:

```md
# oc1-a8f3 - Implement OpenCode todo bridge

## Context
Why this exists and the current assumptions.

## Acceptance
- Observable behavior
- Verification surface or command

## Progress
- Done
- Remaining

## Handoff
Stopped here:
Next:
Blockers:
```

## Decision: default storage is user-local

Default layout:

```txt
~/.local/share/agent-todos/
  inbox.txt
  global.todo.txt              # optional/materialized view, not canonical
  projects/
    dotfiles/
      todo.txt                 # canonical
      done.txt
      notes/
        oc1-20260627-a8f3.md
      registry.md              # optional project/context vocabulary
```

Repo-local mode can exist as an explicit opt-in only:

```txt
.agent-todos/
  todo.txt
  done.txt
  notes/
```

Reason: agent todos can contain local paths, unresolved investigation notes, and private operational context.

## Decision: stable IDs are mandatory

Use `id:<stable-id>` on every durable task. Use IDs for sidecars, dependencies, parent/child links, and sync conflict detection. Do not depend on line numbers for durable relations.

Recommended metadata keys:

- `id:<stable-id>`
- `agent:<agent-id>`
- `src:opencode`
- `scope:global|project`
- `status:active|blocked|waiting|review`
- `parent:<id>`
- `depends:<id>` when needed
- `sidecar:<relative-md-path>` only when needed

Keep values non-whitespace and non-colon to preserve todo.txt `key:value` compatibility.

## Decision: generated views, not canonical global mega-file

Per-project files are canonical. Global state should be a generated view or wrapper output over all project files.

Useful wrapper commands:

```sh
agent-todo ls --all
agent-todo ls +dotfiles
agent-todo ls @blocked
agent-todo note <id>
agent-todo sync-opencode
```

`todo.txt-cli` can still be used per project via `TODO_DIR`/`TODO_FILE`, and can work with sibling files through `addto`, `listfile`, and `move`.

## Decision: OpenCode bridge boundaries

Keep OpenCode `todowrite` as live session scratchpad. The todo.txt layer is durable persistence.

Bridge points:

1. Session start: load relevant project tasks into context.
2. Custom tools: list/add/done/note durable tasks.
3. Compaction: inject current durable task snapshot.
4. Handoff/session end: export pending/completed deltas.
5. Optional: observe `todowrite` use, but prefer explicit import/export before bidirectional sync.

## MVP phases

1. Document grammar and layout.
2. Build minimal `agent-todo` wrapper: `add`, `list`, `done`, `note`, `global`.
3. Add read-only OpenCode context injection.
4. Add explicit export from OpenCode todos to todo.txt.
5. Add bidirectional sync with conflict detection.
