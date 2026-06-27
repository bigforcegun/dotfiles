# Agent todo.txt bridge — research

## Core todo.txt facts

- Official todo.txt keeps the core contract minimal: one line is one task; priority appears first; creation date can follow priority or start the line; `+project` and `@context` can appear after the prefix; completed tasks start with `x`; extensions use `key:value`.
- `todo.txt-cli` is centered on one configured `TODO_FILE`, plus `DONE_FILE` and `REPORT_FILE`, but supports adjacent files with `addto`, `listfile`, and `move`.
- `todo.txt-cli` has an add-on model through executable actions under `TODO_ACTIONS_DIR`.

Sources:

- https://github.com/todotxt/todo.txt
- https://github.com/todotxt/todo.txt-cli

## todo.txt ecosystem practices

Common conventions:

- Use `due:YYYY-MM-DD`, recurrence tags like `rec:...`, threshold/start tags such as `t:YYYY-MM-DD`, and sometimes `pri:A` to preserve priority on completion.
- Use project/context filters and saved views rather than encoding one rigid workflow in the file.
- Use multiple files for inbox/waiting/someday/project lists when a single active list becomes noisy.

Compatibility caution:

- There is no universal extra-tag registry. Custom tags are tolerated by generic clients but often ignored semantically.
- Some clients deliberately reject feature bloat to preserve the simple “one todo equals one line” model.

Relevant examples:

- `todo.txt-note` adds `note:<id>` to a task and stores the full description at `$TODO_DIR/notes/*.txt`.
- `todotxt-mode` supports moving tasks between Todo/Waiting/Someday/Archive files and creating Markdown notes referenced by `note:<file>`.
- `todo-txt-obsidian` supports multiple task files, wikilinks, task notes, filters, due dates, recurrence, projects, and contexts while keeping todo.txt as the visible format.
- Markor issue #937 rejected adding `note:<file>` as a built-in attachment type, citing the desire to keep todo.txt lightweight.

Sources:

- https://github.com/Genzer/todo.txt-note
- https://github.com/davraamides/todotxt-mode
- https://github.com/ghMahmudul/todo-txt-obsidian
- https://github.com/gsantner/markor/issues/937

## Adjacent systems

### Taskwarrior

Taskwarrior demonstrates mature task semantics: projects, tags, annotations, dependencies, `start`/`stop`, generated reports, and virtual tags such as `BLOCKED`, `READY`, and `ACTIVE`.

Design lessons:

- Store relations by stable IDs, not display order.
- Use generated reports/views for “next”, “blocked”, and “active”.
- Keep annotations/notes distinct from the one-line task description.
- Review stale metadata periodically.

Sources:

- https://taskwarrior.org/docs/best-practices/
- https://taskwarrior.org/docs/task/
- https://taskwarrior.org/docs/tags/
- https://taskwarrior.org/docs/workflow/
- https://taskwarrior.org/docs/philosophy/

### Org-mode

Org-mode keeps tasks and notes in plain-text outline nodes, then builds agenda views across many files.

Design lessons:

- Rich context can live next to tasks when the format supports outlines; todo.txt does not, so use sidecars instead.
- Global views should be query outputs over source files.
- Tags/properties are useful as orthogonal metadata axes.

Sources:

- https://orgmode.org/org.html
- https://orgmode.org/manual/Agenda-Views.html
- https://orgmode.org/manual/Tags.html

### Markdown task dashboards

Markdown/Obsidian task workflows commonly treat checklist lines as source of truth and build dashboards by search/query. Context is linked through note files and wikilinks.

Design lesson: a task manager can be a view layer over plain files rather than a database owner.

## Agent-memory and coding-agent practices

Modern agent systems separate three concerns:

1. Compaction: summarize long conversations.
2. Memory: write persistent external notes.
3. Just-in-time retrieval: keep lightweight IDs, file paths, and links in context, then load details only when needed.

Anthropic’s context-engineering guidance recommends the smallest high-signal context and lightweight identifiers over preloading everything. Claude Code memory uses `MEMORY.md` as an index and detailed topic files for on-demand recall. Codex community discussions similarly distinguish permanent project rules (`AGENTS.md`/`CLAUDE.md`) from volatile task progress (`PLANNING.md`/`TASK.md`).

Design lessons:

- Do not put volatile task state into permanent instruction files.
- Keep an index file short; move detail into topic/task files.
- Handoffs should include current state, decisions, next step, and blockers.
- Sidecars are the right place for acceptance criteria and session-resume context.

Sources:

- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools
- https://code.claude.com/docs/en/memory
- https://github.com/openai/codex/discussions/323

## Final synthesis

The community pattern is not “one todo file contains everything”. The repeated pattern is:

1. Small canonical task item.
2. Separate rich notes/context.
3. Query-generated views.
4. Optional bridges/plugins for richer clients.

For agent todos, that maps to: todo.txt-compatible project files as durable task index, Markdown sidecars as agent context, generated global views, and an OpenCode bridge at session boundaries.
