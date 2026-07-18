# Coding Agent Session Manager

## State

- Status: research and product-boundary decision; no implementation or configuration changes yet
- Last updated: 2026-07-19
- Current recommendation: evaluate `dru89/sesh` against the local requirements before starting a custom OpenCode-first TUI
- Version note: Homebrew cask and latest stable release are `1.1.1`; upstream `main` is six unreleased commits ahead

## Purpose

Design or adopt a standalone, minimally invasive TUI for browsing, searching, inspecting, and resuming coding-agent sessions.

The desired product starts with OpenCode and may later support Codex CLI, Claude Code, and other local agents. It must complement the existing `bin/oc`, OpenCode plugins, and tmux setup rather than becoming a second runtime owner like Orca or Agent Deck.

## Files

- `research.md` - prior-session findings, local inventory, product landscape, `dru89/sesh` audit, architecture recommendation, MVP boundary, and adoption kill gate.

## Related contexts

- `../opencode-sessions-sidebar/` - native OpenCode sidebar and drawer research.
- `../agents-session-dumper/` - cross-agent transcript stores and parser research.
- `../oc-project-discovery/` - local `bin/oc` project-root and backend discovery behavior.
- `../hotkeys-and-plugins/` - current OpenCode and tmux interaction conventions.

## Load policy

Read this file first, then `research.md` before:

- installing, configuring, forking, or replacing `dru89/sesh`;
- implementing a standalone coding-agent session browser;
- adding OpenCode, Codex, or Claude session adapters;
- adding tmux launch, attach, popup, or live-status integration;
- changing `bin/oc` behavior for session resume.
