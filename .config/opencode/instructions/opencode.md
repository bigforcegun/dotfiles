# OpenCode Config Rules

When creating `opencode.json` for a user:

1. Do not set `model`, `small_model`, or `provider` unless the user explicitly requests concrete values.
2. Do not add provider-specific defaults implicitly.
3. Default to a vendor-agnostic config (`theme`, `permission`, `watcher`, `tui`, `server`, `autoupdate`, `share`).
4. If provider setup is needed, instruct the user to use `/connect` or environment variables rather than hardcoding provider credentials/config.
5. For dotfiles, prefer a portable config that works even when no API keys are present.
6. Before writing config, verify there is no required provider binding unless explicitly requested.
7. If modifying any OpenCode config file, always create a `.bak` backup file first in the same directory.
8. Before modifying any OpenCode config file, show a clear alert and ask for explicit user permission.
9. Request permission for each individual OpenCode config modification; do not reuse prior approval.
