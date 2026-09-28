---
updated: 2026-09-29
status: active
next: пользователь запускает генерацию rulesync; в новой сессии проверить по транскриптам, что Agent-вызовы идут с model; при просадке — формулировка на английском или FORCE
---

# Claude Code: сабагенты и выбор модели

[[DOTFILES]]

## Purpose

Как Claude Code выбирает тип и модель сабагента, почему по умолчанию всё идёт на дорогую модель родителя, что говорит сообщество и какие есть рычаги (agents/*.md, CLAUDE_CODE_SUBAGENT_MODEL, FORCE).

## Files

- [[2026-09-29-claude-code-subagent-models-research]] — встроенные типы, приоритет переопределения, порядок выбора модели, ловушки алиасов/1M, жалобы сообщества с issue-ссылками, три уровня управления, локальное состояние на 2026-09-29.

## Load policy

Читать research перед любой правкой `~/.claude/agents/`, `env.CLAUDE_CODE_SUBAGENT_*` в `~/.claude/settings.json` или rulesync-сабагентов с target `claudecode`. Правка settings.json — только с подтверждением пользователя. Поведение меняется от версии к версии: перед решением сверить с актуальной докой.

## Related

- [[2026-06-21-omo-subagents-refining]] — та же задача (модель на агента) в OMO/OpenCode; эталон «конфига как в OMO».
- [[2026-07-06-openrouter-specialist-subagents]] — специализированные модели для сабагентов на стороне OpenCode.
