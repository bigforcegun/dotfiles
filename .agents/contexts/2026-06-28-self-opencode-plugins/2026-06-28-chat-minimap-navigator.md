# Chat Minimap Navigator Plugin Research

## OpenCode chat navigator / minimap

### User intent

- Build or evaluate a VSCode-like minimap/navigator for the current OpenCode chat.
- Desired UX:
  - right-side narrow panel beside current chat, not a separate route;
  - anchors for user / assistant / tool / error messages;
  - click or keyboard jump-to-message if the host exposes message scroll/focus control;
  - compact visual density similar to VSCode minimap/outline, not just a scrollbar.

### Corrections / facts captured during chat

- `messages_page_up` / `messages_page_down` only scroll text. They are not message navigation, anchors, outline, or a minimap.
- Current docs/code checked during chat did not show a ready-made OpenCode plugin that provides a right-side current-chat minimap or message navigator.
- `messages_next` / `messages_previous` appeared in SDK/config surfaces as deprecated, so do not base a durable navigator plan on them without verifying current TUI implementation.

### TUI plugin extension points found

- `api.route.register(...)` / `api.route.navigate(...)` for full plugin screens.
- `api.keymap.registerLayer(...)` for commands and shortcuts.
- `api.client`, `api.event`, and `api.state` for data/state integration.
- Host slots mentioned in current docs/code include:
  - `app`
  - `app_bottom`
  - `home_prompt_right`
  - `session_prompt_right`
  - `sidebar_content`
  - `sidebar_footer`

### Important limitation

- No obvious host slot was found for a panel directly to the right of the current session message list, such as `session_messages_right`, `chat_right`, or `message_sidebar`.
- Therefore a true VSCode-like right-side minimap beside the chat likely cannot be implemented cleanly as a standalone plugin with only the currently observed host slots.

### Practical implementation options

1. Separate navigator route opened by hotkey/command.
   - Feasible with plugin API.
   - Not a minimap beside the chat.
2. Navigator inside existing sidebar via `sidebar_content`, if the sidebar is visible/appropriate in session view.
   - Closest non-invasive side-panel option.
   - Must verify whether it replaces or coexists with important sidebar content.
3. Floating overlay via the `app` slot.
   - Likely possible.
   - Brittle because it may cover chat and cannot reserve layout width.
4. Proper native-feeling minimap.
   - Patch OpenCode TUI to add a host slot beside the session message list.
   - Then implement a plugin that renders into that slot.

### Open technical questions before implementation

- Does plugin API expose current session messages with enough metadata and stable IDs?
- Does plugin API expose a supported jump/scroll-to-message command, or would the TUI need another API addition?
- Is `sidebar_content` rendered in the session route and can it coexist with the current sidebar content without replacing important UI?
- If patching OpenCode TUI, what is the smallest slot/API addition that upstream would plausibly accept?

### Change protocol reminders

- Before modifying any OpenCode config file, ask explicit permission for that individual file and create a same-directory `.bak` backup.
- Local plugin source changes are not config changes, but still verify through the actual OpenCode TUI surface.
- If this becomes an upstream OpenCode patch, keep the core TUI change minimal: expose a slot/API first, then keep local plugin behavior outside upstream when possible.
