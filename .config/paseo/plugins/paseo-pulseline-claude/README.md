# Pulseline · Claude

Client-only Paseo plugin (`>=0.8.0 <0.9.0`). Registers one composer pill per eligible
agent, keeps a normalized pulse model per agent, and publishes a deterministic label.

Eligibility is provider-neutral: any non-archived agent that has a `workspaceId`.

| Module               | Responsibility                                                    |
| -------------------- | ------------------------------------------------------------------ |
| `client/types.ts`    | normalized, provider-neutral shapes                               |
| `client/blocks.ts`   | timeline item -> pulse block classification and weight            |
| `client/model.ts`    | pure reducer: history, live rows, turns, epoch replacement        |
| `client/metrics.ts`  | exact / approximate / omitted metric policy                       |
| `client/normalize.ts`| wire envelope validation                                          |
| `client/history.ts`  | multi-page history assembly, dedupe, explicit gap                 |
| `client/label.ts`    | deterministic label text with the `~` marker rule                 |
| `client/store.ts`    | per-agent bootstrap, buffering, busy ticker, teardown             |
| `client/registry.ts` | pill lifecycle, shared store publication, label-only updates      |
| `client/descriptor.ts` | button descriptor: title, variant-tagged label, popover behavior |
| `client/pulse-strip.ts` | strip bars as theme tokens and weights                         |
| `client/detail-model.ts` | popover groups: exact usage, `~` observations, activity        |
| `client/store-registry.ts` | leased per-agent store: created on mount, stopped on unmount |
| `client/use-pulse-view.ts` | the lease itself, bound to React's mounted lifetime         |
| `client/pulse-icon.tsx` | pill icon: state dot, breathes while a turn runs               |
| `client/pulse-detail.tsx` | anchored popover body: pulse strip and metric groups         |

Metric honesty: provider-reported tokens, cost and context window are exact and
unmarked. Turn duration, tool count, tool average and text rate are client-observed
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

The pill uses the public v0.8 button descriptor: a custom `icon` component, a
`behavior.kind: "popover"` with `Content`, and `registration.update({ label })` for
live text. The behavior instance is shared, so a label update never closes an open
popover. There is no agent panel, no Modal, no server entry and no plugin RPC.

| Command             | Checks                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `npm run typecheck` | `tsc --noEmit`, including host-contract assignability              |
| `npm test`          | `node --test client`                                               |
| `npm run smoke`     | entry + fake host: history, live lifecycle, cleanup                |
