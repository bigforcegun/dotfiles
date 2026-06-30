const MAX_BLOCKS = 36
const MIN_BLOCK_WIDTH = 8
const STATUS_SEPARATOR = " / "

const READ_TOOL_PREFIXES = ["read", "list", "get", "fetch", "search", "find", "query", "inspect", "analyze"]
const WRITE_TOOL_PREFIXES = ["write", "edit", "apply", "create", "update", "patch", "delete", "remove", "move", "rename"]

const HEIGHT_GLYPHS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]
const COLOR_BY_KIND = {
  text: { ansi: "\u001b[38;5;244m", tui: "#928374" },
  reasoning: { ansi: "\u001b[38;5;141m", tui: "#b16286" },
  read: { ansi: "\u001b[38;5;75m", tui: "#458588" },
  write: { ansi: "\u001b[38;5;214m", tui: "#d79921" },
  tool: { ansi: "\u001b[38;5;109m", tui: "#83a598" },
  error: { ansi: "\u001b[38;5;203m", tui: "#fb4934" },
  success: { ansi: "\u001b[38;5;114m", tui: "#b8bb26" },
  other: { ansi: "\u001b[38;5;240m", tui: "#665c54" },
}
const STATUS_WIDGETS = [
  {
    id: "input",
    label: "↓",
    value(metrics) {
      return metrics.exact.input
    },
    visible(metrics) {
      return metrics.exact.input > 0 || metrics.exact.output > 0
    },
    format(value) {
      return formatNumber(value) ?? "0"
    },
  },
  {
    id: "output",
    label: "↑",
    value(metrics) {
      return metrics.exact.output
    },
    visible(metrics) {
      return metrics.exact.input > 0 || metrics.exact.output > 0
    },
    format(value) {
      return formatNumber(value) ?? "0"
    },
  },
  {
    id: "cache",
    label: "◇",
    value(metrics) {
      return metrics.exact.cache
    },
    visible(metrics) {
      return metrics.exact.cache > 0
    },
    format(value) {
      return formatNumber(value) ?? "0"
    },
  },
  {
    id: "tps",
    label: "⚡",
    value(metrics) {
      return metrics.exact.tps
    },
    visible(metrics) {
      return Number.isFinite(metrics.exact.tps) && metrics.exact.tps > 0
    },
    format(value) {
      return formatDecimal(value)
    },
  },
  {
    id: "toolCount",
    label: "🔧",
    value(metrics) {
      return metrics.tools.count
    },
    visible(metrics) {
      return metrics.tools.count > 0
    },
    format(value) {
      return formatNumber(value) ?? "0"
    },
  },
  {
    id: "toolAverage",
    label: "⏱",
    value(metrics) {
      return metrics.tools.averageMs
    },
    visible(metrics) {
      return metrics.tools.count > 0 && Number.isFinite(metrics.tools.averageMs)
    },
    format(value) {
      return formatDuration(value)
    },
  },
  {
    id: "toolTotal",
    label: "⌛",
    value(metrics) {
      return metrics.tools.totalMs
    },
    visible(metrics) {
      return metrics.tools.totalMs > 0
    },
    format(value) {
      return formatDuration(value)
    },
  },
  {
    id: "system",
    label: "⚙",
    value(metrics) {
      return metrics.categories.system
    },
    visible(metrics) {
      return metrics.categories.system > 0
    },
    format(value) {
      return formatNumber(value) ?? "0"
    },
  },
  {
    id: "user",
    label: "👤",
    value(metrics) {
      return metrics.categories.user
    },
    visible(metrics) {
      return metrics.categories.user > 0
    },
    format(value) {
      return formatNumber(value) ?? "0"
    },
  },
  {
    id: "context",
    label: "📚",
    value(metrics) {
      return metrics.categories.context
    },
    visible(metrics) {
      return metrics.categories.context > 0
    },
    format(value) {
      return formatNumber(value) ?? "0"
    },
  },
  {
    id: "schema",
    label: "📐",
    value(metrics) {
      return metrics.categories.schema
    },
    visible(metrics) {
      return metrics.categories.schema > 0
    },
    format(value) {
      return formatNumber(value) ?? "0"
    },
  },
  {
    id: "toolResults",
    label: "📦",
    value(metrics) {
      return metrics.categories.toolResults
    },
    visible(metrics) {
      return metrics.categories.toolResults > 0
    },
    format(value) {
      return formatNumber(value) ?? "0"
    },
  },
  {
    id: "thinking",
    label: "🧠",
    value(metrics) {
      return metrics.categories.thinking
    },
    visible(metrics) {
      return metrics.categories.thinking > 0
    },
    format(value) {
      return formatNumber(value) ?? "0"
    },
  },
  {
    id: "answer",
    label: "💬",
    value(metrics) {
      return metrics.categories.answer
    },
    visible(metrics) {
      return metrics.categories.answer > 0
    },
    format(value) {
      return formatNumber(value) ?? "0"
    },
  },
]
const RESET_COLOR = "\u001b[0m"

function normalizeToolName(value) {
  return typeof value === "string" ? value.toLowerCase().replace(/^[^:]+:/, "") : ""
}

function toolKind(part) {
  const status = part.state?.status
  if (status === "error") return "error"

  const name = normalizeToolName(part.tool)
  if (READ_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix))) return "read"
  if (WRITE_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix))) return "write"

  return "tool"
}

function partKind(part) {
  switch (part.type) {
    case "text":
      return part.synthetic || part.ignored ? undefined : "text"
    case "reasoning":
      return "reasoning"
    case "tool":
      return toolKind(part)
    case "step-finish":
      return "success"
    case "retry":
      return "error"
    case "file":
    case "patch":
      return "read"
    case "subtask":
    case "agent":
    case "compaction":
    case "snapshot":
      return "other"
    default:
      return "other"
  }
}

function approximateTokens(text) {
  if (typeof text !== "string" || text.length === 0) return 0
  let ascii = 0
  let nonAscii = 0
  for (const char of text) {
    if (char.codePointAt(0) <= 0x7f) ascii += 1
    else nonAscii += 1
  }
  return Math.ceil(ascii / 4 + nonAscii / 2)
}

function positiveTokenEstimate(text) {
  return Math.max(1, approximateTokens(text))
}

function toolTokenEstimate(part) {
  const state = part.state
  if (!state) return 1

  if (typeof state.output === "string") return positiveTokenEstimate(state.output)
  if (typeof state.error === "string") return positiveTokenEstimate(state.error)
  if (typeof state.raw === "string") return positiveTokenEstimate(state.raw)
  if (typeof state.title === "string") return positiveTokenEstimate(state.title)

  return 1
}

function partTokenEstimate(part) {
  switch (part.type) {
    case "text":
    case "reasoning":
      return positiveTokenEstimate(part.text)
    case "tool":
      return toolTokenEstimate(part)
    case "step-finish":
      return Math.max(1, part.tokens?.output ?? part.tokens?.total ?? 1)
    case "patch":
      return Math.max(1, (part.files?.length ?? 1) * 20)
    case "retry":
      return positiveTokenEstimate(part.error?.data?.message)
    case "file":
    case "subtask":
    case "agent":
    case "compaction":
    case "snapshot":
      return 1
    default:
      return 1
  }
}

function heightIndex(tokens) {
  if (tokens <= 16) return 0
  if (tokens <= 64) return 1
  if (tokens <= 128) return 2
  if (tokens <= 256) return 3
  if (tokens <= 512) return 4
  if (tokens <= 1_024) return 5
  if (tokens <= 2_048) return 6
  return 7
}

function collectAssistantParts(messages, partForMessage) {
  const blocks = []

  for (const message of messages) {
    const info = message.info ?? message
    if (info.role !== "assistant") continue

    const parts = message.parts ?? partForMessage(info.id)
    if (parts.length === 0) {
      const tokens = info.tokens?.output ?? info.tokens?.total
      if (tokens) blocks.push({ kind: "success", height: heightIndex(tokens) })
      continue
    }

    for (const part of parts) {
      const kind = partKind(part)
      if (!kind) continue
      blocks.push({ kind, height: heightIndex(partTokenEstimate(part)) })
    }
  }

  return blocks
}

function isBusy(status) {
  return status?.type === "busy" || status?.type === "retry"
}

function colorize(glyph, kind, enabled) {
  if (!enabled) return glyph
  return `${(COLOR_BY_KIND[kind] ?? COLOR_BY_KIND.other).ansi}${glyph}${RESET_COLOR}`
}

function pulseHeight(height, tick) {
  if (tick % 2 === 0) return height
  return Math.min(HEIGHT_GLYPHS.length - 1, height + 1)
}

function renderBlockSegments(blocks, busy, tick, width) {
  if (width < MIN_BLOCK_WIDTH) return busy ? [{ kind: "other", glyph: "●", color: COLOR_BY_KIND.other.tui }] : []

  const visibleCount = Math.max(1, Math.min(MAX_BLOCKS, width, blocks.length))
  const visible = blocks.slice(-visibleCount)
  const lastIndex = visible.length - 1

  return visible.map((block, index) => {
    const height = busy && index === lastIndex ? pulseHeight(block.height, tick) : block.height
    const glyph = HEIGHT_GLYPHS[height] ?? HEIGHT_GLYPHS[0]
    return { kind: block.kind, glyph, color: (COLOR_BY_KIND[block.kind] ?? COLOR_BY_KIND.other).tui }
  })
}

function renderBlocks(blocks, busy, tick, width, color) {
  return renderBlockSegments(blocks, busy, tick, width).map((block) => colorize(block.glyph, block.kind, color)).join("")
}

function formatNumber(value) {
  if (!Number.isFinite(value) || value <= 0) return undefined
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return String(value)
}

function formatDecimal(value) {
  if (!Number.isFinite(value) || value <= 0) return undefined
  if (value >= 100) return String(Math.round(value))
  return value.toFixed(value >= 10 ? 1 : 2).replace(/\.0+$/, "")
}

function formatDuration(value) {
  if (!Number.isFinite(value) || value <= 0) return "0ms"
  if (value >= 1000) return `${formatDecimal(value / 1000)}s`
  return `${Math.round(value)}ms`
}

function tokenTotals(messages, session) {
  const totals = {
    input: session?.tokens?.input ?? 0,
    output: session?.tokens?.output ?? 0,
    cache: (session?.tokens?.cache?.read ?? 0) + (session?.tokens?.cache?.write ?? 0),
  }

  if (totals.input > 0 || totals.output > 0 || totals.cache > 0) return totals

  for (const message of messages) {
    const info = message.info ?? message
    if (info.role !== "assistant") continue
    totals.input += info.tokens?.input ?? 0
    totals.output += info.tokens?.output ?? 0
    totals.cache += (info.tokens?.cache?.read ?? 0) + (info.tokens?.cache?.write ?? 0)
  }

  return totals
}

function messageInfo(message) {
  return message?.info ?? message
}

function messageParts(message, partForMessage) {
  const info = messageInfo(message)
  if (Array.isArray(message?.parts)) return message.parts
  if (!info?.id || typeof partForMessage !== "function") return []
  return partForMessage(info.id) ?? []
}

function latestAssistantMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const info = messageInfo(messages[index])
    if (info?.role === "assistant") return { message: messages[index], index, info }
  }
  return undefined
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

function exactMetrics(messages, session) {
  const latest = latestAssistantMessage(messages)
  const tokens = latest?.info?.tokens ?? session?.tokens
  const cacheRead = finiteNonNegative(tokens?.cache?.read) ?? 0
  const cacheWrite = finiteNonNegative(tokens?.cache?.write) ?? 0
  const input = finiteNonNegative(tokens?.input) ?? 0
  const output = finiteNonNegative(tokens?.output) ?? 0
  const reasoning = finiteNonNegative(tokens?.reasoning) ?? 0
  const created = latest?.info?.time?.created
  const completed = latest?.info?.time?.completed
  const seconds = Number.isFinite(created) && Number.isFinite(completed) ? (completed - created) / 1000 : 0

  return {
    input,
    output,
    cache: cacheRead + cacheWrite,
    cacheRead,
    cacheWrite,
    reasoning,
    tps: output > 0 && seconds > 0 ? output / seconds : undefined,
  }
}

function toolDurationMs(part, status, now) {
  const start = part.state?.time?.start
  const end = part.state?.time?.end
  if (!Number.isFinite(start)) return 0
  if (Number.isFinite(end)) return Math.max(0, end - start)
  if (part.state?.status === "running" && isBusy(status) && Number.isFinite(now)) return Math.max(0, now - start)
  return 0
}

function textPartTokens(parts, type) {
  return parts.reduce((total, part) => total + (part.type === type ? approximateTokens(part.text) : 0), 0)
}

function toolResultTokens(parts) {
  return parts.reduce((total, part) => {
    if (part.type !== "tool") return total
    const state = part.state
    if (!state || (state.status !== "completed" && state.status !== "error")) return total
    if (typeof state.output === "string") return total + approximateTokens(state.output)
    if (typeof state.error === "string") return total + approximateTokens(state.error)
    return total
  }, 0)
}

function visibleContextTokens(messages, latestIndex, partForMessage) {
  let total = 0
  for (let index = 0; index < latestIndex; index += 1) {
    const message = messages[index]
    const info = messageInfo(message)
    if (typeof info?.system === "string") total += approximateTokens(info.system)
    for (const part of messageParts(message, partForMessage)) {
      if (part.type === "text" || part.type === "reasoning") total += approximateTokens(part.text)
      if (part.type === "file" && typeof part.source?.text?.value === "string") total += approximateTokens(part.source.text.value)
      if (part.type === "tool") total += toolResultTokens([part])
    }
  }
  return total
}

export function buildPulseMetrics(input) {
  const messages = input.messages ?? []
  const latest = latestAssistantMessage(messages)
  const exact = exactMetrics(messages, input.session)
  const parts = latest ? messageParts(latest.message, input.partForMessage) : []
  const tools = parts.filter((part) => part.type === "tool")
  const totalMs = tools.reduce((total, part) => total + toolDurationMs(part, input.status, input.now), 0)
  const previousMessage = latest ? messages[latest.index - 1] : undefined
  const previousInfo = messageInfo(previousMessage)
  const previousParts = previousMessage ? messageParts(previousMessage, input.partForMessage) : []
  const system = typeof previousInfo?.system === "string" ? approximateTokens(previousInfo.system) : 0
  const user = previousInfo?.role === "user" ? textPartTokens(previousParts, "text") : 0
  const thinking = exact.reasoning || textPartTokens(parts, "reasoning")
  const answer = exact.output || textPartTokens(parts, "text")

  return {
    exact,
    tools: {
      count: tools.length,
      totalMs,
      averageMs: tools.length > 0 ? totalMs / tools.length : undefined,
    },
    categories: {
      system,
      user,
      context: latest ? visibleContextTokens(messages, latest.index, input.partForMessage) : 0,
      schema: 0,
      toolResults: toolResultTokens(parts),
      thinking,
      answer,
    },
  }
}

function statusMetrics(input) {
  return input.metrics ?? buildPulseMetrics(input)
}

function statusWidget(config, metrics) {
  if (!config.visible(metrics)) return undefined
  const value = config.value(metrics)
  const formattedValue = config.format(value)
  return {
    id: config.id,
    label: config.label,
    value,
    formattedValue,
    text: `${config.label} ${formattedValue}`,
  }
}

function composeStatusWidgets(widgets) {
  return widgets.map((widget) => widget.text).join(STATUS_SEPARATOR)
}

function buildStatusView(input) {
  const metrics = statusMetrics(input)
  const widgets = STATUS_WIDGETS.map((config) => statusWidget(config, metrics)).filter(Boolean)
  if (widgets.length > 0) return { metrics, widgets, text: composeStatusWidgets(widgets) }

  if (input.busyFallback !== false && isBusy(input.status)) {
    const busyWidget = { id: "busy", label: "busy", value: true, formattedValue: "", text: "busy" }
    return { metrics, widgets: [busyWidget], text: busyWidget.text }
  }

  return { metrics, widgets: [], text: "" }
}

function visibleLength(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "").length
}

function pulseView(pulseBlocks, statusView, color) {
  return {
    pulseBlocks,
    metricSnapshot: statusView.metrics,
    statusWidgets: statusView.widgets,
    statusText: statusView.text,
    blocks: pulseBlocks,
    tokenText: statusView.text,
    color,
  }
}

export function buildPulseLine(input) {
  const view = buildPulseView(input)
  const pulseBlocks = view.pulseBlocks ?? view.blocks
  const statusText = view.statusText ?? view.tokenText
  const blockText = pulseBlocks.map((block) => colorize(block.glyph, block.kind, view.color)).join("")

  if (!blockText) return statusText
  if (!statusText || input.width < pulseBlocks.length + statusText.length + 2) return blockText

  return `${blockText}  ${statusText}`
}

export function buildPulseView(input) {
  const blocks = collectAssistantParts(input.messages, input.partForMessage)
  const busy = isBusy(input.status)
  const color = input.color !== false
  const totals = tokenTotals(input.messages, input.session)
  const statusView = buildStatusView({ ...input, busyFallback: blocks.length === 0 })

  if (blocks.length === 0) {
    const tokens = totals.output || totals.input || totals.cache
    if (tokens > 0) {
      const pulseWidth = Number.isFinite(input.pulseWidth) ? Math.max(0, Math.floor(input.pulseWidth)) : Math.max(input.width, MIN_BLOCK_WIDTH)
      const pulseBlocks = renderBlockSegments([{ kind: "success", height: heightIndex(tokens) }], busy, input.tick, pulseWidth)
      return pulseView(pulseBlocks, statusView, color)
    }

    return pulseView(busy ? [{ kind: "other", glyph: "●", color: COLOR_BY_KIND.other.tui }] : [], statusView, color)
  }

  const availableWidth = Number.isFinite(input.pulseWidth)
    ? Math.max(0, Math.floor(input.pulseWidth))
    : Math.max(0, input.width - (statusView.text ? statusView.text.length + 2 : 0))
  const pulseBlocks = renderBlockSegments(blocks, busy, input.tick, availableWidth)

  return pulseView(pulseBlocks, statusView, color)
}

export const __testing = {
  approximateTokens,
  buildPulseMetrics,
  collectAssistantParts,
  buildStatusView,
  formatDuration,
  formatNumber,
  heightIndex,
  partKind,
  partTokenEstimate,
  renderBlockSegments,
  renderBlocks,
  visibleLength,
}
