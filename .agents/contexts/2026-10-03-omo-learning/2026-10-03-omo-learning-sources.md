# Источники и границы проверки

Дата наблюдений: 2026-10-03. OMO: версия 5.1.13; upstream commit `294a165e320314b130526b2a1326368ef14bfb57`. Ссылки на этот commit фиксируют версию, ссылки OpenCode/Paseo описывают изменяемую документацию, а не проверенный локальный сервер.

## Первичные источники

- S1. [Конфигурация OpenCode edition](https://github.com/code-yeongyu/oh-my-openagent/blob/294a165e320314b130526b2a1326368ef14bfb57/docs/reference/opencode-config.md): агенты, overrides, особое поведение Prometheus, hook ulw-execute. Прочитано также ведущим агентом.
- S2. [JSON Schema OMO](https://github.com/code-yeongyu/oh-my-openagent/blob/294a165e320314b130526b2a1326368ef14bfb57/assets/oh-my-opencode.schema.json): поля reasoning, textVerbosity, agent maxTokens, category max_tokens, team_mode. Ведущий агент извлёк нужные поля через curl + jq.
- S3. [Нормализация task](https://github.com/code-yeongyu/oh-my-openagent/blob/294a165e320314b130526b2a1326368ef14bfb57/packages/omo-opencode/src/tools/delegate-task/tool-argument-preparation.ts): category имеет приоритет; пропущенный run_in_background становится false; пропущенный load_skills становится пустым массивом, null запрещён. Прочитано ведущим агентом.
- S4. [Контракт task](https://github.com/code-yeongyu/oh-my-openagent/blob/294a165e320314b130526b2a1326368ef14bfb57/packages/omo-opencode/src/tools/delegate-task/tool-description.ts): выбор исполнителя, идентификаторы и продолжение.
- S5. [Получение фонового результата](https://github.com/code-yeongyu/oh-my-openagent/blob/294a165e320314b130526b2a1326368ef14bfb57/packages/omo-opencode/src/tools/background-task/create-background-output.ts): background ID, уведомления и ожидание.
- S6. [Создание дочерней сессии](https://github.com/code-yeongyu/oh-my-openagent/blob/294a165e320314b130526b2a1326368ef14bfb57/packages/omo-opencode/src/tools/delegate-task/sync-session-creator.ts) и [передача prompt](https://github.com/code-yeongyu/oh-my-openagent/blob/294a165e320314b130526b2a1326368ef14bfb57/packages/omo-opencode/src/tools/delegate-task/sync-prompt-sender.ts): связь с родителем и явный контекст.
- S7. [OpenCode Server](https://opencode.ai/docs/server/): сессии, сообщения, prompt_async, abort, события, /doc, список команд и агентов. Прочитано ведущим агентом; локальный API не запускался.
- S8. [OpenCode SDK](https://opencode.ai/docs/sdk/): внешний клиент; примеры SDK не исполнялись.
- S9. [Paseo workflows](https://paseo.sh/docs/orchestration-workflows.md): разделение worktree, implement-then-review, сообщения, host, heartbeat. Прочитано ведущим агентом.
- S10. [Paseo workspaces](https://paseo.sh/docs/workspaces.md) и [worktrees](https://paseo.sh/docs/worktrees.md): место файлов, изоляция, жизненный цикл.
- S11. [Paseo MCP](https://paseo.sh/docs/mcp.md) и [CLI](https://paseo.sh/docs/cli.md): agent ID, продолжение, workspace и parentage.
- S12. [Paseo schedules](https://paseo.sh/docs/schedules.md) и [skills](https://paseo.sh/docs/skills.md): расписания, advisor и handoff.
- S13. [OMO orchestration, dev](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/docs/guide/orchestration.md) и [features, dev](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/docs/reference/features.md): использованы для поиска тем; расхождения команд требуют сверки с релизом, не считаются runtime-фактами.
- S14. [Paseo agent profiles](https://paseo.sh/docs/agent-profiles.md): настройки будущих запусков, host-scoped профили, заметки для выбора. Прочитано исследователем во второй волне.

## Локальные источники

- L1. `~/.config/opencode/opencode.json`, plugin entry, и `~/.cache/opencode/packages/oh-my-openagent@5.1.13/node_modules/oh-my-openagent/package.json`: исследователь подтвердил pin/cache 5.1.13. Это не измерение версии уже запущенного серверного процесса.
- L2. `~/.omo/omo.jsonc` ссылается на `~/.dotfiles/.omo/omo.jsonc`, по проверке исследователя. Ведущий прочитал worktree-копию `.omo/omo.jsonc`: раздел `[opencode]`, team_mode.enabled=false, reasoning в models[]. Точная effective-конфигурация процесса отдельно не снималась.
- L3. `~/.config/opencode/AGENTS.md`: правила стиля. Текущий prompt Hephaestus также содержит обязательные исследовательские, проверочные и отчётные процедуры; не вся формальность исходит из пользовательского файла.
- L4. Установленный skill `ulw-research`: максимальное исследование по явному запросу. Загружен в этой сессии. Это отдельный протокол, не значение textVerbosity.
- L5. Реальные вызовы инструментов этой сессии: task вернул bg_ и ses_; после уведомлений background_output вернул результаты; продолжение task по ses_ сохранило дочернюю сессию. Это наблюдение данного запуска, не тест всех вариантов отмены.
- L6. `dot-agents-ctl load omo-learning` и `check`: контекст читается; общий корпус имеет старую ошибку другого контекста. CLI проверен в tmux также с неверным slug и --help.
- L7. Установленный `~/.cache/opencode/packages/oh-my-openagent@5.1.13/node_modules/oh-my-openagent/dist/index.js:113264`: createBuiltinCommandDefinitions, включая ulw-execute на строке 113287, goal, stop-continuation и handoff. Поиск start-work по всему файлу не вернул совпадений. В `dist/skills/ulw-plan/SKILL.md` и `dist/skills/ulw-execute/SKILL.md` прочитаны названия и контракты. Это проверка поставленных файлов, не меню клиента.

## Как читать доказательства

Код и схема релиза подтверждают контракт. Документация подтверждает описанный интерфейс. Наблюдение инструмента подтверждает выполненный путь. Рекомендации по организации курса не являются обещаниями продукта. Наличие поля в схеме не доказывает одинаковую поддержку всеми моделями/провайдерами.

Для частной конфигурации и API-контракта первичный источник достаточен; независимая статья не заменяет исходный код. Источники одного upstream не считаются независимыми подтверждениями.
