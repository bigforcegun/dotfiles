# AgentCairn Additional Tuning Plan

## Status

Proposed. This plan covers only:

1. Unix-style OpenCode maintenance owned by dotfiles.
2. User-configurable, safe OpenCode subagent memory streams.
3. Deterministic project orientation through an external launch-scoped Project Brief.
4. Deferred multi-project registry/plugin work only after the simple brief path proves insufficient.

Automatic semantic-link generation and raw-wikilink normalization remain out of scope. Project context is not implemented by changing or overloading `related:`.

## Desired Boundary

```text
dotfiles launcher + external OpenCode config
  owns: Phase 1 checkout validation and direct Project Brief delivery

dotfiles maintenance script + launchd
  owns: optional cadence, enabled streams, retries, logs, launchd ownership

AgentCairn
  owns: stream-policy validation, session selection, capture, receipts,
        Markdown writes, redaction/control rejection, reindex, and optional
        historical search/recall

OpenCode prompt policy
  owns: loading the external brief through configured instructions; semantic
        memory remains explicit MCP access
```

Do not add a `cairn opencode maintain` orchestration command. The external script composes narrow AgentCairn CLI operations.

## Invariants

- OpenCode capture is always explicit and project-allowlisted.
- No `all subagents`, wildcard agents, or implicit global discovery.
- Control prompts, tool output, reasoning, incomplete/error assistant output, and task prompts never become memories.
- Every stream has an independent stable state/receipt identity.
- Phase 1 uses one explicit checkout-to-brief binding; it does not require a generalized project identity system.
- When multi-project strict scope is implemented, one canonical `project_key` identifies the same repository across capture, state, note frontmatter, and recall, while a separate checkout identity distinguishes local clones/worktrees. `project` remains only a display label.
- AgentCairn's vault then index lock order remains canonical. Dotfiles must not add an independent shell lock.
- Retry only exit `75`; validation/configuration errors and unknown failures remain visible failures.
- Project orientation is deterministic and direct: it never competes with semantic top-K ranking or depends on AgentCairn availability.
- A Project Brief is concise and curated; detailed history remains in ordinary memories and is fetched only through focused recall.
- The Project Brief and its OpenCode config remain outside foreign repositories.

## Target User Configuration

Add a validated nested OpenCode stream table to the dotfiles-managed AgentCairn config. Example shape:

```toml
[opencode_streams.user]
enabled = true
projects = ["/Users/bigforcegun/.dotfiles"]
session_scope = "root"
reader = "authored_user_messages"
max_sessions = 10
max_candidates = 50

[opencode_streams.librarian]
enabled = true
projects = ["/Users/bigforcegun/.dotfiles"]
session_scope = "child"
agents = ["librarian"]
reader = "completed_final"
max_sessions = 5
max_candidates = 1
```

Safe defaults:

- Absent stream configuration captures nothing automatically.
- Empty `projects` or `agents` matches nothing.
- Project paths must be absolute, canonicalized, and non-wildcard.
- Unknown stream IDs fail before opening OpenCode data or vault state.
- A stream's immutable read strategy constrains its selector: root/user streams cannot capture child finals; child/final streams require exact agent allowlists and completed non-error assistant text.

Cadence belongs to dotfiles, not stream policy. The maintenance script decides when to invoke each enabled stream.

## Phase 1 Project Brief Contract

The first implementation is deliberately independent of AgentCairn:

1. Store one plain Markdown brief at a user-owned absolute path outside the foreign repository.
2. Reference that path from a dedicated external OpenCode config through `instructions`.
3. Select the config with `OPENCODE_CONFIG` in a project-specific launcher.
4. Validate the brief and expected checkout before starting OpenCode; fail visibly on absence or mismatch.
5. Keep AgentCairn MCP available only for optional historical recall.

This phase has no project registry, `project_context` MCP tool, graph traversal, auto-plugin, or machine-readable startup profile.

**Acceptance:** launching from the bound checkout loads the external brief; launching from another checkout or with a missing brief refuses before OpenCode starts; the localhost command can be answered without AgentCairn.

## Deferred Multi-Project Context Contract

Implement this section only after a second project/clone makes per-project launchers materially inconvenient.

Every canonical `project_key` may name one stable Project Brief permalink and one Project Index permalink. These are ordinary human-editable Markdown notes, but their role is explicit and validated by AgentCairn.

```toml
[project_context.dotfiles]
project_key = "<canonical repository/worktree scope ID>"
brief_permalink = "project-dotfiles-brief"
index_permalink = "project-dotfiles-index"
```

The brief is deliberately bounded and curated:

```yaml
---
title: Project Brief · .dotfiles
type: memory
permalink: project-dotfiles-brief
project: .dotfiles
project_key: <canonical repository/worktree scope ID>
role: project-brief
pinned: true
---
```

It contains purpose, project vocabulary, entry points, commands, invariants, active constraints, current focus, and links to durable decisions/runbooks. The separate Project Index is a navigational map of curated topic links. Neither note is selected by semantic ranking.

At this later phase, AgentCairn may add an explicit MCP read surface such as `project_context(project?)` for inspection and navigation. It must fail closed when no configured project context exists; it must not silently select the nearest semantic memory. Direct OpenCode brief delivery remains independent of this tool.

Do not require the model to call `project_context` to receive mandatory facts. A later dynamic OpenCode plugin may select briefs transparently only after version-specific tests cover session identity, retries, compaction, child sessions, missing session IDs, and prompt-cache behavior.

## Implementation Waves

### Wave 0 — Launch-scoped external Project Brief

**Dotfiles/OpenCode integration:**

1. Create one external brief and one dedicated external OpenCode config referencing it by absolute path.
2. Add a project-specific launcher that validates the expected checkout and brief before setting `OPENCODE_CONFIG` and starting OpenCode.
3. Keep the launcher binding explicit and local. Do not infer a portable identity from basename or semantic memory.
4. Before changing OpenCode configuration, obtain per-file approval and create the required `.bak` backup.

**Acceptance:** brief delivery works with AgentCairn unavailable; wrong checkout and missing brief fail visibly; no repository file is created.

### Wave 1 — Deferred canonical project identity

Trigger: a second project/clone, checkout-specific facts, or strict cross-machine memory scope makes explicit launchers insufficient.

**AgentCairn fork:**

1. Extract a shared repository/worktree-aware project identity helper, modeled on upstream AgentCairn PR #133 rather than `Path(cwd).name`.
2. Add `project_key` alongside existing `project` to OpenCode state, note frontmatter, DuckDB notes, and recall result data.
3. Make strict project scope compare `project_key`; preserve basename-only legacy notes as non-strict/cross-project results until an explicit migration assigns keys.
4. Normalize selected-session and project-paged capture to the same project-key path.

**Acceptance:** two distinct roots ending in the same basename never share strict recall results, cursors, or receipts; Git worktrees resolve to one repository scope according to the chosen helper contract.

### Wave 2 — Deferred AgentCairn Project Context

Trigger: Wave 0 is proven and multi-project navigation needs more than direct brief delivery.

**AgentCairn fork:**

1. Add a typed project-context registry keyed by canonical `project_key`; validate one configured brief/index pair per project.
2. Add explicit frontmatter validation for `role: project-brief` and `role: project-index`; preserve unknown human frontmatter without treating it as context policy.
3. Add `project_context(project?)` to MCP. Resolve only the configured exact project key, then hydrate the brief/index by permalink and return their authored graph neighbors separately from semantic neighbors.
4. Keep project-context notes out of ordinary semantic recall ranking changes. They are surfaced only through the explicit tool and prompt-time policy.
5. Create/migrate the current `.dotfiles` note to stable `project-dotfiles-brief` and `project-dotfiles-index` permalinks only through a previewed, reversible note migration.

**Dotfiles/OpenCode integration:**

1. Preserve direct launch-scoped brief delivery as the mandatory path.
2. Add `project_context` only for explicit inspection/navigation, not as a prerequisite for startup facts.
3. Before touching OpenCode configuration, obtain per-file approval and create the required `.bak` backup.

**Acceptance:** direct brief delivery remains deterministic; explicit context inspection returns the configured brief/index without semantic ranking; missing/ambiguous project context returns an explicit no-context result.

### Wave 3 — Stream policy primitive

**AgentCairn fork:**

1. Add a typed parser for the nested `opencode_streams` table. Do not extend the existing flat scalar knob registry.
2. Introduce a named stream registry/strategy seam over the current `user` and `research` readers and writers. Preserve the existing modes as compatibility presets.
3. Add `--stream <id>` to bounded OpenCode CLI capture. It resolves one configured policy and rejects contradictory legacy flags.
4. Use stream ID as the durable lane key; initialize/advance state lazily per configured stream.
5. Keep positive selection and existing control filtering. No stream can weaken `include_control = false` or redaction.

**Acceptance:** a configured `librarian` child-final stream works; an unconfigured agent, a root session in a child stream, an incomplete final, and an unknown stream all create no note and no cursor advancement.

### Wave 4 — External maintenance script

**Dotfiles:**

1. Add one executable Unix script, e.g. `bin/agentcairn-opencode-maintain`, that reads enabled stream IDs from the validated AgentCairn CLI JSON output and runs them serially.
2. Each invocation uses the fork explicitly through `uv run --project /Users/bigforcegun/Sources/agentcairn` with the canonical vault and state paths.
3. Retry only exit `75` with bounded backoff; return a nonzero final exit on exhaustion. Do not parse logs to determine success.
4. Emit stable, stream-scoped stdout/stderr log lines suitable for launchd log files.
5. Add one launchd owner for the maintenance script. Its schedule runs the frequent stream set; a second trigger may invoke a named low-frequency stream set, but both call the same script and remain serialized by AgentCairn locks.

**Acceptance:** two script instances cannot corrupt vault/index/state; a busy run leaves work resumable; malformed config visibly fails; logs identify stream ID and AgentCairn exit status.

### Wave 5 — Migration and cutover

1. Keep current `dev.agentcairn.opencode-user` and `dev.agentcairn.opencode-research` plists untouched until staging validation passes.
2. Validate all configured streams against a staging vault/OpenCode fixture; include same-basename projects, control text, child agents, interrupted work, and concurrent startup.
3. Install the new plist under a distinct label, run controlled user and child-final captures, and inspect receipts, project keys, vault output, index status, and logs.
4. Observe one full frequent interval and one low-frequency interval.
5. Only then unload old labels. Preserve their plist files for rollback; never delete vault Markdown, state database, or index during rollback.

## Required Tests and QA

- Config parser: absent/empty/wildcard/unknown stream fails closed; valid stream resolves deterministically.
- Stream isolation: distinct stream IDs cannot share receipts/cursors; a revision remains idempotent only inside its stream key.
- Selector safety: root/child/agent/completion/control scenarios.
- Project identity: same basename, symlink, worktree, selected-session versus project-paged consistency, and legacy note behavior.
- Launch-scoped brief: correct checkout, wrong checkout, missing/invalid brief, absolute instruction path, AgentCairn unavailable, and no repository writes.
- Project context: configured brief/index resolution, exact-key isolation, malformed frontmatter, no-context failure, authored-neighbor hydration, and semantic-ranking independence.
- Prompt-time policy: mandatory brief is direct instructions; optional historical questions use focused recall; no semantic result can substitute for a missing brief.
- Locking: simultaneous stream startup, state SQLite busy/retry behavior, vault/index exit 75, and no partial Markdown writes.
- Script surface: `--help`, one happy configured stream, invalid config, exit-75 retry exhaustion, and launchd `plutil -lint`.
- Full fork test suite plus manual staging-vault capture before cutover.

## Must Not Do

- Do not re-enable the OpenCode ambient plugin.
- Do not use stock `cairn schedule install` for OpenCode.
- Do not introduce a global `--include-subagents` or `--mode all`.
- Do not use `related:` for stream metadata or project membership.
- Do not add a wrapper-level lock as a substitute for AgentCairn locking.
- Do not make `importance`, `pinned`, or `role` implicit ranking boosts.
- Do not make Phase 1 depend on AgentCairn, MCP tool invocation, a project registry, or semantic recall.
- Do not write Project Brief/config files into foreign repositories.

## Source Research

- `.omo/ulw-research/20260716-opencode-streams-links/maintenance-research.md`
- `.omo/ulw-research/20260716-opencode-streams-links/subagent-streams-research.md`
- `.omo/ulw-research/20260716-opencode-streams-links/SYNTHESIS.md`
- `.omo/ulw-research/20260718-234426/SYNTHESIS.md`
- `project-brief.md` is the durable distilled decision; future implementation should not require the `.omo` journal.
