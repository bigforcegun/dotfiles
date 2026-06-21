# Agent Context System — research references

## Summary

The useful community pattern is not “create many global folders by artifact type”. It is:

- one obvious agent entrypoint;
- directory-scoped context;
- one folder per workstream or memory bank;
- short routing/index files;
- optional detail files loaded on demand.

## References

### AGENTS.md

- https://agents.md/
- Pattern: root `AGENTS.md`, optionally nested `AGENTS.md` for subprojects.
- Implication: cross-agent instructions work best as directory-scoped context, not as one giant global document.

### OpenAI Codex AGENTS.md

- https://developers.openai.com/codex/guides/agents-md
- Pattern: Codex uses repository/directory instructions while working in a tree.
- Implication: keeping context near the relevant folder matches Codex-style loading.

### OpenCode rules

- https://opencode.ai/docs/rules/
- Pattern: `AGENTS.md` plus optional custom instruction files and glob loading through config.
- Implication: a root `.agents/INDEX.md` can be referenced by project rules later without forcing every session to read all details.

### Claude Code memory

- https://code.claude.com/docs/en/memory
- Pattern: `CLAUDE.md`, `.claude/rules/`, project memory, and imported files.
- Implication: entrypoint + scoped detail files is a stronger pattern than dumping all plans in one file.

### Cursor agent practices

- https://cursor.com/blog/agent-best-practices
- Pattern: plans can be saved into `.cursor/plans/`; rules live in `.cursor/rules/`; skills are loaded dynamically.
- Implication: persisted plans are useful, but they should be discoverable and not always loaded.

### Cline Memory Bank

- https://docs.cline.bot/best-practices/memory-bank
- Pattern: `memory-bank/` with `projectbrief.md`, `activeContext.md`, `systemPatterns.md`, `techContext.md`, `progress.md`.
- Implication: one context/memory folder is common, but mandatory multi-file templates can become too heavy for small repos.

### agent-work-mem

- https://github.com/daystar7777/agent-work-mem
- Pattern: `AIMemory/INDEX.md`, `PROJECT_OVERVIEW.md`, `work.log`, `archive/`, `handoff_*.md`.
- Implication: a shared folder and index are useful for multi-agent handoff; raw logs need tiering/rotation and should not be blindly committed.

### agent-contexts

- https://github.com/nijaru/agent-contexts
- Pattern: `ai/brief.md`, `journal.md`, `architecture.md`, `decisions.md`, `PLAN.md`, plus `research/` and `design/`.
- Implication: explicit AI workspace separate from `docs/` is a good fit; for this repo `.agents/` is the chosen root.

### agent-handoff-kit

- https://github.com/jimozo/agent-handoff-kit
- Pattern: `SESSIONS.md`, `SESSIONS_ARCHIVE.md`, `CONTINUE.md`, branch-per-agent handoffs.
- Implication: useful if multi-agent handoff becomes the main workflow, but too session-log-heavy for simple dotfiles planning by default.

### OpenCode memory/context plugins

- https://github.com/joshuadavidthomas/opencode-agent-memory
- https://github.com/keefetang/opencode-context-guard
- Pattern: structured memory/state files and runtime prompt injection.
- Implication: if this repo later needs enforced state, use a plugin; do not simulate enforcement with lots of empty Markdown files.

## Decision from this research

Use `.agents/` as a lightweight context root, not a memory-bank framework. Keep only real artifacts. Let the shape grow from actual workstreams.
