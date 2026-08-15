# External Project Brief Decision

## Status

Decision complete; not implemented.

This document supersedes the earlier assumption that deterministic project orientation must begin with an AgentCairn `project_context` registry and MCP tool.

## User scenario

A foreign repository must receive private, project-specific facts on every OpenCode dialogue without adding files to that repository. Example: a local .NET API must always be started with a particular project, bind address, port, and health check.

That information is not ordinary semantic memory. It is a small mandatory **Project Brief**.

## Durable decision

Use two separate channels:

```text
external Project Brief
  owns: mandatory curated project facts
  delivery: direct OpenCode instructions
  ranking: none

AgentCairn
  owns: optional decisions, fixes, gotchas, and historical context
  delivery: explicit project-scoped MCP recall
  ranking: semantic/lexical as appropriate
```

The Project Brief may live in the AgentCairn/Obsidian vault for human convenience, but AgentCairn does not select, rewrite, rank, or inject it.

## Phase 1 — one project

Do not build a generalized project registry, new MCP tool, graph traversal, or OpenCode plugin.

1. Store one external Markdown brief under a user-owned path outside the repository.
2. Create a dedicated external OpenCode config whose `instructions` array references the brief by absolute path.
3. Start OpenCode through a project-specific launcher that selects the config with `OPENCODE_CONFIG`.
4. Before launch, validate that the brief exists and the current checkout matches the launcher binding. Refuse startup on mismatch.

OpenCode merges the external config with its other configuration sources. Absolute instruction paths are resolved and automatically included as model context.

Example brief:

```markdown
# Project Brief: Widget

## Local API startup

- Applicability: the Widget repository only.
- Working directory: repository root.
- Start with:
  `dotnet run --project src/Widget.Api/Widget.Api.csproj --urls http://127.0.0.1:5074`
- Expected URL: `http://127.0.0.1:5074`.
- Health check: `GET http://127.0.0.1:5074/health`.
- Do not bind to `0.0.0.0` unless explicitly requested.
- If the port is occupied, report it; do not kill the owner automatically.
```

Keep the first brief as plain Markdown. Add structured executable profiles only if automatic command execution becomes a real requirement.

## Guarantee boundary

Keep three claims separate:

1. **Host delivery:** OpenCode inserted the brief into model context.
2. **Model compliance:** the model followed the brief.
3. **Runtime success:** the remembered command started and became healthy.

Only host delivery can be deterministic, and only for the validated launcher path. No memory system guarantees model compliance or process success.

## AgentCairn policy

- Keep the ambient OpenCode plugin disabled.
- Keep autosweep out of the Project Brief path.
- Prefer manual `remember` for decisions, fixes, and gotchas.
- Use focused project-scoped `search`/`recall` only when the current task depends on history.
- Never use semantic top-K, `related:`, graph neighbors, importance, or pinned metadata to deliver mandatory startup facts.
- If optional extraction returns later, it writes provenance-bearing candidates for review; it never edits the Project Brief.

## Phase 2 — multiple projects or clones

Add an external registry only when multiplicity creates real routing pressure:

```text
project binding → external brief path → optional AgentCairn scope
```

Then distinguish:

- `project_key`: portable repository identity, normally an explicit override or normalized selected remote;
- `checkout_key`: local clone/worktree identity, normally based on Git common directory plus local binding.

Do not silently rekey on remote changes. Fork/upstream selection, multiple remotes, no-remotes, and checkout-specific ports require explicit bindings or confirmation.

## Phase 3 — transparent automatic selection

Use a global OpenCode plugin only after project launchers become inconvenient and version-specific contract tests exist.

The current dynamic seam is:

```text
verified session metadata
  → external project binding
  → bounded idempotent brief
  → experimental.chat.system.transform
  → experimental.session.compacting
```

This API is experimental. Retries can repeat transforms, some calls have no session ID, and system-message mutation can affect provider caching. Treat it as a tested convenience layer, not an unconditional guarantee.

## Systems research distilled

- **OpenClaw** and **Letta** validate the architectural split between bounded core/bootstrap context and searchable archival memory.
- **Cerebro** provides an attractive local SQLite/vector/graph substrate, but `recall --prime` remains ranked selection and has no required/core startup-memory field.
- **AgentCairn** remains the preferred optional recall layer for this setup because Markdown is authoritative and its index is derived.
- **Basic Memory** contributes useful later ideas: named external projects, stable external IDs, and richer context traversal.
- **Hermes** contributes reusable lifecycle concepts: current-query prefetch, serialized writes, flush barriers, and session boundaries.
- **Hindsight** provides the strongest model for raw evidence, derived observations, and correctable higher-level knowledge.
- **Link v1.7** is the closest lightweight prototype but still uses basename identity, opt-in hooks, and has no OpenCode lifecycle support.
- **ai-memory** offers Markdown authority, pinned pages, and OpenCode integration, but adds a server, marker/basename routing, and non-local embedding defaults.

No audited system is a drop-in for the complete requirement set. The smallest custom surface is the launch-scoped brief binding, not a new memory engine.

## Acceptance

- The foreign repository remains unmodified.
- Launch from the expected checkout includes the external brief.
- Launch from a different checkout refuses instead of injecting the wrong brief.
- A missing brief fails visibly before OpenCode starts.
- The exact localhost command can be answered without semantic recall.
- AgentCairn/index failure does not affect brief delivery.
- Adding another clone requires an explicit binding before checkout-specific facts are shared.

## Source trail

The exhaustive journal remains under `.omo/ulw-research/20260718-234426/`; its primary synthesis is `SYNTHESIS.md`. This document is the durable distilled decision and should be sufficient for future implementation work.
