# Draft: OpenCode Token Overhead Profiles

## Requirements (confirmed)
- User wants to reduce OpenCode startup/context token overhead.
- User wants this remembered as a persistent project to revisit later.
- No OpenCode config changes have been approved or made.

## Technical Decisions
- Primary optimization target: always-on tools / MCP schemas and heavy orchestration prompt, not user disk instruction files.
- Recommended operating model: separate `lean`, `dev`, and `full` profiles.
- Safest profile operation mechanism: wrapper commands using `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `OPENCODE_CONFIG_CONTENT`, and/or `--pure`.
- Important caveat: `OPENCODE_CONFIG` merges with global/project config according to OpenCode precedence; it may not fully isolate from global heavy plugin unless global config is slimmed or `--pure` is used.

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

## Proposed Profile Model

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
- Should global `.config/opencode/opencode.json` be slimmed so heavy plugin only lives in `full` profile?
- Should profile files live in `~/.config/opencode/profiles/` or in this dotfiles repo under `.config/opencode/profiles/`?
- Should aliases/functions be added to zsh config, and where exactly?
- Which exact tools/MCPs are mandatory for `dev` versus `full`?
- Should Claude prompt integration be disabled only for `lean`, or for all profiles?

## Scope Boundaries
- INCLUDE: profile strategy, measurement strategy, wrapper commands, config layout, token-overhead reduction plan.
- INCLUDE: backup-first approach before any future OpenCode config modification.
- EXCLUDE: editing OpenCode config now.
- EXCLUDE: removing tools/plugins without explicit permission.
- EXCLUDE: changing git hooks or git config.

## Future Continuation Prompt
When returning to this project, ask Prometheus or another agent:
> Continue the OpenCode token overhead profile project from `.omo/drafts/opencode-token-overhead-profiles.md`. First inspect current OpenCode config and CLI behavior, then propose a decision-complete plan for lean/dev/full profiles. Do not modify OpenCode config without explicit permission and backup.
