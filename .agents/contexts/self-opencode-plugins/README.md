# Self OpenCode Plugins

## State

- Status: discovery/context capture, no OpenCode config or plugin changes applied yet
- Last updated: 2026-06-28
- Branch: `omo`

## Purpose

Track ideas, constraints, and implementation notes for many plugins that customize OpenCode itself in this dotfiles workspace.

This context is the umbrella home for self-OpenCode UX/plugin work, such as TUI extensions, chat navigation, session/message tooling, status widgets, and local OpenCode plugin experiments. Each plugin idea should get its own focused research/spec file here. It is separate from general hotkey mapping because these changes may require OpenCode TUI plugin APIs, local plugin files, or upstream OpenCode patches.

OpenCode config edits still require explicit permission per file and a same-directory `.bak` backup before modification.

## Files

- `chat-minimap-navigator.md` - findings and open questions for a VSCode-like current-chat minimap/navigator plugin.
- `chat-pulse-line.md` - plan for a Kilo-style chat pulse/task timeline line near the OpenCode prompt.

## Load policy

Read this file first. Then read only the plugin-specific file that matches the task. For chat navigation or session minimap work, read `chat-minimap-navigator.md`. For Kilo-style chat pulse, task timeline, context progress, or prompt status-line work, read `chat-pulse-line.md`.
