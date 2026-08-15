---
updated: 2026-06-28
status: active
---
# Self OpenCode Plugins

[[DOTFILES]]

## Purpose

Track ideas, constraints, and implementation notes for many plugins that customize OpenCode itself in this dotfiles workspace.

This context is the umbrella home for self-OpenCode UX/plugin work, such as TUI extensions, chat navigation, session/message tooling, status widgets, and local OpenCode plugin experiments. Each plugin idea should get its own focused research/spec file here. It is separate from general hotkey mapping because these changes may require OpenCode TUI plugin APIs, local plugin files, or upstream OpenCode patches.

OpenCode config edits still require explicit permission per file and a same-directory `.bak` backup before modification.

## Files

- [[2026-06-28-chat-minimap-navigator]] - findings and open questions for a VSCode-like current-chat minimap/navigator plugin.
- [[2026-06-28-chat-pulse-line]] - plan for a Kilo-style chat pulse/task timeline line near the OpenCode prompt.

## Load policy

Read only the plugin-specific file that matches the task. For chat navigation or session minimap work, read [[2026-06-28-chat-minimap-navigator]]. For Kilo-style chat pulse, task timeline, context progress, or prompt status-line work, read [[2026-06-28-chat-pulse-line]].


## Related

- [[2026-07-06-opencode-sessions-sidebar]] — конкретная идея плагина под этим зонтиком
- [[2026-06-27-hotkeys-and-plugins]] — смежная поверхность, разделены намеренно
