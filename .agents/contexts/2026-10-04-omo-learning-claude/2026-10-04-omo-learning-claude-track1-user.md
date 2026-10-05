---
updated: 2026-10-04
---

# Трек 1: OMO для пользователя

## 0. Важная развилка: два разных OMO

Внутри пакета `oh-my-openagent@5.1.13` сосуществуют описания ДВУХ разных продуктов:

- **README.md** пакета (корень) описывает будущий/параллельный продукт — отдельный бинарник `omo` (форк pi, "senpi"), устанавливаемый через `curl .../install.sh`, с командой `omo setup` для миграции "from the OpenCode edition". Файлы, на которые он ссылается (`docs/guide/migrating-from-opencode.md`, `docs/reference/configuration.md`, `docs/reference/features.md`, `docs/manifesto.md`) **физически отсутствуют** в установленном пакете — проверено `find`.
  Источник: `~/.cache/opencode/packages/oh-my-openagent@5.1.13/node_modules/oh-my-openagent/README.md`.
- **package.json** того же пакета описывает именно то, что реально установлено и подключено в `~/.config/opencode/opencode.json`: *"Batteries-Included OpenCode Plugin with Multi-Model Orchestration, Parallel Background Agents, and Crafted LSP/AST Tools"*.
  Источник: `.../oh-my-openagent/package.json:4` (поле `description`).

**Вывод:** у пользователя установлена "OpenCode-плагин" редакция OMO (через `~/.config/opencode/opencode.json` → `plugin`), а не новый отдельный бинарник `omo`. Весь этот документ — про OpenCode-плагин редакцию. Упоминания README про сайт omo.dev, senpi, "мы ❤️ Pi" — НЕ ПОДТВЕРЖДЕНО как относящиеся к установленной редакции, игнорировать.

**Поправка (проверено оркестратором):** `doctor` пишет «loaded 4.19.4» — это ложное срабатывание. `getLoadedPluginVersion()` в `dist/cli/index.js:106134` перебирает `~/.cache/opencode/packages/oh-my-openagent@*` через `readdirSync().sort()` (лексикографически) и берёт первый существующий — `4.19.4` раньше `5.1.13`. Реальный рантайм — 5.1.13: в `~/.local/share/opencode/log/opencode.log` сессия 2026-10-03 читает `packages/oh-my-openagent@5.1.13/.../dist/index.js` и его скиллы. Старые каталоги 4.19.4/5.1.12 — мусор в кэше, сбивающий doctor.

## 1. Ментальная модель

OMO — это плагин к OpenCode (`~/.config/opencode/opencode.json` → `"plugin": [...]`, судя по описанию в package.json), который добавляет:

- **Набор именованных агентов** (суб-агентов с собственным системным промптом и моделью) — вызываются через `task(subagent_type=...)` изнутри сессии или маршрутизируются автоматически.
- **Категории задач** (`category=...`) — альтернативный способ маршрутизации: не "кто ты", а "какая это по форме работа", с привязкой к модели/reasoning независимо от агента.
- **Hooks** — перехватчики жизненного цикла OpenCode-сессии (детектор ключевых слов типа `ultrawork`, enforcement todo/continuation, ralph-loop и т.д.)
- **Встроенные MCP-серверы** — `websearch`, `context7`, `grep_app`, `lsp` (плюс любые MCP пользователя).
- **Skills** (`SKILL.md`) — пошаговые runbook'и, которые агент подгружает по ключевым словам или по явному запросу (`/init-deep`, `ulw-plan`, `ulw-execute`, `review-work`, `ulw-research`, и др. — всего 16 папок в `dist/skills/`).
- **CLI** `oh-my-opencode` (он же `oh-my-openagent`, `omo-agent-toolkit`, `lazycodex`) — для установки/диагностики/запуска извне TUI.

### 1.1 Агенты, реально сконфигурированные в 5.1.13

Список агентов берётся из двух мест: секции `agents` в `~/.omo/omo.jsonc` (у пользователя) и файлов `dist/agents/*.d.ts` в пакете. Совпадает полностью:

| Агент | Назначение (из комментариев в коде/конфига) | Модель у пользователя (`omo.jsonc`) |
|---|---|---|
| `sisyphus` | Главный рабочий агент (default run agent, "Sisyphus" — основной исполнитель) | gpt-5.6-sol-fast, reasoning medium |
| `hephaestus` | Второй исполнитель/строитель (имя — кузнец-бог; роль — implementer) | gpt-6-sol-fast, medium |
| `oracle` | Финальный ревьюер/оракул — не может читать файлы или запускать команды, получает всё инлайн в промпте (см. `review-work/SKILL.md:150`) | gpt-5.6-sol-fast, reasoning xhigh |
| `librarian` | Внешний ресёрч (документация, веб, библиотеки) | gpt-6-luna-fast, low |
| `explore` | Внутренний ресёрч по кодовой базе (read-only поиск) | gpt-6-luna-fast, low |
| `multimodal-looker` | Работа с изображениями/визуальным контентом | gpt-5.6-sol-fast, low |
| `prometheus` | Планировщик ("planning consultant") — пишет планы в `.omo/plans/`, сам НИКОГДА не реализует (см. `ulw-plan/SKILL.md:10`) | gpt-6-astra-fast, high |
| `metis` | "Plan Consultant" — анализирует запрос ДО планирования: ищет скрытые намерения, неоднозначности, AI-slop паттерны (из JSDoc в `dist/agents/metis.d.ts`) | gpt-6-astra-fast, high |
| `momus` | "Plan Reviewer" — назван в честь бога насмешки Мома; придирчиво ищет пробелы/неоднозначности в плане перед реализацией (JSDoc в `dist/agents/momus.d.ts`) | gpt-6-astra-fast, xhigh |
| `atlas` | Отдельный core-агент (упомянут в `run --help` как доступный core-агент наравне с Sisyphus/Hephaestus/Prometheus) | gpt-5.6-sol-fast, medium |
| `sisyphus-junior` | Облегчённая версия Sisyphus (видимо, для подзадач) | gpt-5.6-sol-fast, medium |

Источники: `~/.omo/omo.jsonc` (секция `agents`), `.../dist/agents/{sisyphus,oracle,librarian,explore,multimodal-looker,metis,momus}.d.ts`, `bin/oh-my-opencode.js run --help` ("Available core agents: Sisyphus, Hephaestus, Prometheus, Atlas").

Роли `explore`, `librarian`, `metis`, `momus`, `oracle` **read-only** — явно написано в `ulw-plan/SKILL.md:93`: *"Roles - the ONLY subagents you may spawn (all read-only, plus oracle for the high-accuracy review): explore ... librarian ... metis ... momus"*.

### 1.2 Категории (альтернатива агентам)

Секция `categories` в `~/.omo/omo.jsonc` и вывод `doctor --verbose`:

| Категория | Для чего (из `ulw-execute/SKILL.md:137-149`) |
|---|---|
| `quick` / `unspecified-low` | мелкая механическая работа, boilerplate — дефолт для дробимых кусков |
| `unspecified-high` | стандартные фичи в паре файлов по известным паттернам |
| `visual-engineering` | фронтенд, UI/UX, стили, анимация |
| `writing` | документация и текст |
| `git` | git-операции |
| `deep-low` | запутанный дебаг/исследовательская работа, решаемая по фактам |
| `deep-high` | то же, но когда решение не выводится из фактов напрямую (trade-off, контракт между пакетами) |
| `ultrabrain` | ОДНА по-настоящему сложная логическая задача — отдают цель, не шаги |
| `artistry` | (есть в конфиге, назначение не раскрыто ни в одном SKILL.md — НЕ ПОДТВЕРЖДЕНО) |

Источник: `~/.omo/omo.jsonc`, `dist/skills/ulw-execute/SKILL.md` (таблица "Delegation router"), вывод `doctor --verbose` (секция Categories).

### 1.3 Hooks (реально существующие в 5.1.13)

Подтверждено по дереву `dist/hooks/`:

- `keyword-detector/ultrawork/` — детектор слова "ultrawork"/"ulw" во входящем сообщении пользователя (`index.d.ts`, `source-detector.d.ts`).
- `ralph-loop/` — отдельный цикл ("ralph-loop-hook.d.ts", "loop-state-controller.d.ts", "continuation-prompt-injector.d.ts", "iteration-continuation.d.ts") — т.е. `ralph-loop` — не просто модное слово из статьи, а реальный встроенный hook с собственным state-контроллером.
- `todo-continuation-enforcer/` — принуждает сессию не останавливаться, пока в TODO есть незавершённые пункты (`todo.d.ts`, `continuation-injection.d.ts`).
- `stop-continuation-guard/` — отдельная защита от преждевременной остановки.
- `tasks-todowrite-disabler/`, `todo-description-override/`, `compaction-todo-preserver/`, `session-todo-status.d.ts` — вспомогательная todo-инфраструктура (переживает компакцию контекста).
- `atlas/boulder-continuation-injector.d.ts`, `atlas/idle-continuation.d.ts` — продолжение работы, привязанное к состоянию "Boulder" (см. §3 про `oh-my-opencode boulder`).
- `goal/index.d.ts` — отдельный hook про цель сессии (`create_goal`).
- `claude-code-hooks/` — совместимость с хуками в стиле Claude Code.

Источник: `find .../dist/hooks -iname "*hook*" -o -iname "*todo*" -o -iname "*continuation*"`.

### 1.4 Встроенные MCP

`doctor --status`/`--verbose` на машине пользователя показывает: `websearch`, `context7`, `grep_app`, `lsp` — builtin (4), плюс 1 MCP пользователя (`toolchain-salotech`). Источник: вывод `oh-my-opencode doctor --verbose` (секция MCPs, строка "MCP: builtin=4, user=1").

## 2. Ключевые слова и команды

Проверено реальным наличием кода/skill-файла, НЕ просто упоминанием в README:

| Слово/команда | Статус | Что делает |
|---|---|---|
| `ultrawork` / `ulw` | ПОДТВЕРЖДЕНО (hook `keyword-detector/ultrawork`) | Триггерит режим "изучи кодовую базу перед правкой, спланируй, проверяй каждый шаг, проверь результат на реальной поверхности" — так описано в README, механика — через keyword-detector hook + skills `ulw-plan`/`ulw-execute`. |
| `ralph-loop` | ПОДТВЕРЖДЕНО (hook `dist/hooks/ralph-loop/*`) | Отдельный зацикленный режим продолжения сессии (own loop-state-controller, iteration-continuation, continuation-prompt-injector/builder). Детали поведения НЕ ПОДТВЕРЖДЕНЫ (не нашёл отдельного SKILL.md с описанием для пользователя — только .d.ts типы, реализация в .js не читалась). |
| `/init-deep` | ПОДТВЕРЖДЕНО (skill `dist/skills/init-deep/SKILL.md`) | Генерирует иерархию `AGENTS.md` (корень + вложенные директории по "очкам сложности"). Режимы: `/init-deep` (update), `--create-new` (снести и переписать), `--max-depth=N` (по умолчанию 3). Параллельно запускает фоновых `explore`-агентов + LSP/ast-grep. |
| `ulw-plan` (он же "Prometheus-режим") | ПОДТВЕРЖДЕНО (skill `dist/skills/ulw-plan/SKILL.md`) | Консультант-планировщик. НИКОГДА не реализует сам. Пишет decision-complete план в `.omo/plans/<slug>.md` после явного "ок" пользователя. Первая строка ответа обязана быть `ULW-PLAN MODE ENABLED!`. |
| `ulw-execute` / `$ulw-execute` | ПОДТВЕРЖДЕНО (skill `dist/skills/ulw-execute/SKILL.md`) | Оркестратор исполнения плана из `.omo/plans/`. Сам НЕ пишет код — только делегирует воркерам, ведёт `.omo/boulder.json` и ledger `.omo/ulw-execute/ledger.jsonl`. Флаги: `--worktree <path>`, `--make-pr`, `--ship`. |
| `review-work` | ПОДТВЕРЖДЕНО (skill `dist/skills/review-work/SKILL.md`) | Пост-имплементационный гейт-ревью: сам гоняет manual QA + запускает ОДНОГО ревьюера (`oracle`), не панель. |
| `ulw-research` / `/ulw-research` | ПОДТВЕРЖДЕНО (skill `dist/skills/ulw-research/SKILL.md`) | Максимально насыщенный ресёрч с командой воркеров, claim-graph, цитированием каждого утверждения. |
| `start-work` / `/start-work` | ЧАСТИЧНО ПОДТВЕРЖДЕНО: фраза "start work" упоминается в `ulw-execute/SKILL.md:70` как триггер "No-plan bootstrap" (трактуется как согласие и запускает `ulw-plan`→сразу исполнение), но отдельной slash-команды `/start-work` в `.opencode/command/` НЕТ (там только `get-unpublished-changes`, `omomomo`, `publish`, `remove-deadcode`, `security-research`). Так что `/start-work` как именно slash-команда — НЕ ПОДТВЕРЖДЕНО; как фраза-триггер в тексте — подтверждено. |
| `mass ulw` / "mass ulw research" | УПОМИНАЕТСЯ в `ulw-research/SKILL.md:166` ("mass ulw research", "mulw research") и в README ("Type `mass ulw`...") — но соответствующий skill `mass-ulw` в установленном пакете физически отсутствует (`find .../mass-ulw` — пусто). Т.е. функциональность задокументирована как ссылка на skill, но сам skill НЕ установлен в 5.1.13 — НЕ ПОДТВЕРЖДЕНО как рабочая фича в этой версии. |

### 2.1 Slash-команды, реально поставляемые плагином

Из `.opencode/command/*.md` (и зеркально `.agents/command/*.md`) пакета:

- `/get-unpublished-changes`
- `/omomomo`
- `/publish`
- `/remove-deadcode`
- `/security-research`

(Содержимое каждой не разбиралось подробно — помечено как источник для детального трека 2/3, если понадобится.)

## 3. CLI `oh-my-opencode`

Вывод `node bin/oh-my-opencode.js --help` (бинарники: `oh-my-opencode`, `oh-my-openagent`, `omo-agent-toolkit`, `lazycodex`, `lazycodex-ai` — все указывают на один файл, см. `package.json:"bin"`):

| Подкоманда | Назначение |
|---|---|
| `install` / `setup` | Установка и интерактивная настройка |
| `cleanup` / `uninstall` | Чистка managed Codex Light state, ремонт legacy-артефактов |
| `run [options] <message>` | Запуск opencode с enforcement todo/background-задач — **ждёт**, пока все todo завершены/отменены И все дочерние (фоновые) сессии не idle. Флаги: `-a/--agent`, `-m/--model`, `-d/--directory`, `-p/--port`, `--attach <url>`, `--on-complete`, `--json`, `--session-id` (резюме сессии) |
| `get-local-version` | Текущая версия + проверка обновлений |
| `doctor [--status|--verbose|--json|--platform]` | Диагностика установки (см. §6) |
| `config migrate` | Миграция старого конфига в `~/.omo/omo.jsonc` |
| `refresh-model-capabilities` | Обновить кэш capability-снапшота моделей (models.dev) |
| `version` | Версия |
| `boulder [-d][-w][--json]` | Прогресс "Boulder"-состояния (elapsed time, per-task статистика) — то самое `.omo/boulder.json`, которое пишет `ulw-execute` |
| `worktree-sweep` | Найти (и опционально удалить) устаревшие git worktree |
| `ulw-loop [args...]` | Запуск Codex LazyCodex ulw-loop CLI (относится к Codex-редакции, не к OpenCode — отдельная ветка функциональности) |
| `mcp oauth` | OAuth-токены для MCP-серверов |

Источник: прямой вывод `--help` на каждую подкоманду (команды безопасны, read-only).

## 4. Типовые сценарии дня

1. **Быстрый вопрос / мелкая правка.** Просто пишете в чат без ключевых слов — отрабатывает дефолтный агент (`sisyphus`, если не переопределено `default_run_agent` в `.omo/omo.jsonc` или `OPENCODE_DEFAULT_AGENT`). Без `ultrawork` — никакого доп. планирования/ресёрча, минимум накладных расходов.
2. **Фича средней сложности, выполнить сразу.** Добавляете слово `ultrawork`/`ulw` в запрос — срабатывает keyword-detector, агент читает код перед правкой, планирует, проверяет каждый шаг (механика описана в README, детального SKILL.md на "просто ultrawork" в этом пакете не нашлось — ulw-plan/ulw-execute идут отдельными явными триггерами).
3. **Большой рефакторинг с планированием.** Явно просите план (или говорите "ulw-plan") → активируется Prometheus-консультант, он никогда не правит код сам, пишет decision-complete план в `.omo/plans/<slug>.md`, спрашивает только то, что реально требует вашего решения (а не то, что можно найти в коде), и ждёт вашего "ок". Затем отдельной командой `$ulw-execute [plan-name] [--make-pr|--ship]` запускаете исполнение — это отдельный оркестратор, который только делегирует работу воркерам и ведёт Boulder-состояние/ledger.
4. **Ресёрч (внутренний или внешний).** Просите "ulw-research" или явно "глубокое исследование" → оркестратор поднимает команду воркеров (`explore` по коду, `librarian` по вебу/докам), строит claim-graph, требует цитату/код-пруф на каждое утверждение, в конце — синтез с источниками.
5. **Пост-работы ревью перед PR.** Говорите "review" / `review-work` → сначала сами запускается manual QA (на реальной поверхности — curl, pty, браузер и т.п.), затем ОДИН ревьюер `oracle` (не читает файлы — весь контекст передаётся инлайн) выносит вердикт APPROVE/REJECT по чеклисту (полнота цели, соответствие ограничениям, корректность поведения, качество кода, безопасность, упущенный контекст, аудит QA-доказательств, scope creep).
6. **Документирование репозитория для агентов.** `/init-deep` — сгенерировать/обновить иерархию `AGENTS.md` (аналог `CLAUDE.md`, но для OpenCode-агентов), с оценкой сложности директорий и параллельным explore+LSP+ast-grep анализом.
7. **Дебаг.** Отдельного выделенного "debug-skill" для пользователя не разбирался подробно, но есть `dist/skills/debugging/` — существует как skill, подробности НЕ ПОДТВЕРЖДЕНЫ (не читал содержимое).
8. **Когда OMO лучше НЕ использовать:** для тривиальных однострочных правок `ultrawork`/`ulw-plan` — избыточны (сами авторы описывают `ulw-research`: "An ordinary question, a debugging session... is not activation; answer those normally" — `ulw-research/SKILL.md:36`). Также `ulw-plan` явно пишет: approval авторизует только написание плана, выполнение — отдельная сессия (`ulw-plan/SKILL.md:77`) — то есть не пытайтесь просить "запланируй и сразу сделай" одним сообщением, модель спроектирована так, чтобы это разделять.

## 5. Категории vs агенты — когда что

- Если нужен **конкретный специалист** (ресёрчер по коду, ресёрчер по вебу, планировщик, ревьюер) — это **агент** (`explore`, `librarian`, `prometheus`, `oracle`, `metis`, `momus`...).
- Если нужно просто **промаршрутизировать кусок работы по форме/сложности** безотносительно роли (мелкая механическая правка vs один сложный логический узел) — это **категория** (`quick`, `unspecified-high`, `deep-high`, `ultrabrain`...), используется внутри `ulw-execute` при декомпозиции плана на под-задачи для воркеров.

## 6. Подводные камни и где смотреть состояние

- **Doctor врёт о версии.** «Loaded 4.19.4» — артефакт сортировки старых каталогов в `~/.cache/opencode/packages/` (см. поправку в начале). НЕ выполнять предложенный `bun add` в каталоге 4.19.4 — это обновит мёртвую копию. Лечение — удалить устаревшие `oh-my-openagent.19.4` и `.1.12` из кэша (с подтверждения пользователя).
- **Где смотреть состояние:**
  - `oh-my-opencode doctor` / `--status` / `--verbose` / `--json` — главный источник правды о здоровье установки, версиях, MCP, моделях по категориям/агентам.
  - `oh-my-opencode boulder [-w <id>] [--json]` — прогресс активной `ulw-execute`-работы (elapsed time, per-task статистика).
  - `.omo/boulder.json` — файл состояния текущей "Boulder"-работы (какой план активен, какие session_id, какой worktree).
  - `.omo/plans/<slug>.md` — планы, написанные Prometheus/`ulw-plan`.
  - `.omo/ulw-execute/ledger.jsonl` — построчный JSON-журнал доказательств по каждому выполненному чекбоксу плана (команды, артефакты, adversarial-классы, cleanup).
  - `~/.omo/omo.jsonc` (у пользователя — симлинк на `~/.dotfiles/.omo/omo.jsonc`) — канонический конфиг агентов/категорий для OpenCode-редакции; "closest file wins", т.е. проектный `.omo/omo.jsonc` в репозитории перекрывает глобальный.
  - `~/.local/share/oh-my-opencode/posthog-activity.json` — файл телеметрии (PostHog), если важно знать, что и куда шлётся.
- **Oracle не читает файлы.** Если зовёте `oracle` напрямую (а не через `review-work`), весь контекст — diff, содержимое файлов, QA-матрица — нужно подавать текстом в промпт; иначе ревью будет пустым/неверным.
- **Планировщик намеренно не исполняет.** Если кажется, что Prometheus/`ulw-plan` "завис" после составления плана и не начинает работу — это by design: нужен явный `$ulw-execute`, отдельная сессия.
- **`mass-ulw` skill — задокументирован, но физически отсутствует** в установленном пакете 5.1.13 (проверено `find`). Ссылки на него в `ulw-execute/SKILL.md` и `ulw-research/SKILL.md` предполагают наличие отдельного skill, но пользователю он пока не доступен локально — при использовании слов "mass ulw" ожидайте degraded-поведение или ошибку, пока skill не появится в установке.
- **`ulw-loop` CLI относится к Codex/LazyCodex-ветке**, а не к OpenCode-плагину, которым пользуется этот пользователь — это НЕ то же самое, что hook `ralph-loop` в `dist/hooks/ralph-loop/`. Легко спутать по названию.

## Шпаргалка

| Хочу | Команда/слово | Когда уместно |
|---|---|---|
| Просто поговорить/мелкая правка | ничего особого | тривиальные правки, вопросы "что тут происходит" |
| Серьёзная фича, выполнить сейчас | `ultrawork` / `ulw` в сообщении | фича средней/высокой сложности, но без формального плана |
| Написать decision-complete план перед большой задачей | попросить "ulw-plan" / "спланируй" | рефакторинг, неочевидный scope, нужен review перед кодом |
| Выполнить ранее написанный план | `$ulw-execute [plan] [--make-pr|--ship]` | план уже лежит в `.omo/plans/` |
| Глубокий ресёрч с цитатами | `ulw-research` / "ulw research" | вопрос, требующий много источников/верификации кода |
| Ревью готовой работы перед PR | "review" / `review-work` | закончили реализацию, нужен gate перед сдачей |
| Документировать репо для агентов | `/init-deep [--create-new] [--max-depth=N]` | первая настройка AGENTS.md или устарела структура |
| Проверить здоровье установки OMO | `oh-my-opencode doctor --verbose` | что-то не работает / после обновления |
| Посмотреть прогресс активного плана | `oh-my-opencode boulder --json` | идёт `ulw-execute`, хочется статуса без логов |
| Обновить OMO | `bun add oh-my-openagent@latest` в директории кэш-пакета (команда из вывода `doctor`) | когда `doctor` сообщает о расхождении версий |

## Источники

- `~/.cache/opencode/packages/oh-my-openagent@5.1.13/node_modules/oh-my-openagent/README.md` — описание другого (будущего/senpi) продукта, НЕ текущей установки.
- `.../oh-my-openagent/package.json` (поля `description`, `bin`, `workspaces`) — подтверждает "OpenCode plugin" редакцию.
- `.../oh-my-openagent/dist/agents/{sisyphus,hephaestus,oracle,librarian,explore,multimodal-looker,metis,momus,atlas,sisyphus-junior}.d.ts` и `builtin-agents/*.d.ts`.
- `.../oh-my-openagent/dist/skills/{init-deep,ulw-plan,ulw-execute,review-work,ulw-research}/SKILL.md` — полный текст прочитан.
- `.../oh-my-openagent/dist/hooks/{keyword-detector/ultrawork,ralph-loop,todo-continuation-enforcer,stop-continuation-guard,atlas,goal}/*` — существование и имена файлов подтверждены через `find`; содержимое `.js` не разбиралось.
- `~/.omo/omo.jsonc` (симлинк → `~/.dotfiles/.omo/omo.jsonc`) — секции `agents` и `categories`.
- `~/.config/opencode/opencode.json` — подключение плагина, провайдеры, модели.
- Вывод команд (запущены вживую, read-only): `node bin/oh-my-opencode.js --help`, `doctor --status`, `doctor --verbose`, `run --help`, `boulder --help`, `config --help`, `mcp --help`.
- `.opencode/command/*.md` и `.agents/command/*.md` — список реальных slash-команд пакета (имена подтверждены, содержимое не разбиралось подробно).
- `find` по пакету — подтверждение отсутствия: `docs/guide/migrating-from-opencode.md`, `docs/reference/configuration.md`, `docs/reference/features.md`, `docs/manifesto.md`, skill `mass-ulw` — все НЕ найдены в установленном дереве 5.1.13.

### Что НЕ подтверждено (и где искал)
- Точное поведение простого `ultrawork` (без `ulw-plan`/`ulw-execute`) — есть hook-детектор ключевого слова, но отдельного пользовательского SKILL.md "как ведёт себя голый ultrawork" в пакете не нашёл (искал `grep -rl ultrawork dist/skills` — совпадения только внутри других skills, не отдельный файл).
- Полное поведение `ralph-loop` для конечного пользователя — нашёл только `.d.ts` сигнатуры (`loop-state-controller`, `ralph-loop-hook`, `continuation-prompt-injector/builder`, `iteration-continuation`), не читал `.js`-реализацию и не нашёл отдельного SKILL.md/README с пользовательским описанием команды.
- `/start-work` как отдельная slash-команда — не существует как файл в `.opencode/command/`; только фраза-триггер внутри логики `ulw-execute` ("No-plan bootstrap").
- `mass-ulw` / `mass ulw` — упоминается в двух SKILL.md и README, но сам skill отсутствует на диске в 5.1.13; не проверял, появляется ли он после `bun add oh-my-openagent@latest` (обновление не выполнялось — потребовало бы изменения состояния, не делал без запроса).
- Содержимое slash-команд `/get-unpublished-changes`, `/omomomo`, `/publish`, `/remove-deadcode`, `/security-research` — только подтверждено их существование, не читал тела.
- Upstream GitHub (CHANGELOG, issues) — не запрашивался в рамках этого прогона (хватило первоисточника №1 — установленного пакета); если нужна сверка с публичным roadmap/changelog, это отдельный шаг.
