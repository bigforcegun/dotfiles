# Git Rules

- Treat Git metadata and policy files as sensitive project configuration.
- Before modifying any Git config or hook file, create a `.bak` backup in the same directory.
- Request explicit user permission before each Git config modification.
- Prefer non-destructive Git operations unless the user explicitly requests otherwise.
- Keep commit history auditable by preserving required commit trailers.
