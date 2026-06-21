# Cross-agent workspace

`.agents/` is the repo-local root for agent-readable plans and context.

The rule is intentionally small: **one workstream equals one folder** under `contexts/`. Inside that folder, keep only files that contain real content. Do not create empty placeholder files for every possible artifact type.

## Reading order

1. Read `INDEX.md`.
2. Pick the matching folder under `contexts/`.
3. Read that context folder's `README.md`.
4. Read only the files named by that README.

## File convention

Required:

- `README.md` - status, purpose, and reading order for the context.

Optional, only when useful:

- `plan.md` - active/canonical plan.
- `plan-v2.md` - alternate or superseding plan when comparison is still needed.
- `research.md` - references and investigation notes.
- `decisions.md` - durable decisions that are not already clear from the plan.
- `handoff.md` - current resume packet for another agent/session.
- `evidence.md` - curated verification index, not raw logs.
- `artifacts/` - small curated artifacts only.

Do not put secrets, auth tokens, full transcripts, raw debug dumps, or large generated logs here. Put transient material in `.omo/`, `.agents/tmp/`, or another ignored location.
