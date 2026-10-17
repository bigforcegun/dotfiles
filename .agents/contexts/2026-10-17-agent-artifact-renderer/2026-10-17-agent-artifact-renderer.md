---
updated: 2026-10-18
status: active
next: "VE: пользователь запускает rulesync install + make global, проверяем в бою artificer (раскладка skill в 3 агента, вызов по ключевым словам, OpenCode deny/allow). Публикация: выбрать wildcard A/B и провайдер входа; дожать на стенде Channels (руками, dev-флаг) и превью review в браузере Paseo."
---

# Рендерер артефактов для агентов (Canvas-аналог)

[[DOTFILES]]

## Purpose

Найти готовый инструмент, которым Claude Code / Codex / OpenCode дёшево делают красивые HTML-артефакты: отчёты, графики, диаграммы, слайды. Без самописа.

## Требования (уточнены пользователем 2026-10-17)

1. На выходе HTML; смотрится в превью Paseo (sandbox-iframe без сети) — но Paseo-специфика из требований выкинута.
2. Агенту дёшево разобраться: формат, который модель знает, или короткий праймер.
3. Агенту дёшево сгенерировать: компактный исходник, не простыня кода.
4. Красиво; статики достаточно, графики/диаграммы/слайды нужны.
5. **Не самопис** — пользователь дважды отверг собственные рендереры и каталоги.
6. Создание (эта задача) и публикация (отдельная) — разные проблемы.

## Решение

**visual-explainer** (github.com/nicobailon/visual-explainer, skill): quick-режим (JSON-блоки → HTML, 13 KB, ~6 KB доков) по умолчанию; full-режим (гайд + kit) для графиков и слайдов. Победил по визуалу на глаз пользователя и по цене.

Отклонены: mcp-ui (нет рендерера), json-render (самопис каталога), A2UI (нет таблиц/графиков, сырой протокол), Quarto (9–11 MB, brew + 423 MB venv, `data:`-ресурсы блокируются превью Paseo — подтверждено глазами пользователя). MCP Apps — другая категория (интерактивное приложение в чат-хосте; Paseo не хост, issue #3428 закрыт not planned). Публикация: plannotator/artifact-server (MCP + skill + CLI) — разобран по коду, план self-host на CapRover в [[2026-10-18-artifact-server-publication]]; локальный стенд подтвердил публикацию, рендер VE, комментарии в обе стороны и mailbox-возврат агенту — [[2026-10-18-artifact-server-local-stand]] (Channels и превью в Paseo не проверены).

## Files

- [[2026-10-17-visual-explainer-integration]] — интеграция: rulesync sources, сабагент artificer (было visualizer), MCP-сервер.
- [[2026-10-18-artifact-server-publication]] — публикация: artifact-server, альтернативы, self-host на CapRover (домены, wildcard, авторизация).
- [[2026-10-18-artifact-server-local-stand]] — локальный стенд artifact-server: как поднять, результаты, подводные камни, недопроверенное (Channels, Paseo).

Стенды 1–2 (`canvas-stand`, `stand-quarto-ve`), `ve-integration`, `canvas-tools-research.*` и сводка `.agents/artifacts/README.md` отправлены в корзину 2026-10-18 (rmtrash, по решению пользователя). Итоги — в этой заметке и в заметке интеграции.

- `.agents/artifacts/artifact-server-stand/` — стенд 3: скрипты Playwright/MCP для artifact-server, скриншоты review. Симлинк `node_modules` указывал на удалённый `canvas-stand/node_modules`.

Интеграция внесена в `.rulesync-global` (бэкапы `*.bak` рядом): `sources` с visual-explainer в `rulesync.jsonc`, `.rulesync/subagents/artificer.md`, `.rulesync/rules/50-codex-subagents-routing.md` (только Codex; стенд: без правила 0/3 спавнов, с правилом 3/3, флаг usage_hint_text 0/3), OpenCode `permission.skill` в `.rulesync/permissions.jsonc`.

## Load policy

Загружать при теме «артефакты / канвас / HTML-отчёты агентов». Не предлагать самописные рендереры. Артефакты по умолчанию — в `/tmp/artificer/`, в проект (`.agents/artifacts/<slug>/`) только по явной просьбе.

## Related

- [[2026-06-21-agents-session-dumper]] — там же вывод «универсального рендерера нет»; здесь найден готовый (visual-explainer) для артефактов, может пригодиться и дамперу.
