# Paseo Pulseline OC

Requires Paseo >=0.14.0. Only host theme tokens supply colours:
foreground (text), accent (reasoning/write), foregroundMuted (read/idle),
statusWarning (tools), statusSuccess (success), statusDanger (error), border (other).
Surfaces use surface0/1/2; no plugin-owned colour literals.

## Composer

The supported label is a plain string: sixteen cells (`PULSE_LABEL_WIDTH = 16`), contiguous ⣀⣤⣶⣿,
existing volume folding retained. The capacity has one named constant; default
render limits, composer registration and legacy label geometry derive from it.
The 8px legacy slots total 128px, within the host pill’s 160px cap. The SDK
cannot display independently coloured glyphs. The legacy Label component is
unused by the host; it is not a supported rich-label feature.

The fixed icon slot contains a muted static idle dot, or a theme-tinted
quarter-circle ring over a translucent track while busy. Rotation uses RN
Animated, 900ms linear infinite timing, useNativeDriver:false for RN Web.
The current activity supplies colour; a newest error uses statusDanger.
Animation stops on unmount. Slot dimensions never animate.

## Popover (host width 280–420px)

Three zones fill the available inner width, including compact layouts:

1. Status: Running <tool>, Working, Loading…, History unavailable, Idle or
   No activity yet. Its prefix reuses the pill’s ActivityMark/WorkingRing
   component and activity-colour selector, including the idle dot and error tint.
   A separate incomplete-history note exposes any gap.
2. Twelve counters in a fixed 2×6 grid; each slot is exactly one sixth of
   available width and 36px high, with a Lucide icon LEFT of the tabular-numeral value (2px gap).
   `COUNTER_SCALE = 4/3` scales both icon and value from their former sizes:
   icon 10→13⅓px, ALL value text 9→12px. One font size and one icon size
   apply to every slot, independent of value length. No auto font fitting is
   enabled. The shared scale may be raised to 1.5 later. Monospace compact
   values use a character budget calculated from measured slot width;
   durations use s/m, rates omit /s, sub-dollar costs use cents, overflow uses +.
   Full values, units and approximation remain in the unchanged tooltip.
   At minimum width formats shorten further; wider slots preserve e.g. 397k.
   Currency inequalities/cent units take precedence over the ~ prefix when
   both cannot fit; the tooltip retains the approximation designation.
   Order: input, output, cache, output rate, text rate, turn, chat, tools,
   tool average, tool total, context, cost. Unknown values remain —.
   Compact values use k, bounded 99m+/999k+/$99+ overflow; context shows a
   rounded percentage with exact used/max in its hint. Small positive costs
   show <$0.01. Hover, focus or press selects a themed hint with full name,
   unrounded value, exact/approximate designation and source meaning.
   The minimum 68px hint region stays in normal flow to avoid clipping.
3. History, always last: full-width horizontal ScrollView, initially scrolled
   to newest after loading. Bars are 10px wide with 2px gaps, 8–36px high
   across eight volume buckets. Strict chronological order is preserved;
   active tools are never relocated. Each 10px column has a fixed 40px bar
   region plus a 14px icon region below it, all inside the same horizontal
   scroller. Its fixed 76px viewport includes 20px reserved space below the
   icons. Both scroll indicators are disabled; RN-web maps this to scrollbar-width
   none and a ::-webkit-scrollbar display:none rule. Hover/focus/press highlights the whole 54px column with surface2,
   including low-volume bars. The icons ALWAYS use the same kind colour as their bars, including idle
   and after leaving/remounting the chat: Brain reasoning, MessageSquare text, FileText read,
   Pencil write/edit, Terminal shell, Search search, Globe web/fetch, Bot
   task/subagent, Wrench generic tool, AlertTriangle error, Archive compaction.
   A reserved 42px hint ABOVE the strip shows icon, kind, tool name/status
   and original size bucket (independent of the blink’s displayed height).
   It defaults to the last block, follows hover/focus selection, and returns
   to the latest block on hover-out. Only selected columns have surface2
   background; all unselected columns omit backgroundColor (transparent).

A compact swatch-and-word colour legend BELOW the strip contains
only observed kinds, deduplicated; it stays on one line when space permits and
wraps otherwise. It uses exactly the same theme colour mapping as the bars.

## Cursor motion

The final chronological history bar alone blinks while busy, regardless of an
older tool’s running status. It uses the existing shared 450ms runtime phase:
phases 0/2 are base height and opacity .8, phase 1 is base+1 bucket and opacity
1. The composer active tail uses that same segment opacity/height calculation.
Bucket 8 stays clamped to the 36px bar maximum. Idle bars are static at opacity
.9. Column widths, 40px bar region, icon row and whole strip height never change;
neighbours do not move or blink. No extra blink timer is created.

## History and accounting

Fetch canonical before pages until hasOlder=false, including across gap
pages. Missing/repeated cursors and failures stop safely and mark incomplete.
No page-count/render-count cap applies to history. Memory retains at most
5000 blocks (newest plus protected active block), with matching bounded
accounting; exceeding retention marks incomplete. Accounting pruning is amortized
over 128 events (bounded transient overhead), and forced before snapshots. Bootstrap live buffer is
256 events; overflow also marks incomplete. Epoch replacement resets history.
Only daemon/provider-retained current-epoch history can be recovered.

Input/output/cache/cost are latest provider usage, not chat totals. Output
rate follows the per-turn rules below. Text rate
is approximate UTF-16 units per observed work second, deduplicated by message
identity or sequence before accounting; replacement snapshots contribute a
delta. Retained work spans exclude idle gaps. Turn duration starts at observed
turn start and ticks with wall clock during silence (~); reconstructed history
uses observed endpoints. Tool totals sum timed calls (parallel spans overlap);
averages use the timed subset. No missing value is invented as zero.

## Verification limits

Automated tests cover accounting, pagination, lifecycle, presentation geometry
and interaction contracts. Live host hover, nested scrolling and theme QA
require a running UI session and are not implied by these tests.

## Per-turn output rate (Zap)

Zap uses output attributed to one turn divided by that turn's observed
start-to-completion duration, always `~`. While running it uses fresh usage
for that current turn / elapsed wall time, otherwise the last measurable
completed turn. In idle the last measurable completed result stays frozen.
The hint names `current turn` or `last turn`, its ID, tokens, duration and
source. Missing tokens or non-positive/unknown duration stays —. Missing
usage does not replace the last measurement with zero.

Pinned host v0.14.0 provider audit (paths relative to host checkout):

- `packages/server/src/server/agent/providers/codex-app-server-agent.ts:1049-1068,
  6219-6223,6281-6291`: output is `tokenUsage.last.outputTokens`, forwarded as
  latest usage at completion. Treat it directly as provider-reported turn
  output; never difference it against the previous completion or use chat duration.
- `packages/server/src/server/agent/providers/claude/agent.ts:2165-2178,4912-4935`:
  completion copies `result.usage.output_tokens`, not `modelUsage` and not cost.
  Use this directly. Claude SDK documents `result.usage` as main-loop,
  per-turn in streaming-input sessions; cumulative `modelUsage` and
  `total_cost_usd` are different fields and are not output-token baselines:
  https://code.claude.com/docs/en/agent-sdk/typescript#sdkresultmessage
- `packages/server/src/server/agent/providers/opencode-agent.ts:754-758,
  918-955,2835-2851,5482-5489`: despite the name accumulatedUsage, output is
  OVERWRITTEN by each step-finish; only cost accumulates across the session.
  Sum fresh observed step snapshots within the turn; do not add completion's
  repeated final step. If only completion is available, retain its final-step
  count. This is explicitly a LOWER BOUND on turn output, not a provider turn
  total. The tooltip says so. Identical catalog snapshots cannot distinguish
  repeated equal-output steps without additional identity/cost information;
  deduplication avoids replay inflation but may undercount such steps.

No audited provider exposes chat-cumulative outputTokens through this field.
An explicitly scoped cumulative normalization path is nevertheless regression
tested: subtract consecutive completion counters, require a known baseline,
reject negative/reset deltas, and never infer scope from increasing values.
The cumulative fixture is synthetic, not an assertion about these adapters.

Public AgentStream payload omits daemon-internal usage_updated. Live usage is
therefore read from fresh catalog lastUsage snapshots, with stale/identical
snapshots ignored; catalog updates without a current turn cannot reattribute
old usage. Completion events provide the terminal turn binding.

A bounded per-descriptor measurement cache survives component remount and
same-epoch refetch. It is pruned to retained turn IDs after bootstrap and
cleared by epoch replacement. It is not disk storage. Historical canonical
pages (`AgentTimelineEntryPayloadSchema`, protocol messages.ts:4717-4727)
contain timeline items, turn IDs and timestamps, but neither usage nor turn
boundary events. A new descriptor/process cannot reconstruct TPS from those
pages alone; stale agent.lastUsage and text length are not substituted for
missing measured turn output. Cached observed measurements can be restored
when those turn IDs are retained on refetch.


## Strip wheel interaction

On RN-web the scrollable node owns a non-passive wheel listener. Plain deltaY
moves horizontally; dominant native deltaX remains horizontal. Pixel, line
(16px) and page (viewport width) modes are normalized and clamped to bounds.
Wheel events are prevented and stopped even at strip edges so the outer
popover does not scroll vertically. Ctrl-wheel/pinch zoom is preserved.
Listener and inline scrollbar-width override are removed/restored on unmount;
native RN surfaces without DOM event methods are left to native scrolling.
RN-web 0.21.0 scrollbar hiding was verified in ScrollViewBase.js and the
StyleSheet compiler's scrollbarWidth polyfill:
https://github.com/necolas/react-native-web/blob/0.21.0/packages/react-native-web/src/exports/StyleSheet/compiler/index.js

Counter tests verify the fixed six-slot geometry and a conservative .65em
monospace width budget at 240px inner width; this is a layout budget test,
not a measurement of rendered pixels or a substitute for live font QA.
