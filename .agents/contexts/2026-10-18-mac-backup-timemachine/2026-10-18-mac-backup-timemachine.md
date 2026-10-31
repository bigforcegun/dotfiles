---
updated: 2026-10-19
status: active
next: "~26.10: проверить неделю TM без шифрования (log show --last 7d по CT1000X9PROSSD9, listbackups); дальше — прошивка через Windows"
---

# Mac: чистка места и Time Machine на Crucial X9 Pro

[[DOTFILES]]

## Purpose

Почистить локалхост и получить рабочий ежедневный бэкап Time Machine на USB-SSD

## State (2026-10-19)

**Бэкап есть**, но **без шифрования**: TM на втором X9 Pro (`2420E8C17AE1`), том `X9TM`,
бэкап `2026-10-19-013036`, автобэкап включён. Неделя наблюдения, проверка ~26.10.
Старый X9 Pro не подключён — нет свободных портов.

Разбор падения — [[2026-10-18-mac-backup-timemachine-x9-stand]]. Коротко:

- TM без шифрования 2/2 чисто, с шифрованием 4/4 падение (оба диска).
- Падение — нечитаемые блоки (`04/08/03`) в полосе ≈4.736–4.794 ГБ **от начала APFS**,
  на обоих дисках, независимо от физического LBA. Перезапись блок лечит.
- Линк, кабель, порт, шифрование APFS при простой записи (f3, fio) — исправны.
- Подозрение (не доказано): шифрованная TM × зона метаданных APFS × прошивка SM2320.

### Что дальше

1. ~26.10: `log show --last 7d --predicate 'eventMessage CONTAINS "CT1000X9PROSSD9"'`,
   `tmutil listbackups`. Ядро может не хранить неделю — отсутствие строк ≠ отсутствие ошибок.
2. Прошивка через Crucial Storage Executive (Windows) — для `CT1000X9PROSSD9` она есть.
   После неё — повтор шифрованной TM.
3. fio-долбёжка мелкими синхронными записями узкого региона на сыром диске — прошивка без APFS.
4. Диск другой марки — окончательный ответ.

Деструктивные операции с дисками авто-классификатор агенту не даёт: скрипт кладётся
в tmux с подтверждением `YES`, пароль sudo вводит пользователь. Шифрованный том для TM можно создать и без GUI:
`diskutil apfs addVolume <cont> "Case-sensitive APFS" <name> -role T -passphrase …`.

## Done

- Claude Code: `cleanupPeriodDays: 36500` (чат 8cbec4f4 невосстановим).
- mcpproxy: `logging.level=warn`, /tmp err-лог 4.6 ГБ обрезан.
- Mole: конфиги в `.config/mole/` (whitelist + `Caches/antidote*`, purge_paths `~/Projects`), линки в `setup_user_mac`. `mo clean` прогнан; сломал antidote-плагины → пересобраны.
- Старые JetBrains-кэши удалены (LocalHistory сохранён в `~/.local/share/jetbrains-localhistory-backup-20261009/`).
- Asimov включён (brew services, раз в сутки), конфиг `.config/asimov/config`.
- Исключения TM: `.config/tmutil_black_list.txt`, все 41 `[Excluded]`. Бэкап раз в сутки.
- Локальный снапшот удалён → Data 817 → ~670 ГБ занято.
- Старый X9 Pro: переразмечен EFI → 7.8 ГБ дыра → APFS 992 ГБ (шифр.), бэкап упал.

## Open / found

- Ejectify (авто-эджект при сне) — пользователь ставит сам.
- Второе место бэкапа: restic/Kopia → NAS/облако (TM на NAS у пользователя не работал).
- SkipPath `Claude/vm_bundles` мёртвый; `OneDrive.noindex` в asimov — `Operation not permitted`.
- `mo optimize` удалит мёртвые агенты `com.custom.launchpick`, `com.koekeishiya.skhd`.
- OrbStack prune ~18 ГБ; Docker Desktop + OrbStack оба стоят.
- `DEVICE_LOCKED`: первый бэкап гнать на разблокированном маке (`caffeinate`).

## Files

- [[2026-10-18-mac-backup-timemachine-x9-stand]] — стенд 18–19.10: прогоны, скан, гипотеза, грабли скриптов.

## Load policy

Загружать при любой работе с бэкапами, Time Machine, внешними дисками, Mole/Asimov.
Не стирать и не размечать диски без явного «да» пользователя на конкретный диск.
