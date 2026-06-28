# Chat Pulse Line Prototype Plan

## Goal

Build a local OpenCode TUI plugin prototype that shows a compact Kilo-style chat pulse near the prompt without changing OpenCode config.

## Constraints found

- Current OpenCode plugin API exposes `session_prompt_right`, not a full-width prompt-above slot.
- MVP must therefore render in `session_prompt_right` first.
- Plugin source changes are safe here; persisted OpenCode config changes still require explicit permission and a same-directory backup.

## MVP steps

1. Pure renderer
   - Read recent assistant messages and parts from `api.state.session.messages(sessionID)` and `api.state.part(messageID)`.
   - Classify parts into text, reasoning, read tool, write tool, generic tool, error, and success colors.
   - Encode block height from approximate token output per part/step.
   - Build a width-aware string with blocks plus token/context summary when available.
2. TUI integration
   - Register a `session_prompt_right` slot.
   - Render the pulse for the provided `session_id`.
   - Request render on session/message/part events and use a light timer only while a session is busy.
3. Smoke QA
   - Drive the plugin through a fake TUI API.
   - Verify slot registration, rendered output, event-triggered rerender, and cleanup.

## Later, outside this prototype

- If `session_prompt_right` is too narrow in real use, patch OpenCode with a generic full-width host slot such as `session_prompt_above`.
- Add config/keybindings for visibility and detail level only after the placement works.
