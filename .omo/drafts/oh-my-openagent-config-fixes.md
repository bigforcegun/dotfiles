# Draft: Oh-My-OpenAgent Config Fixes

## Requirements (confirmed)
- "настройка oh-my-openagent"
- Remaining work: "поправить сабмит на контол энтер"
- Remaining work: "поправить модельку для unspecified-low"
- Remaining work: "поправить / проверить интеграцию тмукса"

## Technical Decisions
- Planning only; no OpenCode config files will be modified in this session.
- Because this touches OpenCode configuration, implementation plan must include backup and explicit permission guardrails before any config modification.

## Research Findings
- SDD framework: none detected (`openspec/` and `.specify/` not found).
- `.config/opencode/opencode.json` currently enables `oh-my-openagent@latest` plugin and a local `tmux` MCP via `npx -y @fr1sk/tmux-mcp`.
- `.config/opencode/opencode.json` permissions deny edits to `opencode.json`, `opencode.json.bak`, `.opencode/**`, and `~/.config/opencode/**`; plan must account for permission/approval constraints.
- `.config/opencode/tui.json` exists and currently has only leader/command-list bindings; Ctrl+Enter submit is not configured there.
- OpenCode docs say keybinds belong in `tui.json`; `theme`, `keybinds`, and `tui` in `opencode.json` are deprecated.
- OpenCode docs expose separate submit bindings: `input_submit` and `dialog.prompt.submit`; desktop prompt shortcuts are not configurable through `opencode.json`.
- No repo-level Node package manifest or dedicated OpenCode config validation command was found.
- No explicit `small_model`, `category`, or `unspecified-low` setting was found in scanned OpenCode files.
- oh-my-openagent docs define built-in/custom categories including `unspecified-low`, category config shape, model matching, and fallback/runtime fallback behavior.
- Tmux verification options exist: OpenCode MCP config in `opencode.json`, tmux config reload paths in `.tmux.conf`, helper `bin/tmux_auto_theme`, and zsh tmux auto-start/attach scripts.
- Hooks exist via `.gitconfig` and `.githooks/*`; no CI workflows were found.

## Open Questions
- Exact desired behavior for submit: should Ctrl+Enter submit while Enter inserts newline, or should Ctrl+Enter be an additional submit shortcut while Enter remains submit?
- Which model/provider should `unspecified-low` use?
- What counts as tmux integration verified: config presence only, MCP tool availability, or live tmux session interaction?
- Test/QA strategy: config-only smoke checks, add validation command/docs, or no test infra setup.

## Scope Boundaries
- INCLUDE: plan config changes for Ctrl+Enter submit behavior, unspecified-low model selection, tmux MCP verification/fix path.
- INCLUDE: validation and rollback/backup requirements for OpenCode config changes.
- EXCLUDE: applying actual config changes during planning.
