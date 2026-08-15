---
updated: 2026-07-06
status: active
---
# OpenCode Sessions Sidebar

[[DOTFILES]]

## Purpose

Track research for adding a session-oriented sidebar or drawer to OpenCode with minimal UI jank.

This context exists because the problem spans multiple layers at once:
- native OpenCode TUI host slots and layout constraints;
- third-party OpenCode plugins with different compatibility stories;
- external tmux-based sidebars that are not true OpenCode TUI plugins;
- local wrapper/theme/tmux conventions in this dotfiles workspace.

## Files

- [[2026-07-06-opencode-sessions-sidebar-research]] - source-of-truth notes for plugin inventory, compatibility checks, layout/slot limitations, `opencode-sidebar` architecture, theming, flicker findings, and recommended directions.

## Load policy

If changing any of the following, load this context before editing:
- `.config/opencode/tui.json`
- OpenCode TUI plugins under `.config/opencode/plugins/`
- `bin/oc`
- any new session sidebar/drawer prototype for OpenCode
- tmux-side integrations that try to emulate an OpenCode session browser


## Related

- [[2026-06-28-self-opencode-plugins]] — зонтичный контекст плагинов OpenCode
- [[2026-07-19-coding-agent-session-manager]] — альтернативный подход к той же потребности, снаружи TUI
- [[2026-06-21-agents-session-dumper]] — тот же корпус сессий с другой стороны
