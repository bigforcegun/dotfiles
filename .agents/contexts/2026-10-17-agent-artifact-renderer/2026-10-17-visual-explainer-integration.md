# visual-explainer: интеграция в Claude Code / Codex / OpenCode через rulesync

2026-10-17. Продолжение входной заметки контекста (вердикт: visual-explainer). Проверено на `bde0b2c` (v0.12.0), rulesync 24.0.0.

## Что это за штука на самом деле

Не просто skill — пакет из пяти частей в `plugins/visual-explainer/`:

| Часть | Что | Нужна нам |
|---|---|---|
| `SKILL.md` + `references/` | гайд для модели (9 KB + до 58 KB справочников) | да — это «мозги» |
| `quick/`, `kit/`, `plan/` | рендереры `*.mjs` (node, без зависимостей) | да — их вызывает skill |
| `commands/*.md` | 8 slash-команд (`generate-slides`, `diff-review`…) | по желанию |
| `mcp/server.mjs` | stdio MCP-сервер (npm `visual-explainer`, bin `visual-explainer-mcp`) | см. ниже |
| `pptx/`, `video/`, `extension.ts` | экспорт в PPTX/MP4, расширение Pi | нет |

## rulesync: «как плагин» = `sources`, не plugin

У rulesync «plugin» — это **упаковка своих** конфигов в Claude-плагин (`claudecode-plugin` target), не установка чужих. Чужой skill подключается через `sources` + `rulesync install` (lockfile с SHA).

Проверено в `/tmp/rs-ve`:

```jsonc
"sources": [
  { "source": "https://github.com/nicobailon/visual-explainer",
    "transport": "git", "path": "plugins", "skills": ["visual-explainer"] }
]
```

- `transport: "git"` обязателен: GitHub API-транспорт упал на rate limit (403) на ~48 файлах.
- Приезжает **весь** каталог (48 файлов: `kit/`, `quick/`, `mcp/`, `references/`…) в `.rulesync/skills/.curated/visual-explainer/`, SHA пинуется в `rulesync.lock`.
- `rulesync generate` в песочнице **не прогнан** (запрет системы разрешений) — раскладку по агентам не видел глазами.
- **Не проверено:** работают ли `sources` в `.rulesync-global` (`global: true`). Doc global-mode содержит невнятную оговорку о поддерживаемых полях. Проверить `rulesync install` в копии `.rulesync-global`.

Маркетплейс-плагин Claude Code (`/plugin install visual-explainer@visual-explainer-marketplace`) — только для Claude, мимо rulesync. Не берём.

## Жадность: skill только в сабагенте

Цель: основной чат видит одну строку «есть visualizer», а SKILL.md, справочники и 10–50 KB HTML живут в контексте сабагента.

Что умеет каждый агент (по докам, 2026-10-17):

| | Скрыть skill от main | Дать skill сабагенту | Итог |
|---|---|---|---|
| Claude Code | `disable-model-invocation: true` | `skills: [...]` во frontmatter — вливает полный текст при старте | ❌ несовместимо: «You can't preload skills that set disable-model-invocation: true» |
| Codex | `[[skills.config]] enabled=false` | агент в `~/.codex/agents/*.toml` может skill только **выключить**, не включить | ❌ та же дыра |
| OpenCode | `permission.skill: { "visual-explainer": "deny" }` | override в агенте: `allow` | ✅ |

Цена «не прятать»: в main висит только description skill'а — ~500 байт (~120 токенов). Тело грузится, лишь если main сам решит позвать skill.

**Варианты:**

1. **Skill установлен везде + сабагент `artificer` (было visualizer) + правило маршрутизации** («HTML-артефакты → делегируй visualizer»). Main платит ~120 токенов за description и ~50 за сабагента. Риск: main иногда позовёт skill сам. В OpenCode закрывается permission'ом.
2. **Skill не устанавливается как skill вовсе.** Файлы лежат в стабильном пути (curated-копия или клон), сабагент в инструкции: «прочитай `<path>/SKILL.md`, следуй ему». Main платит ноль за skill, только описание сабагента. Одинаково во всех трёх агентах. Минус: выпадает из `generate`, путь надо прописать руками; авто-триггер skill'а только через сабагента.

Рекомендация: **вариант 1** для старта (минимум ручного), OpenCode — с permission'ом. Если окажется, что main сам дёргает skill и жрёт контекст, — перейти на вариант 2.

Сабагент в rulesync (`.rulesync-global/.rulesync/subagents/visualizer.md`), набросок:

```md
---
name: visualizer
targets: ["*"]
description: Builds HTML artifacts (reports, charts, diagrams, slides) with visual-explainer. Give it the facts and a target path; it returns only the file path.
claudecode:
  model: sonnet
  skills: ["visual-explainer"]
opencode:
  mode: subagent
  permission:
    skill: { "visual-explainer": "allow" }
---
Use the visual-explainer skill. Quick mode by default, full mode only for charts/slides. Write to the path you were given. Reply with the path only.
```

Codex: сабагенты спавнит **только по прямой просьбе или инструкции в AGENTS.md/skill** — правило маршрутизации в rules обязательно.

## MCP: что он даёт и чего не даёт

Сервер — **не LLM** и не MCP App. Это рендерер + библиотека доков по MCP:

- **tools:** `visual_explainer_prepare` (возвращает чек-лист, ничего не пишет), `visual_explainer_render_quick` (JSON-спека → HTML), `visual_explainer_render_html` (готовый HTML/источник → обработка kit'ом → файл);
- **prompts:** те же 8 команд;
- **resources:** `SKILL.md`, `references/*`, `quick/schema.json`, `kit.css` — read-only.

Что это решает:

- **Один способ на три агента без файлов skill'а**: rulesync уже раскладывает `mcp` во все три таргета.
- **Quick-режим почти бесплатен**: агент шлёт 3–4 KB JSON, схему читает ресурсом по требованию. Не нужен shell/node у агента.
- **Скрытие от main работает лучше, чем у skill'ов:**
  - Claude Code: `mcpServers` inline во frontmatter сабагента — «The subagent gets the tools; the parent conversation doesn't». Только для `~/.claude/agents/`, у plugin-агентов поле игнорируется. rulesync пробрасывает `claudecode.mcpServers` как есть.
  - Через твой mcpproxy (toolchain): upstream с ленивой выдачей через `retrieve_tools` — в main ноль схем во всех трёх агентах.
  - Codex: MCP у агента только наследуется от родителя — скрыть нельзя.

Что не решает:

- **Full-режим всё равно пишет модель**: 8–10 KB HTML-источника генерирует агент, MCP только постобрабатывает. Контекст жрётся там, где пишут → сабагент всё равно нужен.
- **Куда пишет:** только в одну «тюрьму» — `~/.agent/diagrams/` или `VISUAL_EXPLAINER_OUTPUT_DIR` (абсолютный, без симлинков, один на процесс). В текущий worktree (`.agents/artifacts/`) не попадёт, если не перезапускать сервер с другим env. Для «смотрю в превью Paseo» это минус против skill'а, который пишет куда скажешь. Подстановка пути проекта в env inline-сервера — **не проверено**.
- `open: false` по умолчанию — браузер сам не откроется, это хорошо.

**Вывод по MCP:** хорош как **дешёвый quick-рендер** для любого агента и как способ спрятать инструмент от main (Claude inline / mcpproxy). Не заменяет skill для full-режима и пишет не туда, куда ты хочешь смотреть.

## Итоговая схема (предложение)

1. `.rulesync-global/rulesync.jsonc` → `sources` с visual-explainer (git, `path: plugins`) + `rulesync install` → lockfile.
2. `.rulesync-global/.rulesync/subagents/visualizer.md` (выше) + правило в rules: «HTML-артефакты делает visualizer, вывод в `.agents/artifacts/`».
3. OpenCode: `permission.skill` deny глобально / allow в visualizer.
4. MCP — **отложить**; включить позже inline в Claude-сабагенте или через mcpproxy, если quick-режим без shell окажется нужен.

## Открытые проверки

- `sources` + `install` в global-режиме rulesync.
- Как `generate` раскладывает curated skill с подкаталогами по `~/.claude/skills`, `~/.codex/skills`, `~/.config/opencode/skill(s)`.
- Описание skill'а upstream (кривое для триггера?) — переопределить нельзя: curated перезаписывается при install.

Источники: code.claude.com/docs/en/sub-agents (skills, mcpServers); learn.chatgpt.com/docs/agent-configuration/subagents (Codex); opencode.ai/docs/skills (permission.skill); `rulesync docs guide/declarative-sources`, `guide/plugin-packaging`, `reference/file-formats`; `plugins/visual-explainer/mcp/{README.md,server.mjs}`.
