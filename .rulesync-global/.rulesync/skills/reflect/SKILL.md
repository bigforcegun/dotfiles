---
name: reflect
description: >-
  End-of-session reflection for development work. Produces a short graded brief
  of what is worth persisting — approach corrections, bugs noticed in passing,
  non-obvious project facts — then writes the approved items to memory or the
  backlog. Use when the user types /reflect, says "рефлексия", "что запомнить",
  "подведи итоги сессии", or asks to wrap up a coding session.
targets:
  - '*'
disable-model-invocation: true
codexcli:
  policy:
    allow_implicit_invocation: false
---
# Reflect

End-of-session pass over **this conversation only**. No repo exploration, no subagents, no
re-reading files you already read. Two phases: report (read-only), then persist what the user picks.

Answer in the user's language.

## 1. Collect candidates

**A — Правки подхода.** What would have let you hit the target on the first try.
Every item MUST name what it actually cost. No cost → not an item.
Cost = a retry, the wrong file edited, a rejected patch, a rerun with different flags,
a "нет, не так" from the user, a dead end you backed out of.

**B — Баги замеченные мимоходом.** Defects seen but not fixed — including ones you
introduced and worked around. Not things you already fixed. Not hypotheticals.
Needs a concrete referent: file:line, command, or error text.

**C — Факты о проекте.** Non-obvious things still true next week.
Cut anything the next session finds by reading the repo, `git log`, or CLAUDE.md.
If the answer is "just grep for it" — not a fact worth storing.

## 2. Grade by evidence, not by feeling

- `✓` **проверено** — you ran it and saw the result. Persist by default.
- `~` **наблюдал** — happened once, never isolated. Persist with the caveat inline.
- `?` **догадка** — inferred, never tested. Report it, **never persist it**. Say what would confirm it.

Do not use percentages or confidence words. The grade is about evidence you have, not certainty you feel.

## 3. Filter hard

- **Cap: 5 items total** across A+B+C. Over cap → keep the ones that would have changed
  what you did today. Drop the rest silently.
- **Zero items is a valid and common outcome.** Say "нечего сохранять" and stop. Never pad.
- Cut: true only inside this chat; a restatement of CLAUDE.md or an existing memory;
  generic advice ("нужны тесты", "лучше планировать"); anything with no concrete referent.

## 4. The brief

Max 15 lines. No preamble, no summary of the session itself — the user was there.

```
**Запомнить**
✓ <правка> — стоило: <что пошло не так>
~ <правка> — стоило: <что пошло не так>

**Баги**
✓ path/to/file.ts:42 — <что ломается>

**Про проект**
? <факт> — проверить: <как>

→ Сохранить: номера / всё / ничего?
```

Omit any empty section. Then stop and wait.

## 5. Persist only what the user picked

Routing — the three buckets go to three different places:

| Bucket | Destination |
|---|---|
| A — правки | memory `type: feedback`, with **Why:** / **How to apply:**. If it's a rule about the project rather than about how you work → project `CLAUDE.md` instead. |
| B — баги | **Not memory** — bugs rot and then lie to future sessions. Use `spawn_task` per bug, or append to the repo's backlog file if one exists. Memory only for "this is known broken and won't be fixed", which is a fact, not a bug. |
| C — факты | memory `type: project` (ongoing work/constraints) or `reference` (URLs, dashboards, tickets). |

Before writing any memory file: list the memory dir and check for an existing file on the
topic. Update that file rather than creating a near-duplicate. Add a `MEMORY.md` index line
for genuinely new files only. Link related memories with `[[slug]]`.

Never persist `?` items. Never persist without an explicit pick from the user.
