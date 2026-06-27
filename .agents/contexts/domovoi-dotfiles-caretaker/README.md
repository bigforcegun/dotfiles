# Domovoi dotfiles caretaker

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
2. Read `plan.md` for the current architecture and rollout proposal.

## Guardrails

- Do not mutate OpenCode config, Git config, hooks, or policy files without explicit user permission.
- Prefer evidence-backed recommendations: current versions, changelogs, advisories, validators, and actual command output.
- Treat Domovoi as a caretaker/orchestrator first, not as a blind updater.
