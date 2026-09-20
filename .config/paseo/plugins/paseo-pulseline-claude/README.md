# Pulseline · Claude

Client-only Paseo plugin (`>=0.8.0 <0.9.0`). Registers one composer pill per eligible
agent, keeps a normalized pulse model per agent, and publishes a deterministic label.

Eligibility is provider-neutral: any non-archived agent that has a `workspaceId`.

Height is volume, colour is kind. Each block's payload is estimated in tokens when
it is normalized (text and reasoning from their text, tools from output/error/raw/
title/detail, a compaction from its reported `preTokens`) and bucketed once:
`<=16 -> 0, <=64 -> 1, <=128 -> 2, <=256 -> 3, <=512 -> 4, <=1024 -> 5, <=2048 -> 6,
else 7`. The bucket travels with the block, so two assistant messages of the same
kind but different size draw at different heights. An item whose payload the daemon
never sent — a tool that has produced nothing yet — claims bucket 0 rather than a
made-up size.

| Module               | Responsibility                                                    |
| -------------------- | ------------------------------------------------------------------ |
| `client/types.ts`    | normalized, provider-neutral shapes                               |
| `client/blocks.ts`   | timeline item -> pulse block: kind (colour) plus measured volume   |
| `client/volume.ts`   | estimated tokens per item and the 16/64/128/256/512/1k/2k buckets  |
| `client/model.ts`    | pure reducer: history, live rows, turns, epoch replacement        |
| `client/metrics.ts`  | exact / approximate / omitted metric policy                       |
| `client/normalize.ts`| wire envelope validation                                          |
| `client/history.ts`  | multi-page history assembly, dedupe, explicit gap                 |
| `client/label.ts`    | pill adapter: folds the buckets into contiguous ⣀⣤⣶⣿ braille cells |
| `client/store.ts`    | per-agent bootstrap, buffering, busy ticker, teardown             |
| `client/registry.ts` | pill lifecycle, shared store publication, label-only updates      |
| `client/descriptor.ts` | button descriptor: accessible title, pulse-only label, popover behavior |
| `client/pulse-strip.ts` | kind to theme-colour-token map (geometry lives in pulse-segments) |
| `client/detail-model.ts` | one ordered row list ↓ ↑ ◇ ⚡ ↯ 💬/🏁 Σ 🔧 ⏱ ⌛ ◇ $, then the footer |
| `client/store-registry.ts` | leased per-agent store: created on mount, stopped on unmount |
| `client/use-pulse-view.ts` | the lease itself, bound to React's mounted lifetime         |
| `client/pulse-glyphs.ts` | composer pulse as fixed-width glyph cells: one `Text` per symbol, per-kind colour, published vocabulary |
| `client/pulse-label.tsx` | optional component composer label, used by hosts that support one |
| `client/pulse-icon.tsx` | mandatory icon slot: the themed pulse dot, and the per-agent lease |
| `client/pulse-dot.ts` | dot model: colour of the newest activity, phase-driven beat, calm idle |
| `client/pulse-target.ts` | shared agent-id resolution for icon and popover               |
| `client/pulse-segments.ts` | the single segment model: volume-driven heights, two-phase base/base+1 active tail, empty-state placeholders |
| `client/abandon.ts`  | plugin-owned waits: cleanup/stop settle them, host promises may linger |
| `client/format.ts`   | counts/k, one-decimal rates, money, unbounded MM:SS            |
| `client/deadline.ts` | store-owned request deadlines; clear() settles every guard     |
| `client/detail-tree.ts` | the popover's element tree, JSX-free with View/Text injected so hierarchy, styles and accessible names are assertable |
| `client/pulse-detail.tsx` | popover shell: the view lease, the memoized styles and model, then the tree |

Metric honesty: provider-reported tokens, cost, context window and the output rate
(provider tokens over the observed chat span) are unmarked. Turn duration, tool count, tool average and text rate are client-observed
and always carry `~`. Stream and provider token rates, reasoning tokens, cache-write
tokens and unrecoverable timings are omitted rather than reported as zero.

History is read as a canonical tail page and, while the daemon reports older rows
and the 200-row contract limit allows, older pages behind its cursor. Whatever stays
unread — the limit, the page cap, a failed page, a page from another epoch — sets
`gap`. An epoch replacement supersedes any in-flight page, drops buffered events
stamped with the replaced epoch, and refetches.

The bootstrap listing is awaited work with a bounded retry (one). A terminal
failure tears down every registration and the local directory listener, then
reports through `onBootstrapError`; nothing is swallowed. Paseo calls the
contribution synchronously and demands a cleanup function back
(`packages/app/src/plugins/evaluate.ts:396-403`), so a failure discovered after
setup returns cannot be turned into a load failure — the entry logs it instead.

Registration is cold. A pill descriptor costs the daemon nothing: no store, no
timeline subscription, no history fetch, no timer. The store is leased by the
mounted icon or popover through `usePulseView`, so a directory of ninety agents
performs the work of the one pill actually on screen, and unmounting releases it.

The pill uses the public v0.8 button descriptor: a custom `icon` component that
draws a dot in the reserved 16x16 slot, a `behavior.kind: "popover"` with `Content`,
and `registration.update({ label })` for live text. The label is a plain string —
the host owns it and no API carries colour into it — so the dot is the pill's only
colour-bearing signal: it takes the theme token of the running or newest row
(`statusDanger` on an error), grows through the three 450 ms phases while the agent
works, and settles to a calm muted mark when it stops. The visible label is pulse blocks only — no plugin name, no variant
tag, no metrics. The descriptor carries both labels. The string one — four braille
cells, `⣀⣤⣶⣿`, one per segment, chosen for narrow apparent ink — is what today's
host draws; vertical placement there belongs to the host, which owns the composer
Text, so nothing here pads, spaces, repeats or offsets a glyph to fake a baseline,
and the budget is 12 cells so nothing truncates to `…`. Alongside it the descriptor
supplies `Label`, a component the host renders instead once it supports one:
`client/pulse-glyphs.ts` draws the very same symbols, one `Text` child per cell, so
that each glyph can carry its own kind colour instead of the single colour a string
label gets. Nothing else differs: same vocabulary, same glyph per segment, same `12`
cells. The cells sit in a container of fixed width and height with `overflow:
"hidden"` and `alignItems: "flex-end"`, every cell is a fixed `8` px box with a
shared `16` px line height (so all glyphs share one bottom edge), and empty cells pad
the left. A phase changes the trailing cell's glyph level and opacity and nothing
else — no slot width, no flex, no glyph count, no label length, no padding, no
container width — so the pulse can never resize the pill or reflow the composer.
Today's host ignores the extra key (`validateButton` spreads the button,
`buttons/validation.ts:82`), which is why the string stays the fallback.

The vocabulary is published as `PULSE_LABEL_SPEC` in `client/pulse-glyphs.ts` so a
second implementation can copy it byte for byte: glyphs `⣀⣤⣶⣿` (`U+28C0`, `U+28E4`,
`U+28F6`, `U+28FF`) low to high, capacity `12` cells, slot width `8`, font size `12`,
line height `16`. The eight
volume buckets fold two-into-one — a passive bar rounds down, the active one rounds
up, so its single-bucket beat still crosses a level; metrics live in the popover with one original glyph each and the
full-width pulse footer last. The active tail is pinned last and alternates between its own volume bucket and one
bucket above it, clamped at the top; two phases exist, 450 ms apart, cycling
0 → 1 → 0 and resetting when the turn ends.
Height and layout weight come from fixed per-kind tables, so the same fixture
yields the same tuples in every Pulseline implementation. An empty conversation
still draws one bar: a neutral placeholder when idle, an active reasoning bar
while a turn runs. The footer is the last child, full width, `alignItems:
"flex-end"`, `minHeight: 20`, labelled "Agent activity pulse"; each segment is a
weighted wrapper around a bar of its exact height, and separators are one-pixel
views rather than margins. Metric rows show a glyph and a value only — the row
name exists for screen readers — and a model with nothing to report says
"No metrics yet". The behavior instance is shared, so a label
update never closes an open popover. There is no agent panel, no Modal, no server
entry and no plugin RPC.

React Native cannot be imported under `node --test`, so the popover injects its
primitives: production passes `View` and `Text`, `client/fake-render.ts` passes
markers and walks the result into plain nodes. What the popover draws — hierarchy,
footer-last, full width, per-segment geometry, accessible names, theme colours,
density — is asserted against that real element tree. Drawn bar geometry is this
plugin's own: the model's height units stay the agreed cross-plugin steps, and
`barHeightPx` maps the eight volume buckets to 8–64 px (8 px per bucket) over bars
of a constant 6 px width (5 compact) — height carries volume, width carries nothing
— inside a footer of fixed height 68 aligned to `flex-end`, so every bar stands on
one common baseline and neighbouring buckets stay unmistakable. Source scans are kept only
for what they genuinely describe: allowed imports and forbidden host surfaces.

| Command             | Checks                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `npm run typecheck` | `tsc --noEmit`, including host-contract assignability              |
| `npm test`          | `node --test client`                                               |
| `npm run smoke`     | entry + fake host: history, live lifecycle, cleanup                |
