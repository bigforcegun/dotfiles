# Cross-agent workspace

[[DOTFILES]]

`.agents/` is the repo-local root for agent-readable plans and context. It is a realm:
a physical storage layer that travels with this repository. Folders exist for
management, never for structure.

One workstream equals one folder under `contexts/`. Inside it, keep only files that
contain real content. No placeholder files.

## Reading order

1. Open [[DOTFILES]] — the hub. There is no generated index; the corpus is whatever
   links back to it.
2. Pick the matching context from its backlinks.
3. Read its entry note.
4. Follow only the links the task needs. The entry note answers most questions alone.

## Layout

```text
contexts/
  2026-06-21-mcp-stack/                # <created>-<name>
    2026-06-21-mcp-stack.md            # entry note, named after the folder
    2026-06-28-mcp-stack-plan.md       # every note carries a YYYY-MM-DD- prefix
    2026-06-28-mcp-stack-research.md
```

Entry note frontmatter:

```yaml
---
updated: 2026-06-21      # when the workstream last moved, not when a byte changed
status: active           # active | paused | blocked | done | archived
next: one line
---
```

The slug and the creation date are not fields — they are the folder name, and the
entry note repeats it. Nothing that the filesystem already states is stored twice.

## Links

A note knows nothing about the folder it sits in. Links are flat: never a path, never
a folder segment. Every note name is therefore unique across the whole realm — that
uniqueness is what makes flat linking possible, and `dot-agents-ctl check` enforces it.

| Target | Form |
|---|---|
| The hub | `[[DOTFILES]]` — every entry note carries it, right under the H1 |
| A context | `[[2026-06-21-mcp-stack]]` — its entry note |
| A note | `[[2026-06-28-mcp-stack-plan]]` — the filename, no path, no `.md` |
| With display text | `[[2026-06-21-mcp-stack\|the MCP fleet design]]` |
| Anything outside the realm | a normal Markdown link, never `[[ ]]` |

Root notes — the hub and this rulebook — carry no `YYYY-MM-DD-` prefix. A date says
when a workstream started; the hub has no start. Everything under `contexts/` is dated.

Generic note kinds (`plan`, `research`, `decisions`, `handoff`) carry the context slug
in the filename so the name still means something when read outside its folder.

- Naming a note in prose means linking it. A filename in backticks is not a link — the graph cannot see it.
- Links live in the body, never in frontmatter. Frontmatter holds state; the graph holds structure.
- A `## Related` section at the end of an entry note carries one line per link saying *why* the two are related. An unexplained link is a dead one.
- A broken `[[link]]` is a warning — it marks something worth writing. A note nobody links to is an error: it has fallen out of the tree and no reader will ever reach it.
- `[[ ]]` resolves inside this repository's `.agents/` only. It never points into the Claude memory vault, which uses the same syntax for a different realm.
- Not every context has relatives. An honest orphan beats a manufactured link.

## Rules

- Nothing here is generated. The tree is the link graph, and it is maintained by hand.
- An entry note without `[[DOTFILES]]` is an error, not a warning — it drops out of the
  tree silently, and only `dot-agents-ctl check` will say so.
- Directory and note names are derived. Never rename them by hand.
- `dot-agents-ctl check` is the authority on the schema — run it after touching anything here.
- Watch which realm you write to. No `.agents/`, no writing — a context belongs to the repository it describes.
- No secrets, tokens, full transcripts, or raw logs. Transient material goes to `.omo/` or another ignored location.
