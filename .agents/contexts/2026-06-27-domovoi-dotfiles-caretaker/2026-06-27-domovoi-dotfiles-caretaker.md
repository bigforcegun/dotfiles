---
updated: 2026-06-27
status: active
---
# Domovoi dotfiles caretaker

[[DOTFILES]]

## Status

Concept/design context for a future dotfiles caretaker called **Domovoi**.

## Purpose

Capture the emerging architecture for a meticulous agent workflow that watches this dotfiles repository, classifies what would be most useful to do next, and routes work to the right skills or subagents.

The core problem space:

- dotfiles contain many software install paths and package choices;
- software freshness, changelogs, updates, bugs, and vulnerabilities need periodic review;
- configs need linting, validation, and deprecation checks;
- existing approaches should be challenged against better alternatives;
- the repository targets both Linux and macOS, so platform drift matters.

## Reading order

1. Read this file.
2. Read [[2026-06-27-domovoi-dotfiles-caretaker-plan]] for the current architecture and rollout proposal.

## Guardrails

- Do not mutate OpenCode config, Git config, hooks, or policy files without explicit user permission.
- Prefer evidence-backed recommendations: current versions, changelogs, advisories, validators, and actual command output.
- Treat Domovoi as a caretaker/orchestrator first, not as a blind updater.

## Related

- [[2026-06-21-agent-context-system]] — смотрителю нужен корпус, куда маршрутизировать найденную работу
- [[2026-06-21-dotfiles-access-audit]] — одна из поверхностей периодического обзора
- [[2026-09-11-multi-repo-git-tui]] — ресерч по multi-repo инструментам; пример работы, которую смотритель должен делать сам: сверять свежесть и заброшенность кандидатов перед установкой
