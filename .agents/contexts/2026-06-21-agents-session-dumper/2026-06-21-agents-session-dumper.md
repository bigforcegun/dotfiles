---
updated: 2026-06-21
status: active
next: design the common IR in `2026-06-28-agents-session-dumper-plan.md`, then prototype one `Claude Code -> IR -> Markdown` adapter against temporary output before writing to the Obsidian vault
---
# Agents Session Dumper

[[DOTFILES]]

## Purpose

Design a pipeline that dumps chat/session histories from multiple agent CLIs into Markdown notes in a central Obsidian vault, preserving incremental updates, forks/resumes, subagents, tool usage, and skill wikilinks.

## Files

- [[2026-06-28-agents-session-dumper-plan]] - target behavior, durable decisions, architecture sketch, common IR draft, open questions, and next step.
- [[2026-06-28-agents-session-dumper-research]] - validated source stores, adapter styles, per-client format facts, and production tooling comparison.

## Load policy

Read [[2026-06-28-agents-session-dumper-plan]] for implementation or architecture work. Read [[2026-06-28-agents-session-dumper-research]] when touching collectors/parsers for Claude Code, Codex, opencode, Cursor, or Kimi.


## Legacy input

Ported from `docs/agents-session-dumper.md`.

## Related

- [[2026-07-19-coding-agent-session-manager]] — тот же корпус сессий: этот дампит, тот читает и возобновляет
- [[2026-07-06-opencode-sessions-sidebar]] — третья поверхность над сессиями, внутри TUI
- [[2026-06-21-agent-context-system]] — целевой формат дампа — markdown с вики-ссылками
