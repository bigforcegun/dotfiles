# Paseo Pulseline

Requires Paseo >=0.14.0. All colours come from host tokens: foreground (text),
accent (reasoning/write), foregroundMuted (read), statusWarning (tools),
statusSuccess (success), statusDanger (error), border (other), surface2 (hover).

## Composer and status

The composer label is a plain string of contiguous ⣀⣤⣶⣿ glyphs. Capacity has
one authority, PULSE_LABEL_WIDTH=16. Rich glyph colouring is unsupported by the
host. The legacy Label component is not a supported host rich-label surface.

The pill and header reuse ActivityMark/WorkingRing and one colour selector.
Idle is a static muted dot. Working rotation has a 900ms linear period; web
uses the compositor clock, with RN Animated (useNativeDriver:false) fallback.
Newest error always overrides activity tint with statusDanger.

One activePulseBlock rule selects the latest running tool belonging to the
active turn (or latest represented turn when idle), otherwise the latest block.
Earlier-turn running leftovers cannot become the current status. Only a busy
snapshot gets a Running/Working header. Other states are Loading…, History
unavailable, Idle and No activity yet. Coverage gaps have a visible note.

The selected bar and composer active tail share the 450ms phase source:
phases 0/2 base height and opacity .8; phase 1 next bucket and opacity 1.
Bucket 8 clamps at 36px. Idle is static .9. Chronological positions never move.

## Popover geometry

All zones share the content's left edge; counter icon/value rows are left
aligned in fixed one-sixth slots, in a fixed 2×6 grid. Counter order is input,
output, cache, output TPS, text rate, turn, chat, tools, tool average, tool total,
context, cost. Unknown values stay —. COUNTER_SCALE=4/3 controls ALL value text
(12px) and ALL counter icons (13⅓px), never per-value font fitting. Formats
shorten to the measured slot budget, preserving exact facts in accessibility
labels/tooltips. The counter hint is a fixed 32px/two-line row: Info by default,
selected counter icon/tint on hover/focus. No 68px blank hint region remains.
While history is paging, this same slot shows a muted 12px WorkingRing and
`Loading history… N blocks`, updated after each page. It takes priority over
hover hints without adding a row. A non-interactive thin marker and the same
ring sit at the viewport's left edge, where older columns are prepended. Both
indicators disappear after completion, cancellation or failure.

Zone 3 order: block hint (32px) → strip → legend. The hint defaults to the last
block, follows hover/focus and returns to the last on hover-out. Each column has
a fixed 40px bar region and 14px icon region; bar width 10px, pitch 12px. Eight
volume buckets span 8–36px. A 76px viewport reserves 20px below the icons.
Only hovered/focused/pressed columns receive surface2; others are transparent.

Icons ALWAYS retain block kind colours, including idle. Mapping: Brain
reasoning, MessageSquare text, FileText read, Pencil write/edit, Terminal shell,
Search search, Globe web, Bot task/subagent, Wrench generic, AlertTriangle error,
Archive compaction. Legend below the strip lists observed kinds and theme
swatches, deduplicated, wrapping only as needed.

## Virtual strip and wheel

Only viewport columns plus two screens of overscan on either side are mounted.
Leading/trailing spacers preserve exact extent count*12-2. Initial position is
the newest end. React.memo columns receive primitive own props and a stable
selection setter, so a phase tick rerenders only the selected blinking column;
hover changes only affected columns. History segment arrays are cached by
immutable blocks identity and phase. Legend results are cached too.

onScroll (throttle 16ms) only updates the rendered window and hover state; scroll
and layout never request data. Initial newest positioning runs in a layout
effect before anchoring. Appends, growth and background prepends keep the strip
at the newest end if it was within one column of the old end. A detached viewport
anchors the first surviving visible ID at its old screen x (layout effect, no
animation), preserving position through prepends, eviction and coalescing.

Both scrollbar indicators are disabled. RN-web supplies scrollbar-width:none
and its WebKit polyfill. A non-passive node wheel listener maps dominant deltaY
horizontally (native deltaX retained), normalizes pixel/line/page units and clamps
bounds. It prevents outer vertical scrolling even at edges; Ctrl/pinch is passed
through. Listener and inline scrollbar override are cleaned up on unmount.

## Lifecycle and background history

A descriptor keeps its store across unmount, preserving live timings, usage and
observed sums. Stop publishes a non-busy view with blocks/metrics intact and
stops its runtime timer. On remount, reconnect/subscription_restored, or stream
error, live authority is demoted: the next catalog state may reconcile busy.
Without a continuity break, named live transitions remain authoritative over
stale catalog snapshots and preserve known start times. Existing history stays
visible during quiet refresh; only an empty/new epoch starts as Loading.

Each mount starts with a canonical tail page (200 rows), then sequentially pages
all available older history until hasOlder=false or 5000 retained blocks. Each
next request is scheduled with setTimeout(0): no more than one page is ingested
per macrotask. Only one request is active. Stop, stream error and epoch change
cancel the scheduled page; generation checks reject stale in-flight responses.

On remount/reconnect the NEWER side pages only until it intersects known seqs,
repairing an unseen hole even when the retained store is full. The checkpoint
also preserves whether the OLDER side was complete. Completed older history
is never re-paged; an interrupted older side resumes at the oldest kept canonical
seqStart. Missing/repeated cursor or failure to join within 5000 rows marks
incomplete. Epoch replacement invalidates checkpoints, reported usage, token
sums and live authority. Stopping during paging preserves hasOlder for resume.

Live buffering ends immediately after the initial tail/newer-side join, so older
paging does not delay active turn status. During paging, available counter cells
carry ~ and hints disclose provisional history. Once paging completes, complete
history counts lose that provisional mark; inherently approximate timings/live
token sums and genuine coverage gaps keep it. Failed or capped histories retain
the incomplete note. Counts no longer depend on how often a popover was opened.

Retention is bounded to 5000 blocks (newest plus one protected active block).
Live eviction uses a chronological Map queue, O(1) amortized. History/coalesced
reconciliation is page work: a seq range replaces covered live text/reasoning
chunks and subtracts their text-accounting identities before observing the
merged entry. Tool timing facts remain intact. Provider token counters are not
reconstructed from transcript length. Bootstrap buffers at most 256 live events; overflow
marks incomplete.

## Counters and honesty

Input/output/cache CELLS show approximate sums of per-turn usage observed live,
not provider lastUsage. Fresh per-turn usage replaces that turn's contribution;
completion is counted once (terminal/catalog echoes do not add again). The kept
store preserves the observation ledger and resets it on epoch change. Tooltips
show chat sum (~), exact provider latest request, and, when history predates live
observation, `since HH:MM — earlier turns not observed`. Recent turn IDs are
retained for duplicate protection; old wire replay is also gated by seq high-water.
Cost remains provider-reported latest value, not accumulated or price-derived;
small positive values display <$0.01 / <1¢. Context is a provider snapshot.

Provider scope is shared with output-rate.ts (host v0.14.0):
- Codex: tokenUsage.last fields, forwarded at completion; direct per-turn usage.
- Claude: result.usage fields (main-loop per-turn usage), not cumulative
  modelUsage/cost. Reference: https://code.claude.com/docs/en/agent-sdk/typescript#sdkresultmessage
- OpenCode: each step-finish overwrites input/output/cache; sum fresh observed
  steps and do not add the completion echo. Missing/indistinguishable catalog
  steps mean a LOWER BOUND, explicitly approximate. Cost alone is cumulative.
No audited adapter exposes cumulative chat token counts through these fields.
The explicit cumulative normalization path is tested synthetically using
consecutive completion deltas; it requires a known baseline and rejects resets.

Output TPS divides one turn's attributed output by its observed start→end
span (~). Current measurable turn is shown while running, otherwise the last
measurable completion; idle freezes the last result. Tooltip names turn/id,
count, span and source, including OpenCode lower-bound coverage. Historical
canonical pages have no usage or terminal events, so new descriptors cannot
reconstruct measured TPS from history alone. Text rate is deduplicated UTF-16
units per observed work second, not model tokens/s. Tool totals sum timed spans
(parallel spans overlap); averages use the timed subset. Formatting promotes
units before rounding crosses a boundary (999.6→1k).

## Work per event and verification

Runtime publishes cached identity plus phase, with no whole-snapshot stringify.
Store revisions cache snapshots/sorted arrays; clock reads use incremental
aggregates. Accounting prune runs once per 128 observations, not per snapshot.
TPS caches its latest measurable completion. Late directory-list replies release
their subscriptions even after normal promise reactions were abandoned.

Regression tests exercise remount/coalesced refetch, authority loss, epoch reset,
checkpoint resume/background cursors, token sums, hint/layout contracts and true React
memo render counts for 5000 blocks. Font-fit tests use a conservative .65em
monospace layout budget, not measured pixels. Live UI QA remains separate.

## Round 3: continuity, anchors and invariant widths

First adoption of an epoch preserves catalog usage already installed by mount;
only a real epoch change or explicit reset clears usage, attributed-usage
baseline, observation ledger and TPS cache. A global last-attributed usage
record filters identical/subset catalog echoes across turn boundaries for both
chat sums and TPS. A named terminal event still attributes its own usage; fresh
catalog step values advance the baseline. Identical unidentifiable provider
steps can undercount and remain approximate.

After any observation interruption (unmount, error or reconnect), kept sums
explicitly say `some turns not observed`. The initial `since HH:MM` boundary is
not a promise of uninterrupted coverage. Actual epoch reset clears this flag.

VirtualStrip owns scroll position and window range. Pixel offsets are refs;
React state changes only when the range changes. Block hint and legend are memo
components outside that scroll state. Index lookup and legend data are cached
by immutable block/segment data, shared across pulse phases; only the selected
active segment object changes. Hover clears on scroll start and whenever its
ID leaves the rendered window, using an ID→index map rather than a full find.

Reconciliation anchors the first surviving VISIBLE column at its previous
screen x. Prepending, head eviction and head coalescing no longer depend on the
whole-history first ID surviving. If no visible identity survives, the old
position is clamped to the new extent.

A before-response with a new epoch or reset is discarded; the controller clears
the invalid window and resyncs from tail. Joined remounts resume background paging from
the oldest retained canonical seqStart, not the newly fetched join window.
Viewport width and scroll position have no role in data loading. Background
requests are cursor-deduplicated, sequential and bounded by retained blocks;
repeated or missing cursors terminate with an incomplete-history note.

Composer text is always exactly PULSE_LABEL_WIDTH characters: U+2800 blank
braille pads the left of short/loading/idle labels. Popover root width, minWidth
and maxWidth are 394px in every state, corresponding to a 420px host surface
minus host plugin padding 12px per side and surface border 1px per side.
Verified in pinned v0.14.0: plugins/popover.tsx, styles/theme.ts SPACING[3], and
components/ui/menu/menu-overlay.tsx. The host still owns compact-sheet and
screen-bound placement. The plugin does not inject parent styles.

Regression checks were first run against the previous implementation: seven
store/runtime/controller cases and six real-renderer UI cases failed. They now
exercise the live paths rather than only testing formatting helper outputs.

## Live follow-up: visible blink, status and semantic icons

Composer blinking operates in glyph space, independently of the popover height
step: phase 1 advances one glyph, or dips from the top glyph to the one below.
Thus every active size bucket changes the label string; idle remains static.
Popover height/opacity phases retain their existing contract.

The virtual strip sticks to the newest end on append, prepend or tail volume growth
when the viewport was within one column of the previous end. It updates both
native scrolling and the virtual range, including after content layout. Scrolling
left detaches follow; detached prepends retain the visible-column anchor. Phase-only
ticks do not initiate scrolling. A completed tool remains the last block but
is never described as running: the header checks its current status explicitly.

Bar icons preserve semantic metadata: turns use CircleCheck / CircleX / Ban;
notifications Bell, todo ListTodo, plugin Puzzle, unknown CircleHelp, compaction
Archive. MCP tools use Plug before detail classification. Protocol 0.14.0 has
no MCP ToolCallDetail variant, so MCP recognition uses `mcp__` / `mcp:` name
prefixes. Wrench is reserved for otherwise unrecognized tools. Existing detail
icons and generic error AlertTriangle remain. Legends label these as done,
failed, canceled, note, todo, plugin, unknown, compaction and mcp.

Host `packages/app/src/plugins/icons.ts` resolves names from the Lucide namespace.
The icon regression test uses an independent canonical-export allowlist from
the host lockfile's lucide-react-native 1.50.0 (source URL and SHA256 are recorded
in `client/fixtures/host-lucide-icons.txt`); runtime still imports only host Icon.
Live-store and real-renderer regressions cover same-call completion, next tool,
next turn, all eight glyph buckets, pinned/detached append and tail growth.

Background-history regressions run the real runtime/store without any scroll:
multi-page completion, repeated mounts with invariant block/tool counts, joined
newer-side holes followed by older-side resume, cancellation of queued/in-flight
pages, epoch replacement and live status during paging. Renderer tests verify
progress N changes per page in the fixed hint slot, both indicators disappear,
and prepends preserve pinned/detached positions. Before the background change,
six runtime cases and two renderer cases failed against the lazy implementation.

## Recovering closed-chat time counters on the client

Read-only probe of closed OpenCode agent ef223c39 (daemon 0.14.0, canonical
projection): 1022 entries over six pages, 30 user_message, 250 reasoning, 75
assistant_message, 624 tool_call and 43 todo. No entry has turnId. All tools
are terminal-only (611 completed, 13 failed), so no tool duration is measurable.
596 distinct timestamps span several days; 228 backwards adjacent deltas are
real part-start timestamp ordering, not evidence of an import clock. Pinned
OpenCode replay prefers part.time.start/end, then message.time.created/completed;
the manager preserves that timestamp. Full report and real-client validation:
`/tmp/pulseline-unify/probe-ef223c39.md`.

HistoryFacts retains scalar row facts: sequence range, timestamp, item type,
text length/message identity, tool call/status and optional native turnId. No
extra transcript text, commands, paths or tool output are copied. The ledger
is capped at 20000 facts (four per retained block, allowing status pairs and
invisible user boundaries). Page reconciliation rebuilds derived accounting;
live events and 450ms ticks keep incremental O(1) accounting, with the existing
amortized retention scan. Render virtualization is unchanged.

Native turnId wins. Otherwise user_message in sequence order starts a synthetic
turn, ending before the next user boundary. Leading orphan rows do not invent
a turn. Work span is max(timestamp)-min(timestamp) within that turn: OpenCode
part timestamps can go backwards in canonical sequence order. Chat time sums
these spans, excludes between-turn idle gaps, and the last turn supplies the
idle timer. Text rate divides unique assistant UTF-16 lengths from timed turns
by those same spans. An untimed turn's text never inflates another turn's rate.
All recovered time/rate values carry ~ and a `derived from history` tooltip.

Non-finite/negative clocks and multi-row equal timestamps supply no temporal
metrics. Import-burst detection is conservative: for at least eight rows, both
the history window and each turn must span at least max(1000ms, (rows-1)*5ms).
This is a heuristic, not proof of timestamp provenance; unusually fast dense
histories may remain unavailable. Native/live-matched singleton anchors may
extend later live observations but never produce a standalone idle duration.

Tool timings require an actual running→terminal pair for the same callId and
usable non-backwards timestamps. Missing pairs stay —; no neighbour-based
duration or provider pricing is inferred. Historical and live identities alias
to one turn; coalesced text replaces covered chunks, while compact live span
and status endpoints survive remount/refetch. Epoch reset clears both ledgers.

Tokens/cache/output-token TPS/context/cost still require provider reports.
When absent, cells remain — and tooltips say `not reported for this chat`.
The real closed agent now yields chat ~78:57, last turn ~03:07, text ~16/s,
tools 624, gap=false; tool timing and provider-only cells remain unavailable.

Offline regressions use the final three real user spans (222 anonymised rows):
text lengths only, aliased call IDs and shifted timestamp offsets. Tests cover
reverse paging/refetch, native IDs, import clocks, status pairs arriving after
the completed block, backwards tool timestamps, mixed live/history deduplication,
epoch reset, numerator/denominator scope and no history rebuild on live ticks.

## Growing reasoning columns

The store projects consecutive reasoning records in the same turn into one
display block. Its ID uses the first sequence (canonical seqStart), and its
height uses the combined text estimate. Both composer and popover use this
projection, including the active block. A different kind, turn, or sequence
gap ends the run; invisible user/turn events therefore remain boundaries.
The protocol offers no reasoning-part identity here, so this is a conservative
adjacency rule, not an inference about internal model thought boundaries.

Raw records, sequence ranges, paging checkpoints, retention limits and usage
accounting stay separate. Canonical range replacement still deduplicates raw
chunks before projection, including partial refetches. History loading progress
counts retained source blocks, not the smaller number of display columns.
The projection is cached between data changes; pulse ticks reuse its identity.
