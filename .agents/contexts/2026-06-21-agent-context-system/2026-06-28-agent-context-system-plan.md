# Agent Context System — plan

## Goal

Make `.agents/` the repo-local home for cross-agent workstream context while keeping the structure light enough for simple dotfiles tasks.

The system should help an agent answer three questions quickly:

1. What contexts exist?
2. Which files should I read for this task?
3. What is canonical now versus legacy/reference material?

## Non-goals

- Do not build a full project-management system.
- Do not create mandatory placeholder files for every workstream.
- Do not duplicate raw session transcripts or bulky command output.
- Do not move sensitive configs, auth material, or raw logs into `.agents/`.
- Do not require OpenCode/Claude/Cursor-specific config changes to use the convention.

## Convention

Root:

```text
.agents/
  README.md
  INDEX.md
  contexts/
    <slug>/
      README.md
      2026-06-28-agent-context-system-plan.md      # optional
      2026-06-28-agent-context-system-research.md  # optional
      decisions.md # optional
      handoff.md   # optional
      evidence.md  # optional
```

Rules:

- One workstream equals one folder under `.agents/contexts/`.
- `README.md` is the only required file in a context.
- Add [[2026-06-28-agent-context-system-plan]], [[2026-06-28-agent-context-system-research]], `decisions.md`, `handoff.md`, or `evidence.md` only when the content exists.
- Prefer lower-case stable filenames inside contexts.
- If there are multiple active plan variants, keep [[2026-06-28-agent-context-system-plan]] as the current candidate and use `plan-v2.md` only while comparison is still needed.
- Keep `.agents/INDEX.md` short. It is a routing table, not a changelog.

## Current migration model

Existing scattered plans were ported into context folders:

| Old source | New context-local file |
|---|---|
| `docs/mcp-stack/PLAN.md` | [[2026-06-28-mcp-stack-plan]] |
| `docs/mcp-stack/PLAN2.md` | [[2026-06-28-mcp-stack-plan-v2]] |
| `docs/mcp-stack/RESEARCH.md` | [[2026-06-28-mcp-stack-research]] |
| `docs/mcp-stack/OMO.md` | [[2026-06-28-omo]] |
| `docs/opencode-optimisations-ep1/PLAN.md` | [[2026-06-28-opencode-mcp-lazy-loading]] |
| `docs/dotfiles-access-audit-plan.md` | [[2026-06-28-dotfiles-access-audit-plan]] |
| `.omo/plans/oc-project-discovery.md` | [[2026-06-28-oc-project-discovery-plan]] |

Legacy files remain in place for now to avoid breaking links. Future edits should happen in `.agents/contexts/*`; legacy docs can later be replaced with pointers or removed in a separate cleanup.

## Acceptance criteria

- A new agent can start from `.agents/INDEX.md` and find the right context in under one minute.
- A simple task does not require creating any files except possibly a context `README.md`.
- Existing plan content lives next to related research/context instead of being split by global type folders.
- No empty `DECISIONS.md`, `HANDOFF.md`, `LOG.md`, `EVIDENCE.md`, or `artifacts/` folders are created by default.
- Runtime state remains outside `.agents/` unless deliberately summarized.

## Open decisions

1. Whether to eventually add `AGENTS.md` guidance that tells agents to read `.agents/INDEX.md` for planning/research tasks.
2. Whether legacy `docs/` files should become symlinks, short pointers, or be removed after the context migration stabilizes.
3. Whether `.agents/tmp/` should be added to `.gitignore`; this requires explicit permission because `.gitignore` edits are protected in this repo.
