# Rejected: OpenCode Token Overhead Profiles

## Status

- Rejected on 2026-06-27.
- User decision: the `lean` / `dev` / `full` profile model is not a useful idea for this workspace.
- Keep this file only as historical research and diagnostics; do not continue this plan unless a new request reframes the problem.

## Requirements (confirmed)
- User wants to reduce OpenCode startup/context token overhead.
- User wants this remembered as a persistent project to revisit later.
- OpenCode/OMO config changes were made outside the original plan; this file now tracks the remaining profile/token-overhead implications rather than claiming no changes exist.
- Later decision: the profile-based approach below is rejected and should not be implemented.

## Technical Decisions
- Superseded decision: do not implement the profile split described below.
- Historical finding: the likely major token costs were always-on tools / MCP schemas and heavy orchestration prompt, not user disk instruction files.
- Rejected operating model: separate `lean`, `dev`, and `full` profiles.
- Historical mechanism considered: wrapper commands using `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `OPENCODE_CONFIG_CONTENT`, and/or `--pure`.
- Historical caveat: `OPENCODE_CONFIG` merges with global/project config according to OpenCode precedence; it may not fully isolate from global heavy plugin unless global config is slimmed or `--pure` is used.

## Research Findings
- Current working directory: `/Users/bigforcegun/.dotfiles`.
- Active config inspected: `.config/opencode/opencode.json`.
- Current config includes plugin: `oh-my-openagent@latest`.
- Current config lists these instruction files:
  - `~/.config/opencode/instructions/agent-identity.md`
  - `~/.config/opencode/instructions/common.md`
  - `~/.config/opencode/instructions/communication.md`
  - `~/.config/opencode/instructions/opencode.md`
  - `~/.config/opencode/instructions/git.md`
- These five disk instruction files total roughly `2298 bytes`, `337 words`, estimated `~550-750 tokens`.
- `~/.claude/CLAUDE.md` contains only `@RTK.md`.
- `~/.claude/RTK.md` exists and is roughly `296 bytes`, `42 words`, estimated `~70-100 tokens`.
- Disk instructions are not the major token cost; likely major costs are built-in orchestration prompt and tool schemas.
- OpenCode CLI help shows no `--config` flag, but docs/search indicate `OPENCODE_CONFIG` is supported.
- Useful environment variables discovered:
  - `OPENCODE_CONFIG`: path to config file.
  - `OPENCODE_CONFIG_DIR`: path to config directory.
  - `OPENCODE_CONFIG_CONTENT`: inline config override.
  - `OPENCODE_DISABLE_DEFAULT_PLUGINS`: disable default plugins.
  - `OPENCODE_DISABLE_CLAUDE_CODE`: disable reading `.claude` prompt + skills.
  - `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT`: disable reading `~/.claude/CLAUDE.md`.
- OpenCode CLI supports `--pure`: run without external plugins.
- Live verification on 2026-06-27 showed OpenCode 1.17.11 starts with OMO 4.13.0 and connects OMO-native `websearch`, `context7`, `grep_app`, `lsp`, plus `mcpproxy-salotech`.
- `.mcpproxy/mcp_config.json` now has profiles `salotech`, `dev`, and `gamedev`; `salotech` includes `playwright`, `semble`, `context7`, `salotech-slack`, `salotech-atlassian`, `salotech-freshdesk`, `salotech-mongodb-sisa`, `salotech-grafana`, `salotech-trino`, and `salotech-opensearch`.
- `mcpd status` showed `com.bigforcegun.mcpproxy` running on launchd; `mcpd ps` showed the mcpproxy process tree at roughly 622 MB RSS during verification.
- `mcpproxy-salotech` retrieve-tools returned read-only tools from Slack, MongoDB, Atlassian, and Grafana, confirming the profile is usable through the lazy retrieval surface.
- `salotech-trino` and `salotech-opensearch` are listed in the `salotech` profile but are currently `enabled: false` in `.mcpproxy/mcp_config.json`; retrieve-tools did not expose clear Trino/OpenSearch tools.
- `mcpd ps` still showed a `salotech-opensearch` process despite `enabled: false`; user decided this is out of scope for this context.
- `.config/opencode/package.json` currently still declares `@opencode-ai/plugin = 1.15.10` and `opencode-subagent-statusline = ^0.9.2`, while actual `opencode --version` is `1.17.11` and `.opencode` has `@opencode-ai/plugin@1.17.11`. User decision: package drift only matters for self-written plugins; do not chase generic package drift here.
- `bin/npm-changes` exists and was smoke-tested with `--help` and package metadata lookup. It is useful for freshness/changelog checks, but it currently reports baselines from whichever package file is passed.

## Proposed Profile Model

Rejected. Do not implement this model as written.

### `lean`
- Purpose: fast questions, grep, tiny edits, low overhead.
- Likely launch pattern:
  ```bash
  OPENCODE_CONFIG="$HOME/.config/opencode/profiles/lean.json" \
  OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1 \
  opencode --pure "$@"
  ```
- Keep: basic identity/common/communication/git instructions.
- Avoid: heavy plugins, MCPs, subagent orchestration, Obsidian, Context7, web search, session tools.

### `dev`
- Purpose: normal coding with verification.
- Keep: core tools, bash, read/edit, diagnostics, minimal instructions.
- Optional: limited plugin support if token cost is acceptable.

### `full`
- Purpose: autonomous/deep tasks needing OhMyOpenCode, subagents, skills, MCP/tools.
- Keep current heavy framework/plugin behavior.

## Open Questions
- None. The profile idea is rejected, `salotech-opensearch` cleanup is out of scope, and package drift matters only for self-written plugins.

## Scope Boundaries
- INCLUDE: historical profile strategy, measurement strategy, wrapper commands, config layout, and token-overhead reduction notes.
- INCLUDE: backup-first approach before any future OpenCode config modification.
- INCLUDE: live diagnostics for current MCP profile and package/runtime drift.
- EXCLUDE: implementing `lean` / `dev` / `full` profile split.
- EXCLUDE: cleaning stale `salotech-opensearch` process in this context.
- EXCLUDE: generic package/runtime drift except self-written plugin dependencies.
- EXCLUDE: editing OpenCode config now.
- EXCLUDE: removing tools/plugins without explicit permission.
- EXCLUDE: changing git hooks or git config.

## Future Continuation Prompt
When returning to this project, ask Prometheus or another agent:
> Revisit OpenCode token overhead only if there is a new concrete bottleneck. Do not resume the rejected lean/dev/full profile plan. First inspect current OpenCode config and CLI behavior, then propose a narrower fix. Do not modify OpenCode config without explicit permission and backup.
