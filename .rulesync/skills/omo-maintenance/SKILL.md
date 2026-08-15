---
name: omo-maintenance
description: >-
  Maintenance runbook for Oh My OpenAgent (OMO) in this dotfiles workspace. Use
  whenever the user wants to maintain, assess, update, validate, or repair OMO,
  its OpenCode integration, its configured MCP surface, or its configuration
  links, even without naming this skill. Do not use for generic OpenCode usage
  questions, standalone MCP work, or unrelated dotfiles edits.
targets:
  - '*'
---
# OMO Maintenance

Keep OMO working after an update, breakage report, or any maintenance request. This is an operational runbook, not an architecture reference.

## Source of truth

Read current state before acting:

1. ~/.config/opencode/opencode.json for the OMO plugin entry.
2. ~/.omo/omo.jsonc for the active OMO configuration.
3. .omo/omo.jsonc when this dotfiles repository is its source. Confirm the home file links to it.
4. The installed package source and current upstream docs when behavior is unclear.

Do not infer OMO behavior from local historical notes. Treat oh-my-openagent.json[c] and oh-my-opencode.json[c] as migration inputs, not active configuration.

## Operating loop

1. Run git status --short; preserve unrelated work.
2. Read the pinned OMO plugin spec from opencode.json, then inspect the matching package cache entry.
3. Compare it with npm view oh-my-openagent version. Read upstream release notes or source when the update changes behavior.
4. Update only the stale or broken component. Preserve an existing pin unless the user requests a different spec.
5. If configuration changes are necessary, back up the exact file first and edit the canonical .omo/omo.jsonc source. Keep deployment in setup_user and setup_user_mac as link ".omo/omo.jsonc".
6. Validate through a fresh OpenCode process. The task is complete only after the user-facing surface works.

Never recreate a legacy OMO config under ~/.config/opencode/.

## MCP boundaries

Do not duplicate OMO-native websearch, grep_app, lsp, or ast_grep through rulesync or a global proxy. context7 is an intentional override only when explicitly configured. Keep workspace-sensitive tools such as LSP and ast-grep out of global proxy processes.

## Validation

- Run opencode mcp list and confirm the configured OMO MCP surface starts.
- Run opencode run "Reply with exactly: OMO_OK".
- If ast-grep changed, invoke the ast-grep skill; do not require it to appear in opencode mcp list.
- If Librarian changed, run one small targeted research request.
- Inspect errors and logs before diagnosing a failure.

## Helper

Use `scripts/omo-maintenance` for deterministic checks:

- `scripts/omo-maintenance status`
- `scripts/omo-maintenance update-check`
- `scripts/omo-maintenance config-audit`
- `scripts/omo-maintenance verify [--smoke]`

It is read-only. Do not replace it with ad-hoc cache inspection or automatic migration.

## Report

Report the installed and upstream versions, changed paths, user-surface validation, and any remaining risk. Keep it short.
