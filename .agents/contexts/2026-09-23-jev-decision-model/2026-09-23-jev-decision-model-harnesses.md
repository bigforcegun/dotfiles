# Доступ и точки интеграции в четыре харнесса

[[2026-09-23-jev-decision-model]]

Аудит проведён 2026-09-23 по установленным версиям на этой машине.

## Доступ: OpenRouter уже настроен

В `~/.config/opencode/opencode.json` провайдер `openrouter` уже сконфигурирован, то есть
отдельный аккаунт TypeSafe не обязателен.

| | OpenRouter | нативный TypeSafe |
|---|---|---|
| Цена | $0.042/M input, $0 output | то же |
| Контекст | **32k** | 64k |
| ID модели | `typesafe/jev-1.13`, `~typesafe/jev-latest` | `jev-1.13.0`, с патчем |
| Эндпоинт | **не** `/chat/completions` | `/v1/systemone` |

Урезанный вдвое контекст — главное отличие. Для триажа неважно, для «выгружаю весь
state агента» может стать решающим.

**Эндпоинт — два кандидата, окончательно не разведён:**

- `POST https://openrouter.ai/api/v1/systemone` — из доков OpenRouter про TypeSafe SDK,
  тело один в один как у вендора (SDK-совместимый алиас).
- `POST https://openrouter.ai/api/alpha/decisions` — родной alpha-эндпоинт OpenRouter,
  ответ с `id: gen-dec-...`. Подтверждён **двумя независимыми источниками**: сторонним
  гайдом и реализацией `emirbartu/opencode-system-one`.

Рабочая гипотеза: живы оба, `alpha/decisions` — родной. Смоук-тест бьёт обе ветки,
скрипт в `/tmp/jev-smoke.sh` (транзиентный, при необходимости переписать).

## Сводка по харнессам

| Харнесс | Версия | Хук компакции | Мутация транскрипта | Путь к verbatim |
|---|---|---|---|---|
| **OpenCode** | 1.18.30 | `experimental.session.compacting` — только промпт | **да**, `experimental.chat.messages.transform` | **плагин в рантайме** |
| Claude Code | — | `PreCompact` — добавить / заблокировать | нет | блокировать + внешний инструмент |
| Codex CLI | 0.154.0 | нет | нет | только внешний |
| Paseo | plugin 0.8.0 | нет (timeline ≠ контекст) | только отображение | не его слой |

## OpenCode 1.18.30 — единственный пригодный

Полный список хуков в `@opencode-ai/plugin@1.18.30`: `chat.headers`, `chat.message`,
`chat.params`, `command.execute.before`, `permission.ask`, `shell.env`, `tool.definition`,
`tool.execute.before`, `tool.execute.after`, `event`, `auth`, `config`,
`experimental.chat.messages.transform`, `experimental.chat.system.transform`,
`experimental.compaction.autocontinue`, `experimental.provider.small_model`,
`experimental.session.compacting`, `experimental.text.complete`, `experimental_workspace`.

Задачу решает не тот, что называется «compacting»:

```ts
// Хук компакции. Умеет ровно одно: править промпт суммаризатора.
"experimental.session.compacting"?: (
  input:  { sessionID: string },
  output: { context: string[]; prompt?: string }
) => Promise<void>

// Отключить синтетический "continue" после компакции.
"experimental.compaction.autocontinue"?: (
  input:  { sessionID: string; agent: string; model: Model; overflow: boolean; ... },
  output: { enabled: boolean }
) => Promise<void>

// ⭐ Мутируемый массив всех сообщений перед отправкой в LLM.
"experimental.chat.messages.transform"?: (
  input:  {},
  output: { messages: { info: Message; parts: Part[] }[] }
) => Promise<void>
```

`session.compacting` для verbatim бесполезен — он позволяет вежливее попросить
суммаризатор ничего не потерять; механизм остаётся пересказом.

`experimental.chat.messages.transform` отдаёт весь список сообщений с `parts` на мутацию.
Фильтруешь части с tool-call/tool-result, остальное не трогаешь — это и есть дословная
компакция, см. [[2026-09-23-jev-decision-model-verbatim-compaction]].

Рядом: `tool.execute.before`, `tool.execute.after`, `permission.ask` — готовые точки для
pre-tool-use гейта.

**Три подвоха, видные прямо в типах:**

1. **`input: {}` пустой.** Ни `sessionID`, ни модели, ни цели. Хук глобальный;
   различать сессии и доставать goal придётся из самих `messages`.
2. **Это не хук компакции, а хук каждой отправки.** Вызывается на любой запрос к LLM,
   а не при переполнении. Плагин обязан сам считать объём, сам решать, когда включаться,
   и кешировать вердикты по `callID` — иначе классификатор дёргается на каждый ход.
3. **Префикс `experimental.`** у всех. 1.19 вправе переименовать; версию пинить.

Не проверено: `oh-my-openagent@4.19.4` — тоже плагин, и если он трогает `messages`,
порядок вызова transform-хуков между плагинами становится важен.

### Сторонние плагины — ставить не рекомендуется

| Проект | Бэкенд | Что делает | Состояние |
|---|---|---|---|
| `emirbartu/opencode-system-one` | **OpenRouter** | Jev решает, какой skill грузить и какой набор тулов нужен | 13 коммитов, 2 звезды |
| `purplesmoke05/...jev-auto-model-router` | `TYPESAFE_API_KEY` | виртуальный провайдер `Auto (Jev)` | бета, 1 звезда, не в npm |
| `moisesfilho/typesafe-jev-opencode` | `TYPESAFE_API_KEY` | локальный MCP с `jev_decide` | 1 коммит |

Блокеры по нашей конфигурации: `purplesmoke05` требует отдельного ключа TypeSafe,
peer-range `>=1.18.31 <1.19.0` (у нас 1.18.30), и в README прямым текстом
«Compatibility with oh-my-openagent is not fully validated» — а OMO у нас стоит.
`emirbartu` ложится на наш OpenRouter, но перехватывает загрузку скиллов и набор тулов:
худшее место для недельного кода с двумя звёздами, потому что при поломке будет казаться,
что агент поглупел.

Вывод: писать свой тул. `~/.config/opencode/tools/` пустой (только `.keep`), `mcp: {}`
пустой — конфликтовать не с чем. Перед написанием сверить соглашение (`tool/` vs `tools/`,
сигнатуру экспорта) с установленной версией, а не по памяти.

## Claude Code — `PreCompact` есть, но additive

Девять событий: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `SubagentStop`,
`SessionStart`, `SessionEnd`, `PreCompact`, `Notification`. В `~/.claude/settings.json`
сконфигурировано шесть, `PreCompact` среди них нет.

Что `PreCompact` умеет: *«Use to add critical information to preserve»*, плюс из
changelog — **заблокировать компакцию** (`exit 2` или `{"decision":"block"}`).
Мутировать транскрипт нельзя: хук получает событие, а не список сообщений.

Блокировка открывает обходной путь: `PreCompact` запрещает штатную суммаризацию, внешний
инструмент делает дословную компакцию поверх транскрипта. Грубо, требует доступа к
файлам сессии, но не тупик.

## Codex CLI 0.154.0 — ничего

`~/.codex/hooks.json` содержит пять событий: `UserPromptSubmit`, `PreToolUse`,
`PostToolUse`, `PermissionRequest`, `Stop`. Все пять установлены Paseo — каждая команда
это `paseo hooks codex <Event>` под проверкой `$PASEO_TERMINAL_ID`.

Компакции нет ни в каком виде. Только внешний путь.

## Paseo — не тот слой

`@getpaseo/plugin@0.8.0` экспортирует темы, attachment sources, settings, RPC и timeline
transform. Единственное похожее — `PluginTimelineTransformResult`, но он работает над
`PluginTimelineItem { type: "plugin", kind, version, data }`: это **элементы отображения**,
а не сообщения модели.

Логично — Paseo оркеструет агентов и рисует их, контекстом владеет нижележащий агент.
Компакция здесь не живёт.

## Что из этого делать

1. Смоук-тест через OpenRouter: зафиксировать рабочий эндпоинт и реальный p50.
   Если правда 380 мс, на `messages.transform` это ложится нормально, а на
   `tool.execute.before` уже заметно.
2. Прототип verbatim-компакции в OpenCode — единственный харнесс, где ничего не надо
   обходить.
3. Батч-фильтр как обычный тул в пустом `tools/`.

Роутинг моделей не трогать: самый шумный, самый хрупкий, и апстрим OpenCode уже
[закрыл PR #50468](https://github.com/anomalyco/opencode/pull/50468) на эту тему.

## Ссылки

- [Jev SDK for TypeScript and Python — OpenRouter docs](https://openrouter.ai/docs/guides/community/typesafe-sdk)
- [TypeSafe Models — OpenRouter](https://openrouter.ai/provider/typesafe)
- [Jev on OpenRouter — Jev AI Guide](https://jevaiguide.com/channels/openrouter/)
- [opencode-system-one — emirbartu](https://github.com/emirbartu/opencode-system-one)
- [PR #50468 — anomalyco/opencode](https://github.com/anomalyco/opencode/pull/50468)
