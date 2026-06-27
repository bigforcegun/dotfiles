# Agents Session Dumper

## State

- Status: research/design, no implementation yet
- Last updated: 2026-06-21
- Next step: design the common IR in `plan.md`, then prototype one `Claude Code -> IR -> Markdown` adapter against temporary output before writing to the Obsidian vault.

## Purpose

Design a pipeline that dumps chat/session histories from multiple agent CLIs into Markdown notes in a central Obsidian vault, preserving incremental updates, forks/resumes, subagents, tool usage, and skill wikilinks.

## Files

- `plan.md` - target behavior, durable decisions, architecture sketch, common IR draft, open questions, and next step.
- `research.md` - validated source stores, adapter styles, per-client format facts, and production tooling comparison.

## Load policy

Read this file first. Read `plan.md` for implementation or architecture work. Read `research.md` when touching collectors/parsers for Claude Code, Codex, opencode, Cursor, or Kimi.

## Legacy input

Ported from `docs/agents-session-dumper.md`.
