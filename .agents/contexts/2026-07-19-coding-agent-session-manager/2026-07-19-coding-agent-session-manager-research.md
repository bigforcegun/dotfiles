# Standalone Coding-Agent Session Manager Research

## Executive conclusion

The missing tool in this workspace is a **passive session browser and resumer**, not another agent runtime orchestrator.

Recommended order:

1. Evaluate [`dru89/sesh`](https://github.com/dru89/sesh) against the local requirements.
2. Keep it if its provider and resume hooks can be extended to show the required OpenCode hierarchy and timeline.
3. Fork or build a narrow OpenCode-first TUI only if the fit check fails.
4. Keep tmux optional and keep all vendor stores read-only.

Orca, Agent Deck, Claude Squad, and dmux contain useful UI ideas, but their process, worktree, permission, and configuration ownership conflicts with the existing dotfiles workflow.

## User intent recovered from earlier sessions

The most relevant earlier discussion is Claude/OpenCode session `ses_129d48061ffegU9PYKzpzkr83j`, created 2026-06-17.

The requested experience was:

- see all main sessions and nested subagents/subtasks as a tree;
- see useful live or recent-activity state;
- navigate the current chat through a timeline or table of contents;
- jump quickly to previous messages;
- search conversation history across sessions;
- avoid heavy or invasive integration.

That work installed `opencode-subagent-statusline`, but did not find one tool that combined the global session tree, transcript navigation, and cross-session search. Current `.config/opencode/tui.json` now contains:

- `opencode-subagent-statusline@1.2.0`;
- `@ishaksebsib/opencode-tree@0.4.2`;
- the local `session-cycle` plugin.

These solve current-session status, conversation branching, and quick root-session cycling, but not global historical browsing.

## Local baseline verified on 2026-07-19

### OpenCode

- Installed version: `1.17.20`.
- Database: `~/.local/share/opencode/opencode.db`.
- Session CLI: `opencode session list --format json`.
- Resume CLI: `opencode --session <id>`.
- Export CLI: `opencode export <id>`.

Observed database scale:

| Entity | Count |
|---|---:|
| Sessions | 1,656 |
| Root sessions | 348 |
| Child sessions | 1,308 |
| Messages | 35,295 |
| Parts | 182,850 |

Implications:

- root/child navigation is not cosmetic; most sessions are children;
- list and transcript views must be lazy or paged;
- preview requests must be cancellable or generation-tagged;
- a durable second index should not be introduced before direct-search performance is measured.

OpenCode's current SQLite session row includes useful fields such as `parent_id`, `directory`, title, agent, model, cost, token totals, timestamps, workspace ID, archive time, and metadata. The public JSON list is simpler and omits important hierarchy fields, so a rich OpenCode adapter will probably need a read-only SQLite capability path plus a CLI fallback.

### Local OpenCode launcher

`bin/oc` is already the source of truth for safe OpenCode start/attach behavior:

- discovers candidate OpenCode processes and listening ports;
- validates `/project/current.worktree`;
- attaches only when the backend matches the canonical project root;
- otherwise starts OpenCode from that root;
- temporarily renames the tmux window to `oc:<directory>` and restores it on exit.

Any session browser must change to the recorded `session.directory` before invoking:

```sh
oc --session <session-id>
```

The interaction between an old session ID, its recorded directory, and `bin/oc` backend discovery still needs real-surface testing before implementation.

### Local tmux behavior

The current tmux setup already owns runtime navigation and persistence:

- numeric tmux sessions are renumbered on creation and close;
- `Ctrl-Alt-Up/Down` switches tmux sessions;
- `Ctrl-Alt-Left/Right` and `Ctrl-Tab` switch windows;
- `sainnhe/tmux-fzf` is bound through `<prefix>+Space`;
- tmux-resurrect and tmux-continuum preserve terminal topology;
- windows and panes retain the current working directory;
- status line is at the top and uses the local light/dark Gruvbox-derived palette.

Consequences:

- tmux names and numeric indexes must not be canonical agent-session identifiers;
- the new tool must not rename, renumber, restore, or supervise tmux objects;
- `<prefix>+Space` is unavailable for a new popup binding;
- one-shot launch into the existing named `opencode` tmux session is reasonable, but should remain optional.

## Product landscape

### Passive or mostly passive tools

| Project | Scope | Useful characteristics | Main gap for this workspace |
|---|---|---|---|
| [`dru89/sesh`](https://github.com/dru89/sesh) | OpenCode, Claude Code, external providers | Fuzzy picker, details, resume, JSON output, statistics, summaries, recap, external-provider protocol | No demonstrated recursive OpenCode child tree or full timeline UI |
| [`Shane0xM/oc-session`](https://github.com/Shane0xM/oc-session) | OpenCode | Small read-only browser; native resume; no daemon or tmux ownership | OpenCode-only and intentionally shallow |
| [`jazzyalex/agent-sessions`](https://github.com/jazzyalex/agent-sessions) | Codex, Claude, OpenCode, and others | Read-only normalized local index and rich browsing | macOS GUI rather than terminal-first TUI |
| [`golovpeter/codex-cli-session-manager`](https://github.com/golovpeter/codex-cli-session-manager) | Codex | Keyboard-first passive TUI; native resume/fork | Codex-only |
| [`fortytwode/claude-browse`](https://github.com/fortytwode/claude-browse) | Multiple agents | Local index, fzf/web viewer, passive core | Optional board adds hooks and status integration; OpenCode is not its center |

### Runtime owners and orchestrators

| Project | Useful ideas | Why it is not the default fit |
|---|---|---|
| [`asheshgoplani/agent-deck`](https://github.com/asheshgoplani/agent-deck) | Groups, global search, attention states, archive, fork, cost dashboard | Own registry, tmux sessions, worktrees, MCP/skills, accounts, conductors, daemons, and messaging bridges |
| [`smtg-ai/claude-squad`](https://github.com/smtg-ai/claude-squad) | Compact list, preview/diff tabs, attach/resume | Owns tmux and worktree lifecycle and can auto-accept prompts |
| [`standardagents/dmux`](https://github.com/standardagents/dmux) | Pane status, notifications, read-only file browser | Creates worktrees and branches and manages merge/PR lifecycle |
| [`stablyai/orca`](https://github.com/stablyai/orca) | Integrated workspace, restore, browser, GitHub, remote control | Full ADE and daemon; launches agents itself, creates worktrees, and changes the approval/autonomy model |

### Why Orca feels too aggressive

The likely referenced Orca is [`stablyai/orca`](https://github.com/stablyai/orca), which is an integrated agent development environment rather than a historical-session browser.

It manages workspaces, worktrees, terminal panes, session restoration, browser/design surfaces, GitHub/Linear integration, notifications, remote/mobile control, and telemetry. Its documented agent launch model uses full-autonomy or permission-bypass flags for supported agents by default. This is a fundamentally different trust and ownership boundary from “read local history and invoke the native resume command.”

There is also a separate [`beaufour/orca`](https://github.com/beaufour/orca), so future references should identify Orca by repository owner.

## tmux tools are complementary, not sufficient

Tools such as [`joshmedeski/sesh`](https://github.com/joshmedeski/sesh), tmux-sessionizer, tmuxinator, smug, tmuxp, tmux-fzf, resurrect, and continuum manage project directories, layouts, windows, and processes.

They do not natively know:

- OpenCode/Codex/Claude transcript IDs;
- root and child agent relationships;
- message timelines and tool events;
- model, token, cost, compaction, or archive metadata;
- whether a terminal process represents the historical session selected in the agent store.

The correct separation is:

```text
agent-native transcript store
        ↓
read-only provider adapter
        ↓
session browser / search / timeline
        ↓
optional launcher
        ├─ current shell
        ├─ tmux
        └─ future terminal adapters
```

## Detailed `dru89/sesh` fit analysis

### Current capabilities

The upstream README describes `sesh` as a unified coding-agent session browser. Current `main` supports:

- fuzzy picker across providers;
- built-in OpenCode and Claude Code providers;
- `sesh list`, `show`, `resume`, `stats`, `index`, `recap`, and `ask`;
- JSON output for scripts and external UIs;
- configurable native resume commands;
- external providers through a JSON list command and resume-command template;
- optional LLM-generated summaries and natural-language search;
- a Raycast extension and agent skill.

OpenCode discovery reads `~/.local/share/opencode/opencode.db` and extracts session title, slug, directory, and first prompts. Default resume is `opencode --session {{ID}}`. Configuration can override that with the local wrapper, for example:

```json
{
  "$schema": "https://raw.githubusercontent.com/dru89/sesh/main/schema.json",
  "providers": {
    "opencode": {
      "resume_command": "oc --session {{ID}}"
    }
  }
}
```

Before adopting this configuration, verify that the shell wrapper generated by `sesh init zsh` changes into `{{DIR}}` before calling `oc`; `bin/oc` depends on the current directory for project-root selection.

### What it may already eliminate

If the local fit check succeeds, `sesh` could eliminate the need to build:

- provider discovery;
- cross-provider fuzzy search;
- shell handoff and native resume;
- JSON/CLI integration;
- basic detail views;
- summary, recap, and natural-language history lookup.

### Missing or unproven local requirements

The current README does not demonstrate:

- recursive OpenCode `parent_id` tree rendering;
- root → subagent status aggregation;
- paged full transcript/timeline navigation;
- current OpenCode `busy`, `retry`, permission, or waiting status;
- direct integration with the existing `bin/oc` backend policy;
- tmux launch into the named `opencode` session without becoming a tmux owner;
- Gruvbox/local-keymap parity.

These are the fit-check criteria, not assumptions that the project cannot support them.

## `dru89/sesh` version audit

Audit time: 2026-07-19 UTC.

### Local state

- `dru89/tap` is not tapped locally.
- `sesh` is not installed as a Homebrew cask.
- `command -v sesh` returned no executable.
- No installation or tap mutation was performed during this research.

### Stable release and cask

| Source | Version | Date | Verdict |
|---|---:|---|---|
| GitHub latest stable release | `v1.1.1` | 2026-04-27 20:41:36 UTC | Latest packaged stable |
| `dru89/homebrew-tap` cask | `1.1.1` | 2026-04-27 20:41:37 UTC | Exactly current with stable release |
| Local installation | none | n/a | Nothing installed to compare |

The cask points directly to the `v1.1.1` GitHub release archives for Darwin/Linux on amd64/arm64. It was updated one second after the release commit, so there is no stable-version lag.

The cask deliberately skips Homebrew livecheck:

```ruby
livecheck do
  skip "Auto-generated on release."
end
```

Therefore `brew livecheck` does not detect unreleased upstream commits.

### Upstream `main`

- HEAD: `c4e7f81c2024e3ca2c8545ed631b219520d0e1c9`.
- HEAD date: 2026-07-06 20:56:11 UTC.
- Distance from `v1.1.1`: six commits ahead, zero behind.
- Status: unreleased.

Unreleased commits:

| Commit | Date | Subject |
|---|---|---|
| `f376fa99` | 2026-04-28 | Fix PowerShell wrapper behavior |
| `ffd7d21a` | 2026-04-28 | Anchor TUI help bar with a tall detail pane |
| `9cb125b3` | 2026-04-28 | Fix Windows test failures |
| `0037ca07` | 2026-04-28 | Add Windows CI and release workflow |
| `bbfe9434` | 2026-04-28 | Update contributor/release documentation |
| `c4e7f81c` | 2026-07-06 | Keep picker on screen and prefer summaries over raw titles |

### Version verdict

- **Freshest stable binary:** Homebrew cask `1.1.1` and GitHub release `v1.1.1`; they are identical in version.
- **Freshest source code:** upstream `main`, six commits ahead of the stable release.
- **Most recent user-visible unreleased change:** the July 6 picker/summaries fix.
- **Recommended evaluation baseline:** install the stable cask first, then test `main` only if the picker behavior or summaries issue is relevant.

Installing unreleased source would require an explicit source build such as `go install ...@main`; that was not performed and should not be treated as a normal stable installation path.

### Primary sources

- Repository: https://github.com/dru89/sesh
- Release: https://github.com/dru89/sesh/releases/tag/v1.1.1
- Stable-to-main comparison: https://github.com/dru89/sesh/compare/v1.1.1...main
- Current HEAD: https://github.com/dru89/sesh/commit/c4e7f81c2024e3ca2c8545ed631b219520d0e1c9
- Homebrew tap: https://github.com/dru89/homebrew-tap
- Cask source: https://github.com/dru89/homebrew-tap/blob/879d7f95fcf81232560152ca3ecba3ccb2a69ade/Casks/sesh.rb
- Cask update commit: https://github.com/dru89/homebrew-tap/commit/879d7f95fcf81232560152ca3ecba3ccb2a69ade

## Recommended product boundary if custom work remains necessary

### MVP

1. OpenCode root-session list grouped by project/directory.
2. Recursive child/subagent tree.
3. Lazy timeline for messages, tools, compaction, and errors.
4. Search over title, directory, agent, model, and message text.
5. Read-only detail panel with timestamps, tokens, cost, and IDs.
6. Resume through `cd <directory> && oc --session <id>`.
7. Optional one-shot tmux launch.

### Explicitly excluded from MVP

- creating or deleting worktrees;
- starting and supervising background agents;
- sending prompts through tmux;
- installing plugins, skills, MCP servers, or hooks;
- changing permission or sandbox modes;
- committing, merging, or opening pull requests;
- remote dashboards, bots, bridges, or telemetry;
- destructive session deletion;
- pretending persisted timestamps are authoritative live progress.

### Adapter boundary

Use provider capabilities rather than assuming a universal schema:

```text
SessionProvider
  list_roots()
  list_children(parent_id)        optional
  timeline(session_id, cursor)    optional
  search(query, scope)            optional
  resume_spec(session_id)
  capabilities()

Launcher
  current_shell(spec)
  tmux_window(spec)               optional
```

The provider returns data and an argument-vector launch specification. It must not execute shell-interpolated titles, paths, or transcript content.

### Persistence policy

- Treat each agent's native store as authoritative.
- Open stores read-only and detect unsupported schemas.
- Do not invoke vendor initialization code during discovery if it may migrate data.
- Start with direct queries and bounded in-memory filtering.
- Add a rebuildable sidecar index only after measuring search against the full corpus.
- Never let deleted transcript content survive indefinitely in an undocumented cache.

### Live state policy

MVP status should be honest:

- recent;
- stale;
- archived;
- child count;
- last event type.

Later, an optional OpenCode server adapter may provide `busy`, `retry`, permission, or waiting state. tmux/process existence is a separate runtime observation and must not be conflated with transcript truth.

## Stack recommendation for a custom implementation

Preferred initial stack:

- Go;
- Bubble Tea v1;
- Bubbles v1;
- Lip Gloss v1;
- `database/sql` with a read-only SQLite driver;
- `context.Context` for cancellable previews;
- `os/exec` with direct argument vectors;
- external provider adapters over JSON when needed.

Why Go:

- Bubbles already provides list filtering, pagination, viewport, spinner, help, and text input;
- Bubble Tea supports asynchronous commands and terminal handoff to child processes;
- a single binary is easy to install through the existing dotfiles/package workflow;
- the expected workload is local SQLite reading and terminal rendering, not a systems-performance bottleneck.

Ratatui/Rust remains reasonable if existing reusable parser code appears in Rust or maintainership preference changes. Corpus size alone does not justify the additional implementation surface.

## Personalization points

- Theme: Gruvbox-derived colors matching `.config/opencode/tui.json` and `.tmux.conf.local`.
- Navigation: vi-style `j/k`, `/` search, `Enter` current-shell resume, `t` tmux launch, `y` copy ID, `e` export.
- Layout: session tree, transcript preview, compact metadata/status line.
- Default launch: current shell through `bin/oc`.
- Optional tmux launch:

```sh
tmux new-window -t opencode -c "$directory" "oc --session $session_id"
```

The implementation must use argument vectors rather than assembling this example through an unquoted shell command.

- Do not occupy `<prefix>+Space` because tmux-fzf already owns it.
- Do not duplicate local `Ctrl-K/Ctrl-L` OpenCode root-session cycling.
- Do not use numeric tmux session names as durable references.

## Adoption kill gate

Before custom coding, install and use the stable cask through its real TUI surface.

Evaluate:

1. Does OpenCode discovery remain responsive with 1,656 sessions?
2. Does fuzzy search cover first prompts and project directories well enough?
3. Can `resume_command` safely delegate to `bin/oc` after changing to the recorded directory?
4. Can the provider be extended to expose `parent_id` without creating a second index?
5. Can the UI render a recursive tree and paged timeline without fighting its current model?
6. Does the stable `1.1.1` picker behave acceptably, or is the unreleased July 6 fix required?
7. Can all optional LLM indexing remain disabled unless explicitly configured?

Decision:

- **Adopt/configure** if the first three pass and tree/timeline are small upstreamable extensions.
- **Fork** if the core is suitable but the provider/UI contracts need focused changes.
- **Build new** only if hierarchy and timeline require replacing the central model or if `bin/oc` integration cannot be made safe.

## Open questions

- How does stable `sesh 1.1.1` perform against the full local OpenCode database?
- Does its current SQLite query include child sessions, and if so, are they flattened?
- Does `sesh init zsh` preserve the exact working directory needed by `bin/oc`?
- Can details be extended without triggering optional LLM summarization?
- Should a future Codex adapter use Codex state SQLite, rollout files, or an app-server protocol?
- Should Claude discovery remain defensive JSONL parsing or delegate details to the Claude CLI/SDK?

## Next action

With explicit approval to install software:

```sh
brew install --cask dru89/tap/sesh
```

Then perform real-surface QA against OpenCode sessions before modifying dotfiles configuration or beginning implementation.
