# Agent context index

This is the entrypoint for cross-agent work in this repository.

## Active contexts

| Context | Status | Read first | Legacy inputs |
|---|---|---|---|
| `contexts/mcp-stack/` | active design | `contexts/mcp-stack/README.md` | `docs/mcp-stack/` |
| `contexts/dotfiles-access-audit/` | audit plan | `contexts/dotfiles-access-audit/README.md` | `docs/dotfiles-access-audit-plan.md` |
| `contexts/oc-project-discovery/` | historical/ignored OMO workstream port | `contexts/oc-project-discovery/README.md` | `.omo/plans/oc-project-discovery.md`, `.omo/evidence/` |
| `contexts/agent-context-system/` | new plan | `contexts/agent-context-system/README.md` | chat research, public references |
| `contexts/omo-subagents-refining/` | active tuning notes | `contexts/omo-subagents-refining/README.md` | OMO package cache, GitHub issues/PRs |
| `contexts/agents-session-dumper/` | research/design | `contexts/agents-session-dumper/README.md` | `docs/agents-session-dumper.md` |
| `contexts/opencode-config-tuning/` | draft plans | `contexts/opencode-config-tuning/README.md` | `.omo/drafts/oh-my-openagent-config-fixes.md`, `.omo/drafts/opencode-token-overhead-profiles.md` |
| `contexts/hotkeys-and-plugins/` | discovery/context capture | `contexts/hotkeys-and-plugins/README.md` | current branch scan, OpenCode docs |
| `contexts/self-opencode-plugins/` | discovery/context capture | `contexts/self-opencode-plugins/README.md` | chat discussion, OpenCode docs/code lookup |
| `contexts/domovoi-dotfiles-caretaker/` | concept/design | `contexts/domovoi-dotfiles-caretaker/README.md` | chat discussion |
| `contexts/agent-todo-txt-bridge/` | research/design | `contexts/agent-todo-txt-bridge/README.md` | chat research, todo.txt/Taskwarrior/Org/agent-memory references |
| `contexts/mcpd-envless-start/` | decision/design | `contexts/mcpd-envless-start/README.md` | chat discussion, `.mcpproxy/mcp_config.json`, `bin/mcpd`, launchd plist |
| `contexts/opencode-speed-improvements/` | research | `contexts/opencode-speed-improvements/README.md` | chat research, OpenCode/Codex GitHub issues |

## Root rules

- Keep one workstream in one folder under `contexts/`.
- Required per context: `README.md` only.
- Add `plan.md`, `research.md`, `decisions.md`, `handoff.md`, or `evidence.md` only when there is real content.
- Prefer direct content inside the context folder over meta-files that point elsewhere.
- Keep raw artifacts out of git unless they are small, curated, and useful for review.

## Local-only areas

- `.omo/` remains ignored runtime state; copy only durable summaries into `.agents/contexts/*`.
- `.agents/tmp/` may be used for scratch output only if it is ignored locally.
