---
updated: 2026-10-04
---

# Трек 2: Недушный OMO

Версии: OpenCode 1.18.34, OMO (`oh-my-openagent`) 5.1.13, установлен **только как opencode-плагин** (нет отдельного нативного `omo`-бинаря: `which omo` → `command not found`). Все пути и номера строк — из установленного пакета:
`~/.cache/opencode/packages/oh-my-openagent@5.1.13/node_modules/oh-my-openagent/`.

Запреты соблюдены: `.agents/contexts/2026-10-03-omo-learning/` и `2026-06-21-omo-subagents-refining/` не читались; конфиги не менялись (только чтение + анализ через `python3`/`grep`/`cat`).

## 1. Где и как OMO читает конфиг

Источник: `dist/index.js` (минифицированный, но с сохранёнными именами функций и комментариями-путями к исходным TS-файлам `packages/omo-config-core/src/loader/*`).

- Пользовательский конфиг: `resolveUserOmoConfigDirectory()` → `$HOME/.omo/omo.jsonc` (или `.json`, если `.jsonc` нет). Для symlink-пути **нет** проверки «это симлинк — игнорируй»: `detectUserOmoJsonPath()` просто делает `existsSync`. (`dist/index.js:21342-21356`). Это объясняет, почему у пользователя рабочий конфиг — симлинк `~/.omo/omo.jsonc -> ~/.dotfiles/.omo/omo.jsonc` — подхватывается: он user-scope, а не project-scope.
- Проектный конфиг: `findProjectConfigPathsFarthestFirst()` идёт от `cwd` вверх до `$HOME`/account-home и на каждом уровне ищет `<dir>/.omo/omo.jsonc|omo.json` (`dist/index.js:21373-21399`). **Важно**: если сама директория `.omo` в проекте — симлинк, либо если файл `omo.jsonc/omo.json` внутри неё — симлинк, такой проектный конфиг **полностью игнорируется** (`isSymlinkedProjectPath`, `isLoadableProjectConfigFile`, `dist/index.js:21349-21372`). Для user-конфига это ограничение не действует.
- Порядок слияния: `resolveOmoConfigPaths()` возвращает `[{path: userPath, scope:"user"}, ...projectPaths]`, где `projectPaths` — «от дальней директории к ближней» (`dist/index.js:21417-21423`, функция `findProjectConfigPathsFarthestFirst` в конце делает `.reverse()`, то есть ближайший к `cwd` накатывается последним и выигрывает). Итог: **user `~/.omo/omo.jsonc` — база, каждый вложенный `.omo/omo.jsonc` по дереву проекта — оверрайд, чем ближе к cwd — тем выше приоритет.**
- Легаси-имена, которые мигрируются автоматически (один раз) в `omo.jsonc`, но сами **не читаются в рантайме**: `oh-my-openagent.jsonc`, `oh-my-openagent.json`, `oh-my-opencode.jsonc`, `oh-my-opencode.json` (`CONFIG_FILE_NAMES`, `dist/config-migration/discovery-paths.d.ts:2`; те же имена в `dist/index.js:99179-99182`). В `~/.config/opencode/` лежат их `.bak`-остатки после миграции — это артефакты, не действующий конфиг.
- Формат: JSONC (комментарии разрешены), парсится как `jsonc` — подтверждено расширением `.jsonc` как первичным вариантом поиска везде.
- Блок `"[opencode]": {...}` в конфиге пользователя — это **не опечатка и не мусор**, это легитимный harness-scoped блок: `harnessBlockKey(harness) => \`[${harness}]\`` (`dist/index.js:20940-20942`), harness `opencode` входит в `OMO_CONFIG_HARNESS_IDS = ["opencode","native","codex"]` (`dist/index.js:20341`). Внутри такого блока действует та же схема `OhMyOpenCodeConfigSchema`.
- Диагностика применения. **Поправка оркестратора:** бинаря `omo` нет, но doctor есть и работает: `node ~/.cache/opencode/packages/oh-my-openagent@5.1.13/node_modules/oh-my-openagent/bin/oh-my-opencode.js doctor --verbose` (запускалось, без сети). Его строку «loaded 4.19.4» игнорировать — ложное срабатывание, см. трек 1. Дополнительно:
  - Невалидные/неизвестные ключи не роняют загрузку, а **молча вырезаются с предупреждением**: `"config: <file>: <key> ignored (unknown key)"` / `"... ignored (invalid value)"` (`omoConfigDiagnosticLines`, `dist/index.js:21021-21035`). Эти строки попадают в `warnings` результата `validatePluginConfig()` (`dist/index.js:26944-26967`).
  - При полностью невалидном файле — `"config: <file>: reset to defaults (<reason>)"`, где `<reason>` — `JSONC parse error` / `unreadable` / `invalid: <path>` (`dist/index.js:21011-21020`).
  - В TUI это всплывает как тост (`ctx.client.tui.showToast(...)`, пример на `dist/index.js:94707-94699` для hook-уведомлений) и как текст **"config invalid — run doctor"** в сайдбаре TUI (`dist/tui.js:75397,75447`) — то есть сам `oh-my-opencode.js`-doctor framework в пакет зашит (`packages/omo-opencode/src/cli/doctor/...`, видно по комментариям-путям в `dist/index.js:88306-88352` и `dist/tui.js:72976-73061`), но вызывается только из отдельного нативного CLI-бинаря, которого у пользователя нет.
  - bunx-вариант не нужен — локальный бинарь из кэша уже работает.
  - Собственный лог плагина идёт через `log2(...)`, попадает в обычный opencode-лог (сейчас `logLevel: "INFO"` в `~/.config/opencode/opencode.json`), пример полезного сообщения: `"[config] ralph_loop is deprecated and will be removed in a future release. Use goal instead."` (`dist/index.js:26932`).

Второй файл пользователя, `~/.dotfiles/.config/opencode/oh-my-openagent-openai-gpt-5-4.json`, **не читается OMO вообще** — его имя не совпадает ни с одним из `CONFIG_FILE_NAMES`, ни с `omo.json`/`omo.jsonc`. Он лежит в `~/.config/opencode/`, где у легаси-имён есть миграционная логика, но конкретно это имя в неё не попадает. Это неактивный ручной снэпшот/бэкап профиля, инертный при любом содержимом.

## 2. Каталог «рычагов душности»

Полный список имён хуков — enum `HookNameSchema` (`dist/config/schema/hooks.d.ts`), 58 значений; это единственный источник истины для того, что можно указать в `disabled_hooks`. Ниже — хуки, которые дают пользователю видимый «шум» (напоминания, принудительные продолжения, тосты, автодействия), с их конфиг-рычагами. Описания — по именам функций/комментариям в коде и по докам v5.1.13 (см. «Источники»); где подтверждения из кода нет — помечено.

| Хук / фича | Симптом для пользователя | Как выключить/настроить | Риск выключения |
|---|---|---|---|
| `todo-continuation-enforcer` | «Дёргает» простаивающего агента назад к работе, если в TodoWrite остались незакрытые пункты (docs v5.1.13: *"yanks idle agents back to work"*) | `disabled_hooks: ["todo-continuation-enforcer"]` | Агент может бросить TODO-лист недоделанным без напоминания |
| `stop-continuation-guard` | Не даёт агенту просто остановиться, если есть основания продолжить (парная логика с enforcer'ом, папка `hooks/stop-continuation-guard/hook.ts`) | `disabled_hooks: [...]`; есть отдельная команда `/stop-continuation`, но её тоже можно отключить через `disabled_commands: ["stop-continuation"]` | Потеря автоматического дожима задачи до конца |
| `goal` (замена легаси `ralph_loop`) | Цикл «продолжай, пока не достигнута цель»; инжектит continuation-промпты в простаивающую сессию | `goal.enabled` default **`false`** (`dist/index.js:26455`, `GoalConfigSchema`); у пользователя не включён → уже тихо. Включается явно `"goal": {"enabled": true}` | Если включить — агент сам продолжает работу без твоего ОК; `default_max_iterations` (default 100) ограничивает зацикливание |
| `ralph_loop` (deprecated) | Старое имя `goal`; если задать `ralph_loop.enabled`/`default_max_iterations` в конфиге — автоматически переносится в `goal.*` с предупреждением в лог | Не использовать вовсе; ключ не входит в `disabled_hooks`-enum, отключать нечем кроме `goal.enabled:false` | — (будет удалён) |
| `agent-usage-reminder` | Периодически советует использовать специализированных агентов | `disabled_hooks: ["agent-usage-reminder"]` | Теряешь подсказки «есть агент получше под эту задачу» |
| `category-skill-reminder` | При делегировании в категорию напоминает про доступные skills | `disabled_hooks: ["category-skill-reminder"]` | Модель реже сама подгружает нужный skill |
| `unstable-agent-babysitter` | Автоматически включает фоновый режим/монитор для «нестабильных» моделей (Gemini/Minimax-семейства); описан в `hooks/unstable-agent-babysitter/*` | `disabled_hooks: ["unstable-agent-babysitter"]`; точечно — `categories.<name>.is_unstable_agent: false` | Нестабильные модели чаще зависают без автоматической подстраховки |
| `monitor-status-injector` / `monitor` | Инжектит статус фоновых `Monitor`-процессов в контекст | `monitor.enabled` default **`false`** (`MonitorConfigSchema`, `dist/index.js:26617-26630`) — у пользователя не тронут, по умолчанию выключен; либо `disabled_hooks: ["monitor-status-injector"]` при включённом `monitor.enabled` | При выключенном monitor агент не видит статус долгих команд без явного запроса |
| `background-notification` | Тост/уведомление при завершении фоновой задачи (`task(..., run_in_background=true)`) | `disabled_hooks: ["background-notification"]` (пример из docs v5.1.13) | Пропустишь завершение фоновых агентов без явной проверки |
| `session-notification` | OS-level уведомление (звук/тост) когда сессия «простаивает» | `disabled_hooks: ["session-notification"]`; либо точечно `notification.force_enable` (только форсирует включение, не отключает) | Не узнаешь, что агент закончил и ждёт |
| `background_task` (конкурентность) | Параллельный фан-аут фоновых агентов — больше токенов и шума в UI одновременно | `background_task.defaultConcurrency` (default **5**, `BackgroundTaskConfigSchema`), `providerConcurrency`, `modelConcurrency`, `maxDepth`, `staleTimeoutMs` (default 2 700 000 мс = 45 мин) — приоритет `modelConcurrency > providerConcurrency > defaultConcurrency` (docs v5.1.13) | Слишком низкая конкурентность = долгие прогоны вместо параллельных |
| `team_mode` | Полноценные multi-agent «команды» (tmux-панели, почтовый ящик, team-tool-gating и пр.) | `team_mode.enabled` default **`false`** (`TeamModeConfigSchema`, `dist/index.js:26644-26656`); у пользователя явно `false` — уже тихий режим. `tmux_visualization: false` тоже явно выставлен | Команды/`hyperplan` не работают без явного включения |
| `keyword_detector` (`ultrawork`, `hyperplan`, `team`, `hyperplan-ultrawork`) | Авто-детект ключевых слов в промпте и раскрытие их в сложные режимы (team/ulw) | `keyword_detector.disabled_keywords: ["hyperplan", "team", "ultrawork", "hyperplan-ultrawork"]` — точечно по каждому слову | Случайное слово в тексте больше не триггерит тяжёлый режим — но и осознанный вызов по ключевому слову тоже перестанет работать |
| `auto-slash-command` | Детектит паттерны в тексте и сам исполняет slash-команду | `disabled_hooks: ["auto-slash-command"]` | Команды нужно вызывать явно `/команда` |
| `directory-agents-injector` | Инжектит `AGENTS.md` из дерева директорий в контекст | Доки v5.1.13: «auto-disabled на OpenCode 1.1.37+» (нативная поддержка AGENTS.md самим OpenCode) — на OpenCode 1.18.34 должен быть неактивен сам по себе. Явно: `disabled_hooks: ["directory-agents-injector"]` | Дублирование контекста AGENTS.md, если автоотключение не сработало |
| `directory-readme-injector` | Аналогично инжектит `README.md` по дереву проекта | `disabled_hooks: ["directory-readme-injector"]` | Меньше локального контекста о конвенциях проекта |
| `rules-injector` | Инжектит правила из `.claude/rules/*` по glob/`alwaysApply` | Это «guard»-хук, в docs v5.1.13 отдельно помечен: *"protect safety, permissions, or provider protocol correctness... disable only in trusted debugging environments"* | Нарушение явных project rules без предупреждения |
| `comment_checker` (хук `comment-checker`) | Блокирует/ругается на AI-слоп комментарии в коде | `disabled_hooks: ["comment-checker"]`; точечно — inline `// @allow` на строку или `// comment-checker-disable-file` в начале файла; кастомизация через `comment_checker.custom_prompt` с плейсхолдером `{{comments}}` | Код засоряется типовыми AI-комментариями без проверки |
| `native-edition-nudge` | Напоминает/подталкивает перейти на нативную OmO-CLI-редакцию | `disabled_hooks: ["native-edition-nudge"]` | Просто теряешь рекламный нудж — риска по функциональности нет |
| `legacy-plugin-toast` | Тост про устаревшие/конфликтующие legacy-плагины | `disabled_hooks: ["legacy-plugin-toast"]` | Не узнаешь о реальном конфликте плагинов |
| `auto-update-checker` / `startup-toast` | Проверка новой версии при старте сессии + тост | `disabled_hooks: ["auto-update-checker"]`; либо верхнеуровневый `"auto_update": false` | Пропустишь важные обновления/миграции |
| `tool-output-truncator` + `experimental.truncate_all_tool_outputs` / `aggressive_truncation` | Агрессивно режет длинный вывод тулов, чтобы не жечь контекст | `disabled_hooks: ["tool-output-truncator"]`; флаги `experimental.aggressive_truncation`, `experimental.truncate_all_tool_outputs` | Выключение = больше токенов съедается на длинный вывод, но меньше потери данных |
| `preemptive-compaction` + `experimental.preemptive_compaction`, `dynamic_context_pruning` | Упреждающе сжимает контекст до лимита, может резать «неважные» сообщения | `disabled_hooks: ["preemptive-compaction"]`; `experimental.preemptive_compaction: false`; `experimental.dynamic_context_pruning.enabled: false` | Чаще реальная компакция «на классике» (opencode), меньше контроля — риск потери контекста при лимите |
| `ast-grep-sg-provision` | Автоматически подтягивает ast-grep (`sg`) как доступный инструмент | `disabled_hooks: ["ast-grep-sg-provision"]` | Нет structural search/rewrite из коробки |
| `claude-code-hooks` | Прогоняет Claude-Code-совместимые хуки (`PreToolUse`/`PostToolUse` и т.п.) поверх OMO; тосты "PostToolUse Hook Warning/Executed" идут из этого пути (`dist/index.js:94707-94740`) | `disabled_hooks: ["claude-code-hooks"]`; точечно `claude_code.hooks: false` (в блоке `claude_code`) | Теряется совместимость с .claude/hooks/*, если они настроены |
| `claude_code.*` (mcp/commands/skills/agents/hooks/plugins) | Загрузка Claude-Code-совместимых MCP/команд/skills/агентов/хуков/плагинов в OMO | Булевы флаги `claude_code.mcp`, `.commands`, `.skills`, `.agents`, `.hooks`, `.plugins`, точечно `claude_code.plugins_override.<name>: false` | Теряется кросс-совместимость с Claude Code окружением |
| `model_fallback` | Автопереключение модели при ошибке (429/5xx) с тостом "Model fallback" | Верхнеуровневый `"model_fallback": false`; `disabled_hooks: ["model-fallback"]`; `experimental.model_fallback_title` управляет только отображением тайтла | При выключении — ошибки провайдера не лечатся автоматически, сессия может просто упасть |
| `runtime_fallback` | Похожий механизм на уровне runtime/провайдера | `runtime_fallback: false` (допускает булево или объект с `enabled`) | Аналогично — меньше автовосстановления после сбоя провайдера |
| `anthropic-context-window-limit-recovery` | Специальный recovery при превышении контекстного окна у Anthropic-моделей | `disabled_hooks: ["anthropic-context-window-limit-recovery"]` | Сессия может просто упасть на лимите вместо мягкого восстановления |
| `babysitting.timeout_ms` (default 120000) | Таймаут «нянченья» подвисших задач/агентов | Настройка числа, не булев переключатель | Слишком большой таймаут = дольше зависший агент считается живым |
| `unstable_agent` / категорийный флаг `is_unstable_agent` | Форсирует мониторинг конкретной категории | `categories.<name>.is_unstable_agent: false` | См. unstable-agent-babysitter выше |
| `tasks-todowrite-disabler` + `new_task_system_enabled` / `experimental.task_system` | Переключает между старым TodoWrite и новой файловой task-системой (`task_create/get/list/update`, персистентной между сессиями) | Верхнеуровневый `new_task_system_enabled`; `experimental.task_system: true` включает; при включённой новой системе этот хук отключает TodoWrite | Путаница между двумя системами тасков, если переключать туда-сюда |
| `question-label-truncator` | Режет длинные подписи у `AskUserQuestion`-подобных выборов | `disabled_hooks: [...]` | Длинные варианты ответа не обрезаются — иногда не влезают в UI |
| `tool-pair-validator` | Валидирует корректность пар вызов/результат тула при трансформации сообщений | guard-хук, доки прямо советуют не трогать | Повреждённая история сообщений может не детектироваться |
| `write-existing-file-guard`, `bash-file-read-guard`, `webfetch-redirect-guard`, `notepad-write-guard` | Защитные гварды (не читал файл перед Write; читаешь через bash вместо Read; редирект при WebFetch; запись в notepad без повода) | Все входят в `disabled_hooks`, но docs v5.1.13 прямо называют их «guard»-хуками для безопасности/корректности — *«disable only in trusted debugging environments»* | Потеря защиты от типовых ошибок инструментов |
| `team-tool-gating`, `team-mode-status-injector`, `team-mailbox-injector` | Шум/гейтинг тулов именно в team-режиме | Прямо не входят все в `HookNameSchema` (`team-mode-status-injector`, `team-mailbox-injector` отсутствуют в enum — управляются только через `team_mode.enabled`, НЕ ПОДТВЕРЖДЕНО обратное); `team-tool-gating` есть в enum | Неактуально при `team_mode.enabled:false`, как сейчас у пользователя |
| `atlas` (хук) | Обслуживает Atlas-агента: idle-нуджи, continuation-инъекции для «boulder»-сессий, «final wave approval gate» и т.п. — целый подкаталог `hooks/atlas/*` | `disabled_hooks: ["atlas"]`; агент целиком — `disabled_agents: ["atlas"]` | Теряется весь механизм продолжений/аппрув-гейтов конкретно для Atlas |
| `prometheus-md-only`, `hephaestus-agents-md-injector`, `no-sisyphus-gpt`, `no-hephaestus-non-gpt`, `sisyphus-junior-notepad` | Узкоспециализированные ограничители/инжекторы под конкретных built-in агентов (Prometheus/Hephaestus/Sisyphus) | `disabled_hooks: [...]` по имени | Конкретные гарантии поведения данных агентов (например «sisyphus не на GPT») пропадают |
| `interactive-bash-session` / `non-interactive-env` | Управляют интерактивностью bash-сессий агента | `disabled_hooks: [...]` | Потеря удобства долгоживущих интерактивных shell-сессий |
| `read-image-resizer` | Автоматически уменьшает картинки при Read | `disabled_hooks: ["read-image-resizer"]` | Большие изображения жгут больше токенов/контекста |
| `hashline-read-enhancer` + `hashline_edit` | Улучшенная построчная адресация при Read/Edit (`#hash`-номера строк) | Верхнеуровневый `hashline_edit: false`; `disabled_hooks: ["hashline-read-enhancer"]` | Возврат к обычной построчной адресации, менее устойчивой к смещениям |
| `json-error-recovery`, `edit-error-recovery`, `empty-task-response-detector`, `fsync-skip-warning`, `delegate-task-retry`, `todo-description-override`, `plan-format-validator`, `compaction-context-injector`, `compaction-todo-preserver` | Набор авто-recovery/валидационных хуков (ловят битый JSON от тула, пустой ответ саб-агента, пропущенный fsync, переформулируют описание todo, валидируют формат плана, сохраняют контекст/todo при компакции) | Каждый — отдельный ключ `disabled_hooks: ["<имя>"]` | Разная степень: от «косметика» (`todo-description-override`) до «агент тихо теряет контекст при компакции» (`compaction-context-injector`/`compaction-todo-preserver`) |

Источник для всей таблицы: enum `HookNameSchema` (`dist/config/schema/hooks.d.ts`), список экспортов `dist/hooks/index.d.ts`, возвращаемый объект `createHooks()` (`dist/create-hooks.d.ts`), и выдержки из `docs/reference/configuration.md` / `features.md` ветки `v5.1.13` (см. «Источники», раздел про хуки и background_task/comment_checker — текст совпадает буквально с полями в `dist/config/schema/*`, что подтверждает версионное соответствие).

Отдельно — **не хук, а принудительные commit'ы**: `ulw_execute.auto_commit` и `start_work.auto_commit` (оба `ZodDefault<ZodBoolean>`, схема `oh-my-opencode-config.d.ts:3709-3718`) — это и есть «самодеятельные коммиты» из запроса трека. Выключаются `"ulw_execute": {"auto_commit": false}` и `"start_work": {"auto_commit": false}`. Фактическое дефолтное значение `true/false` не видно в `.d.ts` (там только тип `ZodDefault<ZodBoolean>` без значения) — **НЕ ПОДТВЕРЖДЕНО**, искал в `dist/index.js` рядом с `ulw_execute`/`start_work`, но минификация не позволила однозначно привязать литерал `.default(...)` к этим двум полям за разумное время.

## 3. Разбор текущего конфига пользователя

Файл: `/Users/bigforcegun/.dotfiles/.omo/omo.jsonc` (симлинк `~/.omo/omo.jsonc`), единственный активный конфиг — других `.omo/omo.jsonc` по дереву от cwd до `$HOME` не найдено (целевой проверке не подвергался path walk для конкретного cwd этого треда, но у пользователя нет project-level `.omo/` — см. `git status`/дерево репозитория, точка не искалась специально, не критично для вывода).

Структура:
```jsonc
{
  "$schema": "...schema.json",
  "[opencode]": {
    "team_mode": { "enabled": false, "max_parallel_members": 3, "max_members": 6, "tmux_visualization": false },
    "agents": { /* 11 built-in агентов, каждому "models": [{model, reasoning}] */ },
    "categories": { /* visual-engineering, ultrabrain, deep-low, deep-high, artistry, quick, unspecified-low, unspecified-high, writing */ }
  },
  "_migrations": ["2026-07-opencode-config-unification", "2026-08-reasoning-unification"]
}
```

Проверка по схеме (`dist/oh-my-opencode.schema.json`, он же источник `.d.ts`):

- `"[opencode]"` — валидный harness-блок (п.1). ✅
- `team_mode.*` — все 4 указанных поля существуют в `TeamModeConfigSchema` (`dist/index.js:26644-26656`); `enabled:false` совпадает с дефолтом, остальные (`max_parallel_members:3`, `max_members:6`) — осознанный даунгрейд с дефолтных 4/8. ✅
- `agents.<name>.models[].{model,reasoning}` — ключ `reasoning` (enum `auto/high/low/max/medium/minimal/off/xhigh`) подтверждён в `CategoryConfigSchema`/агентных схемах (`dist/config/schema/oh-my-opencode-config.d.ts:30-50` и аналог для каждого агента) — это современный ключ, заменивший legacy `variant`/`reasoningEffort`. Используемые значения (`medium`, `high`, `low`, `xhigh`) — все валидные enum-значения. ✅
- Имена агентов `sisyphus, hephaestus, oracle, librarian, explore, multimodal-looker, prometheus, metis, momus, atlas, sisyphus-junior` — ровно совпадают с `BuiltinAgentNameSchema`/`AgentNameSchema` (`dist/config/schema/agent-names.d.ts`), все 11 валидны, ни один не пропущен и не лишний. ✅
- Категории `deep-low`/`deep-high` — **не входят** в d.ts-enum `BuiltinCategoryNameSchema` (там всё ещё старое `deep`, `dist/config/schema/categories.d.ts:147-155`), но сама секция `categories` в схеме — это `ZodRecord<ZodString, CategoryConfigSchema>`, то есть **ключ валидируется как произвольная строка**, enum в d.ts не применяется как ограничение записи. Факт, что `deep-low`/`deep-high` — это настоящие, используемые рантайм-категории в 5.1.13, подтверждён прямо в `CATEGORY_MODEL_REQUIREMENTS` (`dist/index.js:22968-22985`) и в системных промптах агентов (`DEEP_LOW_CATEGORY_PROMPT_APPEND...`, `dist/index.js:27681-27815`), а также в миграции `2026-09-category-deep-split` (`LEGACY_CATEGORY_NAME_ALIASES = { deep: "deep-low" }`, `dist/index.js:20878`). Значит старое единое `deep` — легаси, `deep-low`+`deep-high` — актуальная схема именно 5.1.13. ✅ Пользовательский конфиг уже на актуальной схеме (отсюда и `_migrations: ["...reasoning-unification"]` в его файле).
- Остальные категории (`visual-engineering, ultrabrain, artistry, quick, unspecified-low, unspecified-high, writing`) — совпадают с ключами в `CATEGORY_MODEL_REQUIREMENTS` (`dist/index.js:22938-23010`, видел `visual-engineering`, `ultrabrain`, `artistry`, `quick`; `writing`/`unspecified-*` не вклеены в вывод grep, но присутствуют в самом конфиге и используются в промптах `task(category="unspecified-high"...)` по всему `dist/index.js`). ✅
- `_migrations` — валидное поле (`_migrations: z.ZodOptional<z.ZodArray<z.ZodString>>`, `oh-my-opencode-config.d.ts:3719`), просто журнал уже применённых авто-миграций; трогать не нужно.

**Невалидных/устаревших ключей в активном `~/.omo/omo.jsonc` НЕ найдено.** Конфиг чист и уже соответствует схеме 5.1.13.

Единственный «подозрительный» файл — `~/.dotfiles/.config/opencode/oh-my-openagent-openai-gpt-5-4.json` — технически не читается OMO (см. п.1), но если бы читался, был бы устаревшим по содержанию:
- Использует `"deep"` вместо `"deep-low"/"deep-high"` (пример: категория `"deep": {...}` в файле) — легаси-имя, которое `LEGACY_CATEGORY_NAME_ALIASES` автоматически переименовало бы в `deep-low` при миграции, но само присутствие `deep` в живом конфиге сегодня считалось бы устаревшим именем.
- Использует для каждого агента/категории плоские поля `"model"` + `"variant"` вместо текущего `"models": [{model, reasoning}]`. `variant` как поле всё ещё присутствует в схеме 5.1.13 (`variant: z.ZodOptional<z.ZodString>` рядом с `reasoning`), так что формально не отвалится по схеме, но это однозначно старый стиль записи (до `2026-08-reasoning-unification`, судя по имени миграции в активном конфиге пользователя).
- Использует харнес-блоки верхнего уровня без обёртки `"[opencode]"` — раньше (до `2026-07-opencode-config-unification`) это, похоже, было нормой; сейчас актуальный конфиг пользователя обёрнут в `"[opencode]"`.

Итог: этот файл — замороженный снэпшот старого профиля, не активен и устарел по формату; угрозы не представляет именно потому, что OMO его не видит.

## 4. Рекомендуемый «спокойный профиль»

Все ключи ниже проверены против `dist/oh-my-opencode.schema.json`/`dist/config/schema/*.d.ts` версии 5.1.13.

### Общий блок — добавить в `~/.omo/omo.jsonc` (внутрь `"[opencode]": {...}`, рядом с уже существующими `team_mode`/`agents`/`categories`):

```jsonc
// --- "Недушный" профиль, безопасный минимум ---
// Автокоммиты за тебя — выключить, коммитить сам явным образом.
"ulw_execute": { "auto_commit": false },
"start_work": { "auto_commit": false },

// Ключевые слова не должны сами раскрываться в тяжёлые режимы.
"keyword_detector": {
  "disabled_keywords": ["team", "hyperplan", "hyperplan-ultrawork"]
  // "ultrawork" оставлен — это осознанный штатный режим, а не фоновый шум
},

// Назойливые напоминания и тосты, которые не несут риска безопасности.
"disabled_hooks": [
  "agent-usage-reminder",
  "category-skill-reminder",
  "native-edition-nudge",
  "legacy-plugin-toast",
  "background-notification",
  "auto-slash-command"
]
```

### Вариант A — «минимально душный, но с дисциплиной» (оставляем страховочные сетки, убираем только болтливость):

```jsonc
"ulw_execute": { "auto_commit": false },
"start_work": { "auto_commit": false },
"keyword_detector": { "disabled_keywords": ["team", "hyperplan", "hyperplan-ultrawork"] },
"disabled_hooks": [
  "agent-usage-reminder",
  "category-skill-reminder",
  "native-edition-nudge",
  "legacy-plugin-toast",
  "background-notification",
  "auto-slash-command",
  "question-label-truncator"
],
// Таймаут "нянченья" подвисших агентов — пусть будет щедрее, чтобы не дёргал раньше времени.
"babysitting": { "timeout_ms": 300000 }
// todo-continuation-enforcer, stop-continuation-guard, comment-checker, все *-guard хуки
// и model_fallback/runtime_fallback — ОСТАВЛЕНЫ включёнными: это дисциплина, не шум.
```

### Вариант B — «тихий режим» (максимум тишины, сознательно теряем автодожим и часть автовосстановления):

```jsonc
"ulw_execute": { "auto_commit": false },
"start_work": { "auto_commit": false },
"keyword_detector": {
  "disabled_keywords": ["team", "hyperplan", "hyperplan-ultrawork", "ultrawork"]
},
"disabled_hooks": [
  "agent-usage-reminder",
  "category-skill-reminder",
  "native-edition-nudge",
  "legacy-plugin-toast",
  "background-notification",
  "session-notification",
  "auto-slash-command",
  "question-label-truncator",
  "todo-continuation-enforcer",
  "stop-continuation-guard",
  "auto-update-checker"
],
"goal": { "enabled": false },
"team_mode": { "enabled": false },
"monitor": { "enabled": false },
// Снижаем параллелизм фоновых агентов — меньше одновременного шума в сессии.
"background_task": { "defaultConcurrency": 2 }
```

Пояснение по риску варианта B: отключение `todo-continuation-enforcer` и `stop-continuation-guard` означает, что агент **не будет сам возвращаться** к незакрытым TODO и не будет сам продолжать после паузы — тебе придётся вручную говорить «продолжай». Это прямая плата за тишину, а не бесплатный бонус.

То, что уже тихо по дефолту (трогать не нужно): `goal.enabled=false`, `monitor.enabled=false`, `team_mode.enabled=false` — всё подтверждено дефолтами в `dist/index.js` (п.2), причём `team_mode.enabled` у пользователя и так явно `false`.

## 5. Что нельзя убрать конфигом — и как обходить

- **Зашитые в системные промпты инструкции конкретных built-in агентов** (например, тексты `DEEP_LOW_CATEGORY_PROMPT_APPEND`, `DEEP_HIGH_CATEGORY_CALLER_GUIDANCE`, hyperplan-инструкция `hyperplan_default` — все найдены как строковые константы прямо в `dist/index.js:27681-27815`, `105811` и т.д.) — это часть бинарного `dist/index.js`, конфигом не редактируется и не версионируется пользователем.
  - **Официальный обход — полная замена промпта**: `agents.<name>.prompt: "<текст или file:///путь>"` (поле `prompt` подтверждено в `dist/config/schema/agent-overrides.d.ts:117` для каждого агента).
  - **Официальный обход — добавление без потери дефолта**: `agents.<name>.prompt_append: "..."` и аналогично `categories.<name>.prompt_append: "..."` (оба поля подтверждены: `agent-overrides.d.ts:118`, `categories.d.ts` в секции `CategoryConfigSchema`). Можно указывать `file:///абсолютный/путь` или путь с `~` — поддержка внешних файлов-промптов подтверждена docs v5.1.13 (`"agents": {"librarian": {"prompt": "file:///path/to/prompt.md"}}`).
  - Полное отключение агента целиком — `disable: true` на уровне `agents.<name>.disable` или `categories.<name>.disable` (оба поля подтверждены в схеме) либо глобально `disabled_agents: ["atlas", ...]`.
- **Guard-хуки, которые доки прямо не советуют трогать** (`write-existing-file-guard`, `bash-file-read-guard`, `webfetch-redirect-guard`, `rules-injector`, `tool-pair-validator`, `team-tool-gating`) — технически отключаемы через `disabled_hooks`, но это не «душность», а защита корректности/безопасности; выключать стоит только в доверенной debug-среде (цитата из docs v5.1.13: *«protect safety, permissions, or provider protocol correctness»*).
- **`ralph_loop`** как отдельный переключатель — не входит в `disabled_hooks`-enum вообще; единственный рычаг — не включать `goal.enabled` (к которому он мигрирует) и не задавать legacy `ralph_loop.*` в конфиге (если задать — автоматически конвертируется в `goal.*` с предупреждением в лог, см. `dist/index.js:26926-26943`).
- **`comment-checker`** — встроенную проверку AI-slop комментариев можно обходить точечно без изменения конфига: inline `// @allow` на конкретной строке или `// comment-checker-disable-file` в начале файла (подтверждено docs v5.1.13); это предпочтительнее глобального `disabled_hooks: ["comment-checker"]`, если хочется тишины только в одном файле.
- **`team-mode-status-injector` и `team-mailbox-injector`** — эти два хука реально существуют в коде (`createTeamModeStatusInjector`, `createTeamMailboxInjector` в `dist/hooks/index.d.ts`), но **отсутствуют в enum `HookNameSchema`** → их **нельзя** адресно выключить через `disabled_hooks` по имени; единственный рычаг — `team_mode.enabled: false` целиком. НЕ ПОДТВЕРЖДЕНО: не нашёл прямого доказательства, что `isHookEnabled()` для них всегда возвращает `true` при `disabled_hooks`-проверке — заключение сделано по отсутствию имени в enum, не по трассировке вызова.
- **`task-reminder`** (директория `dist/hooks/task-reminder/` существует) — отсутствует и в `HookNameSchema`, и в возвращаемом объекте `createHooks()` (`dist/create-hooks.d.ts`). Похоже на мёртвый/замещённый код (вероятно, предшественник `task-resume-info`). НЕ ПОДТВЕРЖДЕНО окончательно — не нашёл, подключается ли он где-то вне `createHooks()`.
- Фактический дефолт `ulw_execute.auto_commit`/`start_work.auto_commit` (`true` или `false` из коробки) — НЕ ПОДТВЕРЖДЕНО: искал литерал `.default(...)` рядом с этими двумя полями в `dist/index.js`, не нашёл однозначно в разумное время поиска по минифицированному бандлу. Рекомендация из п.4 (`auto_commit: false`) работает независимо от того, что там по умолчанию.

## Резюме (для ответа пользователю)

1. Активный конфиг — только `~/.omo/omo.jsonc` (user-scope, симлинк работает, т.к. для user-пути нет anti-symlink проверки); второй файл `oh-my-openagent-openai-gpt-5-4.json` не читается вовсе — неправильное имя файла, не входит в `CONFIG_FILE_NAMES`/`omo.json(c)`.
2. Текущий `~/.omo/omo.jsonc` **полностью валиден** по схеме 5.1.13, невалидных ключей не найдено; `deep-low`/`deep-high` — это актуальные, а не ошибочные имена категорий (легаси было единое `deep`).
3. Doctor доступен через `bin/oh-my-opencode.js doctor` из кэша пакета (бинаря `omo` нет); плюс тосты в TUI на невалидные ключи и строка «config invalid — run doctor» в сайдбаре.
4. Главные источники «душности» по умолчанию потенциально включены: `todo-continuation-enforcer`, `stop-continuation-guard`, `agent-usage-reminder`, `category-skill-reminder`, `background-notification`, `comment-checker`, авто-коммиты `ulw_execute.auto_commit`/`start_work.auto_commit`. `goal`, `monitor`, `team_mode` у пользователя и по дефолту уже выключены — их не нужно трогать.
5. Жёстко зашитые в промпты агентов инструкции не убираются конфигом, но официально переопределяются через `agents.<name>.prompt`/`prompt_append` и `categories.<name>.prompt_append` (включая `file:///...`).

**Не подтвердилось / не проверено:**
- Фактические дефолтные значения `ulw_execute.auto_commit` и `start_work.auto_commit` (true/false из коробки).
- Поведение `disabled_hooks` в отношении `team-mode-status-injector`/`team-mailbox-injector`/`task-reminder` — отсутствуют в enum, вывод об неотключаемости сделан по отсутствию имени, не по трассировке исполнения.
- (снято: doctor запущен оркестратором локально, работает).
- Полное прохождение всех веток `OhMyOpenCodeConfigSchema` (файл `oh-my-opencode-config.d.ts` на 3700+ строк) не построчно, а по топ-уровневым ключам и целевым секциям, релевантным «душности»; экзотические ветки (`openclaw`, `websearch`, `browser_automation_engine`, `model_capabilities`, `i18n`) не разбирались детально, так как не относятся к шуму/напоминаниям.

## Источники

- `~/.cache/opencode/packages/oh-my-openagent@5.1.13/node_modules/oh-my-openagent/dist/index.js` — строки указаны инлайн по тексту (loader/paths: 21330-21430, 99150-100010; harness blocks: 20940-20970; config diagnostics: 20995-21035, 26944-26967; defaults: 26293-26298 (babysitting), 26450-26460 (goal), 26617-26635 (monitor), 26638-26656 (team_mode); категории: 22930-23010, 27681-27815; миграции: 20878, 99791-99800).
- `.../dist/config/schema/*.d.ts` — все top-level и hook/category/agent схемы (`hooks.d.ts`, `oh-my-opencode-config.d.ts`, `categories.d.ts`, `agent-names.d.ts`, `agent-overrides.d.ts`, `ralph-loop.d.ts`, `background-task.d.ts`, `comment-checker.d.ts`, `experimental.d.ts`, `goal.d.ts`, `claude-code.d.ts`, `monitor.d.ts`, `skills.d.ts`, `commands.d.ts`, `notification.d.ts`, `team-mode.d.ts`, `babysitting.d.ts`, `default-mode.d.ts`, `keyword-detector.d.ts`).
- `.../dist/create-hooks.d.ts`, `.../dist/hooks/index.d.ts`, листинг `.../dist/hooks/*` — полный список хуков и их подмодулей.
- `.../dist/config-migration/discovery-paths.d.ts`, `discovery-roots.d.ts`, `discovery.d.ts`, `types.d.ts` — порядок поиска конфигов.
- `.../README.md` (раздел «Configuration», строки 82-93) — подтверждение «closest file wins», ссылка на `docs/reference/configuration.md`.
- GitHub `code-yeongyu/oh-my-openagent`, тег `v5.1.13` (соответствует установленной версии, проверено `gh api repos/.../tags`):
  - `docs/reference/configuration.md` — разделы Hooks/background_task/comment_checker/monitor.
  - `docs/reference/features.md` — разделы Continuation & Goal Tracking, Background Agents, Notifications, Quality & Safety, Custom Categories, File-Based Prompts, Hooks System, Team Mode, Config Migration.
- Команды, выполненные для проверки окружения: `which omo` → not found; `omo --version`/`omo doctor` → `command not found`; `cat ~/.config/opencode/opencode.json`; `cat /Users/bigforcegun/.dotfiles/.omo/omo.jsonc`; `cat /Users/bigforcegun/.dotfiles/.config/opencode/oh-my-openagent-openai-gpt-5-4.json`; `ls -la ~/.omo/`, `ls -la ~/.config/opencode/` (показали симлинки и `.bak`-артефакты легаси-миграции).
