# Agents Session Dumper Plan

## Goal

Collect sessions from all used agent clients into one central Obsidian vault as Markdown, with smart incremental behavior instead of one-off exports.

Requirements:

- Incremental append into one note per session, cursor-based, without duplicates.
- Fork/resume awareness for rewind branches, resumed sessions, and subagents.
- Skill and tool references rendered as Obsidian `[[wikilinks]]`.
- Multi-agent rendering through a common intermediate representation, not per-client Markdown hacks.
- Continuous watch pipeline where delivery is decoupled from rendering.
- Unix-style extensibility: pluggable adapters; leave a socket for remote/self-host sources, but do not build that layer yet.

## Durable decisions

- Vault target: `~/Nextcloud/documents`, likely under a subfolder such as `ClaudeSessions/`. Nextcloud sync makes the design remote-friendly without binding rendering to a remote API.
- Dump all sessions, one note per session by default.
- Write directly to files in the vault. Obsidian REST is optional transport, not the core sink.
- Adopt path is excluded: existing tools do not cover forks/resume, incremental updates, wikilinks, and multi-agent rendering together.
- Reuse conventions, not code:
  - Detail levels from `claude-code-log`.
  - Note path/frontmatter style from `agentfiles`, e.g. `Claude Sessions/<date>-<slug>.md`.
  - Watch pattern from SpecStory.

## Pipeline architecture

```
Step 1: source collectors (per client)      core                       sink
  CC      --push-- hook(Stop) --\
  Kimi    --push-- export cmd --+
  opencode--push-- API/export  --+--> raw inbox --> [parse] --> common IR --> renderer --> delivery
  Codex   --pull-- watch *.jsonl+                 (per-agent)  (tree,       (obsidian   (file-write/
  Cursor  --pull-- agent-transcripts              adapters)    forks,       md + [[]])  nextcloud/git/REST)
                                                               skills,
                                                               resume,
                                                               cursor)
```

Stages before rendering know nothing about the vault. They produce Markdown or IR into local output. Delivery is replaceable: file-write into a mounted/synced folder, Nextcloud, git, rclone mount, or Obsidian REST.

## Collector model

`SourceCollector = PushCollector | PullCollector`

- Push collectors: client produces an event/export. Examples: Claude Code hooks, Kimi export, opencode export/API.
- Pull collectors: passive stores are tailed/read. Examples: Codex JSONL, opencode DB/API, Cursor CLI JSONL.

All collectors feed a unified raw inbox before parsing.

## Common IR draft

Use opencode's typed taxonomy as the baseline because it is the richest observed schema.

```
Conversation
 ├─ source: "claude-code" | "codex" | "opencode" | "cursor" | "kimi"
 ├─ session_id, project, cwd, git_branch, agent_version, title
 ├─ created / updated, append_cursor
 ├─ skills: [SkillRef]   ·   tools: [str]
 ├─ parent / forks: [ConversationRef]
 └─ tree: Node
        ├─ id, parent_id, role, timestamp
        ├─ blocks: [Text | Reasoning | ToolCall | ToolResult | SkillCall | File | Compaction | ModelSwitch]
        ├─ is_sidechain
        └─ on_main_path: bool
```

Notes:

- `append_cursor` drives incremental updates.
- `parent/forks` represents cross-file resume and fork chains.
- `is_sidechain` covers opencode `Subtask/AgentPart`, Cursor `subagents/`, and Claude Code `isSidechain`.
- `on_main_path` distinguishes the newest leaf from abandoned rewind branches.

## Rendering shape

Default Markdown note should include:

- Frontmatter with source, session id, project/cwd, created/updated, git branch, title, append cursor, parent/fork refs.
- Main-path conversation first.
- Forks or abandoned branches as foldable callouts at divergence points.
- Skills and important tools as `[[wikilinks]]`.
- Sidechains/subagents either inline as callouts or linked companion sections, depending on IR detail.

## Open questions

1. In-file forks: render main path plus abandoned branches as foldable callouts at the divergence point, or render only the main path by default?
2. Resume chains: one note per logical conversation that stitches files together, or one note per file with `parent/forks` links?
3. opencode: render secondary tool-only `ses_*` in `~/.claude/transcripts`, or only canonical API/DB sessions?
4. Kimi: confirm local store path after installation.
5. Processor language/runtime and cursor storage format: frontmatter `last_uuid` versus external `state.json`.

## Next step

Design the common IR in detail, using opencode's taxonomy as the base, and create a mapping table from each of the five clients to IR blocks. Then prototype one `Claude Code -> IR -> Markdown` adapter writing to `/tmp` to validate output before touching the vault.

## Related memory

`claude-sessions-obsidian-dumper`
