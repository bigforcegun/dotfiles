# Migrating an old corpus

Read this only when `.agents/` already exists but does not follow the rules — no
frontmatter, undated folders, `README.md` entry files, references written as paths.
Once per repository, then never again.

Work on a branch. Every step below is reversible until you commit.

## 1. Structure

Run `dot-agents-ctl init --templates <this skill>/templates`. It adds only what is
missing: `contexts/`, the hub note named after the repository, and the rulebook.
Existing files are left alone.

Read the rulebook it just wrote. Everything below is that rulebook applied to files
that predate it.

## 2. Note names — first, and before any dates on folders

Every note name must be unique across the whole corpus, because links are flat and
carry no path. Generic kinds collide constantly: five folders each holding a
`plan.md` are five notes with one name.

- generic kinds (`plan`, `research`, `decisions`, `handoff`, `evidence`) take the
  context slug: `mcp-stack-plan.md`;
- already-specific names (`chat-pulse-line.md`) stay as they are — they read fine
  outside their folder, which is the whole test.

## 3. Dates

- every note gets a `YYYY-MM-DD-` prefix. Take the date from `git log --diff-filter=A`
  on the file. Where the prose remembers an earlier date than git, git is recording
  when the file was moved into `.agents/`, not when the work started — take the
  earlier one and flag it for the user to confirm;
- every context folder becomes `<created>-<slug>`;
- the entry note is renamed to match its folder: `2026-06-21-mcp-stack.md`. There is
  no `README.md` in this scheme — a folder is not a link target.

Use `git mv` so the history survives.

## 4. Links — one pass, last

**Do not rewrite references as you go.** Finish every rename first, build the complete
old-name → new-name map, then walk the corpus once.

This is the step that has gone wrong every single time it was done incrementally. A
pass that only knows part of the map sees `plan.md`, finds five candidates, and picks
the first — so `mcp-stack` ends up pointing at the plan belonging to another context.

Convert, in this order:

- relative paths (`../other-context/`, `contexts/foo/bar.md`) → `[[bar]]`;
- backticked filenames in prose → `[[name]]`. Naming a note without linking it leaves
  it invisible to the graph;
- every entry note gets `[[<hub>]]` directly under its H1, or the context drops out of
  the tree.

Frontmatter is not touched: links live in the body only.

## 5. The audit `check` cannot do

`dot-agents-ctl check` verifies that links **resolve**. It cannot verify that they
resolve to the *right* note — a misdirected link points at a real file and passes
cleanly.

So after step 4, walk it yourself: for every note, list the link targets that are not
files in its own folder. Each one must be a deliberate cross-context reference. In
practice a handful are genuine and the rest are wreckage from a careless rename.

## 6. Close out

`dot-agents-ctl check` must exit 0. Then read the diff — mass renames deserve human
eyes before they become history.
