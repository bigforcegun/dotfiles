# Claude Code: сабагенты и выбор модели — ресёрч

[[2026-09-29-claude-code-subagent-models]]

Состояние на 2026-09-29, Claude Code CLI 2.1.280 (локально). Источники — в конце.

## 1. Типы сабагентов

Маппинга «вопрос → агент» нет. Главная модель одним tool call `Agent` выбирает
`subagent_type`, опираясь только на `description` типов в описании тула + инструкции
harness («независимых агентов — одним сообщением», «делегируй чтение многих файлов»).
Промпт сабагенту модель пишет сама; переписку он не видит, но читает `~/.claude/CLAUDE.md`
(отключается `omitClaudeMd: true`).

Встроенные типы (дока + строки бинарника 2.1.280):

| Тип | Назначение |
|---|---|
| `general-purpose` | ресёрч, веб, многошаговые задачи; **фолбэк, если `subagent_type` не указан** |
| `Explore` | read-only поиск по коду |
| `Plan` | сбор контекста в plan mode |
| `claude` | универсальный, дефолт для фоновых/FleetView-сессий |
| `statusline-setup` | только `/statusline` |
| `claude-code-guide` | по доке есть (Haiku), в сессии не виден — не проверено почему |

Строки `main`, `subagent`, `teammate`, `workflow-subagent`, `comment-thread-analyst` —
внутренние роли, не выбираемые типы. `fork` — отдельный режим: наследует весь контекст
и модель родителя. Если `general-purpose` запрещён и тип не указан — ошибка
`subagent_type is required`.

Кейс из paseo-чата 51454039 (сессия `88eee339…` в fuzzy-flamingo): 3 параллельных
`general-purpose` появились потому, что пользователь перечислил три темы через запятую;
`Map watcher data model` там же ушёл в `Explore`. Thinking перед вызовом в транскрипт
не пишется — рассуждение восстановлено по входам/выходам.

## 2. Где задаются и как переопределяются

Приоритет при совпадении имён: managed settings → `--agents` (сессия) →
`.claude/agents/` → `~/.claude/agents/` → плагины → встроенные.
Встроенный тип **переопределяется файлом с тем же именем** — проверено:
`claude -p --agents '{"general-purpose":{...,"tools":["Read"]}}'` — сабагент получил
только `Read` и наш промпт. Файл заменяет агента **целиком, включая промпт**; поля
«только модель» для встроенных нет ([#25546], закрыт как дубликат).

Поля frontmatter: `name`, `description` (главное для выбора), `tools`/`disallowedTools`,
`model` (alias `sonnet|opus|haiku|fable`, полный ID или `inherit`), `effort`,
`permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`,
`isolation: worktree`, `background`, `omitClaudeMd`, `color`.

Отключение: `permissions.deny: ["Agent(Explore)"]` / `["Agent"]`;
`CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1`; для SDK/`-p` —
`CLAUDE_CODE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1`.

## 3. Выбор модели (актуальная дока)

Порядок:
1. per-invocation `model` в вызове `Agent`;
2. `model` во frontmatter (`inherit` = модель родителя);
3. `CLAUDE_CODE_SUBAGENT_MODEL` — **только дефолт** (с v2.1.251; раньше был первым и
   перекрывал всё, включая `inherit`);
4. модель родителя.

`CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` (v2.1.257+) + `SUBAGENT_MODEL` — жёсткий потолок:
игнорирует frontmatter всех агентов (вкл. Explore/Plan) и per-call `model`. Исключения:
fork и skill-в-сабагенте с `model: inherit`. FORCE без `SUBAGENT_MODEL` = всё на модели родителя.

Встроенные:
- `Explore` — с v2.1.198 наследует модель родителя (потолок Opus на Claude API);
  раньше всегда Haiku. Также с 2.1.198 сабагенты наследуют настройку extended thinking.
- `Plan` — наследует.
- `general-purpose` — `SUBAGENT_MODEL`, иначе модель родителя.

Ловушки алиасов:
- Алиас семейства родителя (`opus` при родителе `opus[1m]`) резолвится в **точную модель
  родителя, включая `[1m]`**. `model: opus` не удешевляет.
- Алиас в `CLAUDE_CODE_SUBAGENT_MODEL` всегда резолвится в свою версию.
- [#57249]: скилл с `model: sonnet` при родителе Opus 1M поднимался как Sonnet 1M —
  отдельный SKU extra-usage.

## 4. Что говорит сообщество

- [#26179] «Subagents should default to Sonnet, not inherit Opus» (2026-02-16): 62 агента
  из 6 плагинов, ни одному не нужен Opus; workaround — `sed 's/model: opus/model: sonnet/'`
  по плагинам после каждого апдейта. **Closed: not planned (stale).**
- Explore перестал быть Haiku: [#29768], [#72940] (дока отставала), пост Joe Cotellese.
- Расход: в статьях пересказ Reddit-поста Max 20 — «85% of your usage came from
  subagent-heavy sessions» (первоисточник не найден). Типичный совет — явный `model`
  в агентах, заявления про −60% токенов.
- Роутинг ломается: [#43869] (open, с 2026-04-05) — все 5 способов увести на Sonnet
  игнорировались, Sonnet-квота Max не используется; также [#18346], [#77396],
  [#20291] (`/agents` показывает sonnet для inherit).
- Регрессии env: [#85592] (reproduced) — с v2.1.223 `SUBAGENT_MODEL` молча перекрывал
  per-call `model`, `.meta.json` писал запрошенную, а не фактическую модель;
  исправлено сменой порядка в v2.1.251. [#97588] (open, 2026-09-27, VS Code 2.1.283) —
  `sonnet` + FORCE, а UI показывает Opus.

Вывод: Anthropic дефолт не меняет, даёт ручки; ручки периодически ломаются, UI/метаданные
могут врать о фактической модели → после настройки проверять реальный расход.

## 5. Три уровня управления (ответ на «будет ли конфиг как в OMO»)

| Уровень | Механизм | Эффект |
|---|---|---|
| 1. Точечно | `~/.claude/agents/<name>.md` с `model:` (в т.ч. `Explore.md`, `general-purpose.md`, `Plan.md`) | аналог `agents.<x>.model` в OMO |
| 2. Дефолт | `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` без FORCE | для агентов без `model` (плагины и т.п.) |
| 3. Потолок | + `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` | всё на одной модели, уровень 1 игнорируется |

Правила в CLAUDE.md — мягкие, не конфиг. OMO-«категории» = свои агенты (`quick`, `deep`)
с `description` + `model`.

Дыры: переопределение встроенного = свой промпт (протухает при апдейтах); главная модель
может передать per-call `model` и перекрыть файл (гарантия только через FORCE).

Черновик раскладки:

```
~/.claude/agents/
  Explore.md          model: haiku
  general-purpose.md  model: sonnet
  Plan.md             model: inherit
  deep.md             model: opus
```

## 6. Локальное состояние (2026-09-29)

- `~/.claude/settings.json`: `model: "opus[1m]"`, `env` пуст → все сабагенты,
  включая Explore, на Opus 1M.
- `~/.claude/agents/` пуст, проектного `.claude/agents/` нет.
- rulesync: `.rulesync-global/.rulesync/subagents/code-review-simple.md` —
  `targets: ['opencode']`, `disable: true`, `gpt-5.3-codex`; в Claude не попадает.

## 7. Реализация (2026-09-29)

Исходники в `.rulesync-global/.rulesync/subagents/`, `targets: ['claudecode']`:

| Файл | model | Промпт |
|---|---|---|
| `Explore.md` | haiku | дословно из бинарника 2.1.280 (`NJt()`), `omitClaudeMd`, disallowed Agent/ExitPlanMode/Edit/Write/NotebookEdit |
| `Plan.md` | inherit | дословно (`jJt()`), те же ограничения |
| `general-purpose.md` | sonnet | дословно (`o4n()`) |
| `deep.md` | opus | свой, на базе general-purpose; при родителе `opus[1m]` = Opus 1M |

Интерполяции `${...}` раскрыты под эту машину: Bash, Read, встроенные `find`/`grep`
(тулов Glob/Grep в сессии нет). Протухают при апдейтах — сверять с бинарником
(`strings` по `agentType:"Explore"` и т.п.).

`permissions.jsonc` → `claudecode.env.CLAUDE_CODE_SUBAGENT_MODEL=sonnet` (rulesync
deep-merge'ит любые ключи секции `claudecode` в `~/.claude/settings.json`). Без FORCE.

rulesync пробрасывает любые поля агента (`looseObject`), имя файла сохраняется.
Генерация rulesync у агентов в deny (и любая bash-команда с этой подстрокой) —
запускает пользователь.

Проверка: вывод сымитирован через gray-matter в `/tmp/.../.claude/agents`, `claude -p`
с родителем Opus, поле `message.model` в транскриптах сабагентов:
Explore → `claude-haiku-4-5-20251001`, general-purpose → `claude-sonnet-5`,
deep → `claude-opus-5-5`. `.meta.json` модель не пишет.
Не проверено: env-дефолт для агентов плагинов без `model`; реальный вывод rulesync.

## 8. Итоговое решение: правило вместо агент-файлов (2026-09-29)

Агент-файлы из §7 удалены (не были сгенерированы и не коммитились). Вместо них —
секция «Модели сабагентов» в `.rulesync-global/.rulesync/rules/40-claude-run-policy.md`
(target `claudecode`): при вызове `Agent` всегда передавать `model` —
Explore→haiku, general-purpose→sonnet, Plan→opus, сложное→general-purpose+opus.
Страховка на пропуски — `claudecode.env.CLAUDE_CODE_SUBAGENT_MODEL=sonnet` в
`permissions.jsonc` (остался из §7). Per-call `model` приоритетнее env, так что правило
выигрывает; env ловит вызовы без `model`.

Эксперимент (правило в проектном CLAUDE.md клона dotfiles, `claude -p`, родитель Opus,
в задачах о моделях ни слова), фактическая модель из `message.model` транскриптов:

| Прогон | Вызов | Реально |
|---|---|---|
| fan-out 3 темы | Explore×3 `haiku` | Haiku×3 |
| **контроль без правила** | Explore×3, model опущен | **Opus×3** |
| веб-ресёрч | general-purpose `sonnet` | Sonnet |
| план | Plan `opus` | Opus |
| глубокий разбор | general-purpose `opus` | Opus |
| поиск + веб | Explore `haiku` + GP `sonnet` | Haiku + Sonnet |

9/9 вызовов по правилу. Без явной просьбы делегировать Opus в 4 из 5 задач сделал всё
сам. Стоимость по `total_cost_usd` почти одинакова (fan-out $1.15 vs контроль $1.18) —
доминирует родитель; экономия не доказана. В контроле одно сообщение Explore пришло от
`claude-opus-4-8` — не объяснено. Тест был на английской формулировке; в политику
правило записано по-русски — не перепроверено. Не проверено поведение в длинной
сессии / после компакции.

## Источники

- Дока: https://code.claude.com/docs/en/sub-agents
- [#26179]: https://github.com/anthropics/claude-code/issues/26179
- [#43869]: https://github.com/anthropics/claude-code/issues/43869
- [#85592]: https://github.com/anthropics/claude-code/issues/85592
- [#97588]: https://github.com/anthropics/claude-code/issues/97588
- [#25546]: https://github.com/anthropics/claude-code/issues/25546
- [#57249]: https://github.com/anthropics/claude-code/issues/57249
- [#29768]: https://github.com/anthropics/claude-code/issues/29768
- [#72940]: https://github.com/anthropics/claude-code/issues/72940
- [#18346]: https://github.com/anthropics/claude-code/issues/18346
- [#77396]: https://github.com/anthropics/claude-code/issues/77396
- [#20291]: https://github.com/anthropics/claude-code/issues/20291
- [#10993]: https://github.com/anthropics/claude-code/issues/10993
- https://joecotellese.com/posts/claude-code-explore-agent-haiku/
- https://youcanbuildthings.com/articles/claude-code-subagents-token-usage/
- https://byteiota.com/claude-code-subagent-model-routing/
- https://www.tembo.io/blog/claude-code-subagents
- https://dev.to/rulestack/three-claude-code-subagent-files-three-models-in-frontmatter-what-each-launch-cost-and-the-field-257k
