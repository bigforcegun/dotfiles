# Salotech layer checks

**Load only if a marker matches.** Otherwise this file does not apply and its
rules must not appear in the report.

Markers: a git remote under `KosyanMedia` or `aviasales`; or the repo already
carries the `AGENTS.md` + `CLAUDE.md`-symlink pair together with `.claude/`
skills or commands committed alongside it.

**Status: proposed, not ratified.** The layer architecture is an active
initiative under discussion (UP-810 was in Grooming as of 2026-08-18). Report
deviations as `layer:` findings, never as violations, and never let them
outrank a deliberate decision the user states in chat. Their own architecture
requires exactly this: a conflict gets surfaced, the human chooses, and a
choice against the shared rule is treated as a signal the shared rule may be
stale — not as an error.

## The three layers

Every rule belongs to exactly one:

- **Code** — bound to a place in the tree: repository → service → package.
  More specific refines less specific; all of them bind.
- **Team** — cross-cutting agreements that travel with the team across every
  project: error handling, test style, interface style. This layer is the core
  of the initiative and is meant to stay **small**.
- **Personal** — a person's own config, workflow, and skills. Lives in the home
  directory, outside the repo, and travels with the person.

`layer:` findings:

- A team-wide agreement sitting in someone's personal config. A personal skill
  may *reference* a team rule but must never be its **source** — otherwise the
  shared rule is reachable only through one person's setup.
- A package-specific detail hoisted into the repo root, or a repo-wide rule
  buried in one package.
- Team or code rules written so they apply outside the org's repositories.
  Those layers are scoped to their projects by design.

## Reachability

A rule must reach the agent **explicitly**. Delivering it as a bare link the
agent may never open is disallowed outright.

This narrows, and does not contradict, the core `enforced:` rule. Naming where
enforcement lives (`ruff.toml`, the CI job) is a pointer to machinery. Handing
the agent a URL and hoping it fetches the rule is a delivery failure. Flag the
second; never flag the first.

## Machine-checkable versus judgement

Format and code style go to the linter, hard. Modularity, readability, and
architecture cannot be linted and belong in the rule sets and human review.
This is the same boundary as the core `enforced:` rule, arrived at
independently — treat agreement between them as strong, not as duplication.

## Freshness

The committed rule: **update an app's `AGENTS.md` in the same PR that touches
its code.** That makes `stale:` mechanically checkable — compare `git log` for
the code paths against the instruction file beside them.

Their split, worth preserving in findings: stable content is maintained by hand
in the PR; drifting content (deployment maps, domain→vendor tables, JSON field
shapes) is re-captured periodically by an agent instead.

## Format

`AGENTS.md` is canonical, `CLAUDE.md` is a symlink to it. Decided twice, in the
AI tactics page and in the monolith task. Do not propose the reverse. Where
duplication across harnesses is genuinely needed, it is generated from one
source, never maintained as two hand-edited copies.

## Known internal tension

Two of their own documents disagree about the Confluence copy: the tactics page
wants it generated or reconciled from a single source, while the storage and
contribution page states these are different documents for different readers
that need no mirroring. Report it as `conflict:` when it shows up in a file.
Do not pick a side.

## Per-app core

The reference shape for a per-app file: one-line purpose · directory structure ·
key models and classes · tests and how to run them.

Directory structure here is `unproven:` by the core rules — vendors recommend
it, measurements show no benefit. Report the cost, note that a 37-module
monolith is plausibly the case the studies never covered, and leave the call to
the human. Do not cut it.
