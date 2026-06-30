# mcpproxy sort-key reordering

## State

- Status: finding captured (verified against source + live MongoDB)
- Last updated: 2026-06-30
- Next step: none required; treat as a known gotcha when using the salotech MongoDB MCP through mcpproxy.

## Purpose

Record a confirmed gotcha: the `smart-mcp-proxy/mcpproxy-go` proxy silently
**reorders JSON object keys alphabetically** when forwarding tool arguments to an
upstream MCP server. This breaks any upstream operation where key order is
semantically meaningful — most notably MongoDB `sort` / `$sort` documents, where
key order defines the sort priority and must match a compound index suffix.

## The bug

When calling an upstream tool via `call_tool_read` / `call_tool_write` /
`call_tool_destructive`, the proxy parses the caller's arguments into a Go
`map[string]interface{}` and then re-marshals that map to send it upstream. Go's
`encoding/json` **sorts map keys lexicographically** on marshal, so the original
insertion order is lost.

Both argument-passing styles are affected equally, because both collapse into the
same Go map before the order is gone:

- `args` (native JSON object) — taken from `request.Params.Arguments.(map[string]interface{})`.
- `args_json` (pre-serialized string) — `json.Unmarshal` into the same `map[string]interface{}`.

Source: `internal/server/mcp.go`, `handleCallToolVariant`:

```go
// Get optional args parameter - handle both new JSON string format and legacy object format
var args map[string]interface{}
if argsJSON := request.GetString("args_json", ""); argsJSON != "" {
    if err := json.Unmarshal([]byte(argsJSON), &args); err != nil { ... }
}
// Fallback to legacy object format
if args == nil && request.Params.Arguments != nil {
    if argumentsMap, ok := request.Params.Arguments.(map[string]interface{}); ok {
        if argsParam, ok := argumentsMap["args"]; ok {
            if argsMap, ok := argsParam.(map[string]interface{}); ok { args = argsMap }
        }
    }
}
// ... later:
result, err := p.upstreamManager.CallTool(callCtx, toolName, args) // map re-marshaled -> keys sorted
```

The reordering is **not** in the upstream `mongodb-js/mongodb-mcp-server`
(`find` uses `z.record`, which preserves insertion order, and passes `sort`
straight to the driver), and **not** in MongoDB itself.

## Evidence

Ran `explain` (executionStats) on a real backlog claim query (collection
`agent-watcher.tickets`) three times — via `args`, then via `args_json`, with the
sort keys sent in correct `slaByDateSort` order:

- Sent: `fr_due_by_escalated:-1, fr_due_by:1, nr_due_by_escalated:-1, nr_due_by:1, due_by_escalated:-1, due_by:1`
- Echoed `command.sort`: `due_by:1, due_by_escalated:-1, fr_due_by:1, fr_due_by_escalated:-1, nr_due_by:1, nr_due_by_escalated:-1` (pure alphabetical, every run).

Because the alphabetized sort no longer matches the `sla_v2_backlog_sort` index
suffix, the plan degrades to a blocking `SORT` over all matching docs
(~120k examined, ~10–17s) instead of an index-provided sort with `limit:1`
short-circuit. This is a harness artifact, not how the query runs in production.

## Practical guidance

- Do **not** trust key order of any object argument sent through this MCP proxy.
- `explain` results from this proxy are unreliable for **sort-order-dependent**
  plans (blocking sort / full scan may be a proxy artifact, not a real regression).
  Filter selectivity, index selection on equality predicates, and residual-filter
  placement are still trustworthy.
- For sort-order-sensitive verification, run the query directly via `mongosh` or a
  driver, bypassing the proxy.
- Application code that builds queries with an **ordered** type (Go `bson.D`,
  mongosh literal objects) is unaffected — only the MCP-proxy hop loses order.

## References

- Proxy: https://github.com/smart-mcp-proxy/mcpproxy-go (`internal/server/mcp.go`, `handleCallToolVariant`)
- Upstream MCP server: https://github.com/mongodb-js/mongodb-mcp-server (`src/tools/mongodb/read/find.ts`, `sort: z.record(...)`)
- Go behavior: `encoding/json` marshals map keys in sorted order.

## Load policy

Read this file before relying on MongoDB `explain`/`find`/`aggregate` results
obtained through an mcpproxy-fronted MCP server, or before debugging "why is the
proxy reordering my arguments".
