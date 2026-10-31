# OMO vs OMP: отчёт сабагента

Источник: Paseo-агент `1299d26f` (OpenCode, профиль «OC OMO 6 Astra Hephaestus», режим ultraresearch), 2026-10-18; 243 вызова инструментов. Перенесён дословно, без правок. Это заявление агента: независимо перепроверены только пункты, перечисленные в [[2026-10-19-omo-vs-omp-research]].

Ответ: **для вашего OpenCode+OMO-сетапа главное отличие от OMP не в наличии сабагентов или hashline: они есть у обоих. Отличается место интеграции.** OMO OpenCode edition добавляет оркестрацию, роли, правила продолжения работы и инструменты к OpenCode; OMP самостоятельно реализует агентский цикл и широкий набор инструментальных подсистем. Однако исходную формулировку уже необходимо уточнять: современный проект OMO также выпускает самостоятельный **OmO Native на Senpi, форке Pi**. Ниже эти редакции не смешиваются. [OMO: архитектура и редакции](https://github.com/code-yeongyu/oh-my-openagent/blob/v5.1.35/docs/guide/migrating-from-opencode.md), [OMP: архитектура](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/README.md).

# OMO и OMP: сравнительное исследование

**Срез: 18 октября 2026 года.** Для исходников использованы закреплённые состояния OMO [`90eaba6e`](https://github.com/code-yeongyu/oh-my-openagent/tree/90eaba6e93a4fbfdb342bd001e6b512e852bdc04) и OMP [`df4f996e`](https://github.com/can1357/oh-my-pi/tree/df4f996e66a200ab7e0496114d43bdf85f32194d). Это снимки веток, не утверждение, что всё в них уже входит в последний релиз.

**Метод:** документация, исходники, GitHub API, релизы, issues и полные публикации экспериментов. Файлы репозитория и конфиги не изменялись; OMP не устанавливался и не запускался. Поэтому «подтверждено» ниже означает подтверждение источником или кодом, **не эксплуатационное испытание на вашей машине**. Выводы и рекомендации обозначены отдельно от фактов.

## 1. Природа, происхождение, лицензии и зрелость

### Сначала существенная поправка к названиям

В README **OMO v5.1.35** основным продуктом уже названа команда `omo`, работающая на Senpi; пакет самостоятельной редакции называется `omo-ai`. Руководство миграции отдельно описывает OpenCode edition и допускает совместное использование двух редакций. Поэтому утверждение «OMO всегда является только плагином OpenCode» на дату исследования неверно. [README v5.1.35:49](https://github.com/code-yeongyu/oh-my-openagent/blob/v5.1.35/README.md#L49-L66), [migration guide](https://github.com/code-yeongyu/oh-my-openagent/blob/v5.1.35/docs/guide/migrating-from-opencode.md).

**Далее под OMO в сравнительных таблицах понимается именно OpenCode edition**, соответствующая вашему вопросу об агентах Sisyphus/Prometheus/Atlas/Hephaestus. Возможности Native отдельно оговариваются.

| Параметр | OMO OpenCode edition | OMP |
|---|---|---|
| Что это | Плагин и оркестрационный слой внутри OpenCode. Отдельно существуют другие редакции OMO. [Документация](https://github.com/code-yeongyu/oh-my-openagent/blob/v5.1.35/docs/guide/installation.md) | Самостоятельный coding-agent harness, происходящий от Pi Марио Цехнера. [README](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/README.md) |
| Основная реализация | TypeScript; сборка и разработка используют Bun, интеграция зависит от API OpenCode. Наличие собственного CLI плагина не превращает его в самостоятельный агентский движок. [package.json](https://github.com/code-yeongyu/oh-my-openagent/blob/v5.1.35/package.json) | TypeScript/Bun плюс Rust-подсистемы через N-API. Это не просто Pi с дополнительным системным промптом. [Архитектура native-пакета](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/natives/README.md), [package.json](https://github.com/can1357/oh-my-pi/blob/v18.11.3/package.json) |
| Ответственные за проект | Репозиторий `code-yeongyu/oh-my-openagent`; в manifest автором указан YeonGyu-Kim. [package.json:163](https://github.com/code-yeongyu/oh-my-openagent/blob/v5.1.35/package.json#L163-L169) | Репозиторий `can1357/oh-my-pi`; manifest указывает Stencil Labs. Copyright содержит Mario Zechner, Can Bölük и Stencil Labs. [package.json:6](https://github.com/can1357/oh-my-pi/blob/v18.11.3/package.json#L6), [LICENSE:3](https://github.com/can1357/oh-my-pi/blob/v18.11.3/LICENSE#L3-L5) |
| Лицензия | **SUL-1.0**, не MIT: допускает внутреннее коммерческое использование и личное/некоммерческое использование; распространение ограничено бесплатными некоммерческими случаями. У сторонних компонентов сохраняются собственные лицензии. [LICENSE](https://github.com/code-yeongyu/oh-my-openagent/blob/v5.1.35/LICENSE.md) | **MIT**, с обычным требованием сохранить copyright и текст лицензии. [LICENSE](https://github.com/can1357/oh-my-pi/blob/v18.11.3/LICENSE) |

### Активность и размер сообщества

Ниже именно **наблюдаемые GitHub-показатели**, а не оценки числа пользователей:

| Показатель на момент чтения API | OMO, весь проект | OMP |
|---|---:|---:|
| Дата создания репозитория | 3 декабря 2025 | 31 декабря 2025 |
| Stars | 70 136 | 35 758 |
| Forks | 5 770 | 3 927 |
| Последний опубликованный релиз | v5.1.35, 17 октября 2026 | v18.11.3, 16 октября 2026 |
| Последние десять релизов попали в интервал | 7–17 октября | 11–16 октября |

Источники: [метаданные OMO](https://api.github.com/repos/code-yeongyu/oh-my-openagent), [метаданные OMP](https://api.github.com/repos/can1357/oh-my-pi), [релизы OMO](https://api.github.com/repos/code-yeongyu/oh-my-openagent/releases?per_page=10), [релизы OMP](https://api.github.com/repos/can1357/oh-my-pi/releases?per_page=10).

**Вывод:** оба проекта активно развиваются, но быстрый выпуск версий не доказывает стабильность. У OMO дополнительно меняются границы продукта и конфигурационная модель; у OMP даже patch-релиз v18.11.3 содержит breaking change интерфейса `ui.approve()` для расширений. Версии стоит фиксировать, а совместимость проверять по конкретному релизу. [Миграция OMO](https://github.com/code-yeongyu/oh-my-openagent/blob/v5.1.35/docs/guide/migrating-from-opencode.md), [OMP v18.11.3](https://github.com/can1357/oh-my-pi/releases/tag/v18.11.3).

Stars измеряют интерес к репозиторию, не качество решений и не количество активных пользователей.

## 2. Философия: различие акцентов, а не противоположные миры

### OMO: организация работы поверх существующего агента

OMO явно разделяет:

- **агента/роль**: кто выполняет работу;
- **категорию**: какого типа задача и какая модель/цепочка ей соответствует;
- **skill**: какие инструкции, инструменты и workflow нужны;
- **hooks и continuation**: как управлять поведением между вызовами и не завершать работу преждевременно.

Это закреплено в feature reference и реализации делегирования, а не только в рекламном описании. [OMO Features: категории, skills, background agents](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/docs/reference/features.md).

### OMP: интеграция возможностей внутрь одного продукта

OMP делает ставку на богатый инструментальный слой: редактирование, LSP, DAP, вычислительные ядра, браузер, поиск, память, задачи. Значительная часть поисковых, AST- и системных операций реализована в собственных native-компонентах. [README OMP](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/README.md), [каталог возможностей](https://omp.sh/docs/tools).

**Но OMP не является «одним агентом без оркестрации».** У него есть сабагенты, роли моделей, изоляция рабочих пространств, plan mode, advisor и режимы дирижирования исполнителями. [Subagents](https://omp.sh/docs/subagents), [model roles](https://omp.sh/docs/roles), [tools/workflows](https://omp.sh/docs/tools).

**Вывод:** полезная формула:

> **OMO OpenCode edition: оркестрация и политика выполнения поверх OpenCode.  
> OMP: самостоятельный интегрированный harness, который тоже умеет оркестрацию.**

Именно **минималистичный upstream Pi**, а не OMP, исторически противопоставлял себя встроенным todo, plan mode, MCP и subagent-инструментам. Это позиция Марио Цехнера в его статье от ноября 2025 года, а не описание сегодняшнего OMP. [Первичный текст автора Pi](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/).

## 3. Инструменты: что действительно есть

Здесь «есть» не означает «включено в каждой сессии». Отдельно указаны встроенная реализация, bundled skill, MCP и внешние зависимости.

| Возможность | OMO OpenCode edition | OMP |
|---|---|---|
| **Hashline edit** | **Есть, opt-in.** Регистрируется при `hashline_edit: true`; по умолчанию выключен. [Регистрация:32](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/plugin/tool-registry-gated-tools.ts#L26-L33) | **Есть, базовая настройка по умолчанию.** Но runtime выбирает `replace` для некоторых моделей. [Default:40](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/edit/settings.ts#L35-L47), [выбор режима:20](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/utils/edit-mode.ts#L20-L42) |
| **LSP** | **Есть через встроенный в поставку MCP `lsp`**; это не запись обычного OMO tool registry. Нужны подходящие language servers. [Architecture Snapshot](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/docs/reference/features.md) | **Есть как собственная интеграция**, без обязательного MCP. Language servers остаются внешними программами. [Code intelligence](https://omp.sh/docs/code-intelligence), [registry:571](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/tools/index.ts#L556-L580) |
| **AST-grep** | **Есть через skill/CLI-интеграцию**; не следует автоматически считать отдельным встроенным MCP-инструментом. [Skill](https://github.com/code-yeongyu/oh-my-openagent/tree/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/shared-skills/skills/ast-grep) | **Есть встроенные `ast_grep` и `ast_edit`.** По документации структурный поиск выключен по умолчанию, структурные правки имеют preview/accept. [Tools](https://omp.sh/docs/tools), [registry:561](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/tools/index.ts#L560-L566) |
| **DAP-отладчик** | **Есть DAP-клиент в shared debugging skill**: документация указывает bundled `dap.mjs`. Отдельного встроенного OpenCode-инструмента `debug`, аналогичного OMP, в проверенном реестре не подтверждено. Можно подключить внешний MCP. [DAP guide](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/shared-skills/skills/debugging/references/tools/dap.md) | **Есть собственный `debug`**, работающий через DAP; нужен доступный адаптер/конфигурация. [Debugging](https://omp.sh/docs/debugging), [registry:564](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/tools/index.ts#L563-L566) |
| **Браузер** | **Есть через browser skills и выбранный provider**, в том числе Playwright MCP. Не путать с omowright/js-eval маршрутом Native/Codex edition. [Browser Automation Options](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/docs/reference/features.md) | **Есть встроенная browser capability**: собственный запуск, CDP, relay. Нужны соответствующие браузер/расширение. [Tools](https://omp.sh/docs/tools), [Web & browser](https://omp.sh/docs/web) |
| **Eval / постоянный REPL** | Универсальный встроенный persistent `eval`, аналогичный OMP, **не подтверждён для OpenCode edition**. Терминал/tmux, пользовательский tool или MCP позволяют организовать такой workflow. [Реестр:132](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/plugin/tool-registry-core-tools.ts#L132-L154), [Features](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/docs/reference/features.md) | **Есть `eval` с постоянным состоянием.** Python и JS разрешены по умолчанию; Ruby и Julia opt-in, runtime должен быть доступен. [Tools](https://omp.sh/docs/tools), [registry:566](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/tools/index.ts#L566) |
| **Память между сессиями** | Есть инструменты истории сессий, но это не то же самое, что семантическая память. Собственная memory wiring подтверждена у Native/Senpi; эквивалентная поставка для OpenCode edition в исследованных точках не подтверждена. Возможен внешний MCP. [Session registry:135](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/plugin/tool-registry-core-tools.ts#L132-L144), [Native memory wiring](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-senpi/src/components/memory/wiring.ts#L31-L81) | **Есть подсистема памяти, выключенная по умолчанию.** Backend определяет функции: local, Mnemopi, Hindsight; внешний Hindsight не становится от этого MCP. [Memory](https://omp.sh/docs/memory), [Tools](https://omp.sh/docs/tools) |
| **Web search** | **Через bundled MCP**: `websearch`; отдельно `context7` и `grep_app` для документации и кода. [MCP architecture](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/docs/reference/features.md) | **Собственный `web_search` с провайдерами поиска**, MCP необязателен. Нужен доступный провайдер. [Tools](https://omp.sh/docs/tools), [registry:579](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/tools/index.ts#L576-L580) |

### Что важно именно про hashline

**В OMO hashline действительно есть.** Фабрика принимает строковые якоря `LINE#ID`; включение проверяется при сборке OpenCode-инструментов. Это не предположение по сходству названий. [OMO tool definition:7](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/tools/hashline-edit/tools.ts#L7-L40), [условная регистрация:32](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/plugin/tool-registry-gated-tools.ts#L32).

**В OMP нельзя писать «все модели всегда используют hashline».** На проверенном SHA среди автоматически переводимых в `replace` семейств есть Kimi, MiMo, MiniMax, DeepSeek и StepFun; также существуют пользовательские model-specific overrides. [edit-mode.ts:8](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/utils/edit-mode.ts#L8-L42).

**Вывод:** переносить hashline «из OMP в OMO» как отсутствующую функцию не требуется. Имеет смысл оценивать конкретную реализацию, режим и модель. Общая идея якорей не означает одинаковый формат вызовов или одинаковую надёжность.

## 4. Агенты, оркестрация, фоновые задачи и управление поведением

### Именованные агенты OMO

В OpenCode edition подтверждены следующие роли:

| Агент | Назначение |
|---|---|
| **Sisyphus** | Главный оркестратор; фабрика выбирает промпт с учётом модели. [Фабрика](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/agents/sisyphus-agent-factory.ts#L48-L54) |
| **Prometheus** | Планирование; текущий промпт направляет в `ulw-plan` и запрещает выполнять продуктовые изменения в роли планировщика. [Промпт:1](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/prompts-core/prompts/prometheus/default.md#L1-L5) |
| **Atlas** | Оркестрация выполнения workflow. [Промпт:1](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/prompts-core/prompts/atlas/default.md#L1-L4) |
| **Hephaestus** | Автономное выполнение задачи целиком, с исследованием и проверками; это primary agent, а не только сабагент. [agent.ts:173](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/agents/hephaestus/agent.ts#L173-L176), [регистрация:142](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/agents/builtin-agents.ts#L142-L157) |

Имена не означают четыре независимых приложения: это профили поведения и конфигурации внутри редакции OMO.

### Сопоставление механизмов

| Механизм | OMO OpenCode edition | OMP |
|---|---|---|
| **Сабагенты** | `task`, категории, специализированные исследователи и консультанты. Категорийным workers запрещено дальнейшее делегирование. [Features](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/docs/reference/features.md) | Встроенный `task`; рекурсивное делегирование ограничивается глубиной и политиками агентов. [Subagents](https://omp.sh/docs/subagents), [Tools](https://omp.sh/docs/tools) |
| **Фоновые задачи** | Background manager, уведомления, получение результатов и отмена. [Background Agents](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/docs/reference/features.md) | Собственные фоновые jobs, ожидание и координация процессов/агентов. [Subagents](https://omp.sh/docs/subagents) |
| **Worktree / isolation** | Опциональные git worktrees в Team Mode и workflow исполнения плана. Team Mode экспериментальный, по умолчанию выключен. [Team Mode](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/docs/guide/team-mode.md) | Собственная изоляция задач: не только git worktree, но и платформенные snapshot/copy-on-write/copy backend. Изоляция по умолчанию выключена. [settings.ts:24](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/task/settings.ts#L24-L70), [worktree.ts:530](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/task/worktree.ts#L530-L558) |
| **Plan mode** | Prometheus, `ulw-plan`, затем отдельный workflow исполнения. [Orchestration](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/docs/guide/orchestration.md) | Встроенный `/plan`, read-only исследование и подтверждение перехода к реализации. [Plan](https://omp.sh/docs/plan) |
| **Todo enforcement** | Есть механизм continuation, а не только список; `/stop-continuation` останавливает соответствующие продолжения. [Features/commands](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/docs/reference/features.md) | Есть `todo` и отдельный goal mode для длительного достижения цели. Их семантика не тождественна OMO todo-enforcer. [Tools](https://omp.sh/docs/tools), [Goal](https://omp.sh/docs/goal) |
| **Magic keywords** | `ultrawork`/`ulw` обрабатываются keyword hook. `ulw-*` исключены из обычного совпадения: skills вроде `ulw-research` имеют собственный маршрут. [constants.ts:1](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/hooks/keyword-detector/constants.ts#L1-L17) | Есть собственные `ultrathink`, `orchestrate`, `workflowz`; это не совместимые алиасы OMO `ulw`. [Magic keywords](https://omp.sh/docs/magic-keywords) |
| **Advisor** | Возможны консультации отдельного агента, например Oracle; наличие локального `paseo-advisor` не является свойством стандартного OMO. [Реестр агентов:32](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/agents/builtin-agents.ts#L32-L37) | Собственная advisor-подсистема: другая модель получает контекст основной работы и может давать замечания. Это отдельный механизм, не просто название task-агента. [Advisor](https://omp.sh/docs/advisor), [runtime.ts:40](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/advisor/runtime.ts#L40-L70) |
| **Hooks** | Lifecycle hooks плагина и совместимость с Claude hooks. [Регистрация](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/plugin/hooks/create-transform-hooks.ts#L41-L53) | Собственные JS/TS hooks и extension API. [Hooks](https://omp.sh/docs/hooks) |

### TTSR: действительно отдельная особенность OMP

**TTSR означает Time-Traveling Stream Rules, не синтез речи.** Правило сопоставляет regex или AST-pattern с генерируемым содержимым, может остановить ответ до выполнения соответствующего tool call, внедрить инструкцию и запустить повторную генерацию. По документации механизм включён по умолчанию; есть и мягкий режим без немедленного прерывания. [Документация TTSR](https://omp.sh/docs/ttsr), [coordinator.ts:218](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/session/ttsr-coordinator.ts#L218-L237).

**Точного эквивалента TTSR в проверенной OpenCode edition OMO не подтверждено.** Обычный pre-tool hook похож по назначению, но не равен потоковому прерыванию с перегенерацией.

**Вывод:** advisor и TTSR являются более содержательными отличиями OMP, чем утверждения «там есть сабагенты» или «там есть планирование». Но ни TTSR, ни изоляция файловой рабочей области сами по себе не образуют полноценную security sandbox. [TTSR: ограничения](https://omp.sh/docs/ttsr), [Tools: approvals](https://omp.sh/docs/tools).

## 5. Модели, провайдеры, подписки и ToS

### Маршрутизация и fallback

**OMO:** категории и агенты имеют модельные цепочки; документация различает предварительное разрешение модели и реактивное восстановление после ошибок провайдера. В актуальной конфигурации используются `models`; `fallback_models` сохраняется как deprecated-поле. [Features: Category Configuration и Fallback Models](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/docs/reference/features.md).

**OMP:** `modelRoles` задаёт роли `default`, `smol`, `slow`, `plan`, `commit`, `task`, `advisor` и другие. Список кандидатов внутри роли означает выбор доступной модели, **не retry-цепочку**. Поведение после ошибок отдельно задаётся `retry.fallbackChains`. [models.md:679](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/docs/models.md#L679-L701).

Таким образом, «у OMO routing есть, у OMP нет» неверно; различаются конфигурационные сущности и механика.

### Подписки: техническая поддержка

| Подписка | OpenCode + OMO | OMP |
|---|---|---|
| **ChatGPT** | OpenCode документирует вход через ChatGPT Plus/Pro. Это возможность хоста, которую использует OMO. [OpenCode providers](https://opencode.ai/docs/providers/#openai) | Документирован OAuth-провайдер `openai-codex`. [Providers](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/docs/providers.md) |
| **GitHub Copilot** | OpenCode документирует device-login и использование моделей подписки. [OpenCode providers](https://opencode.ai/docs/providers/#github-copilot) | Документирован OAuth-провайдер `github-copilot`. [providers.md:216](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/docs/providers.md#L216) |
| **Claude Pro/Max** | Документация OpenCode сообщает, что bundled subscription-auth плагины удалены с 1.3.0 и Anthropic запрещает такое использование. На странице остался и противоречащий этому старый шаг Pro/Max-login, поэтому она не должна быть единственным основанием. [OpenCode providers](https://opencode.ai/docs/providers/#anthropic) | Техническая OAuth-интеграция Anthropic присутствует в документации. Это не подтверждение разрешённости такого использования. [providers.md:55](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/docs/providers.md#L55-L71) |

### Что говорит сам Anthropic

Официальная страница Claude Code указывает, что подписочный OAuth предназначен для обычного использования Claude Code и других native-приложений Anthropic; разработчикам сторонних продуктов предлагаются API credentials. Она отдельно запрещает предлагать Claude.ai login в собственных приложениях и маршрутизировать запросы через Free/Pro/Max credentials пользователей. [Anthropic: Authentication and credential use](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use).

При этом есть отдельное разрешённое условное направление: хостить **неизменённый Claude Code binary** с соблюдением перечисленных условий. Это не то же самое, что самостоятельно реализовать Claude OAuth в другом harness. [Anthropic: Claude Code in products](https://code.claude.com/docs/en/legal-and-compliance#can-customers-offer-claude-code-in-their-products).

**Рекомендация:** для снижения риска нарушения условий подписки использовать официальные API-учётные данные, предназначенные для сторонних клиентов. Это рекомендация о разрешённости использования, **не утверждение, что API-ключ как секрет технически безопаснее OAuth**.

Для ChatGPT и Copilot подтверждена техническая поддержка рассматриваемыми клиентами; отдельного одобрения именно OMP/OMO всеми соответствующими провайдерами в рамках исследования не установлено. Наличие кнопки входа само по себе не является договором.

## 6. Совместимость конфигов: шире, чем кажется, но не полная

| Формат | OMO OpenCode edition | OMP |
|---|---|---|
| **Claude skills** | Подтверждена загрузка user/project Claude skills; `claude_code.skills` по умолчанию разрешает этот путь. [agent-skill-discovery.ts:15](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/plugin-handlers/agent-skill-discovery.ts#L15-L40) | Есть Claude discovery adapter; пользовательские источники могут требовать opt-in. [claude.ts:193](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/discovery/claude.ts#L193-L224) |
| **Claude hooks** | Читаются `~/.claude/settings.json`, проектные `.claude/settings.json` и `.claude/settings.local.json`, включая `settings.hooks`. Это не только hooks из plugins. [config.ts:73](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/hooks/claude-code-hooks/config.ts#L73-L87), [загрузка:232](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/hooks/claude-code-hooks/config.ts#L232-L251) | Подтверждён adapter для `.claude/hooks/pre` и `post`. Это не доказательство полной семантической совместимости со всеми событиями и вариантами Claude settings hooks. [claude.ts:377](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/discovery/claude.ts#L377-L401) |
| **Claude MCP** | Есть compatibility loader и объединение с MCP хоста/плагинов. [mcp-config-handler.ts](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/plugin-handlers/mcp-config-handler.ts#L28-L68) | Есть чтение Claude MCP-источников. [claude.ts:83](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/discovery/claude.ts#L83-L116) |
| **AGENTS.md** | **Да.** OMO имеет directory injector, который автоматически отключается при достаточной native-поддержке OpenCode, чтобы не дублировать её. [create-tool-guard-hooks.ts:77](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/plugin/hooks/create-tool-guard-hooks.ts#L77-L90) | **Да**, отдельный `agents-md` discovery provider. [agents-md.ts:1](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/discovery/agents-md.ts#L1-L28) |
| **Cursor rules** | **Да для `.cursor/rules` и `.mdc`** через rules engine. Не следует расширять это до полного импорта Cursor settings. [constants.ts:5](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/rules-engine/src/constants.ts#L5-L16), [hook wiring:104](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/plugin/hooks/create-tool-guard-hooks.ts#L102-L109) | Есть Cursor adapter, включая `.cursor/rules/*.mdc` и legacy `.cursorrules`. [cursor.ts:1](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/discovery/cursor.ts#L1-L12) |
| **Codex** | Общие AGENTS/skills-конвенции применимы; отдельная OMO Codex edition не означает полный импорт `.codex` в OpenCode edition. Полная совместимость конфигурации не подтверждена. [Skill locations и editions](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/docs/reference/features.md) | Есть Codex discovery adapter; например, пользовательский `~/.codex/AGENTS.md` читается при разрешённом пользовательском источнике. [codex.ts:54](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/discovery/codex.ts#L54-L94) |

**Вывод:** совместимость следует проверять по типу сущности: инструкции, skills, hooks, MCP, permissions и settings не являются одним форматом. Обещание «подхватывает `.claude`» не означает «ведёт себя как Claude Code во всех случаях».

Отдельно: современная миграция OMO Native переносит не всё из OpenCode; UI settings, tool permissions и plugin hooks прямо перечислены среди непереносимых. Значит, даже **между двумя редакциями одного OMO** полной взаимозаменяемости нет. [Migration: What isn’t carried](https://github.com/code-yeongyu/oh-my-openagent/blob/v5.1.35/docs/guide/migrating-from-opencode.md).

## 7. Доказательства качества: что измерено, а что нет

### 7.1. Hashline-бенчмарк Can Bölük

**Тип источника:** первичный отчёт автора OMP о собственном эксперименте, не независимая оценка продукта.

Методика: 180 задач с механическими мутациями файлов React, три запуска на задачу, свежая сессия, 16 моделей, сравнение edit-форматов. В тексте статьи указано:

- hashline превосходит **patch** у 14 из 16 моделей;
- Grok Code Fast 1: **6,7% с patch → 68,3% с hashline**;
- результат проверяется относительно исходного файла, в том числе после форматирования.

[Полная публикация Stencil](https://stencil.so/blog/the-harness-problem).

**Критическое уточнение:** десятикратный результат относится к **patch → hashline**, а не к **replace → hashline**. На той же странице для Grok прирост относительно replace составляет **4,6 процентного пункта**. Это существенно меняет смысл заголовка.

**Что подтверждает код:** исторический runner от 12 февраля запускает `read,edit,write`; verifier сравнивает форматированные версии, а `indentScore` учитывает отдельно. [runner.ts:596](https://github.com/can1357/oh-my-pi/blob/7a6b42353eab3e412d14902ac26cdae9934e149e/packages/react-edit-benchmark/src/runner.ts#L590-L598), [verify.ts:151](https://github.com/can1357/oh-my-pi/blob/7a6b42353eab3e412d14902ac26cdae9934e149e/packages/react-edit-benchmark/src/verify.ts#L151-L181).

**Вывод:** эксперимент поддерживает тезис «edit-интерфейс может сильно влиять на успех конкретной модели». Он не доказывает, что весь OMP в десять раз лучше OMO, Pi или Claude Code, и не измеряет полноценную разработку многомодульной системы.

### 7.2. Независимые повторения и критика hashline

У `nwyin/edit-bench` есть независимый эксперимент на Python, TypeScript и Rust: **20 задач на язык, одна попытка**, несколько моделей. Результаты смешанные. Например, у Gemini 3 Flash:

| Язык | Replace | Hashline |
|---|---:|---:|
| Python | 95% | 70% |
| TypeScript | 80% | 85% |
| Rust | 95% | 90% |

Автор прямо предупреждает о маленькой выборке и отсутствии статистической строгости. Это **не точная репликация React-эксперимента Bölük**. [Первичный отчёт независимого экспериментатора](https://nwyin.com/blogs/hashline-vs-replace-edit-bench.html), [данные и обсуждение](https://github.com/nwyin/edit-bench/issues/14).

В этой критике присутствует предположение о влиянии LSP-feedback в исходном эксперименте. **Его я не считаю установленным фактом:** текущий benchmark client явно задаёт `enableLsp: false`, а исторический список инструментов сам по себе не закрывает вопрос обо всей фоновой диагностике тех запусков. [Текущий client:107](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/typescript-edit-benchmark/src/in-process-client.ts#L107-L112).

**Вывод:** независимые данные ограничивают универсальность выигрыша hashline, но не опровергают автоматически исходный результат на другом наборе задач.

### 7.3. Composio: Pi против OMP

**Тип источника:** собственный эксперимент сторонней компании. Первичный источник для её измерений, но обзорные утверждения о внутренностях проектов остаются вторичными. Composio также поставляет использованную MCP-инфраструктуру.

Испытание: **30 agentic tool-use задач через hosted MCP**, DeepSeek V4 Flash, лимит 900 секунд на задачу. Это не чистый coding benchmark и **не OMO против OMP**. [Полный отчёт](https://composio.dev/content/pi-vs-omp).

| Метрика, как опубликована Composio | Pi | OMP |
|---|---:|---:|
| Успешные задачи | 20/30 | 17/30 |
| Медианное время | 132,2 с | 272,4 с |
| Средние токены на задачу | 558 885 | 742 283 |
| Стоимость на успех | $0,028 | $0,103 |

Ограничения, указанные самим источником:

- Pi использовал reasoning **high**, а не max;
- **24 из 30 испытаний Pi** шли через официальный DeepSeek API, остальные через OpenRouter;
- задачи включали работу с приложениями и их данными, а не только изменение исходников;
- разница итогового счёта сосредоточена в пяти задачах: четыре выиграл Pi, одну OMP.

[Методика, результаты и оговорки](https://composio.dev/content/pi-vs-omp).

**Вывод:** в опубликованной выборке Pi оказался успешнее и экономнее. Причинный вывод «встроенные инструменты ухудшают OMP» этим экспериментом не доказан: конфигурации и маршруты доступа неоднородны, отдельные компоненты harness не изолировались.

### 7.4. Что найдено по OMO

Найден [PR #574 в репозитории OMO](https://github.com/code-yeongyu/oh-my-openagent/pull/574), предлагающий Harbor/Terminal-Bench интеграцию. Он **закрыт без merge**; опубликованный результат в описании относится к `hello-world@1.0`, одному испытанию и reward 1.0, не к полноценному Terminal-Bench. Также найдены обсуждения необходимости опубликовать оценки: [issue #186](https://github.com/code-yeongyu/oh-my-openagent/issues/186), [issue #2743](https://github.com/code-yeongyu/oh-my-openagent/issues/2743).

**Не подтверждено:** публичное контролируемое OMO-versus-OMP сравнение с одинаковыми моделями, задачами, лимитами и verifier; сопоставимая полноценная опубликованная оценка OMO в просмотренных источниках.

Следовательно, **победителя по качеству между OMO и OMP доказательно назначить нельзя**.

### 7.5. Известные проблемы и их статус

| Проект | Наблюдаемое свидетельство | Что из него следует |
|---|---|---|
| OMO | [#2172](https://github.com/code-yeongyu/oh-my-openagent/issues/2172): дублирование кода hashline с GLM-5; создан 27 февраля, закрыт 9 марта 2026. [#2623](https://github.com/code-yeongyu/oh-my-openagent/issues/2623): повторные жалобы на messy edits; закрыт 23 марта. | Существовали конкретные проблемы реализации/взаимодействия с моделями. Это не доказательство наличия того же дефекта в текущем релизе. |
| OMP | [#3772](https://github.com/can1357/oh-my-pi/issues/3772): ошибки hashline с MiMo/DeepSeek; создан 29 июня, закрыт 27 июля. Текущий код уже имеет model-specific переходы на replace. | Универсальность одного edit-формата ограничена; актуальная реализация это учитывает. |
| OMP | v18.11.3 исправляет, среди прочего, ложное успешное завершение после неисправимого context overflow и проблемы доставки результатов возобновлённого сабагента. [Release notes](https://github.com/can1357/oh-my-pi/releases/tag/v18.11.3) | Важны не только качество edits, но и корректность статуса завершения и координации. Это опубликованные исправления, не заявление о сохраняющихся дефектах. |

Количество issues не использовалось как показатель надёжности: без числа пользователей, нагрузки и воспроизводимости такой знаменатель отсутствует.

## 8. Практический вывод: кому подходит что и что забирать

### Кому разумнее OMO OpenCode edition

**Мой вывод:** сохранять OpenCode+OMO логично, если важны уже работающий OpenCode-процесс, именованные роли, категорийное распределение моделей, background delegation и управляемое продолжение многошаговой работы. Это рекомендация по соответствию workflow и стоимости миграции, не доказанное превосходство на benchmark. Основание: [возможности OMO](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/docs/reference/features.md).

### Кому разумнее OMP

**Мой вывод:** OMP интереснее, если требуется самостоятельный инструмент с тесно интегрированными DAP, persistent eval, браузером, модельными ролями, advisor и TTSR, а также MIT-лицензией. Он уменьшает потребность собирать эти возможности из отдельных интеграций, но требует принимать собственные настройки, зависимости и темп изменений. Основание: [Tools](https://omp.sh/docs/tools), [Advisor](https://omp.sh/docs/advisor), [TTSR](https://omp.sh/docs/ttsr), [MIT](https://github.com/can1357/oh-my-pi/blob/v18.11.3/LICENSE).

### Можно ли сочетать

**Да как отдельные процессы и workflow. Подтверждённой схемы «установить OMP как обычный плагин OpenCode» не найдено.** OMP документирует собственные CLI, SDK, RPC и ACP-интерфейсы, а не OpenCode plugin API. [OMP SDK](https://omp.sh/docs/sdk), [RPC](https://omp.sh/docs/rpc), [ACP](https://omp.sh/docs/acp).

**Рекомендация по сочетанию:**

- один оркестратор отвечает за задачу;
- второй harness используется как явно ограниченный исполнитель или консультант;
- отдельные worktrees/checkout для параллельных writer-агентов;
- результат передаётся как diff, артефакт или отчёт, а не через конкурирующие правки одной рабочей копии.

Это предлагаемая схема интеграции, **не проверенная готовая связка OMO↔OMP**. Реализация через RPC возможна как отдельный проект, но в данном исследовании не создавалась и не испытывалась.

### Что действительно стоит перенять в OpenCode+OMO

| Идея | Что делать в существующем сетапе | Приоритет |
|---|---|---|
| **Удобный live-debugging через DAP** | Сначала оценить уже поставляемый OMO debugging skill. Если нужен единый MCP-интерфейс с VS Code или standalone DAP-host, рассмотреть Microsoft DebugMCP. [OMO DAP](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/shared-skills/skills/debugging/references/tools/dap.md), [DebugMCP](https://github.com/microsoft/DebugMCP) | Высокий, если регулярно отлаживаете runtime-проблемы |
| **Persistent Python/JS eval** | Добавлять через отдельный tool/plugin/MCP с явным жизненным циклом ядра, если такое состояние действительно требуется. Не путать его с одноразовым запуском скрипта. Основание для идеи: [OMP eval](https://omp.sh/docs/tools). | Высокий для анализа данных и итеративных вычислений |
| **Advisor как отдельный режим** | Использовать имеющийся консультирующий агент для второго мнения; автоматическое фоновое наблюдение добавлять только при понятной пользе и бюджете. Это не полная замена OMP advisor. [OMP Advisor](https://omp.sh/docs/advisor) | Средний |
| **TTSR-подобные узкие правила** | Переносить идею через hooks хоста: точный детектор, остановка до опасного вызова, короткая корректирующая инструкция. Обычный MCP-сервер сам по себе не заменяет контроль streaming lifecycle. [TTSR](https://omp.sh/docs/ttsr), [OMO hooks](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/packages/omo-opencode/src/plugin/hooks/create-transform-hooks.ts#L41-L53) | Средний, для повторяющихся конкретных ошибок |
| **Подбор edit-режима под модель** | Не включать hashline только из-за заголовка про «10×». Сравнивать на ваших файлах и задачах; у OMO функция уже есть, а сам OMP использует исключения по моделям. [OMP edit-mode.ts](https://github.com/can1357/oh-my-pi/blob/df4f996e66a200ab7e0496114d43bdf85f32194d/packages/coding-agent/src/utils/edit-mode.ts#L20-L42) | Высокий при дешёвых/нестабильных на edits моделях |
| **LSP, AST-grep, браузер, web search** | Не добавлять повторно только ради соответствия OMP: соответствующие маршруты уже есть у OMO. Проверять доступность и удобство конкретной реализации. [OMO Features](https://github.com/code-yeongyu/oh-my-openagent/blob/90eaba6e93a4fbfdb342bd001e6b512e852bdc04/docs/reference/features.md) | Сначала проверка имеющегося, потом расширение |

### Что осталось неподтверждённым

1. **Контролируемое прямое превосходство OMO или OMP.** Искал в официальных репозиториях, benchmark-обсуждениях, PR, публикациях Stencil и Composio; сопоставимого head-to-head не найдено.
2. **Полная независимая репликация исходного hashline-эксперимента** с теми же fixtures, версиями, моделями и условиями. Найденные внешние эксперименты меняют условия.
3. **Полный пакет воспроизводимости Composio**, достаточный для независимого повторения именно опубликованных 30 испытаний. Проверены статья и описанная методика, не выполнено воспроизведение.
4. **Полная семантическая совместимость всех Claude/Cursor/Codex конфигов.** Подтверждены конкретные loaders, но не обещание переносимости любых hooks, permissions и расширений.
5. **Универсальные persistent eval и durable-memory tools именно в OMO OpenCode edition.** Проверены её tool registry и связанные модули; возможности Native не приписывались плагину.
6. **Работоспособность и производительность на вашей машине.** Намеренно не проверялись запуском согласно вашему ограничению.

**Итоговая рекомендация:** не менять работающий OpenCode+OMO на OMP только ради hashline, LSP или сабагентов: это не отсутствующие у OMO классы возможностей. Рассматривать OMP стоит ради **цельной инструментальной среды и конкретных механизмов вроде persistent eval, advisor и TTSR**. Для вашего текущего стека наиболее рационален выборочный перенос полезных возможностей, а не установка второго автономного оркестратора поверх первого. Это инженерный вывод из архитектур и миграционных границ, а не победный счёт несуществующего сравнительного испытания.
