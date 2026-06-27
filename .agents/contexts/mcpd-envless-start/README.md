# mcpd envless start

## State

- Status: decision captured, implementation pending
- Last updated: 2026-06-28
- Next step: change the mcpproxy startup path so `mcpd` no longer sources `~/.mcpproxy/env`; design a portable KeePass-backed wrapper before editing launchd or `bin/mcpd`.

## Purpose

Capture the secret-loading direction for MCPProxy: startup must be portable and not depend on an OS-specific keychain as the source of truth. The target is `mcpd` launching `mcpproxy` without reading an env file that contains secrets.

## Decision

- Do not make macOS Keychain / Linux Secret Service / Windows Credential Manager the primary source of truth.
- Do not keep long-lived MCPProxy secrets in `~/.mcpproxy/env`.
- Keep `.mcpproxy/mcp_config.json` portable by using `${env:VAR}` references for values that upstream MCP servers need.
- Use KeePass / `.kdbx` as the portable source of truth.
- Add a startup wrapper that unlocks KeePass, reads configured entries, exports variables only into the child process environment, then `exec`s `mcpproxy serve`.
- If interactive unlock is required, prefer an explicit foreground/manual start command over launchd autostart that silently fails without a TTY.

## Target shape

```text
mcpd start-or-run
  -> mcpproxy KeePass wrapper
     -> prompt/unlock KeePass vault
     -> read named entries/attributes
     -> export required env vars in memory only
     -> exec mcpproxy serve
```

`~/.mcpproxy/env` may exist temporarily during migration, but future agents should treat it as legacy and avoid adding new secrets there.

## Relevant files

- `.mcpproxy/mcp_config.json` - current MCPProxy config with `${env:...}` placeholders.
- `Library/LaunchAgents/com.bigforcegun.mcpproxy.plist` - currently sources `~/.mcpproxy/env`; must be changed only after the wrapper exists.
- `bin/mcpd` - daemon dispatcher; likely place for an explicit unlock/run verb or wrapper integration.
- `.agents/contexts/mcp-stack/plan-v2.md` - older/current MCP stack plan; still mentions env sourcing and should be updated when implementation happens.

## Non-goals

- No real secrets, tokens, vault paths, passwords, or raw env dumps in `.agents/`.
- No OS-keyring-only design as the main path. OS keyrings can be optional cache/integration later, not the portable source of truth.
- No generated plaintext env file on disk as the primary mechanism.

## Load policy

Read this file before changing MCPProxy startup, `mcpd`, the mcpproxy LaunchAgent, or `.mcpproxy/env` handling.
