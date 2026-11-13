# Tool-level checks

Load when the repo targets a specific harness. Findings here use the same tags
as the core rules.

## Claude Code

- Reads `CLAUDE.md`, **not** `AGENTS.md`. A repo with only `AGENTS.md` and no
  bridge is `missing:` — the bridge is either a first-line `@AGENTS.md` import
  or a symlink. Both are correct; symlinks need admin or Developer Mode on
  Windows, which is the only reason to prefer the import.
- A bare `@token` outside backticks **is an import**. An email address, a
  handle, or `@types/node` in prose silently pulls a file or breaks. High-value
  `stale:` check, and almost never caught by hand.
- Imports resolve up to **4 hops** and do not reduce context — everything loads
  at launch. Splitting a long file into imports is `bloat:` disguised as
  organisation.
- The hierarchy **concatenates**: managed policy → user → project → local, root
  down to cwd, `CLAUDE.local.md` last within a directory. Nothing overrides
  anything, so contradictions across levels are `conflict:`.
- Path-scoped content belongs in `.claude/rules/*.md` with `paths:` frontmatter.
  A rule without `paths:` loads every session like `CLAUDE.md` — check that the
  frontmatter is actually there when the file's content is path-specific.
- `paths:` does **not** exist in `SKILL.md`; skills load by description match.
  A `paths:` key in a SKILL.md frontmatter is a `misplaced:` finding.
- Multi-step procedures belong in a skill. Anything that must happen every time
  without exception belongs in a hook — `CLAUDE.md` is advisory, hooks are
  deterministic. A "always run X before committing" line is `misplaced:`.
- Block-level HTML comments are stripped before injection: maintainer notes are
  free, so suggest them instead of deleting context the human wants recorded.
- Auto-memory `MEMORY.md` loads only its first 200 lines / 25 KB.

## Codex

- Chain: `~/.codex/AGENTS.override.md` → `~/.codex/AGENTS.md` → every
  `AGENTS.md` from git root down to cwd. Later means closer means stronger.
- `project_doc_max_bytes` defaults to **32 KiB for the whole chain**, and
  overflow is dropped **silently**. In a monorepo the cap is consumed by the
  sum, not by any one file — measure the chain, not the file.
- `AGENTS.override.md` at any level replaces that level entirely.
- `--print-instructions` dumps what actually merged. Prefer it over inference
  when the chain is non-trivial.
- OpenAI's own guidance: keep lint and format checks in CI, not in the file.

## GitHub Copilot

- Three mechanisms coexist: `.github/copilot-instructions.md` (repo-wide),
  `.github/instructions/*.instructions.md` (needs `applyTo` glob frontmatter),
  and `AGENTS.md` anywhere with nearest-file precedence. A root `CLAUDE.md` or
  `GEMINI.md` is accepted as an alternative.
- GitHub's stated limits: **no longer than 2 pages**, and **must not be task
  specific**. A task-shaped instruction here is `misplaced:` — it belongs in a
  skill or prompt.
- Repo-wide and path-specific instructions both apply when both match; they do
  not override. Priority runs personal → repository → organization.

## Cursor

- `.cursor/rules/*.mdc` with `alwaysApply`, `description`, `globs` selecting
  one of four activation modes.
- A `.md` file in `.cursor/rules/` without frontmatter is **ignored silently** —
  always a finding, and invisible without checking.
- Cursor's own limit is <500 lines per rule, and its own advice matches the
  core method: add a rule only after the agent repeats a mistake.
- `.cursorrules` is legacy. Flag it as `misplaced:` in a new repo, but do not
  flag it in a repo that has carried it for years unless something else reads
  the content.
