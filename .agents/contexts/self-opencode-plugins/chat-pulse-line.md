# Chat Pulse Line Plugin Plan

## Status

- Canonical plan lives here: `.agents/contexts/self-opencode-plugins/chat-pulse-line.md`.
- Plugin-local `PLAN.md` must not be used; keep planning/context in `.agents` only.
- Prototype implementation exists under `.config/opencode/plugins/chat-pulse-line/` in the dotfiles repo.
- `~/.config/opencode/plugins` has been restored as a symlink to `.dotfiles/.config/opencode/plugins`; old divergent live folder was backed up as `~/.config/opencode/plugins.bak.20260628-202156`.
- `setup_user` now links `.config/opencode/plugins` so the topology survives future setup runs.
- Renderer, fake-API smoke test, and `app_bottom` TUI integration are implemented.
- Pulse blocks are colored by operation type through OpenTUI `span` nodes with `style.fg`.
- `npm run check`, `npm run smoke`, `bash -n setup_user`, and Bun/OpenTUI colored-span assertion pass.
- Real OpenCode TUI placement still needs manual QA.

## User intent

- Build a compact Kilo-style chat pulse / task timeline for OpenCode.
- Desired UX:
  - one thin line near the chat prompt, preferably directly above the input line;
  - tiny sausage/brick blocks showing what the current dialog is made of;
  - live pulse on the latest block while the session is busy;
  - context/token usage visible without opening a separate screen;
  - non-invasive: must not interfere with typing in the prompt.

## Kilo reference captured during chat

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

## OpenCode findings

- No ready-made equivalent was found in OpenCode under these exact Kilo terms:
  - `TaskTimeline`
  - `ContextProgress`
  - `showTaskTimeline`
  - `context progress`
  - `task timeline`
- OpenCode exposes the likely required raw data:
  - session messages via TUI state;
  - message parts via TUI state;
  - live part events such as `message.part.updated` and `message.part.delta`;
  - TUI plugin API access to state, events, routes, slots, and renderer.
- Earlier planning expected `session_prompt_right`; the current live implementation uses an OpenTUI/Solid `app_bottom` slot instead.

## Current implementation state

### Pure renderer: implemented

- File: `.config/opencode/plugins/chat-pulse-line/pulse-line.js`.
- Reads assistant messages from `api.state.session.messages(sessionID)` and parts from `api.state.part(messageID)`.
- Supports both plain message shape and `{ info, parts }` export shape.
- Classifies blocks into:
  - text;
  - reasoning;
  - read tool;
  - write tool;
  - generic tool;
  - error;
  - success;
  - other.
- Encodes block height from approximate output/tokens.
- Appends input/output/cache summary when width allows.
- Exposes `buildPulseLine()`, `buildPulseView()`, and `__testing` helpers.

### TUI integration: implemented, placement unverified

- Runtime file resolves through the `~/.config/opencode/plugins` symlink to `.config/opencode/plugins/chat-pulse-line/tui.js` in dotfiles.
- Registers one slot at order `100_000`.
- Renders `app_bottom()` through Solid/OpenTUI text.
- Renders each pulse block as its own `span` so reasoning/read/write/tool/error/success colors survive the real TUI renderer.
- Uses half renderer width as the pulse budget.
- Requests rerender on session/message/part lifecycle events for the current session only.
- Runs a 450ms pulse timer only while session status is `busy` or `retry`.
- Cleans event, timer, and Solid root disposers on lifecycle dispose.

### QA state

- `npm run smoke` passes in the live plugin directory and prints the expected colored pulse plus token summary.
- Smoke coverage includes:
  - slot registration;
  - rendered output;
  - event-triggered rerender filtering;
  - export-shape messages;
  - token-only fallback;
  - cleanup.
- `npm run check` passes in the live plugin directory after removing the stale missing `tui-test.js` reference.
- Bun/OpenTUI `testRender()` confirms the first rendered blocks carry distinct foreground RGB values for reasoning/read/write/success.
- Manual QA in a real OpenCode TUI session is still pending.

## Desired UX target

Render a compact status row near the prompt:

```text
▁▃▂▆▁ ▒▒ ▇▇ ░  42% ctx  in 18k / out 2.1k / cache 9k
> user prompt...
```

If terminal width is narrow, progressively degrade:

1. blocks + context percent;
2. blocks + token summary;
3. blocks only;
4. single busy indicator;
5. hidden if it would make prompt unusable.

## Next steps

1. Add a durable renderer-level smoke test if the plugin gets a Bun-based test command.
   - Node smoke can verify ANSI output, but OpenTUI `app_bottom()` color spans need Bun/native OpenTUI.
2. Re-run verification after each source change.
   - `npm run check`
   - `npm run smoke`
   - Bun/OpenTUI `testRender()` span-color assertion while no committed Bun test exists.
3. Manually QA inside a real OpenCode TUI session.
   - Confirm `app_bottom` placement.
   - Confirm the line does not interfere with prompt input.
   - Confirm busy pulse is visible while a session is running.
4. Decide whether host-slot work is needed.
   - If `app_bottom` is too far from the prompt, patch OpenCode TUI minimally with a generic full-width prompt-adjacent slot such as `session_prompt_above` or `session_status_line`.
   - Keep the chat-pulse behavior in the local plugin; keep any OpenCode host patch generic.
5. Add controls only after placement works.
   - Toggle visibility.
   - Cycle detail level: blocks only / blocks + tokens / hidden.

## Change protocol reminders

- This `.agents` file is the only canonical plan/context document for this workstream.
- Do not recreate `.config/opencode/plugins/chat-pulse-line/PLAN.md`.
- Before modifying any OpenCode config file, ask explicit permission for that individual file and create a same-directory `.bak` backup.
- Local plugin source changes are not config changes, but still need manual QA through the actual OpenCode TUI surface.
- If adding an upstream OpenCode slot, keep the patch generic and minimal.
