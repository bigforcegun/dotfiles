# Zsh history truncation

## State

- Status: active investigation; durable manual tracer is implemented.
- Last updated: 2026-07-18.
- Next step: run `~/.dotfiles/bin/zsh-history-trace` manually in a dedicated console with `sudo`, then preserve its concise trace log if history shrinks again.

## Purpose

Preserve the zsh-history truncation investigation: the confirmed environment leak that was fixed, the remaining unknown writer, current forensic surfaces, and abandoned unsafe daemon designs.

## Files

- `handoff.md` - chronology, findings, active implementation, commands, and strict safety boundaries.

## Load policy

Read this file first, then `handoff.md`. Do not restore, compact, truncate, deduplicate, or replace the live history file. Do not enable a detached/root watcher without first resolving macOS per-TTY sudo authentication and root-child lifecycle.
