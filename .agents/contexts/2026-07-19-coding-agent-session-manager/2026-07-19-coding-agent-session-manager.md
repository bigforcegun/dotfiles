---
updated: 2026-07-19
status: active
---
# Coding Agent Session Manager

[[DOTFILES]]

## Purpose

Design or adopt a standalone, minimally invasive TUI for browsing, searching, inspecting, and resuming coding-agent sessions.

The desired product starts with OpenCode and may later support Codex CLI, Claude Code, and other local agents. It must complement the existing `bin/oc`, OpenCode plugins, and tmux setup rather than becoming a second runtime owner like Orca or Agent Deck.

## Files

- [[2026-07-19-coding-agent-session-manager-research]] - prior-session findings, local inventory, product landscape, `dru89/sesh` audit, architecture recommendation, MVP boundary, and adoption kill gate.

## Related contexts

- [[2026-07-06-opencode-sessions-sidebar]] - native OpenCode sidebar and drawer research.
- [[2026-06-21-agents-session-dumper]] - cross-agent transcript stores and parser research.
- [[2026-06-21-oc-project-discovery]] - local `bin/oc` project-root and backend discovery behavior.
- [[2026-06-27-hotkeys-and-plugins]] - current OpenCode and tmux interaction conventions.

## Load policy

Load this context before:

- installing, configuring, forking, or replacing `dru89/sesh`;
- implementing a standalone coding-agent session browser;
- adding OpenCode, Codex, or Claude session adapters;
- adding tmux launch, attach, popup, or live-status integration;
- changing `bin/oc` behavior for session resume.

