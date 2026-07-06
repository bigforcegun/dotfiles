# OpenCode Sessions Sidebar Research

## Goal

User wants a session-oriented sidebar experience in or around OpenCode that feels native, avoids obvious flicker, and ideally does not require a tmux-heavy external shell.

The desired UX direction is closer to:
- a project/session browser;
- quick jumping between sessions;
- optional visibility into active/background work;
- low visual noise and low rerender cadence.

## Local baseline in this workspace

### OpenCode / local wrapper

- OpenCode TUI theme is currently `gruvbox` in `.config/opencode/tui.json`.
- `bin/oc` is the local source of truth for safe OpenCode attach/start behavior:
  - discovers local OpenCode candidates by process + port;
  - validates by `/project/current.worktree`;
  - attaches only on project match;
  - otherwise starts `opencode --port 0` from canonical project root.
- `bin/oc` temporarily renames the current tmux window to `oc:<dir>` and restores it on exit.

### Local OpenCode/tmux visual identity

- `.config/opencode/tui.json` sets OpenCode `theme: "gruvbox"`.
- `.config/opencode/plugins/chat-pulse-line/` adds Gruvbox-like sidebar/status accents.
- `.config/opencode/plugins/oc-tmux-window-title/tui.js` renames tmux windows from live OpenCode session state to `oc://<workdir>/<title>`.
- `.tmux.conf.local` defines the primary tmux palette and status formatting, with light/dark switching through `THEME_OS_MODE`.
- `bin/dark_mode_notify_hook`, `bin/tmux_auto_theme`, `bin/alacritty_auto_theme`, and `bin/alacritty_theme` drive runtime theme switching outside OpenCode.

## Plugin inventory researched

### 1. `dnaroid/opencode-sidebar-background-sessions`

- Type: OpenCode TUI plugin
- Purpose:
  - `Running Agents` section for active background sub-agent sessions;
  - `Sessions` accordion for recent project sessions.
- Install model: npm package + `tui.json` path to `./node_modules/opencode-sidebar-background-sessions`
- Verdict in this workspace:
  - package publishes successfully;
  - manual/path install is supported by upstream docs;
  - runtime failed in local OpenCode with visible error:
    - `Cannot add child: Nodes with measure functions cannot have children.`
- Likely reason:
  - plugin appears to target older OpenTUI render assumptions;
  - implementation uses imperative `BoxRenderable` / `TextRenderable` composition;
  - host here is on newer `@opentui/solid 0.4.1`.
- Result: install/config experiment was reverted.

### 2. `Dylan-Liew/opencode-session-switch`

- Type: OpenCode TUI plugin
- Purpose: compact sidebar session switcher
- Publish status: published to npm as `opencode-session-switch`
- Latest checked version: `0.1.5`
- Install contract:
  - recommended: `opencode plugin -g opencode-session-switch`
  - manual: add `"opencode-session-switch"` to `tui.json`
- Compatibility notes:
  - plugin/dev dependencies target `@opencode-ai/plugin ^1.17.4`
  - plugin/dev dependencies target `@opentui/core ^0.3.4` and `@opentui/solid ^0.3.4`
  - local host is `opencode 1.17.12`, `@opencode-ai/plugin 1.17.12`, `@opentui/solid 0.4.1`
- Verdict:
  - more plausible than `opencode-sidebar-background-sessions` because the UI is simpler;
  - still not guaranteed, because it was built against OpenTUI 0.3.x and does not declare strict peer runtime boundaries.

### 3. `opencode-subagent-statusline`

- Type: OpenCode TUI plugin already used locally
- Purpose:
  - subagent monitor in sidebar;
  - running/completed/failed child sessions;
  - elapsed time and token/context when available.
- Compatibility notes:
  - package explicitly targets `@opentui/core >=0.4.0 <0.5` and `@opentui/solid >=0.4.0 <0.5`
  - this matches local host much better than the background-sessions plugin.
- Limitation:
  - it is a subagent/status plugin, not a project-wide session browser.

### 4. `@ishaksebsib/opencode-tree`

- Type: OpenCode TUI plugin already configured locally
- Purpose: tree view for branched conversations
- Limitation: not an active sessions or project sessions sidebar.

### 5. `arnavpisces/opencode-sidebar`

- Type: not an OpenCode TUI plugin
- Real architecture:
  - separate tmux-based launcher/workspace manager;
  - custom TUI app on one side;
  - standard `opencode attach ...` in another pane/window;
  - own session/project model, parking, preview, and tmux orchestration.
- Good ideas from it:
  - project/session browser layout;
  - parked session concept;
  - strong keyboard model;
  - visual density closer to a workspace browser.
- Main mismatch with local goals:
  - depends on tmux-centric orchestration;
  - duplicates lifecycle ownership already handled by `bin/oc`;
  - current implementation visibly flickers.

## Native OpenCode slot/layout findings

### What exists

OpenCode TUI host slots researched include:
- `app`
- `app_bottom`
- `home_logo`
- `home_prompt`
- `home_prompt_right`
- `session_prompt`
- `session_prompt_right`
- `home_bottom`
- `home_footer`
- `sidebar_title`
- `sidebar_content`
- `sidebar_footer`

### What does not appear to exist

No obvious host slot was found for a custom panel directly beside the current message list, such as:
- `session_messages_right`
- `chat_right`
- `message_sidebar`
- `left_sidebar`
- `sidebar_left`

### Practical implications

- OpenCode already has a built-in session sidebar area.
- Plugins can populate that built-in sidebar through `sidebar_*` slots.
- There is no documented placement API to move that built-in sidebar to the left.
- There is no documented slot that reserves new layout width left or right of the message list.

### Feasible non-core options

1. Use `sidebar_content` inside the built-in sidebar.
2. Use `app` to render a full-height overlay/drawer.
3. Use a separate route/screen for a navigator.

### Infeasible without core patch

- true left sidebar that pushes chat right;
- independent right-of-messages panel with reserved width;
- plugin-controlled placement flip from right sidebar to left sidebar.

## `app`-slot drawer idea

### Why it became the main compromise path

User explicitly rejected the built-in right sidebar as already overloaded.

The best no-core-patch alternative is:
- left-side full-height drawer via `app`;
- hidden by default;
- toggled by hotkey;
- compact, event-driven, low-flicker;
- overlays chat instead of reflowing layout.

### Constraints of this approach

- It can cover the chat, not push it.
- Focus management must be handled carefully.
- Mouse hitbox / close behavior / narrow terminal behavior need deliberate design.
- It should be opt-in and mostly closed by default.

### Why it is still attractive

- no tmux dependency;
- can live inside real OpenCode TUI;
- can visually resemble the external session browser enough for the intended workflow;
- avoids the overloaded built-in right sidebar.

## `arnavpisces/opencode-sidebar` architecture notes

### How it works

- custom TUI app, not OpenCode plugin;
- tmux layout with launcher/session panes and parked session windows;
- own OpenCode server boot/attach layer;
- own project/session discovery via OpenCode APIs.

### Why it clashes with local `bin/oc`

- `opencode-sidebar` wants to own `opencode serve` and `opencode attach`.
- `bin/oc` already owns safe attach/start policy for this workspace.
- Combining them directly creates overlapping lifecycle ownership.

### Best architectural combination if ever forked

- keep its session browser UI ideas;
- replace its direct serve/attach layer with a local adapter/helper compatible with `bin/oc` policy;
- keep tmux-specific behavior out unless explicitly wanted.

## `arnavpisces/opencode-sidebar` theming notes

- Theme system is self-contained in `src/lib/themes.ts`.
- Current default theme is not gruvbox.
- Runtime theme switching exists.
- Pane/background sync to tmux is background-oriented only.
- It does not automatically inherit the full local tmux palette/statusline theme.

### Practical consequence

To look native in this workspace, it would need at least:
- a custom gruvbox-ish preset in its theme definitions;
- likely additional UI tuning beyond colors if the goal is strong visual parity.

## `arnavpisces/opencode-sidebar` flicker findings

The visible flicker appears to be intrinsic to the app’s own render cadence, not mainly to local tmux hooks.

### Strong suspects

1. periodic refresh poll every 5 seconds;
2. active animation frame loop every 250ms while app is "active" or recently interacted with;
3. event-driven invalidation from backend/global event stream.

### Not strong suspects

- local `dark_mode_notify_hook`;
- local `tmux_auto_theme`;
- local theme/background writes as periodic source.

### Practical verdict

- As-is, the app looks too repaint-heavy for the desired native feel.
- If ever reused, it should be treated as a fork/patch candidate, not as a drop-in dependency.

## Current recommendation hierarchy

### Best fit for the stated goal

1. **Native OpenCode TUI implementation via `app` drawer overlay**
   - no tmux;
   - fully inside OpenCode;
   - left-side drawer possible;
   - must be designed to avoid polling and avoid full-tree animation churn.

2. **Native OpenCode TUI implementation via built-in `sidebar_content`**
   - most supported technically;
   - worse fit for user because the right sidebar is already overloaded.

3. **Fork/patch external `opencode-sidebar`**
   - only if the custom browser UI is worth the maintenance cost.

### Not recommended as-is

- `opencode-sidebar-background-sessions` in current host stack;
- unpatched `arnavpisces/opencode-sidebar`.

## If this context becomes implementation work

Most promising concrete build path:

1. implement a minimal left-side `app` drawer prototype inside OpenCode;
2. keep it closed by default and toggle by one hotkey;
3. render only project/session data needed for the current view;
4. avoid periodic polling where possible;
5. borrow visual structure from `opencode-sidebar`, not its tmux/runtime model;
6. keep `bin/oc` as the workspace source of truth for attach/start semantics.
