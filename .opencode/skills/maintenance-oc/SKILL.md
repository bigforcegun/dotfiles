---
name: maintenance-oc
description: Maintain and troubleshoot OpenCode configuration, skills, plugins, MCP servers, and related dotfiles. Use when maintaining or diagnosing OpenCode itself.
---

# OpenCode Maintenance

Будь кратким: пользователю нужен не пересказ всех релизов, а решение, что изменится в работе OpenCode и стоит ли обновляться.

## Базовый принцип

Сначала собери факты, потом делай вывод. Для npm-зависимостей используй bundled script:

```sh
scripts/collect-opencode-update-info
```

Запускай его из предполагаемой OpenCode config/project директории. Если директория не очевидна, проверь типичные места без правок: `~/.config/opencode`, `.opencode`, текущий repo. Для конкретного manifest можно передать:

```sh
scripts/collect-opencode-update-info --package-json /path/to/package.json
```

Скрипт дает baseline/latest, npm publish history, ссылки на repo/releases/compare и GitHub release notes при доступном `gh`. Если changelog мутный, добери смысл через `npm diff`, GitHub compare/commits, README/API diff или официальные OpenCode release notes.

## Целостность setup

Для файловой topology используй отдельный read-only verifier, а не collector:

```sh
scripts/verify-opencode-setup-integrity
```

Он определяет активный config dir через `opencode debug paths` и выводит тип (`symlink`/`regular`/`missing`), target и JSON-валидность `opencode.json` и `tui.json`. `regular` сам по себе не ошибка: verifier ничего не предполагает о чужой схеме dotfiles. Ненулевой exit означает missing, dangling symlink или невалидный JSON.

При обновлении сохрани вывод verifier до и после во временные файлы и сравни их через `diff -u`. Если тип или target изменился, особенно `symlink → regular`, назови это риском и не восстанавливай ссылку автоматически: сначала покажи diff и запроси явное разрешение.

## Анализ обновлений

В брифе группируй только то, что влияет на работу:

- Фичи: новые возможности, hooks, CLI/TUI/API additions.
- Багфиксы: исправления поведения, стабильность, совместимость.
- Регрессы и риски: breaking changes, peer dependency drift, смена UX, миграции, flaky areas.
- Совместимость: совпадает ли package/API с текущей версией OpenCode и локальным config/plugin code.

Не хардкодь частные плагины или пути. Анализируй то, что есть в текущем state пользователя.

## Формат ответа после проверки

Используй компактный формат:

```markdown
**Бриф**
<2-5 коротких пунктов о сути изменений>

**Changelog**
- Фичи: ...
- Баги/фиксы: ...
- Регрессы/риски: ...
- Совместимость: ...

**Вердикт**
<одна строка из списка ниже> — <короткая причина>
```

Вердикт должен быть ровно один:

- `обновление не требуется`
- `обновление можно отложить`
- `обновление можно провести`
- `обновление необходимо`

Выбирай строго:

- `обновление не требуется`: installed/baseline уже актуален или изменений нет.
- `обновление можно отложить`: только minor/cosmetic improvements, нет явного user impact.
- `обновление можно провести`: полезные фиксы/фичи, риски низкие, совместимость понятна.
- `обновление необходимо`: security/critical bugfix, явный peer/API mismatch, текущий config уже конфликтует с версией OpenCode.

## Если пользователь просит провести обновление

Не обновляй на этапе анализа. Обновляй только после отдельной явной просьбы вроде “обнови”, “делай”, “проведи обновление”.

Перед правкой OpenCode config соблюдай локальные правила безопасности: попроси разрешение, если оно еще не дано для конкретной правки, и сделай `.bak` рядом с изменяемым OpenCode config файлом.

Типовой flow:

1. Зафиксируй baseline: `opencode --version`, manifest, lockfile, relevant package versions. Запусти verifier и сохрани его вывод во временный файл; если он завершился с ошибкой, остановись и сообщи о broken setup.
2. Сделай backup изменяемого `package.json` или другого OpenCode config файла.
3. Запусти из целевой директории:

   ```sh
   bun update --latest
   ```

   Если manifest уже вручную приведен к нужным ranges, достаточно:

   ```sh
   bun install
   ```

4. Проверь post-state: manifest, lockfile, `bun pm ls`/package versions, imports или CLI surface, если применимо. Повтори verifier, сравни его вывод с baseline через `diff -u` и сообщи о любом изменении links/config topology.
5. Повтори краткий анализ отличий и рисков уже после обновления.
6. Заверши коротким отчетом: что получилось, что не получилось, что проверить вручную.
7. Рекомендуй перезапустить OpenCode, потому что runtime/TUI обычно не подхватывает все изменения без restart.

Не добавляй новые зависимости “на всякий случай”. Не лечи unrelated проблемы. Если проверка показала pre-existing failures, назови их отдельно.
