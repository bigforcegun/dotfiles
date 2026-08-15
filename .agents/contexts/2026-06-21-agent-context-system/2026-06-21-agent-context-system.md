---
updated: 2026-08-15
status: done
next: заменён на [[2026-08-15-agents-context-v2]]
---

# Agent Context System

[[DOTFILES]]

## Purpose

Design a lightweight, repo-local system for storing cross-agent plans and context in `.agents/` without creating placeholder noise.

## Files

- [[2026-06-28-agent-context-system-plan]] - implementation plan for the `.agents/` context system.
- [[2026-06-28-agent-context-system-research]] - references and conventions collected during the chat research.

## Load policy

Read [[2026-06-28-agent-context-system-plan]] when changing the `.agents/` convention. Read [[2026-06-28-agent-context-system-research]] when checking whether the convention still matches public agent tooling practices.


## Related

- [[2026-08-15-agents-context-v2]] — вторая редакция, которая эту заменяет
- [[2026-07-19-agentcairn-memory-integration]] — разграничение: что durable-память, а что рабочий контекст
- [[2026-06-27-agent-todo-txt-bridge]] — соседний слой долговременного состояния агента
- [[2026-06-21-agents-session-dumper]] — тоже пишет markdown с вики-ссылками для агентов
