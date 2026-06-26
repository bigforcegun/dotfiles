# Hotkeys and Plugins

## State

- Status: discovery/context capture, no keybinding or OpenCode config changes applied yet
- Last updated: 2026-06-24
- Branch: `omo`
- Current worktree note: `.mcpproxy/mcp_config.json` was already modified before this context was created; do not treat it as part of this workstream unless explicitly requested.

## Purpose

Track the repo-local plan for changing user hotkeys correctly across terminal, window-manager, editor, shell, tmux, OpenCode TUI, and plugin layers.

This context exists because the hotkey surface is split across multiple config systems, and OpenCode config edits have stricter local rules: ask explicit permission per OpenCode config file and create a same-directory `.bak` backup before modifying it.

## Files

- `research.md` - current map of hotkey/plugin files, OpenCode keybind rules, conflicts, and next decisions.

## Load policy

Read this file first. Read `research.md` before changing any hotkey, TUI keybind, plugin list, tmux binding, shell binding, skhd/yabai binding, i3 binding, or Neovim mapping.
