# OpenCode Sessions Sidebar

## State

- Status: research/context capture only; no persistent OpenCode or tmux config changes left active from this workstream
- Last updated: 2026-07-06
- Branch: `master`
- Current worktree note: plugin install/config experiments for `opencode-sidebar-background-sessions` were reverted after runtime incompatibility; treat this context as research, not as applied config

## Purpose

Track research for adding a session-oriented sidebar or drawer to OpenCode with minimal UI jank.

This context exists because the problem spans multiple layers at once:
- native OpenCode TUI host slots and layout constraints;
- third-party OpenCode plugins with different compatibility stories;
- external tmux-based sidebars that are not true OpenCode TUI plugins;
- local wrapper/theme/tmux conventions in this dotfiles workspace.

## Files

- `research.md` - source-of-truth notes for plugin inventory, compatibility checks, layout/slot limitations, `opencode-sidebar` architecture, theming, flicker findings, and recommended directions.

## Load policy

Read this file first, then `research.md`.

If changing any of the following, load this context before editing:
- `.config/opencode/tui.json`
- OpenCode TUI plugins under `.config/opencode/plugins/`
- `bin/oc`
- any new session sidebar/drawer prototype for OpenCode
- tmux-side integrations that try to emulate an OpenCode session browser
