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

## OMO-конфликт: разрешение (главная находка)

**OMO Ultimate уже реализует динамическую подгрузку MCP сам.** Проверено по
кэшу пакета `oh-my-openagent@4.9.2`:

- Есть meta-tool **`skill_mcp`** (`createSkillMcpTool`):
  *"Invoke MCP server operations from skill-embedded MCPs. Requires mcp_name plus
  exactly one of: tool_name, resource_name, or prompt_name."* — это ровно
  search/execute-паттерн, только через скиллы.
- Per-skill `formatMcpCapabilities(skill, manager, sessionID)` — компактно отдаёт
  модели capability скилла, а не сырые N×M схемы тулов (progressive disclosure).
- `BUILTIN_MCP_TOOL_HINTS` для встроенных (websearch/context7/grep_app).
- README OMO прямо: *«Навыки несут собственные MCP-серверы. Запускаются по
  необходимости, ограничены задачей, исчезают по завершении. Контекст чистый.»*

**Следствие:** `opencode mcp list` показывает 6 серверов `connected`, но это коннект
на уровне OMO-менеджера, **не** обязательно сырые схемы в окне модели — экспозиция
идёт через `skill_mcp` (лениво).

**Вывод по конфликту:**
- В **OMO-проектах** ставить `francisco`-плагин — **избыточно и конфликтно**: два
  конкурирующих ленивых слоя + двойной коннект к одним серверам. ❌ Не стекать.
- Рычаги в самом OMO (из `oh-my-opencode.schema.json`): `disabled_mcps`,
  `disabled_tools`, `skills` (`sources`/`enable`/`disable`), `mcp_env_allowlist`.
  Стороннего плагина не нужно.

**Перепостановка задачи EP1.** Вопрос не «добавить tool-search плагин», а:
когда mcp-stack добавляет общий флот (URL'ы mcp-proxy) в OpenCode — он попадает
**eager** в native `mcp` (раздувание) или его можно прогнать через ленивый
`skill_mcp`? Рычаг — упаковать общий флот как **skill-embedded MCP** (через
`skills.sources`), а не native `mcp`-записи, чтобы унаследовать OMO-ленивость.

**Остаточная эмпирика (одна проверка):** реально ли native `mcp`-добавка грузится
eager, пока OMO-builtins ленивы — замерить tool-set, который уходит модели.

**Где плагин всё-таки уместен:** не-OMO таргеты (Cursor / Codex / Kilo / «голый»
OpenCode без OMO). Это отдельный трек, не смешивать с OMO-проектами.

---

## Два пути реализации — ТОЛЬКО для не-OMO (для OMO см. выше)

Установлено: **OpenCode 1.17.6**. Путь A проверен — **нативного `mcp_lazy`/`mcp_search`
в бинаре 1.17.6 НЕТ** (0 вхождений). Остаётся путь B (плагин), и только для не-OMO.

### Путь A — нативный флаг `experimental.mcp_lazy` — ❌ ОТПАДАЕТ
Из PR `anomalyco/opencode#12520`. **Проверено: в бинаре 1.17.6 строк `mcp_lazy`/`mcp_search`
нет (0 вхождений).** Не влито. Вернуться к нему при апгрейде OpenCode, когда фича доедет.

### Путь B — сторонний плагин (для не-OMO)
Механизм: массив `plugin` в `opencode.json` (ключ — `plugin`, **не** `plugins`).
```json
"plugin": ["<mcp-tool-search-plugin>"]
```
Кандидат `francisco-m001/opencode-mcp-tool-search` — **блокеры, выявленные при разборе:**
- пакет `@francisco-m001/opencode-mcp-tool-search` опубликован в **GitHub Packages**
  (`npm.pkg.github.com`), не в публичном npm → `npm view` даёт 404; ставить через
  `.npmrc` + токен `read:packages` ИЛИ собирать из исходников в `.opencode/plugin/`;
- **README устарел**: учит `plugins`/`mcpServers`, а 1.17.6 хочет `plugin`/`mcp`;
- архитектурно это **мини-гейтвей**: свой список `mcpServers`, сам коннектится через
  MCP SDK, fuzzy-поиск `fuse.js`, регистрирует `mcp_tool_search` + `mcp_call_tool`;
  требует **убрать серверы из native-конфига** и завести внутри плагина.
- **интеграция с mcp-stack:** скормить ему как upstream URL'ы mcp-proxy →
  `opencode → плагин → mcp-proxy → stdio`. Процессы остаются за proxy, `toolFilter`
  режет наверху, плагин = только search-фасад. Это рабочий «MCP над MCP».

Альт-кандидат: `opencode-raven@2.1.4` (есть в публичном npm) — но «routed through Raven»,
вероятно внешний сервис → против C3/приватности; проверить отдельно.

## Шаги

**Для OMO-проектов (основной кейс):**
1. Эмпирически подтвердить, что OMO-builtins реально ленивы (через `skill_mcp`), а
   native `mcp`-добавки — eager. → замер tool-set'а, уходящего модели.
2. Упаковать общий флот mcp-stack (URL'ы mcp-proxy) как **skill-embedded MCP**
   (`skills.sources`), а не native `mcp`, чтобы унаследовать ленивость OMO.
3. Проверить, контролировать лишнее через `disabled_mcps`/`disabled_tools`.

**Для не-OMO (отдельный трек):** путь B — собрать `francisco` из исходников в песочнице,
указать upstream = mcp-proxy URLs, проверить регистрацию meta-тулов.

## Проверка (acceptance)

**OMO-трек:**
- [ ] В tool-set модели на старте — `skill_mcp` (и/или капы скиллов), а **не** сырые
      схемы всех тулов 6 серверов.
- [ ] Общий флот mcp-stack виден агенту лениво (через `skill_mcp`), не eager.
- [ ] `disabled_mcps`/`disabled_tools` режут лишнее.

**Не-OMO-трек:**
- [ ] Плагин активен в логе старта; зарегистрированы `mcp_tool_search` + `mcp_call_tool`.
- [ ] В списке тулов сессии **нет** сырых MCP-тулов, но **есть** meta-тулы.
- [ ] Функционально: агент сначала зовёт `mcp_tool_search`, потом `mcp_call_tool`.
- [ ] upstream = mcp-proxy: `toolFilter` соблюдён (зарезанный тул не виден и в поиске).

**Общее:**
- [ ] Project-local HTTP-мосты (`:8400`, `:3001`) не сломаны.

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
