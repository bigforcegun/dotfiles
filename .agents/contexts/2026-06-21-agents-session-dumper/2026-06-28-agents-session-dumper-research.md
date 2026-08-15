# Agents Session Dumper Research

## Validated sources

| Client | Canonical store | Format | Explicit export | Best ingest |
|---|---|---|---|---|
| Claude Code | `~/.claude/projects/<proj>/<sid>.jsonl` plus App Support `claude-code-sessions/` | JSONL tree with `parentUuid` | No Markdown command; hooks `Stop`/`SessionEnd` expose `transcript_path` | Read files or hook |
| Codex | `~/.codex/sessions/Y/M/D/rollout-*.jsonl`, `session_index.jsonl`, `logs_2.sqlite` | JSONL linear append | No separate export; rollout is the dump | Read files |
| opencode | `~/.local/share/opencode/opencode.db` SQLite plus `storage/*.json` | SQLite/API | `opencode export <id>` JSON requires TTY; `import`; REST API | `opencode serve` API |
| Cursor | CLI: `~/.cursor/projects/<proj>/agent-transcripts/<chatId>/<chatId>.jsonl` plus `subagents/`; GUI: `.../Cursor/User/**/state.vscdb` | CLI JSONL; GUI SQLite | GUI Export Chat; CLI JSONL plus `--print --output-format json` | Read CLI `agent-transcripts`; skip GUI initially |
| Kimi / Kimi Code CLI | Not installed; likely `~/.kimi` | Unknown | Native export command with metadata and turns | Export command |

All five are dumpable. Three have explicit export paths: opencode, Cursor, and Kimi.

## Adapter styles

| Style | Clients | Benefit |
|---|---|---|
| API | opencode `/api`, Cursor `--output-format json`, Claude Code SDK | Typed and stable |
| File | Claude Code, Codex, Cursor CLI JSONL | Simple and offline |
| DB | opencode `opencode.db`, Cursor GUI `state.vscdb` | Does not require runtime |

## Push versus pull

- Push: Claude Code hook event, Kimi export command, opencode export/API.
- Pull: Codex JSONL watch, opencode DB/API read, Cursor CLI transcript read.

A collector should normalize both modes into a raw inbox, then parser adapters normalize to IR.

## Claude Code JSONL facts

Validated on 19 files.

- Group by `sessionId`, not filename. Empty/aux files exist and filename can differ from `sessionId`.
- Filter non-message records: `queue-operation`, `mode`, `last-prompt`, `attachment`, `file-history-snapshot`.
- Forks are normal: 9 of 19 files had in-file branching from rewind/edit; 3 had cross-file resume chains where a child `parentUuid` points into another file.
- `leafUuid` history represents rewinds; newest leaf is the main path.
- Skills appear as assistant `tool_use` with `name == "Skill"` and input `{skill,args}`; render as `[[skill]]`.
- Schema drifts by version, observed from 2.1.138 to 2.1.170. Parser must be a superset parser; production tools have failed on `mode`.

## Codex rollout facts

- Each line is `{timestamp, type, payload}`.
- Important types: `session_meta`, `response_item`, `event_msg`, `turn_context`.
- `response_item` can include `message`, `reasoning`, `function_call`, `function_call_output`, and `web_search_call`.
- Resume appends to the same file. Fork creates a new file.
- `session_index.jsonl` contains `[id, thread_name, updated_at]` and can drive discovery and titles.

## opencode facts

opencode is the richest observed source and should define the IR baseline.

- `opencode serve --port 4096` exposes REST under `/api`.
- `GET /api/session` returned 30 sessions with titles.
- `GET /api/session/:id/message` returns `{info:{role}, parts:[{type}]}`.
- OpenAPI 3.1 is available at `/doc`.
- Auth uses `OPENCODE_SERVER_PASSWORD`.
- TS SDK exists.

OpenAPI taxonomy includes:

- Parts: `TextPart`, `ReasoningPart`, `ToolPart`, `FilePart`, `AgentPart`, `SubtaskPart`, `StepStart`, `StepFinish`, `PatchPart`, `SnapshotPart`, `CompactionPart`, `RetryPart`.
- Messages: `User`, assistant text/reasoning/tool messages, `System`, `Shell`, `Synthetic`, `Compaction`, `ModelSwitched`, `AgentSwitched`, and tool states `Pending`, `Running`, `Completed`, `Error`.

opencode explicitly tracks subagents via `Subtask/AgentPart`, compaction, model switches, and agent switches. These are fields Claude Code requires inference for.

### opencode share

- Share URL: `opncd.ai/s/<id>`.
- Config: `"share": "auto" | "manual" | "disabled"`.
- `/unshare` deletes data and makes the session public.
- Correct web ingest is the JSON API behind the SPA, not HTML scraping.
- For network ingest, prefer a self-hosted share server with the same model privately.
- Share exists only for opencode among the validated clients.

## Cursor CLI transcript facts

- Shape is close to Claude Code: `{"role":"user|assistant","message":{"content":[{"type":"text","text":...}]}}`.
- `subagents/` contains sidechains as separate files.
- Adapter can likely share most parsing logic with Claude Code.

## Production tooling comparison

No existing tool covers the target case. The shared failure point is forks/resume plus incremental output plus wiki graph plus multi-agent rendering.

| Tool | Pipeline | Universal render | Forks/resume | Incremental | Wiki graph |
|---|---|---|---|---|---|
| claude-code-log | No | No, Claude Code only; failed on `mode` | No | No | No |
| cc2md | No | No, Claude Code only | No | No | No |
| agentfiles | No, watcher is UI | No, parser hardcoded to Claude Code | No | No | No |
| SpecStory | Yes, `watch` | No, own agents and no opencode | No | No, timestamp files | No, repo |

Additional findings:

- There is no universal renderer for all platforms. Existing tools mostly read `~/.claude/projects` and do not render opencode, Codex, or Cursor formats.
- `agentfiles` claiming 13+ agents refers to managing skills/agent files, not transcript rendering.
- A validated parser around 40 lines already handled more than the existing tools: trees, forks, and cross-file resume.
