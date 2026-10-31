---
updated: 2026-10-19
status: active
next: Решить, что забирать из OMP (persistent eval, DAP, TTSR-хуки, hashline после замера); открыт вопрос isDefault модели opencode в ~/.paseo/config.json.
---
# OMO vs OMP: ресёрч

[[DOTFILES]]

## Purpose

Сравнение Oh My OpenAgent (OpenCode edition) и Oh My Pi: что нового в OMP, чего нет в OMO, что из OMP стоит забрать в OpenCode+OMO-сетап.

## Вывод

OMO (OpenCode edition) — оркестрация, роли и continuation поверх OpenCode. OMP — самостоятельный харнесс с богатым встроенным инструментарием; оркестрация у него тоже есть. Hashline, LSP, AST-grep, браузер, web search и сабагенты есть у обоих. Реально нет в OMO: TTSR (потоковое прерывание с перегенерацией), advisor, persistent `eval`, встроенный `debug`-инструмент (в OMO только debugging skill с `dap.mjs`). Прямого OMO-vs-OMP бенчмарка не существует, публичной оценки OMO нет.

Решение: на OMP не переезжать. Кандидаты на перенос по приоритету: persistent eval через MCP; DAP (сначала OMO debugging skill, затем `microsoft/DebugMCP`); TTSR-подобные правила на хуках; hashline (`hashline_edit: true`) только после замера на своих задачах.

## Перепроверено лично (2026-10-18)

- OMO hashline выключен по умолчанию: `tool-registry-gated-tools.ts` — `pluginConfig.hashline_edit ? { edit: … } : {}` (SHA `90eaba6e`).
- Лицензия OMO — Sustainable Use License (`LICENSE.md`, v5.1.35); OMP — MIT.
- README OMO v5.1.35: основной продукт `omo` на senpi, «our fork of pi»; OpenCode edition — отдельная линия.
- OMO 70 136 звёзд (GitHub API).
- 6.7% → 68.3% — patch → hashline, по самому блогу Stencil.
- OMO сам переводит `default_agent: "hephaestus"` в display name: `agent-config-assembly.ts:146-148` (v5.1.13).

Остальное в отчёте сабагента — заявления, не проверенные независимо.

## Побочные изменения в сетапе

- `.config/opencode/opencode.json`: добавлены `"model": "openai/gpt-6-astra-fast"`, `"default_agent": "hephaestus"`; бэкап `opencode.json.pre-default-model-20261018.bak`. Внёс пользователь вручную (Edit на этот файл запрещён в `~/.claude/settings.json`).
- Голый `paseo run --provider opencode` всё равно стартует на `openrouter/sao10k/l3-lunaris-8b` в режиме `default` и падает с `error`: модель выбирает Paseo (первая в списке), а не OpenCode. Кандидат-фикс — `providers.opencode.additionalModels[{id, isDefault: true}]` в `~/.paseo/config.json` ([custom-providers.md](https://paseo.sh/docs/custom-providers.md)); для встроенного провайдера не проверено. Дефолтного режима у Paseo нет — профиль остаётся обязательным.

## Files

- [[2026-10-19-omo-vs-omp-research-report]] — полный отчёт сабагента (OpenCode/Hephaestus): 8 разделов, ссылки на файлы и строки на закреплённых SHA.
- [[2026-10-19-omo-vs-omp-research-omp-tools]] — откуда хайп по OMP, критика бенчмарков, полные списки операций `lsp`/`debug`, текущий формат hashline.

## Load policy

Для вопросов «стоит ли брать фичу X из OMP» хватает этой заметки. Отчёт открывать, только когда нужна ссылка на первоисточник. Ссылки привязаны к SHA октября 2026 — перед опорой на них в будущем сверить с текущим релизом.

## Related

- [[2026-10-03-omo-learning]] — обучение границам OpenCode/OMO/Paseo; этот ресёрч уточняет, где проходит граница OMO и соседних харнессов.
