---
updated: 2026-06-21
status: active
next: execute hardening only after explicit approval for any sensitive config/git changes
---
# Dotfiles access audit

[[DOTFILES]]

## Purpose

Track the security/access audit for dotfiles secrets, MCP configs, local auth state, permissions, and migration readiness.

## Files

- [[2026-06-28-dotfiles-access-audit-plan]] - current audit plan and findings, ported from `docs/dotfiles-access-audit-plan.md`.

## Load policy

Do not modify Git config, hooks, OpenCode config, MCP config, or secret-bearing files without explicit permission.


## Related

- [[2026-06-28-mcpd-envless-start]] — загрузка секретов при старте — пункт этого аудита
- [[2026-06-27-domovoi-dotfiles-caretaker]] — смотритель должен маршрутизировать аудит как периодическую задачу
