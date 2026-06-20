# Dotfiles access audit — план

Простой аудит доступа к dotfiles перед переходом macOS → Linux. Фокус: `mcpremote-auth` / `mcp-remote` auth, MCP-конфиги, env-файлы и права на секреты.

---

## Текущий снимок

Проверка была read-only, без изменения файлов.

### Главные находки

- `.mcpproxy/mcp_config.json` имеет права `600`, но отслеживается git и содержит sensitive-поля (`Authorization`, `MDB_MCP_CONNECTION_STRING`, `FRESHDESK_API_KEY` и т.п.).
- `.mcpproxy/mcp_config.json.bak` тоже отслеживается git.
- `.mcpproxy/env` имеет права `644` и содержит реальные доступы/API keys. Это срочно: локальные пользователи могут читать файл.
- `.mcpproxy/` имеет права `755`; лучше `700`, чтобы другие локальные пользователи не видели имена файлов.
- `mcpremote-auth` в текущем конфиге указывает на `MCP_REMOTE_CONFIG_DIR=/Users/bigforcegun/.mcp-auth`.
- `~/.mcp-auth` и вложенные `mcp-remote-*` директории имеют `755`; token/client files в основном `600`, но директории раскрывают структуру.
- В `~/.mcp-auth/mcp-remote-0.1.38` есть debug log с правами `644`.
- `.mcpproxy/mcp_config.json.bak-20260620-mcp-remote-local` untracked; его легко случайно добавить в git.

---

## Минимальный hardening правами

На macOS сейчас:

```sh
chmod 700 ~/.dotfiles/.mcpproxy
chmod 600 ~/.dotfiles/.mcpproxy/env ~/.dotfiles/.mcpproxy/mcp_config.json ~/.dotfiles/.mcpproxy/mcp_config.json.bak*

chmod 700 ~/.mcp-auth ~/.mcp-auth/mcp-remote-*
chmod 600 ~/.mcp-auth/mcp-remote-*/*
```

На Linux после checkout/restore:

```sh
umask 077
chmod -R go-rwx ~/.mcp-auth ~/.dotfiles/.mcpproxy
```

Проверка после применения:

```sh
stat -c '%A %a %U:%G %n' ~/.mcp-auth ~/.mcp-auth/* ~/.mcp-auth/*/* ~/.dotfiles/.mcpproxy ~/.dotfiles/.mcpproxy/*
```

Для macOS аналог:

```sh
stat -f '%Sp %OLp %Su:%Sg %N' ~/.mcp-auth ~/.mcp-auth/* ~/.mcp-auth/*/* ~/.dotfiles/.mcpproxy ~/.dotfiles/.mcpproxy/*
```

---

## Что сделать с git

Цель: в git остаются только шаблоны и несекретные декларации; реальные токены, env и auth-state живут вне репозитория.

1. Добавить ignore-правила для локальных секретов и backup-файлов:

   ```gitignore
   .mcpproxy/env
   .mcpproxy/mcp_config.json
   .mcpproxy/mcp_config.json.bak*
   .mcp-auth/
   ```

2. Оставить в репозитории пример:

   ```text
   .mcpproxy/mcp_config.example.json
   .mcpproxy/env.example
   ```

3. Настоящий `.mcpproxy/mcp_config.json` либо держать вне git, либо генерировать из шаблона.

4. Если секреты уже были в истории git, считать их скомпрометированными и ротировать. Чистка истории (`git filter-repo` / BFG) имеет смысл только после ротации и с пониманием последствий для всех клонов.

---

## Что сделать с mcpremote-auth

`mcp-remote` хранит OAuth/client/token state в `MCP_REMOTE_CONFIG_DIR`. Для него нужна приватная директория, не привязанная к публично читаемым dotfiles.

Рекомендуемая модель:

```sh
mkdir -p ~/.local/state/mcp-remote-auth
chmod 700 ~/.local ~/.local/state ~/.local/state/mcp-remote-auth
```

В MCP-конфиге для remote-серверов:

```json
{
  "env": {
    "MCP_REMOTE_CONFIG_DIR": "/home/bigforcegun/.local/state/mcp-remote-auth"
  }
}
```

На macOS аналогично можно держать в:

```text
~/.local/state/mcp-remote-auth
```

или оставить `~/.mcp-auth`, но обязательно `700` на директориях и `600` на файлах.

---

## Секреты и хранение

Лучше не держать реальные секреты plaintext в dotfiles. Варианты:

- `pass` / `gopass` для Linux-first подхода;
- `age` + `sops` для encrypted-at-rest файлов в git;
- `git-crypt`, если хочется шифровать часть репозитория;
- 1Password CLI / Bitwarden CLI, если секреты уже живут в password manager;
- macOS Keychain сейчас и `secret-tool` / `kwallet` / `pass` на Linux позже.

Практичный компромисс для dotfiles:

- в git: `env.example`, config templates, scripts;
- вне git: реальные `env`, token stores, OAuth state;
- bootstrap script проверяет наличие секретов и пишет понятную ошибку, но не создаёт insecure files.

---

## Ротация

Ротировать стоит всё, что лежало в файлах с правами `644` или было закоммичено:

- Freshdesk API key;
- Exa API key;
- MongoDB connection string/password;
- Slack/Atlassian OAuth state, если в debug log или backup попали токены;
- любые bearer/API tokens из `.mcpproxy/mcp_config.json` и backups.

После ротации проверить, что старые значения не остались в:

```sh
rg -n --hidden --glob '!**/.git/**' 'old-token-fragment|old-password-fragment|old-api-key-fragment' ~/.dotfiles ~/.mcp-auth
```

---

## Linux migration checklist

- Перед раскаткой выставить `umask 077` для bootstrap-сессии.
- Создать приватные директории для secret state: `~/.local/state/mcp-remote-auth`, `~/.config/mcp-proxy`, при необходимости `~/.config/mcpproxy`.
- Реальные `env` и token stores создавать уже на Linux, не переносить через git.
- Проверить, что setup scripts не делают `chmod -R 755` по dotfiles или `~/.config`.
- После `stow`/symlink/setup прогнать `stat` по MCP/auth путям.
- Убедиться, что backup-файлы с секретами не создаются рядом с committed templates.

---

## Открытые решения

- Оставляем ли `.mcpproxy/mcp_config.json` в git как источник правды, но без секретов через `${ENV}`, или полностью выносим из git?
- Используем ли `sops/age` для encrypted config в git, или держим секреты целиком вне репозитория?
- Переносим ли `MCP_REMOTE_CONFIG_DIR` с `~/.mcp-auth` в XDG-путь `~/.local/state/mcp-remote-auth`?
- Чистим ли историю git после ротации секретов, или достаточно ротации + ignore/template на будущее?
