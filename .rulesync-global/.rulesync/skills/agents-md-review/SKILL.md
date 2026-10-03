---
name: agents-md-review
description: >
  Review agent instruction files — AGENTS.md, CLAUDE.md, .claude/rules/*.md,
  .cursor/rules/*.mdc, copilot-instructions.md — for redundancy, unverifiable
  prose, tool-enforced duplication, stale commands, misplaced content, and
  context-budget overrun. Use when the user says "review AGENTS.md", "check my
  CLAUDE.md", "отревьюй agents.md", "проверь claude.md", "is my agents file any
  good", after /init or an LLM generated one, or invokes /agents-md-review.
  Also before committing a hand-edited instruction file. NOT for writing
  project code, and NOT for README or human-facing docs.
targets:
  - '*'
---
Instruction files are a tax paid on every session. Review them like production
code: each line must carry what the agent cannot get from the repo itself.
The best outcome is a shorter file.

## What these files actually do

Measured, so calibrate findings against this rather than against intuition:

- They **save steps, not IQ.** Runtime −28.6% and output tokens −16.6% in one
  study; two others found task success flat. Nothing here makes an agent
  smarter, so never justify a line by "it improves quality".
- They **cost** ~20% more inference and 14–22% more reasoning tokens. The cost
  is proven, the benefit is not. Length must earn itself.
- The one reliably measured lever is **naming a tool**: mentioning `uv` moved
  it from ~0 to 1.6 calls per task; repo-specific scripts 0.05 → 2.5. Lines
  that steer which command runs are the highest-value lines in the file.
- **Generated files hurt**: −3% success and +20% cost, while hand-written ones
  gain ~4%. Provenance is itself a finding.

## The one test

For every line: **would removing it cause the agent to make a mistake?**
If no, it goes in `Cut`. Apply this before any other rule.

## Budgets

| File | Target | Hard limit |
|---|---|---|
| `AGENTS.md` | 20–30 lines to start, ≤100 mature | Codex: whole chain capped at 32 KiB, truncated silently |
| `CLAUDE.md` | <200 lines | none, adherence degrades first |
| `copilot-instructions.md` | ≤2 pages (GitHub's own limit) | — |
| `.cursor/rules/*.mdc` | <500 lines per rule | — |
| auto-memory `MEMORY.md` | one line per entry | first 200 lines / 25 KB load |

Imports do not save context. An `@path` file loads in full at launch.

## Rules

### Content

- `dup:` **Do not restate the repo.** Project overviews, directory trees,
  dependency lists, framework facts — measured at zero benefit, and they are
  what generated files are made of. Exception: a repo with no documentation at
  all, where they measured +2.7%.
- `noise:` **Only non-default behaviour.** The one content class confirmed
  useful is non-standard practice. Language defaults, Prettier, PEP 8 — known.
- `missing:` **Name the tools you want used.** Package manager when ambiguous,
  test runner, repo-specific scripts. Strongest measured effect in the corpus.
- `vague:` **Commands are executable, with flags.** `uv run pytest tests/unit -v`,
  never "run the tests". A rule states what differs, never a virtue.
- `noise:` **Boundaries are addressed.** Three tiers — always / ask first /
  never — each naming a path, file, or command. `never modify /app/legacy/, it
  is sync on purpose` is signal; `avoid bad practices` is not a boundary.
- `enforced:` **Never re-state the toolchain.** Lint, format, types, CI: point
  at the config file. Naming where enforcement lives is fine; copying the rules
  it enforces is not.
- Check **security** explicitly. Present in only 14.5% of real files, yet
  `never commit secrets` is the single most common useful constraint found
  across 2,500 repositories.

### Integrity

- `stale:` **Verify every command and path exists.** A wrong command is worse
  than a missing one — the agent trusts it. Real files grow by addition only
  (median deletion under 15 words per commit), so drift is the default state,
  not the exception.
- `conflict:` **Contradictions resolve arbitrarily.** Across the hierarchy,
  files concatenate rather than override. Two rules disagreeing is a defect.
- `dup:` **One source of truth.** Parallel files with ~90% shared content are a
  defect. One canonical file, the rest an import or a symlink — both forms are
  valid, never flag the choice itself.
- **Nearest file wins.** Root carries what is shared; a package carries its own.

### Provenance

- `generated:` Unedited `/init` output or LLM boilerplate is a finding on its
  own, before reading the content. Tells: polite prose, a section per repo
  fact, a directory tree, "This project is a...".
- The method that works: note every correction you repeat, and promote only
  what recurred. Three independent sources converge on this.

### Contested

- `unproven:` Content whose value is asserted by vendors but measured at zero —
  repository overviews above all. **Report it, never cut it.** It goes in its
  own section, with the cost named, and the human decides. A navigation map for
  a 37-module monolith may well be the exception the studies did not cover.

## Procedure

1. **Collect.** `AGENTS.md` at every level, `CLAUDE.md`, `.claude/CLAUDE.md`,
   `CLAUDE.local.md`, `.claude/rules/**/*.md`, `.cursor/rules/*.mdc`,
   `.cursorrules`, `.github/copilot-instructions.md`,
   `.github/instructions/*.instructions.md`, `AGENTS.override.md`.
2. **Measure.** `wc -lc` per file against the budget table. For Codex, sum the
   whole chain — the 32 KiB cap applies to the concatenation.
3. **Ground.** Read the repo's own truth first: package manifests, task runner,
   lint/type/format configs, CI workflows. Redundancy must be provable.
4. **Verify.** Every command and path: does the script exist in the manifest,
   does the directory exist? Cheap, and it is where the real findings are.
5. **Judge** line by line. Load `references/agent-specific.md` for tool-level
   checks. Load `references/salotech-layers.md` only if the repo shows the
   markers listed there.
6. **Report.** Change nothing.

Never invent findings to fill a section. A lean file earns a short report.

## Report format

```
# agents-md review

<path> — <N> lines / <N> KiB — target <N>  [OK|OVER]
<path> — ...

## Cut
- <file>:L<n> `<tag>` <what it duplicates, or why it is noise>

## Fix
- <file>:L<n> `<tag>` <what is wrong>. → <the concrete replacement line>

## Move
- <file>:L<n> `<tag>` → <destination> (<why it belongs there>)

## Unproven
- <file>:L<n> <what it costs> — <why its value is unmeasured>. Your call.

## Missing
- <what the agent gets wrong without it> → <the line to add>

## Verdict
lines: <before> → <after> (-<N>%)
blocking: <the single change that matters most, or "none">
```

Omit empty sections. If the file is already tight, print `Lean. Ship it.` and
the verdict line, nothing else.

## `--fix`

Report only, by default. With `--fix` or an explicit "apply it", apply `Cut`
and `Fix`, then re-measure and print the new verdict. Never auto-apply `Move`,
`Missing`, or anything in `Unproven` — those create files, invent policy, or
overrule a human's deliberate choice. Preserve any line whose intent you cannot
verify: what looks redundant to you may be a scar from a real incident.

## Boundaries

Agent instruction files only. Not code, not README, not human docs. Does not
write an `AGENTS.md` from scratch — hand-written beats generated by every
measurement available, and a generator here would produce exactly the artifact
this skill exists to catch. For a repo with no instruction file, say so and
hand back an empty 20-line skeleton, not a filled-in one.
