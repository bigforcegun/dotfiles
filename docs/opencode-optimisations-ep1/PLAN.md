# OpenCode Optimisations — Ep.1: MCP tool-search (lazy loading)

Черновик. Цель — дать OpenCode «динамическую подгрузку тулов» (как ToolSearch в Claude Code),
чтобы MCP-флот не раздувал контекст. Связано с [MCP Stack](../mcp-stack/PLAN.md):
закрывает дыру «толщина контекста = по наименее способному агенту».

## Проблема

OpenCode грузит **все** определения MCP-тулов в контекст на старте сессии.
Один GitHub-сервер — 15–20k токенов; несколько MCP — 50k+ ещё до первого сообщения.
Курация контекстов (research/dev/...) это смягчает статически, но не убирает.

## Идея: «MCP над MCP» / meta-tool

Вместо N×M тулов в окне — один meta-tool `mcp_search`:
агент ищет тул по запросу → подгружает только нужное → вызывает on-demand.
Паттерн search/execute (как Cloudflare Code Mode, Anthropic Tool Search, Claude Code ToolSearch).

## Два пути реализации (выбрать после проверки версии)

Установлено: **OpenCode 1.17.6**. Сначала проверить, какой механизм поддержан.

### Путь A — нативный экспериментальный флаг (предпочтительно, если есть)
Из PR `anomalyco/opencode#12520`. **Статус: проверить, влит ли в 1.17.6.**
- В `~/.config/opencode/opencode.json` (в репе: `.config/opencode/opencode.json`):
  ```json
  "experimental": { "mcp_lazy": true }
  ```
- Эффект: MCP-тулы исключаются из tool-list, имена серверов идут компактно в system prompt,
  появляется meta-tool `mcp_search`, в `/mcp` серверы помечаются `Lazy`.

### Путь B — плагин (fallback, если флага в 1.17.6 нет)
У нас уже есть механизм плагинов — массив `plugin` в `opencode.json`
(сейчас там `oh-my-openagent@latest`). Добавить tool-search-плагин туда же:
```json
"plugin": ["oh-my-openagent@latest", "<mcp-tool-search-plugin>@latest"]
```
**TODO:** зафиксировать точное имя пакета плагина (кандидат — `francisco-m001/opencode-mcp-tool-search`),
сверить, что он совместим с 1.17.6 и не конфликтует с `oh-my-openagent`.

## Шаги

1. **Определить механизм.** Проверить, есть ли `experimental.mcp_lazy` в 1.17.6
   (changelog / `opencode` config-schema / тестовый прогон). → выбрать A или B.
2. **Включить** на одном контексте с жирным MCP-набором (напр. dev с github+lsp+filesystem).
3. **Применить** через mcp-stack: правка источника `.config/opencode/opencode.json` → линк уже есть.
4. **Проверить** (ниже).
5. Если ок — раскатать на остальные контексты; задокументировать в mcp-stack как «решение для не-tool-search агентов».

## Проверка (acceptance)

- [ ] В `/mcp` серверы помечены `Lazy` (путь A) / плагин активен в логе старта (путь B).
- [ ] В списке тулов сессии **нет** сырых MCP-тулов, но **есть** `mcp_search`.
- [ ] Функционально: попросить агента найти и вызвать конкретный тул (напр. github `search_issues`)
      — он сначала зовёт `mcp_search`, потом сам тул.
- [ ] Замер контекста: токены tool-definitions на старте до/после (ожидание — десятки k → ~0).
- [ ] Project-local HTTP-мосты (`:8400`, `:3001`) и `toolFilter` из mcp-proxy не сломаны.

## Анализ экосистемы: awesome-opencode

Отдельным пунктом — прочесать <https://github.com/awesome-opencode/awesome-opencode>
как кураторский список плагинов/конфигов/паттернов OpenCode. Цель — не изобретать своё,
если в экосистеме уже есть готовое.

Что ищем:
- **tool-search / lazy-loading плагины** — кандидаты на путь B (сверить с `francisco-m001/opencode-mcp-tool-search`).
- **MCP-паттерны** — как другие решают context bloat и «MCP над MCP».
- **plugin API** — на чём писать свой плагин, если готовое не подойдёт (механизм `plugin[]` в `opencode.json`).
- **смежное** — оптимизации контекста, agent-конфиги, совместимость с `oh-my-openagent`.

Выход пункта: короткий shortlist (2–3 плагина) с «за/против» под наши C2/C3/F-требования из mcp-stack
→ им и кормим путь B. Если ничего не подходит — фиксируем решение писать свой минимальный плагин.

## Открытые вопросы

- Влит ли `mcp_lazy` в 1.17.6 или нужен плагин/апдейт?
- Качество поиска: BM25 по описаниям тулов — хватает ли при близких именах (`search_issues` vs `search_code`)?
- Совместимость со встроенным флотом OMO и с `oh-my-openagent`.
- Не теряется ли `toolFilter` (proxy режет тул → его не должно быть и в `mcp_search`-индексе).
