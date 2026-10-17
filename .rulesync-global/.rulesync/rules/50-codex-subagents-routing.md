---
root: true
targets:
  - 'codexcli'
globs:
  - '**/*'
---

# Маршрутизация сабагентов (Codex)

Codex не запускает сабагентов по их `description` — нужен явный приказ. Это он.

## artificer

Для отчётов, схем, диаграмм, графиков, слайдов и других HTML-артефактов spawn the `artificer` sub-agent (delegate to it) — this is an explicit instruction to use a sub-agent. Do not render them yourself and do not load the visual-explainer skill in the main thread. Pass the facts in full and the output path if the user gave one; return its reply (the file path) to the user.
