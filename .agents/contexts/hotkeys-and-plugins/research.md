# Hotkeys and Plugins Research

## Current branch/context

- Active branch: `omo`.
- Existing `.agents` contexts relevant to this work:
  - `opencode-config-tuning/` covers OpenCode/OMO config fixes, including Ctrl+Enter submit, `unspecified-low`, and tmux integration. It explicitly says no OpenCode config changes were approved yet.
  - `mcp-stack/` covers OMO/OpenCode MCP and plugin interaction. OMO already injects its own built-in MCP/tool surface; avoid duplicate tool names unless intentionally overriding.
- Current worktree had a pre-existing modification in `.mcpproxy/mcp_config.json` before this hotkey context was created.

## OpenCode/OMO hotkeys and plugins

### Files

- `.config/opencode/tui.json`
  - Current TUI config: theme `gruvbox` and TUI plugins:
    - local `oc-tmux-window-title/tui.js`
    - `@slkiser/opencode-quota@latest`
    - `opencode-subagent-statusline`
  - This is the correct place for OpenCode TUI `keybinds`.
- `.config/opencode/opencode.json`
  - Current server/global config includes plugins:
    - `oh-my-openagent@latest`
    - `@slkiser/opencode-quota@latest`
    - `@ramtinj95/opencode-tokenscope@latest`
  - Permission policy denies editing OpenCode config paths without explicit approval.
- `.config/opencode/oh-my-openagent.json`
  - Current OMO agent/category model config.
  - `unspecified-low` is currently `openai/gpt-5.5-fast`, `variant: medium`, with Gemini fallback.
- `.config/opencode/plugins/oc-tmux-window-title/tui.js`
  - Local TUI plugin. Renames tmux window based on current OpenCode session route.
- `.config/opencode/package.json`
  - Local plugin dependencies: `@opencode-ai/plugin` and `opencode-subagent-statusline`.

### OpenCode chat navigator / minimap findings

- User asked whether OpenCode has a VSCode-like minimap/navigator for the current chat.
- Correction: `messages_page_up` / `messages_page_down` only scroll text. They are not message navigation, anchors, outline, or a minimap.
- Current docs/code checked during chat did not show a ready-made OpenCode plugin that provides a right-side current-chat minimap or message navigator.
- TUI plugin API currently exposes useful extension points:
  - `api.route.register(...)` / `api.route.navigate(...)` for full plugin screens.
  - `api.keymap.registerLayer(...)` for commands and shortcuts.
  - `api.client`, `api.event`, and `api.state` for data/state integration.
  - host slots including `app`, `app_bottom`, `home_prompt_right`, `session_prompt_right`, `sidebar_content`, `sidebar_footer`.
- Important limitation: no obvious host slot was found for a panel directly to the right of the current session message list, such as `session_messages_right`, `chat_right`, or `message_sidebar`.
- Practical implementation options, from least to most invasive:
  1. Separate navigator route opened by hotkey/command. Feasible with plugin API, but not a minimap beside the chat.
  2. Navigator inside existing sidebar via `sidebar_content`, if the sidebar is visible/appropriate in session view. This is the closest non-invasive side-panel option.
  3. Floating overlay via the `app` slot. Likely possible, but brittle because it may cover chat and cannot reserve layout width.
  4. Proper native-feeling minimap: patch OpenCode TUI to add a host slot beside the session message list, then implement a plugin that renders into that slot.
- Desired UX for the proper version:
  - right-side narrow panel beside current chat, not a separate route;
  - anchors for user / assistant / tool / error messages;
  - click or keyboard jump-to-message if the host exposes message scroll/focus control;
  - compact visual density similar to VSCode minimap/outline, not just a scrollbar.
- Open technical questions before implementation:
  - Does plugin API expose current session messages with enough metadata and stable IDs?
  - Does plugin API expose a supported jump/scroll-to-message command, or would the TUI need another API addition?
  - Is `sidebar_content` rendered in the session route and can it coexist with the current sidebar content without replacing important UI?
  - If patching OpenCode TUI, what is the smallest slot/API addition that upstream would plausibly accept?

### OpenCode keybind facts

- OpenCode keybinds are customized through `tui.json` under a flat `keybinds` object.
- `plugin` is singular, not `plugins`.
- `tui.json` can contain TUI plugins; `opencode.json` contains OpenCode/global plugins.
- Default prompt bindings from current docs:
  - `input_submit`: `return`
  - `input_newline`: `shift+return,ctrl+return,alt+return,ctrl+j`
  - `dialog.prompt.submit`: `return`
- Therefore, making Ctrl+Enter submit is not just adding `ctrl+return` to `input_submit`; it must also be removed from `input_newline`, otherwise the same key remains mapped to newline.
- If the desired behavior is “Enter inserts newline, Ctrl+Enter submits”, the likely TUI patch is:

  ```json
  {
    "keybinds": {
      "input_submit": "ctrl+return",
      "input_newline": "return,shift+return,alt+return,ctrl+j",
      "dialog.prompt.submit": "ctrl+return"
    }
  }
  ```

- If the desired behavior is “Enter still submits, Ctrl+Enter is an additional submit shortcut”, the likely TUI patch is:

  ```json
  {
    "keybinds": {
      "input_submit": "return,ctrl+return",
      "input_newline": "shift+return,alt+return,ctrl+j",
      "dialog.prompt.submit": "return,ctrl+return"
    }
  }
  ```

- Terminal caveat: some terminals do not send modified Enter distinctly. On macOS terminal stack here, verify in the actual OpenCode TUI after changing.

## Tmux hotkeys and plugins

### Files

- `.tmux.conf`
  - Oh My Tmux base config. Header says “DO NOT EDIT”; local overrides belong in `.tmux.conf.local`.
  - Base bindings include prefix helpers, pane navigation, copy-mode bindings, etc.
- `.tmux.conf.local`
  - Correct place for custom tmux overrides.
  - Current key customizations include:
    - prefix changed to `C-a`; `C-b` and old `C-a` unbound before rebinding.
    - global bindings: `C-M-Left/Right` previous/next window, `C-Tab` next window, `C-M-Up/Down` session switch.
    - prefix bindings: `q` kill-session prompt, `C-x` kill other windows, `n` new, `t` new-window, `/` copy-mode search.
  - Tmux plugin bindings/options:
    - `@extrakto_key "Tab"`
    - `@tmux-fzf-launch-key 'space'` after `unbind space`
    - `tmux-yank`, `tmux-prefix-highlight`, `tmux-pain-control`, `sainnhe/tmux-fzf`, `tmux-resurrect`, `tmux-continuum` enabled.
  - TPM install/update key reminders in comments: `<prefix> + I`, `<prefix> + Alt+u`, `<prefix> + u`.
- `.tmux_simple.conf`
  - Alternate/simple tmux config with its own prefix and plugin list. Change only if this profile is still used.

## Shell/Zsh/FZF hotkeys and plugins

### Files

- `.zshrc`
  - Loads antidote, prezto, zsh-notify, antibody, completions, environment, aliases, fuzzy, ssh.
  - `source ~/.zsh/keybindings.zsh` is currently commented out, so `.zsh/keybindings.zsh` bindings are not active through this `.zshrc` path.
- `.zsh/keybindings.zsh`
  - Contains inactive/custom bindkeys for history substring search, `Ctrl-K`, double `Ctrl-V`, and pound-toggle.
- `.zsh/fuzzy.zsh`
  - FZF history options bind `ctrl-p` to preview toggle and `ctrl-y` to copy selected command.
  - Restores Tab completion with `bindkey '\t' expand-or-complete`.
- `.zsh_plugins`
  - Zsh plugin list includes prezto, oh-my-zsh plugin paths, fzf-ish tools, autopair, notify, syntax highlighting, autosuggestions, zaw, spaceship.
- `.zsh/prezto.zsh`
  - Loads Prezto modules: environment, editor, directory, completion, archive. Prezto editor module can affect keymaps.

## Window manager hotkeys

### macOS/yabai/skhd

- `.config/skhd/skhdrc`
  - Almost all yabai/skhd bindings are currently commented out.
  - Active bindings:
    - `cmd + ctrl - return : alacritty`
    - `cmd + ctrl - l : pmset displaysleepnow`
  - Many commented bindings document intended workspace/window movement parity with i3.
- `.config/yabai/yabairc`
  - Mouse modifier currently `ctrl`; review if pointer actions conflict with keyboard scheme.

### Linux/i3

- `.config/i3/config`
  - Main active i3 keybinding surface. Large set of workspace/window/media/layout bindings.
- `.config/i3/config_manjaro` and `.config/i3/config_default`
  - Alternate/historical configs; change only if still used.

## Neovim hotkeys and plugins

### Files

- `.config/nvim/init.vim`
  - Small current config with Dein plugins and NERDTree mappings:
    - leader is `\\`; Space maps to leader in normal/visual.
    - `<leader>n`, `<C-n>`, `<C-t>`, `<C-f>` are NERDTree actions.
- `.config/nvim/init_v1.vim`, `.config/nvim/init_v2.vim`, `.config/nvim/ini_v2.vim`
  - Larger/historical configs with many mappings and plugin mappings. Change only if they are selected by symlink or launch path.

## Change protocol

1. Decide the target surfaces: OpenCode TUI only, tmux, zsh/fzf, skhd/yabai, i3, Neovim, or all relevant layers.
2. For OpenCode config files, ask explicit permission per file and create a same-directory `.bak` first.
3. For Git config/hook files, ask explicit permission and create `.bak`; no Git config/hook changes are expected for hotkeys.
4. For tmux, prefer `.tmux.conf.local`, not `.tmux.conf`.
5. For OpenCode Ctrl+Enter submit, edit `.config/opencode/tui.json` only after deciding whether Enter submits or inserts newline.
6. After changing, verify through the actual surface:
   - OpenCode: launch TUI and test Enter/Ctrl+Enter and plugin manager/status behavior.
   - tmux: reload config in tmux and test prefix/global bindings.
   - zsh/fzf: start interactive zsh and test FZF/history/completion keys.
   - skhd/yabai: run/reload skhd and test non-destructive focus/launch bindings.
   - i3: validate/reload config in an i3 session if relevant.
   - Neovim: open nvim and inspect/test mapped commands.

## Open decisions before implementation

- Exact desired OpenCode submit behavior:
  - A: Enter inserts newline, Ctrl+Enter submits.
  - B: Enter submits, Ctrl+Enter also submits.
- Which plugins should be affected:
  - TUI plugins in `.config/opencode/tui.json`?
  - Global/server plugins in `.config/opencode/opencode.json`?
  - OMO model/category config in `.config/opencode/oh-my-openagent.json`?
  - tmux/zsh/nvim plugin keybindings?
- Whether `.tmux_simple.conf`, i3 alternate configs, and old Neovim configs are still active and should be kept in sync.
