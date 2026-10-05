---
updated: 2026-10-04
---

# Трек 3: OMO для агента и внешнего вызова

Окружение проверки: OpenCode 1.18.34 (`/opt/homebrew/bin/opencode` -> `/opt/homebrew/Cellar/opencode/1.18.34/bin/opencode`, бинарь Mach-O, исходников нет), OMO 5.1.13 в `~/.cache/opencode/packages/oh-my-openagent@5.1.13/node_modules/oh-my-openagent/` (далее `$OMO`). Все утверждения о поведении CLI `oh-my-opencode run` подтверждены прямым чтением бандла `$OMO/dist/cli-node/index.js` (это читаемый, не минифицированный esbuild-бандл с комментариями вида `// packages/.../src/....ts`, так что можно цитировать номера строк как «логический путь:строка»).

## 1. Три режима неинтерактивного вызова

### 1.1 `opencode run` (голый OpenCode, без ожидания OMO)

Источник: `opencode run --help`.

```
opencode run [message..]
  -c, --continue     continue the last session
  -s, --session      session id to continue
      --fork         fork before continuing
  -m, --model
      --agent
      --format       default | json   (json = raw JSON event stream)
  -f, --file
      --title
      --attach       attach to running server
  -p/-u              basic auth
      --dir
      --port
      --auto         auto-approve permissions that are not explicitly denied (dangerous!)
```

Проверено живым смоук-тестом (см. §6): `opencode run` **не ждёт** ни todo, ни фоновые сессии — завершается сразу после того, как текущий ответ агента закрыт (`step_finish`). Это подтверждает формулировка собственной справки `oh-my-opencode run --help`: *«Unlike 'opencode run', this command waits until: all todos are completed or cancelled; all child sessions (background tasks) are idle»* (`$OMO/dist/cli-node/index.js:110629-110630`) — то есть разработчики OMO сами документируют разницу.

`--agent` в `opencode run` принимает только **primary**-агентов. При попытке передать OMO-субагента (`explore`) получено:

```
! agent "explore" is a subagent, not a primary agent. Falling back to default agent
```

(живой вывод, см. §6). Т.е. `opencode run --agent explore ...` тихо (с предупреждением в stderr) использует дефолтного агента вместо запрошенного — ловушка для внешнего вызывающего, если он не читает stderr.

`--format json` отдаёт в stdout построчный поток событий OpenCode SDK (`step_start`, `text`, `tool`, `step_finish`, …), НЕ единый финальный JSON-объект. Чтобы получить финальный ответ, вызывающему нужно либо парсить поток и брать последний `text`/`step_finish`, либо использовать `opencode export <sessionID>`.

### 1.2 `oh-my-opencode run` (алиасы: `oh-my-openagent`, `omo-agent-toolkit`, `lazycodex`, `lazycodex-ai`) — рекомендуемый для внешнего вызывающего

Источник: `node $OMO/bin/oh-my-opencode.js run --help`; реализация `$OMO/dist/cli-node/index.js:104795-105640` (логически `packages/omo-opencode/src/cli/run/*.ts`).

```
oh-my-opencode run [options] <message>
  -a, --agent <name>     default: CLI/env/config, fallback Sisyphus
  -m, --model <provider/model>
  -d, --directory <path>
  -p, --port <port>      attaches if port already in use
  --attach <url>
  --on-complete <command> shell-команда после завершения
  --json                  структурированный JSON-результат в stdout
  --no-timestamp
  --verbose               полный поток событий
  --session-id <id>       продолжить существующую сессию
```

Разрешение агента (там же, help text): 1) флаг `--agent`, 2) `OPENCODE_DEFAULT_AGENT`, 3) `.omo/omo.jsonc` → `default_run_agent`, 4) fallback `Sisyphus`. Core-агенты, доступные `run`: `Sisyphus, Hephaestus, Prometheus, Atlas` (это те же primary-агенты, что в `opencode agent list`).

**Ожидание завершения — подтверждено чтением кода.** Функция `checkCompletionConditions` (`:104796-104822`) требует последовательно:
1. нет активного «continuation hook marker» (boulder/ralph-loop, см. `areContinuationHooksIdle`, `:104823-104833`);
2. `areAllTodosComplete` — вызывает `client.session.todo({path:{id: sessionID}, query:{directory}})`, фильтрует статусы ≠ `completed`/`cancelled` (`:104834-104846`);
3. нет активного «background task marker»;
4. `areAllChildrenIdle` → `areAllDescendantsIdle` — рекурсивно обходит `client.session.children(...)` и требует `status.type === "idle"` у каждого потомка (`:104847-104875`).

Поллинг: `pollForCompletion` (`:104883-...`), интервал по умолчанию `DEFAULT_POLL_INTERVAL_MS = 500` мс (`:104885`), есть «grace cycles» на ошибки (`ERROR_GRACE_CYCLES = 3`, `:104887`), watchdog на отсутствие событий `DEFAULT_EVENT_WATCHDOG_MS = 30000` мс (`:104889`), и защита от ложного завершения `requireMeaningfulWork` / `DEFAULT_SECONDARY_MEANINGFUL_WORK_TIMEOUT_MS = 60000` мс (`:104890, 104904`) — то есть команда не считает прогон завершённым, если модель ещё не произвела «значимой работы».

**Запрос отправляется с `tools: { question: false }`** (`:105568-105570`, тело промпта в `dispatchInternalPrompt`). Это прямой механический барьер против интерактивных вопросов: инструмент `question` отключён на уровне тела запроса, агент физически не может задать уточняющий вопрос через штатный tool call в этом режиме.

**Коды возврата:**
- `0` — нормальное завершение (`pollForCompletion` возвращает код; `exitCode === 0` считается успехом при формировании `--json` отчёта, `:105609`);
- `1` — ошибка (`console.error(...); return 1`, `:105631`; также путь `mainSessionError` + `ERROR_GRACE_CYCLES`, `:104927-104933`);
- `130` — прервано (SIGINT → `process.exit(130)`, `:105531`; `AbortError` → `return 130`, `:105627-105628`; тоже в `pollForCompletion` при `abortController.signal.aborted`, `:104915-104917`).

**Формат `--json`:** когда указан `--json`, создаётся `jsonManager` (`createJsonOutputManager()`), который **перенаправляет весь обычный лог-вывод в stderr** (`jsonManager.redirectToStderr()`, `:105500-105502`) и в конце печатает в stdout ровно один JSON-объект:

```js
jsonManager.emitResult({
  sessionId: sessionID,
  success: exitCode === 0,
  durationMs,
  messageCount: eventState.messageCount,
  summary: eventState.lastPartText.slice(0, 200) || "Run completed"
});
```
(`:105606-105614`). Т.е. поля результата: `sessionId`, `success` (bool), `durationMs`, `messageCount`, `summary` (**обрезан до 200 символов** — это не полный ответ, только хвост последнего текстового фрагмента!). Для полного текста ответа внешний вызывающий должен отдельно дёрнуть `opencode export <sessionId>` или `session_read`/`client.session.messages`.

Пример из собственной справки: `oh-my-opencode run --json "Fix the bug" | jq .sessionId`.

**Продолжение сессии:** `--session-id <id>` → `resolveSession({client, sessionId, directory})` (`:105535-105539`) переиспользует существующую сессию вместо создания новой — это механизм «дозапроса».

**Сервер:** если `--port` не указан, команда поднимает собственный локальный сервер (или цепляется к уже занятому порту — «attaches if port already in use», из help); `--attach <url>` подключается к уже запущенному `opencode serve`. `--port` и `--attach` взаимоисключающие (`:110616-110619`, явная проверка с `process.exit(1)`).

### 1.3 `opencode serve` + HTTP/SDK

Источник: `opencode serve --help`.

```
opencode serve
  --port, --hostname, --mdns, --mdns-domain, --cors
```

Это голый headless HTTP-сервер OpenCode (JSON-RPC/REST, тот самый клиент, который использует `oh-my-opencode run` внутри — видно по вызовам `client.session.todo(...)`, `client.session.status(...)`, `client.session.children(...)`, `client.event.subscribe(...)` в коде выше). Для внешнего оркестратора это самый гибкий, но самый «сырой» путь: нужно самостоятельно реализовать то, что `oh-my-opencode run` уже делает бесплатно — создание/продолжение сессии, отправку промпта, поллинг todo/children/status, обработку событий. **Рекомендация: не изобретать этот слой заново, использовать `--attach <url>` в `oh-my-opencode run`/`opencode run`, направляя их на уже поднятый `opencode serve`.**

## 2. Как вызывающему агенту сформулировать задачу для OMO

- **Выбор primary-агента** для `oh-my-opencode run -a <...>`: `Sisyphus` (дефолт, «ultraworker», по `opencode agent list` — помечен `(primary)`), `Hephaestus`, `Prometheus`, `Atlas`. Это те же агенты, что видны в `opencode agent list`. Субагенты (`explore`, `librarian`, `oracle`, `metis`, `momus`, `multimodal-looker`, `sisyphus-junior`) **нельзя** передать как primary в `run` — см. §1.1, падает в дефолт с warning.
- **Ключевые слова из README** (`$OMO/README.md`, разделы «Why OmO»): `ultrawork` / `ulw` — сигнал агенту не срезать углы: читать код перед правкой, планировать, проверять каждый шаг, проверять результат «на реальной поверхности». `mass ulw` — превращает задачу в граф параллельных агентов (глубокий ресёрч, ML-пайплайн, миграция), каждая часть на подходящей модели. Это цитаты из README, а не код — поведение изнутри промпт-инжиниринга не проверялось отдельно (НЕ ПОДТВЕРЖДЕНО на уровне кода, только документация).
- **Защита от бесконечной петли вопросов**: в `run`-режиме tool `question` отключён на уровне тела запроса (`tools: { question: false }`, см. §1.2) — агент не сможет остановиться на интерактивный вопрос; если он всё равно «зависнет», сработает `eventWatchdogMs`/`secondaryMeaningfulWorkTimeoutMs` поллер и выйдет с ошибкой, а не будет висеть вечно (но: `DEFAULT_SECONDARY_MEANINGFUL_WORK_TIMEOUT_MS=60000` — минута до повторной проверки, не хард-лимит на всю задачу — общего таймаута на весь прогон в CLI **не обнаружено**: ни `opencode run`, ни `oh-my-opencode run --help` не показывают флаг `--timeout`. Внешнему вызывающему нужен свой внешний таймаут, напр. `timeout 600 oh-my-opencode run ...`).
- **Таймауты** — внешние (`timeout(1)` в обёртке), встроенного флага нет (проверено по тексту help обоих `run`).
- **Ограничение прав (permissions)**: конфиг `~/.config/opencode/opencode.json` → `"permission"` — верифицировано чтением файла пользователя:
  ```json
  "permission": {
    "*": "allow",
    "external_directory": "ask",
    "doom_loop": "ask",
    "bash": { "*": "allow", "*brew install*": "deny", ... },
    "edit": { "*": "allow", "opencode.json": "deny", ".git/**": "deny", ".gitignore": "ask", ... }
  }
  ```
  Риск для headless-вызова: правила `"ask"` (`external_directory`, `doom_loop`, `.gitignore`, `.gitattributes`, `.gitmodules`) требуют интерактивного подтверждения, которого в headless-режиме нет. `opencode run` имеет флаг `--auto` («auto-approve permissions that are not explicitly denied (dangerous!)») — у `oh-my-opencode run` такого флага **нет** в help. Что реально происходит с `"ask"`-правилом без TTY (тихий deny, hang или auto-allow) — **НЕ ПОДТВЕРЖДЕНО**: искал в бандле OMO (`$OMO/dist/cli-node/index.js`, `$OMO/dist/index.js`) — сам `opencode`-бинарь (где реализована логика permission-промпта) не является исходным кодом, доступным для чтения (Mach-O бинарь `/opt/homebrew/Cellar/opencode/1.18.34/bin/opencode`), а намеренный триггер `"ask"`-правила (например, запись за пределы `external_directory`) не пробовался, чтобы не делать деструктивных/дорогих действий без необходимости. Рекомендация для внешнего вызывающего: держать задачи внутри одного проектного каталога, не задевать `.git/**` и `external_directory`-периметр, либо заранее добавить нужные пути в allow-листы в `opencode.json`/`.omo/omo.jsonc`, если такой контроль у вызывающего есть.
- **Выбор модели**: `-m/--model provider/model` в обоих `run`; в OMO есть встроенный fallback-каскад моделей по категориям задач (видно в `~/.omo/omo.jsonc` → `[opencode].categories.*.models[]`, например `ultrabrain` → `gpt-6-astra` reasoning `max`, затем fallback `gpt-5.6-sol`).

## 3. OMO изнутри — что видит агент, работающий внутри OMO-сессии

Источник: имена пакетов инструментов `$OMO/dist/tools/*` и грепы по `$OMO/dist/index.js` (runtime-бандл плагина; `.d.ts` в `dist/tools/*` — только тип-декларации, реализация инлайнится в `dist/index.js`).

Список тул-пакетов (`ls $OMO/dist/tools`): `background-task`, `call-omo-agent`, `delegate-task` (легаси-имя, подменяется на `task`, см. ниже), `glob`, `grep`, `hashline-edit`, `interactive-bash`, `look-at`, `monitor`, `session-manager`, `shared`, `skill`, `skill-mcp`, `slashcommand`, `task`.

- **`task(subagent_type=..., load_skills=[...], prompt=...)`** — делегирование субагенту синхронно/с уведомлением. Пример из подсказки `agent-usage-reminder` (`$OMO/dist/index.js:100890-100914`, вывод reminder-хука когда агент сам сделал grep/glob/webfetch вместо делегирования):
  ```
  task(subagent_type="explore", load_skills=[], prompt="Find all files matching pattern X")
  task(subagent_type="explore", load_skills=[], prompt="Search for implementation of Y")
  task(subagent_type="librarian", load_skills=[], prompt="Lookup documentation for Z")
  ```
  Комментарий в том же месте: «Background tasks run in parallel... System will notify you when each completes» — т.е. `task` поддерживает фоновый режим с нотификацией, не только блокирующий вызов.
- **`call_omo_agent(description=..., subagent_type=..., run_in_background=true, prompt=...)`** — второй механизм делегирования, обнаружен как часть системного промпта в `$OMO/dist/index.js:27875-27876`:
  ```
  call_omo_agent(description="Explore codebase patterns", subagent_type="explore", run_in_background=true, prompt="...")
  call_omo_agent(description="Research documentation", subagent_type="librarian", run_in_background=true, prompt="...")
  ```
  Разница `task` vs `call_omo_agent` в деталях реализации не вычленена из бандла (оба попадают в один список `TASK_TOOLS`/`AGENT_TOOLS`, `:114010`, `:100889-100890`) — вероятно, `call_omo_agent` — более новый/унифицированный API делегирования, который вызывает полноценных OMO-агентов (включая primary типа Sisyphus), а `task` — более старый/легче путь к встроенным категориям (`explore`, `librarian`, `oracle`, `metis`, `momus`, `multimodal-looker`). Точная семантическая разница — НЕ ПОДТВЕРЖДЕНО, нужен более глубокий разбор `$OMO/dist/tools/task/*.d.ts` + runtime либо тест двух вызовов.
- **`background_output`** — инструмент чтения результата фонового таска/сессии (фигурирует рядом с `call_omo_agent` во всех «белых списках» инструментов, напр. `$OMO/dist/index.js:123196-123197`, `:173414-173419`).
- **`session_read`/`session_search`/`session_info`/`session_list`** — инструменты для агента внутри OMO читать/искать по собственным или другим сессиям (пакет `session-manager`; имена видны в списке исключений JSON-error-recovery, `:123192-123203`).
- **`skill` + `skill_mcp`** — skill-loader и MCP-прокси. Паттерн использования из подсказок в коде (`:127501-127503`, `:127592`):
  ```
  skill_mcp(mcp_name="sqlite", tool_name="query", arguments='{"sql": "SELECT * FROM users"}')
  skill_mcp(mcp_name="memory", resource_name="memory://notes")
  skill_mcp(mcp_name="helper", prompt_name="summarize", arguments='{"text": "..."}')
  ```
  Подсказка: «Load the skill first using the 'skill' tool, then call skill_mcp» — то есть MCP-серверы, объявленные скиллом, доступны только после явной загрузки скилла; `skill_mcp` не может звать произвольный MCP напрямую (`:127544`: «skill_mcp can only call MCP servers declared by loaded skills»).
- **LSP/ast-grep**: явных имён тулов `lsp_*` и ast-grep не нашёл в §-граммах выше напрямую, но в коде встречается список `["lsp_symbols", "lsp_goto_definition", "lsp_find_references", "lsp_diagnostics"]` как «исключения из ограничений для некоторых агентов» (`$OMO/dist/index.js:160757`) — подтверждает, что такие LSP-инструменты существуют и выдаются избирательно; ast-grep фигурирует как хук автопровижининга бинаря `sg` (`$OMO/dist/index.js` окрестности `ast-grep-sg-provision`, строки ~100850-100862) — то есть OMO сам ставит/находит `ast-grep` бинарь, но имя самого тула для модели не зафиксировано в собранных грепах (НЕ ПОДТВЕРЖДЕНО конкретное имя тула, напр. `ast_grep_search`).
- **Делегирование подагентов внутри OMO**: судя по `TASK_TOOLS = ["task", "call_omo_agent"]` (`:114010`) и `TARGET_TOOLS2 = ["task", "Task", "task_tool", "call_omo_agent"]` (`:114116`), субагент, вызванный через `task`/`call_omo_agent`, сам может рекурсивно звать эти же инструменты (нет явного грепа, подтверждающего запрет рекурсии на N-м уровне, кроме отдельного ограничения `createAgentToolRestrictions(["write","edit","apply_patch","task","call_omo_agent"], [...])` для какого-то агента, `:160757` — т.е. **некоторым** агентам `task`/`call_omo_agent` явно запрещены, значит у других по умолчанию разрешены — рекурсия архитектурно возможна, но нет гарантии глубины/защиты от взрыва параллелизма кроме `team_mode.max_parallel_members`/`max_members` из `omo.jsonc`).

## 4. Рецепты

### (а) Claude Code вызывает OMO через Bash для ресёрча и забирает ответ

```bash
cd /path/to/target/project
oh-my-opencode run --agent Sisyphus --json \
  "Research: <конкретный вопрос>. Отвечай фактами с указанием файл:строка." \
  > /tmp/omo_result.json 2> /tmp/omo_result.log
sid=$(jq -r .sessionId /tmp/omo_result.json)
ok=$(jq -r .success /tmp/omo_result.json)
echo "session=$sid success=$ok"
jq -r .summary /tmp/omo_result.json   # только первые 200 символов хвоста ответа
# если нужен полный текст:
opencode export "$sid" | jq -r '.messages[-1]'  # точный путь внутри export-JSON не проверен — экспорт даёт полную сессию, разбор под конкретную структуру
```
Важно: `--json` переносит обычные логи в stderr (`/tmp/omo_result.log`), а в stdout — ровно один JSON-объект, что делает парсинг надёжным (в отличие от `opencode run --format json`, который льёт построчный стрим событий).

### (б) Скрипт CI

```bash
set -e
timeout 600 oh-my-opencode run --agent Hephaestus --json --on-complete "echo done" \
  "Implement feature X per spec.md" > result.json
exit_code=$?
if [ "$exit_code" -ne 0 ]; then
  echo "OMO run failed with exit $exit_code" >&2
  exit "$exit_code"
fi
success=$(jq -r .success result.json)
[ "$success" = "true" ] || exit 1
```
Замечания: внешний `timeout` обязателен — встроенного общего лимита на прогон нет (см. §2). Код возврата `0/1/130` подтверждён чтением кода (§1.2); CI должен трактовать `130` как «прервано», а не «ошибка задачи».

### (в) Дозапрос в ту же сессию

```bash
oh-my-opencode run --session-id ses_abc123 --json "Continue the work: также прогони тесты"
```
Подтверждено флагом `--session-id` в help и реализацией `resolveSession({client, sessionId: options.sessionId, directory})` (`$OMO/dist/cli-node/index.js:105535-105539`), которая переиспользует существующую сессию вместо создания новой.

## 5. Риски

- **Стоимость**: не измерялась системно; один смоук-тест (§6) потратил 33293 токена (input) на тривиальный промпт «ответь одним словом: ok» через дефолтного агента (OMO инжектит большой системный промпт/контекст) — внешнему вызывающему стоит помнить, что даже тривиальный `run` не бесплатен по токенам из-за системных промптов OMO/агента.
- **Гонки с конфигом**: `.omo/omo.jsonc` резолвится «ближайший файл выигрывает» (цитата из README, раздел «Configuration») — при параллельных вызовах из разных рабочих директорий с разными project-level `.omo/omo.jsonc` вызывающий может получить разное поведение агентов без явного указания; не проверялось поведение при одновременной записи в один и тот же `.omo/omo.jsonc`/`opencode.json` двумя параллельными `run`.
- **Рабочий каталог**: `-d/--directory` в `oh-my-opencode run`, `--dir` в `opencode run` — если не указан явно, оба берут `process.cwd()` (`$OMO/dist/cli-node/index.js:105498`, `const { directory = process.cwd() } = options`). Для вызова из другого агента/CI критично явно передавать каталог, а не полагаться на cwd процесса-обёртки.
- **Интерактивные permission-промпты в headless**: см. §2 — конфигурация пользователя содержит правила `"ask"` (`external_directory`, `doom_loop`, некоторые git-файлы). Поведение этих правил без TTY **не подтверждено** (ни hang, ни silent-deny не воспроизведены намеренно, чтобы не рисковать деструктивным/дорогим действием без необходимости). Это главный неизвестный риск для безнадзорного headless-вызова и кандидат для отдельной точечной проверки (например, запустить `run` с промптом, который явно просит создать файл за пределами проектного каталога, и посмотреть, зависнет ли процесс до `timeout` или быстро получит deny).
- **Зависания**: встроенная защита — `pollForCompletion`'ы watchdog (`eventWatchdogMs=30000`мс) и «meaningful work» таймаут (`60000`мс, см. §1.2) защищают только от *внутреннего* зависания сессии (нет событий / нет реальной работы), но не от зависания на permission-промпте, который физически не может быть отвечен в headless-режиме (вопрос открыт, см. выше). Внешний `timeout(1)` остаётся единственной надёжной подстраховкой.
- **`opencode run --agent <субагент>`** тихо подменяется дефолтным агентом с предупреждением только в stderr (§1.1) — если вызывающий не читает stderr, он не узнает, что запросил не того агента.

## 6. Реально выполненные команды

```bash
opencode --help
opencode run --help
opencode serve --help
node ~/.cache/opencode/packages/oh-my-openagent@5.1.13/node_modules/oh-my-openagent/bin/oh-my-opencode.js --help
node ~/.cache/opencode/packages/oh-my-openagent@5.1.13/node_modules/oh-my-openagent/bin/oh-my-opencode.js run --help
opencode agent --help
opencode agent list
opencode export --help
opencode session --help
```
Все — read-only, без изменений конфигов. Плюс один живой смоук-тест:
```bash
mkdir -p /tmp/omo-smoke && cd /tmp/omo-smoke
timeout 120 opencode run --agent explore --format json "ответь одним словом: ok"
```
Вывод (точный, сокращён до сути):
```
! agent "explore" is a subagent, not a primary agent. Falling back to default agent
{"type":"step_start", ...}
{"type":"text", ..., "part":{..."text":"ok", ...}}
{"type":"step_finish", ..., "tokens":{"total":33293,"input":33288,"output":5,...},"cost":0}
```
`exit=0`. Каталог `/tmp/omo-smoke` удалён после теста. `~/.config/opencode/opencode.json` и `~/.omo/omo.jsonc` только прочитаны (`cat`), не изменены.

## Источники

- `opencode --help`, `opencode run --help`, `opencode serve --help`, `opencode agent --help`, `opencode agent list`, `opencode export --help`, `opencode session --help` (живой вывод команд).
- `node $OMO/bin/oh-my-opencode.js --help`, `... run --help` — живой вывод.
- `$OMO/dist/cli-node/index.js` (бандл OMO CLI), ключевые диапазоны строк:
  - `:104795-104822` — `checkCompletionConditions`;
  - `:104834-104875` — `areAllTodosComplete`, `areAllChildrenIdle`, `areAllDescendantsIdle`;
  - `:104883-104914` — константы и цикл `pollForCompletion`;
  - `:105492-105640` — функция `run()`, тело промпта с `tools:{question:false}` (`:105568-105570`), формирование `--json` результата (`:105606-105614`), коды возврата (`:105627-105631`);
  - `:110607-110634` — регистрация команды `run` в commander, help-текст.
- `$OMO/dist/index.js` (бандл плагина/рантайма инструментов):
  - `:100889-100914` — пример `task(...)` в agent-usage-reminder хуке;
  - `:27875-27876` — пример `call_omo_agent(...)` в системном промпте;
  - `:114010`, `:114116` — списки `TASK_TOOLS`/`TARGET_TOOLS2`;
  - `:123192-123203` — список инструментов-исключений (включает `session_read/search/info/list`, `skill`, `skill_mcp`, `background_output`, `call_omo_agent`, `task`);
  - `:127501-127592` — паттерны вызова `skill_mcp` и требование предварительной загрузки скилла;
  - `:160757` — ограничение `task`/`call_omo_agent`/LSP-инструментов для отдельного агента.
- `$OMO/README.md` — разделы «Why OmO» (`ultrawork`/`ulw`, `mass ulw`), «Configuration» («closest file wins»), «Docs» (ссылки на `docs/reference/configuration.md` и `docs/reference/features.md`, которые **не входят в npm-пакет** — проверено: `$OMO/docs/reference/` содержит только `github-attachment-upload.md` и `web-terminal-visual-qa.md`, т.е. эти файлы нужно смотреть на omo.dev/docs или в upstream-репозитории, НЕ ПОДТВЕРЖДЕНО содержимое).
- `~/.config/opencode/opencode.json` — блок `"permission"` (прочитан `cat`).
- `~/.omo/omo.jsonc` — блок `"agents"`/`"categories"` (прочитан `cat`).
- Не читал и не использовал: `.agents/contexts/2026-10-03-omo-learning/`, `.agents/contexts/2026-06-21-omo-subagents-refining/` (по запрету задания).
