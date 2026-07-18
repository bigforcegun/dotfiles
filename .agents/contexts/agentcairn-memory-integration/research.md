# Memory Research

## Sources

- OpenCode session `ses_0a3641edaffbrF0tIldKySGwqQ`, 2026-07-13 to 2026-07-15.
- OpenCode patch research `ses_0990aca4effeGKAVvf5J85GSHP`, 2026-07-15.

## Cerebro and the mount idea

| Fact | Conclusion |
|---|---|
| Cerebro is CLI-first and treats SQLite as canonical storage. | A live bidirectional Markdown view needs a connector, stable IDs, deletion/restore, and reconciliation semantics. It is not a small mount. |
| A mount only exposes files; it does not solve ownership, conflicts, or deletion. | Do not use FUSE, network mounts, or symlinked vault roots for the first version. |
| Obsidian works best with a single local native tree. | If this integration is revisited, Markdown must be canonical and Cerebro's index derived/rebuildable. |

## Talon and AgentCairn

| Fact | Conclusion |
|---|---|
| Talon accepts an Obsidian vault natively. | It is a strong second-brain candidate, not the chosen coding-agent memory engine. |
| AgentCairn writes ordinary Markdown notes and provides local recall/MCP tools. | It is the closest ready operational-memory layer for this workspace. |
| The AgentCairn vault is `/Users/bigforcegun/Nextcloud/documents/notes/LLM/Memory`. | Human-editable Markdown remains the durable memory surface. |

## AgentCairn installation facts

- `agentcairn 0.24.2` was installed with `uv`; the OpenCode integration matched the then-current upstream release.
- `~/.agentcairn/config.toml` is linked from `.agentcairn/config.toml` in this repo.
- Retrieval is local: `fastembed` with `nomic-ai/nomic-embed-text-v1.5`; `judge = "embedding"`; no API key was configured.
- The `agentcairn` MCP server was connected through OpenCode. The auto-plugin is now disabled, so automatic recall and sweep do not load at OpenCode startup.

## Why stock sweep is unsafe here

- `cairn sweep` is a global batch ingest, not a current-session capture primitive.
- The stock OpenCode adapter reads every session row, including `parent_id != NULL` subagents, then accepts user text parts. It ingested OMO initiator/control content; three generated junk notes were removed and the vault reindexed.
- A measured day with 84 sessions wrote 3 notes but reached 10.5 GB peak RSS. Full-history ingest is not acceptable.
- Concurrent sweeps contend for one vault writer lock; later runs fail with `vault is busy` rather than queueing.

## Librarian result capture

- The local OpenCode DB currently has 195 `agent = "librarian"` child sessions; each has `parent_id`, title, and separate message/part rows.
- Sample Librarian sessions had one user task, many assistant tool/reasoning rows, and a completed assistant response with a `text` part.
- A research-memory selector must use the final completed assistant text response from a whitelisted agent. It must never capture the subagent's task prompt, tool output, or internal reminders.

## Why capture needs two lanes

- The local DB has 321 root sessions and 603 subagent sessions; subagents are 65.3% of all sessions.
- Recent daily workload reached 88 subagents versus 13 root sessions. OMO fan-out is bursty and dominates session count.
- Librarian final text averages about 5.6k characters, while its task/tool trace must not become memory.
- Conclusion: root-user capture and research-result capture need independent queues, cursors, frequency, and budgets. An unscoped OpenCode sweep is not an operational capture mode.

## Project Brief architecture research

The 2026-07-19 research pass compared Cerebro, AgentCairn, OpenClaw, Letta, Basic Memory, Hermes, Hindsight, Link, ai-memory, Ori Mnemos, memsearch, and adjacent systems.

- Mandatory project facts belong in a deterministic Project Brief, not semantic top-K or Cerebro `--prime`.
- For one foreign repository, the simplest delivery path is an external Markdown brief referenced by an external OpenCode config selected through `OPENCODE_CONFIG`.
- A project-specific launcher should validate the checkout and brief before starting OpenCode.
- AgentCairn remains optional historical memory; it does not own or inject the brief.
- Autosweep is unnecessary for the core scenario. Manual capture is sufficient; later automation may create review candidates only.
- A general `project_key`/`checkout_key` registry is deferred until multiple projects or clones create actual routing pressure.
- A dynamic OpenCode plugin is deferred because the relevant transform and compaction hooks are experimental and require version-specific contract tests.
- No audited product satisfies the complete OpenCode + foreign-repository + deterministic-primer + local Markdown/vector requirement as a drop-in.

The durable decision and phase boundaries are in `project-brief.md`.
