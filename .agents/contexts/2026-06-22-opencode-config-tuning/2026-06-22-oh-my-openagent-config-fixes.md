# Oh-My-OpenAgent Config Fixes

## Status

- Archived/closed on 2026-06-27.
- All originally requested OpenCode/OMO config-fix items are either live-verified complete or explicitly dismissed by user decision.
- Keep this file as evidence for later analysis; do not treat it as an active plan.

## Requirements (confirmed)
- "настройка oh-my-openagent"
- Completed/live-verified: "поправить сабмит на контол энтер"
- Completed/live-verified: "поправить модельку для unspecified-low"
- Completed/live-verified: "поправить / проверить интеграцию тмукса" - TUI window-title integration works; true tmux MCP is explicitly not needed.

## Current Status
- Ctrl+Enter submit behavior is implemented and live-verified in OpenCode TUI inside tmux.
- `unspecified-low` category routing is configured and live-verified through a delegated category task.
- OMO runtime loads successfully with OhMyOpenCode 4.13.0.
- OMO-native MCP surface is connected for `websearch`, `context7`, `grep_app`, and `lsp`; `codegraph` is disabled.
- `mcpproxy-salotech` is connected through OpenCode MCP.
- tmux window-title integration works through `.config/opencode/plugins/oc-tmux-window-title/tui.js`.
- A standalone/local tmux MCP via `npx -y @fr1sk/tmux-mcp` was not found in resolved OpenCode config during live verification. Treat the earlier note claiming it existed as stale; user decided this is not important and should be ignored.

## Technical Decisions
- Context updates only; no OpenCode config files are modified by this plan sync.
- Because this touches OpenCode configuration, implementation plan must include backup and explicit permission guardrails before any config modification.

## Research Findings
- SDD framework: none detected (`openspec/` and `.specify/` not found).
- `.config/opencode/opencode.json` currently enables `oh-my-openagent@latest`, `@slkiser/opencode-quota@latest`, `@ramtinj95/opencode-tokenscope@latest`, and `opencode-skill-creator` plugins.
- `.config/opencode/opencode.json` permissions deny edits to `opencode.json`, `opencode.json.bak`, `.opencode/**`, and `~/.config/opencode/**`; plan must account for permission/approval constraints.
- `.config/opencode/tui.json` configures `input_submit` as `ctrl+return, ctrl+s`, `input_newline` as `return,shift+return,ctrl+j`, and `dialog.prompt.submit` as `ctrl+return`.
- OpenCode docs say keybinds belong in `tui.json`; `theme`, `keybinds`, and `tui` in `opencode.json` are deprecated.
- OpenCode docs expose separate submit bindings: `input_submit` and `dialog.prompt.submit`; desktop prompt shortcuts are not configurable through `opencode.json`.
- No repo-level Node package manifest or dedicated OpenCode config validation command was found.
- `.config/opencode/oh-my-openagent.json` contains `categories.unspecified-low` with `model = "openai/gpt-5.5-fast"`, `variant = "medium"`, and fallback `google/gemini-3-flash-preview`.
- oh-my-openagent docs define built-in/custom categories including `unspecified-low`, category config shape, model matching, and fallback/runtime fallback behavior.
- Tmux verification found working TUI window-title integration via `.config/opencode/plugins/oc-tmux-window-title/tui.js`; resolved OpenCode MCP list did not include a `tmux` MCP server.
- Hooks exist via `.gitconfig` and `.githooks/*`; no CI workflows were found.

## Live Verification (2026-06-27)
- `jq empty` passed for `.config/opencode/opencode.json`, `.config/opencode/tui.json`, `.config/opencode/oh-my-openagent.json`, `.config/opencode/package.json`, and `.mcpproxy/mcp_config.json`.
- `opencode --version` returned `1.17.11`.
- `opencode debug config` resolved OMO agents, OMO MCPs, user/project skills, `opencode-skill-creator`, and `omo-watch`.
- `opencode mcp list` connected `websearch`, `context7`, `grep_app`, `lsp`, and `mcpproxy-salotech`; `codegraph` was disabled.
- TUI launched inside tmux and showed `~/.dotfiles:omo`, `5 MCP`, and OpenCode `1.17.11`.
- In the TUI, typing `verify-enter` then pressing Enter left text in the input, proving Enter is newline/not submit.
- Pressing `C-Enter` submitted the prompt. The test prompt was interpreted as a task, but that still proved the submit path reached runtime.
- After submit, tmux window title changed to `oc://.dotfiles/Verify-enter`, proving the tmux window-title plugin path works.
- A direct `task(category="unspecified-low")` completed successfully with `Agent: Sisyphus-Junior`, `category: unspecified-low`, and `Model: openai/gpt-5.5-fast`.

## Open Questions
- None for this track.

## User Decisions (2026-06-27)
- True/local tmux MCP is not important; ignore it. Verified TUI window-title integration is enough.
- Package/runtime drift matters only for self-written plugins. Do not chase generic OpenCode package drift here.
- Stale `salotech-opensearch` process is out of scope for this context.
- Lean/dev/full token-overhead profile idea is rejected.

## Scope Boundaries
- INCLUDE: document completed config changes for Ctrl+Enter submit behavior, `unspecified-low` model selection, OMO runtime verification, and tmux integration findings.
- INCLUDE: validation and rollback/backup requirements for OpenCode config changes.
- EXCLUDE: adding or validating true tmux MCP unless a future task explicitly asks for it.
- EXCLUDE: generic package/runtime drift except dependencies for self-written plugins.
- EXCLUDE: applying actual OpenCode config changes without explicit approval.
