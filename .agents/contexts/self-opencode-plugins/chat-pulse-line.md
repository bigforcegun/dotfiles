# Chat Pulse Line Plugin Plan

## OpenCode chat pulse / task timeline line

### User intent

- Build a compact Kilo-style “chat pulse” for OpenCode.
- Desired UX:
  - a single thin line near the chat prompt, preferably directly above the input line;
  - tiny “sausage / brick” blocks showing what the current dialog is made of;
  - live pulse on the latest block while the session is busy;
  - context/token usage visible without opening a separate screen;
  - non-invasive: should not interfere with typing in the prompt.

### Kilo reference captured during chat

- Kilo names this feature **context progress graph** / **task timeline**.
- Exact search terms:
  - `TaskTimeline`
  - `ContextProgress`
  - `showTaskTimeline`
  - `context progress graph`
  - `task timeline`
  - `timeline bars`
- Kilo implementation files found:
  - `packages/kilo-vscode/webview-ui/src/components/chat/TaskTimeline.tsx`
  - `packages/kilo-vscode/webview-ui/src/components/chat/ContextProgress.tsx`
  - `packages/kilo-vscode/webview-ui/src/components/chat/TaskHeader.tsx`
  - `packages/kilo-vscode/webview-ui/src/utils/timeline/colors.ts`
  - `packages/kilo-vscode/webview-ui/src/utils/timeline/sizes.ts`
- Kilo colors blocks by message part type:
  - text / reasoning;
  - tool;
  - read-like tools;
  - write-like tools;
  - errors;
  - step finish / success.

### OpenCode search result captured during chat

- No ready-made equivalent was found in OpenCode under these exact Kilo terms:
  - `TaskTimeline`
  - `ContextProgress`
  - `showTaskTimeline`
  - `context progress`
  - `task timeline`
- OpenCode does expose the likely required raw data:
  - session messages via `sync.data.message[sessionID]`;
  - message parts via `sync.data.part[message.id]`;
  - live part events such as `message.part.updated` and `message.part.delta`;
  - TUI plugin API access to state, events, routes, keymaps, slots, and client.

### Preferred UX

Render a compact status row near the prompt:

```text
▁▃▂▆▁ ▒▒ ▇▇ ░  42% ctx  in 18k / out 2.1k / cache 9k
> user prompt...
```

If terminal width is narrow, progressively degrade:

1. blocks + context percent;
2. blocks only;
3. single busy indicator + context percent;
4. hidden if it would make prompt unusable.

### Preferred implementation path

1. Implement as a local TUI plugin first.
   - Use an existing prompt-adjacent slot if available.
   - Candidate observed slot from earlier plugin research: `session_prompt_right`.
   - Need to verify whether there is a slot above/below the prompt. If not, use the closest existing slot for MVP.
2. If existing slots cannot place a full-width line near the prompt, patch OpenCode TUI minimally.
   - Add a host slot such as `session_prompt_above` or `session_status_line`.
   - Keep the slot generic so it can be upstreamable.
   - Keep the actual chat-pulse behavior in the local plugin.

### Data model for MVP

- Input:
  - current session id;
  - visible or recent messages for that session;
  - parts for each message;
  - session status / busy state;
  - assistant token metadata where available.
- Build blocks from recent assistant parts first.
  - Skip synthetic / ignored text where appropriate.
  - Keep only the last N blocks that fit terminal width.
- Classify part color/category:
  - `text` -> muted text block;
  - `reasoning` -> muted/thinking block;
  - `tool` with read-like tool name -> read block;
  - `tool` with write-like tool name -> write block;
  - `tool` with error state -> error block;
  - unknown -> generic tool block.
- Pulse:
  - apply animation/alternating glyph/color to the latest block when session status is busy;
  - if TUI animation is too costly, update only on incoming events.

### Token/context display

- Minimum: show aggregate message token totals if available.
- Better: show context percentage if model context limit is exposed.
- Suggested compact labels:
  - `42% ctx`
  - `in 18k / out 2.1k`
  - `cache 9k`
- Do not block MVP on perfect token accounting; blocks are the primary UX.

### Controls

- Add a command/keybinding later, not required for MVP:
  - toggle pulse line visibility;
  - cycle detail level: blocks only / blocks + tokens / hidden.
- Persisted OpenCode config edits require explicit permission and a same-directory `.bak` backup before modification.

### Open technical questions before implementation

- Which TUI slot is actually rendered closest to the session prompt in the current OpenCode build?
- Does `session_prompt_right` have enough width for a useful pulse line, or is a new full-width slot needed?
- Are token totals present on assistant messages in the TUI sync state, or only available through SDK calls?
- Can a plugin reliably identify the current active session id from route/state without depending on internals?
- What color primitives are safest across OpenCode themes and low-color terminals?

### Suggested implementation phases

1. Prototype read-only renderer in an existing slot.
   - Render last 20-80 parts as glyph blocks.
   - Verify through actual OpenCode TUI.
2. Add width-aware truncation and low-width fallback.
3. Add busy pulse on latest part.
4. Add token/context text if the TUI state exposes reliable data.
5. If placement is wrong, patch OpenCode TUI with a minimal prompt-adjacent slot.

### Change protocol reminders

- This file is only planning/context; no OpenCode config or plugin code has been changed yet.
- Before modifying any OpenCode config file, ask explicit permission for that individual file and create a same-directory `.bak` backup.
- Local plugin source changes are not config changes, but still need manual QA through the actual OpenCode TUI surface.
- If adding an upstream OpenCode slot, keep the patch generic and minimal.
