const MAX_BLOCKS = 36
const MIN_BLOCK_WIDTH = 8
const MAX_ESTIMATE_CHARS = 20_000
const MIN_STREAM_SECONDS = 0.5
const STATUS_SEPARATOR = " | "
const STATUS_GROUP_SEPARATOR = " ▌ "

const READ_TOOL_PREFIXES = ["read", "list", "get", "fetch", "search", "find", "query", "inspect", "analyze"]
const WRITE_TOOL_PREFIXES = ["write", "edit", "apply", "create", "update", "patch", "delete", "remove", "move", "rename"]

const HEIGHT_GLYPHS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]
const STREAM_PART_TYPES = new Set(["text", "reasoning"])
const COLOR_BY_KIND = {
  text: { ansi: "\u001b[38;5;244m", tui: "#928374" },
  reasoning: { ansi: "\u001b[38;5;141m", tui: "#b16286" },
  read: { ansi: "\u001b[38;5;75m", tui: "#458588" },
  write: { ansi: "\u001b[38;5;214m", tui: "#d79921" },
  tool: { ansi: "\u001b[38;5;109m", tui: "#83a598" },
  error: { ansi: "\u001b[38;5;203m", tui: "#fb4934" },
  success: { ansi: "\u001b[38;5;114m", tui: "#b8bb26" },
  misc: { ansi: "\u001b[38;5;240m", tui: "#665c54" },
}
const STATUS_WIDGETS = [
  {
    id: "input",
    group: "chat_base",
    label: "↓",
    value(metrics) {
      return metrics.exact.input
    },
    visible(metrics) {
      return metrics.hasData
    },
    format(value) {
      return formatNumber(value) ?? "?"
    },
  },
  {
    id: "output",
    group: "chat_base",
    label: "↑",
    value(metrics) {
      return metrics.exact.output
    },
    visible(metrics) {
      return metrics.hasData
    },
    format(value) {
      return formatNumber(value) ?? "?"
    },
  },
  {
    id: "cache",
    group: "chat_base",
    label: "◇",
    value(metrics) {
      return metrics.exact.cache
    },
    visible(metrics) {
      return metrics.hasData
    },
    format(value) {
      return formatNumber(value) ?? "?"
    },
  },
  {
    id: "tps",
    group: "timing",
    label: "⚡",
    value(metrics) {
      return metrics.exact.tps
    },
    visible() {
      return true
    },
    format(value) {
      return formatMetricRate(value)
    },
  },
  {
    id: "streamTps",
    group: "timing",
    label: "↯",
    value(metrics) {
      return metrics.exact.streamTps
    },
    visible() {
      return true
    },
    format(value) {
      return formatMetricRate(value)
    },
  },
  {
    id: "turnTotal",
    group: "timing",
    value(metrics) {
      return metrics.turn.totalMs
    },
    visible(metrics) {
      return metrics.hasData
    },
    format(value) {
      return formatClockDuration(value)
    },
    label(metrics) {
      return metrics.turn.active ? "💬" : "🏁"
    },
  },
  {
    id: "chatTotal",
    group: "timing",
    label: "Σ",
    value(metrics) {
      return metrics.chat.totalMs
    },
    visible(metrics) {
      return metrics.hasData
    },
    format(value) {
      return formatClockDuration(value)
    },
  },
  {
    id: "toolCount",
    group: "tools",
    label: "🔧",
    value(metrics) {
      return metrics.tools.count
    },
    visible(metrics) {
      return metrics.hasData
    },
    format(value) {
      return formatNumber(value) ?? "0"
    },
  },
  {
    id: "toolAverage",
    group: "tools",
    label: "⏱",
    value(metrics) {
      return metrics.tools.averageMs
    },
    visible(metrics) {
      return metrics.hasData
    },
    format(value) {
      return formatFixedSeconds(value)
    },
  },
  {
    id: "toolTotal",
    group: "tools",
    label: "⌛",
    value(metrics) {
      return metrics.tools.totalMs
    },
    visible(metrics) {
      return metrics.hasData
    },
    format(value) {
      return formatClockDuration(value)
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
      return "misc"
    default:
      return "misc"
  }
}

function isStreamPartType(type) {
  return STREAM_PART_TYPES.has(type)
}

function approximateTokens(text) {
  if (typeof text !== "string" || text.length === 0) return 0
  const value = text.length > MAX_ESTIMATE_CHARS ? text.slice(0, MAX_ESTIMATE_CHARS) : text
  let ascii = 0
  let nonAscii = 0
  for (const char of value) {
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

export function buildPulseBlocks(input) {
  return collectAssistantParts(input.messages ?? [], input.partForMessage)
}

function isBusy(status) {
  return status?.type === "busy" || status?.type === "retry"
}

function assistantIsOpen(info) {
  return info?.role === "assistant" && !Number.isFinite(info.time?.completed)
}

function turnIsActive(messages, status) {
  if (isBusy(status)) return true
  const lastInfo = messageInfo(messages[messages.length - 1])
  if (lastInfo?.role === "user") return true
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const info = messageInfo(messages[index])
    if (info?.role === "assistant") return assistantIsOpen(info)
  }
  return false
}

function colorize(glyph, kind, enabled) {
  if (!enabled) return glyph
  return `${(COLOR_BY_KIND[kind] ?? COLOR_BY_KIND.misc).ansi}${glyph}${RESET_COLOR}`
}

function pulseHeight(height, tick) {
  if (tick % 2 === 0) return height
  return Math.min(HEIGHT_GLYPHS.length - 1, height + 1)
}

function renderBlockSegments(blocks, busy, tick, width) {
  if (width < MIN_BLOCK_WIDTH) return busy ? [{ kind: "misc", glyph: "●", color: COLOR_BY_KIND.misc.tui }] : []

  const visibleCount = Math.max(1, Math.min(MAX_BLOCKS, width, blocks.length))
  const visible = blocks.slice(-visibleCount)
  const lastIndex = visible.length - 1

  return visible.map((block, index) => {
    const height = busy && index === lastIndex ? pulseHeight(block.height, tick) : block.height
    const glyph = HEIGHT_GLYPHS[height] ?? HEIGHT_GLYPHS[0]
    return { kind: block.kind, glyph, color: (COLOR_BY_KIND[block.kind] ?? COLOR_BY_KIND.misc).tui }
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

function formatMetricRate(value) {
  if (!Number.isFinite(value) || value <= 0) return "00.00"
  return value.toFixed(2).padStart(5, "0")
}

function formatClockDuration(value) {
  if (!Number.isFinite(value) || value < 0) return "?"
  const totalSeconds = Math.floor(value / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function formatFixedSeconds(value) {
  if (!Number.isFinite(value) || value < 0) return "?"
  return `${(value / 1000).toFixed(2).padStart(5, "0")}s`
}

function formatDuration(value) {
  if (value === 0) return "0ms"
  if (!Number.isFinite(value) || value < 0) return "?"
  if (value >= 1000) return `${formatDecimal(value / 1000)}s`
  return `${Math.round(value)}ms`
}

function messageCompletionSeconds(info) {
  const created = info?.time?.created
  const completed = info?.time?.completed
  if (!Number.isFinite(created) || !Number.isFinite(completed) || completed <= created) return undefined
  return (completed - created) / 1000
}

function completedToolDurationMs(parts) {
  const intervals = []
  for (const part of parts ?? []) {
    if (part?.type !== "tool") continue
    const status = part.state?.status
    const start = part.state?.time?.start
    const end = part.state?.time?.end
    if ((status !== "completed" && status !== "error") || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    intervals.push([start, end])
  }

  let total = 0
  let start
  let end
  for (const [nextStart, nextEnd] of intervals.sort(([left], [right]) => left - right)) {
    if (!Number.isFinite(start)) {
      start = nextStart
      end = nextEnd
    } else if (nextStart <= end) {
      end = Math.max(end, nextEnd)
    } else {
      total += end - start
      start = nextStart
      end = nextEnd
    }
  }
  return Number.isFinite(start) ? total + end - start : 0
}

function messageGenerationSeconds(info, parts) {
  const completionSeconds = messageCompletionSeconds(info)
  if (!Number.isFinite(completionSeconds)) return undefined
  const generationSeconds = completionSeconds - completedToolDurationMs(parts) / 1000
  return generationSeconds > 0 ? generationSeconds : undefined
}

function latestStepFinishOutputTokens(parts) {
  let output
  for (const part of parts ?? []) {
    if (part?.type !== "step-finish") continue
    const candidate = finiteNonNegative(part.tokens?.output ?? part.tokens?.total)
    if (Number.isFinite(candidate)) output = candidate
  }
  return output
}

function messageOutputTokens(info, parts) {
  const exactOutput = finiteNonNegative(info?.tokens?.output)
  if (Number.isFinite(exactOutput)) return exactOutput

  const finishedOutput = latestStepFinishOutputTokens(parts)
  if (Number.isFinite(finishedOutput)) return finishedOutput

  const streamedOutput = textPartTokens(parts ?? [], "text")
  return streamedOutput > 0 ? streamedOutput : undefined
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

function latestUserBefore(messages, index) {
  for (let current = index - 1; current >= 0; current -= 1) {
    const info = messageInfo(messages[current])
    if (info?.role === "user") return { message: messages[current], index: current, info }
  }
  return undefined
}

function messageStartMs(entry, parts) {
  const info = entry?.info ?? entry
  if (Number.isFinite(info?.time?.created)) return info.time.created
  if (Number.isFinite(info?.time_created)) return info.time_created
  let start
  for (const part of parts ?? []) {
    const candidate = partStartTime(part)
    if (Number.isFinite(candidate) && (!Number.isFinite(start) || candidate < start)) start = candidate
  }
  return start
}

function messageEndMs(entry, parts, now) {
  const info = entry?.info ?? entry
  if (Number.isFinite(info?.time?.completed)) return info.time.completed
  if (Number.isFinite(info?.time_updated)) return info.time_updated
  let end
  for (const part of parts ?? []) {
    const candidate = partEndTime(part, now)
    if (Number.isFinite(candidate) && (!Number.isFinite(end) || candidate > end)) end = candidate
  }
  return Number.isFinite(end) ? end : now
}

function turnTotalMs(latest, latestParts, previousUser, previousUserParts, now) {
  const start = messageStartMs(previousUser?.message ?? previousUser?.info, previousUserParts)
  const fallbackStart = messageStartMs(latest?.message ?? latest?.info, latestParts)
  const end = messageEndMs(latest?.message ?? latest?.info, latestParts, now)
  const actualStart = Number.isFinite(start) ? start : fallbackStart
  if (!Number.isFinite(actualStart) || !Number.isFinite(end) || end < actualStart) return undefined
  return end - actualStart
}

function liveTurnTotalMs(messages, latest, latestParts, partForMessage, now) {
  if (!Number.isFinite(now)) return undefined
  let currentUser
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const info = messageInfo(messages[index])
    if (info?.role === "user") {
      currentUser = { message: messages[index], info }
      break
    }
  }
  const userParts = currentUser ? messageParts(currentUser.message, partForMessage) : []
  const start = messageStartMs(currentUser?.message ?? currentUser?.info, userParts) ?? liveStartTime(latest, latestParts)
  if (!Number.isFinite(start) || now < start) return undefined
  return now - start
}

function chatSpentTotalMs(messages, partForMessage, now, active) {
  let total = 0
  const activeTurn = active && Number.isFinite(now)
  for (let index = 0; index < messages.length; index += 1) {
    const userInfo = messageInfo(messages[index])
    if (userInfo?.role !== "user") continue
    const userParts = messageParts(messages[index], partForMessage)
    const start = messageStartMs(messages[index], userParts)
    if (!Number.isFinite(start)) continue

    let end
    for (let next = index + 1; next < messages.length; next += 1) {
      const nextInfo = messageInfo(messages[next])
      if (nextInfo?.role === "user") break
      if (nextInfo?.role !== "assistant") continue
      const assistantParts = messageParts(messages[next], partForMessage)
      const assistantEnd = messageEndMs(messages[next], assistantParts, now)
      if (Number.isFinite(assistantEnd) && (!Number.isFinite(end) || assistantEnd > end)) end = assistantEnd
    }
    if (activeTurn && !messages.slice(index + 1).some((message) => messageInfo(message)?.role === "user")) end = now
    if (Number.isFinite(end) && end >= start) total += end - start
  }
  return total
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

function exactMetrics(messages, session) {
  const latest = latestAssistantMessage(messages)
  let cacheRead = 0
  let cacheWrite = 0
  let input = 0
  let output = 0
  let reasoning = 0
  let hasInput = false
  let hasOutput = false
  let hasCacheRead = false
  let hasCacheWrite = false
  let hasReasoning = false

  for (const message of messages) {
    const info = messageInfo(message)
    if (info?.role !== "assistant") continue
    const tokens = info.tokens
    const messageInput = finiteNonNegative(tokens?.input)
    const messageOutput = finiteNonNegative(tokens?.output)
    const messageCacheRead = finiteNonNegative(tokens?.cache?.read)
    const messageCacheWrite = finiteNonNegative(tokens?.cache?.write)
    const messageReasoning = finiteNonNegative(tokens?.reasoning)
    if (Number.isFinite(messageInput)) {
      input += messageInput
      hasInput = true
    }
    if (Number.isFinite(messageOutput)) {
      output += messageOutput
      hasOutput = true
    }
    if (Number.isFinite(messageCacheRead)) {
      cacheRead += messageCacheRead
      hasCacheRead = true
    }
    if (Number.isFinite(messageCacheWrite)) {
      cacheWrite += messageCacheWrite
      hasCacheWrite = true
    }
    if (Number.isFinite(messageReasoning)) {
      reasoning += messageReasoning
      hasReasoning = true
    }
  }

  if (!hasInput) input = finiteNonNegative(session?.tokens?.input)
  if (!hasOutput) output = finiteNonNegative(session?.tokens?.output)
  if (!hasCacheRead) cacheRead = finiteNonNegative(session?.tokens?.cache?.read)
  if (!hasCacheWrite) cacheWrite = finiteNonNegative(session?.tokens?.cache?.write)
  if (!hasReasoning) reasoning = finiteNonNegative(session?.tokens?.reasoning)

  return {
    input: hasInput ? input : finiteNonNegative(input),
    output: hasOutput ? output : finiteNonNegative(output),
    cache: Number.isFinite(cacheRead) || Number.isFinite(cacheWrite) ? (cacheRead ?? 0) + (cacheWrite ?? 0) : undefined,
    cacheRead,
    cacheWrite,
    reasoning: hasReasoning ? reasoning : finiteNonNegative(reasoning),
    tps: undefined,
    tpsLoading: false,
  }
}

function toolDurationMs(part, status, now) {
  const toolStatus = part.state?.status
  const start = part.state?.time?.start
  const end = part.state?.time?.end
  if (!Number.isFinite(start)) return 0
  if ((toolStatus === "completed" || toolStatus === "error") && Number.isFinite(end)) return Math.max(0, end - start)
  if (toolStatus === "running" && isBusy(status) && Number.isFinite(now)) return Math.max(0, now - start)
  return 0
}

function textStreamDurationSeconds(parts, now) {
  let start
  let end
  for (const part of parts) {
    if (!isStreamPartType(part.type)) continue
    const partStart = partStartTime(part)
    if (!Number.isFinite(partStart)) continue
    const partEnd = partEndTime(part, now)
    if (!Number.isFinite(start) || partStart < start) start = partStart
    if (Number.isFinite(partEnd) && (!Number.isFinite(end) || partEnd > end)) end = partEnd
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined
  const seconds = (end - start) / 1000
  return seconds >= MIN_STREAM_SECONDS ? seconds : undefined
}

function textPartTokens(parts, type) {
  if (type) return parts.reduce((total, part) => total + (part.type === type ? approximateTokens(part.text) : 0), 0)
  return parts.reduce((total, part) => total + (isStreamPartType(part.type) ? approximateTokens(part.text) : 0), 0)
}

function assistantToolParts(messages, partForMessage) {
  const tools = []
  for (const message of messages) {
    const info = messageInfo(message)
    if (info?.role !== "assistant") continue
    for (const part of messageParts(message, partForMessage)) {
      if (part.type === "tool") tools.push(part)
    }
  }
  return tools
}

function partStartTime(part) {
  const direct = part.time?.start
  if (Number.isFinite(direct)) return direct
  const state = part.state?.time?.start
  return Number.isFinite(state) ? state : undefined
}

function partEndTime(part, now) {
  const direct = part.time?.end
  if (Number.isFinite(direct)) return direct
  const state = part.state?.time?.end
  if (Number.isFinite(state)) return state
  return Number.isFinite(now) ? now : undefined
}

function livePartTokens(parts) {
  return parts.reduce((total, part) => total + partTokenEstimate(part), 0)
}

function liveStartTime(latest, parts) {
  const created = latest?.info?.time?.created
  if (Number.isFinite(created)) return created
  let start
  for (const part of parts) {
    const candidate = partStartTime(part)
    if (Number.isFinite(candidate) && (!Number.isFinite(start) || candidate < start)) start = candidate
  }
  return start
}

export function buildPulseMetrics(input) {
  const messages = input.messages ?? []
  const latest = latestAssistantMessage(messages)
  const lastInfo = messageInfo(messages[messages.length - 1])
  const exact = exactMetrics(messages, input.session)
  const parts = latest ? messageParts(latest.message, input.partForMessage) : []
  const completedSeconds = messageGenerationSeconds(latest?.info, parts)
  const completedOutputTokens = latest ? messageOutputTokens(latest.info, parts) : undefined
  const streamTokens = textPartTokens(parts)
  const streamSeconds = textStreamDurationSeconds(parts, input.now)
  exact.tps = Number.isFinite(completedOutputTokens) && completedSeconds > 0 ? completedOutputTokens / completedSeconds : undefined
  exact.streamTps = Number.isFinite(input.streamTps) && input.streamTps > 0
    ? input.streamTps
    : streamTokens > 0 && streamSeconds > 0
      ? streamTokens / streamSeconds
      : undefined
  const tools = assistantToolParts(messages, input.partForMessage)
  const totalMs = tools.reduce((total, part) => total + toolDurationMs(part, input.status, input.now), 0)
  const previousUser = latest ? latestUserBefore(messages, latest.index) : undefined
  const previousUserParts = previousUser ? messageParts(previousUser.message, input.partForMessage) : []
  const latestStarted = liveStartTime(latest, parts)
  const activeTurn = turnIsActive(messages, input.status)
  if (activeTurn && lastInfo?.role === "user") {
    exact.tps = undefined
    exact.tpsLoading = true
  } else if (!Number.isFinite(exact.tps) && latest && activeTurn && Number.isFinite(latestStarted) && Number.isFinite(input.now)) {
    const liveTokens = livePartTokens(parts)
    const elapsedSeconds = (input.now - latestStarted) / 1000
    if (liveTokens > 0 && elapsedSeconds > 0) exact.tps = liveTokens / elapsedSeconds
    else exact.tpsLoading = true
  }

  const metrics = {
    exact,
    tools: {
      count: tools.length,
      totalMs,
      averageMs: tools.length > 0 ? totalMs / tools.length : undefined,
    },
    turn: {
      active: activeTurn,
      totalMs: activeTurn ? liveTurnTotalMs(messages, latest, parts, input.partForMessage, input.now) : latest ? turnTotalMs(latest, parts, previousUser, previousUserParts, input.now) : undefined,
    },
    chat: {
      totalMs: chatSpentTotalMs(messages, input.partForMessage, input.now, activeTurn),
    },
  }
  metrics.hasData = [exact.input, exact.output, exact.cache, exact.reasoning, exact.tps].some(Number.isFinite) || metrics.tools.count > 0
  return metrics
}

function statusMetrics(input) {
  return input.metrics ?? buildPulseMetrics(input)
}

function statusWidget(config, metrics) {
  if (!config.visible(metrics)) return undefined
  const value = config.value(metrics)
  const formattedValue = config.format(value, metrics)
  const label = typeof config.label === "function" ? config.label(metrics) : config.label
  return {
    id: config.id,
    group: config.group,
    label,
    value,
    formattedValue,
    text: `${label} ${formattedValue}`,
  }
}

function composeStatusWidgets(widgets) {
  const groups = []
  let currentGroup

  for (const widget of widgets) {
    if (!currentGroup || currentGroup.name !== widget.group) {
      currentGroup = { name: widget.group, widgets: [] }
      groups.push(currentGroup)
    }
    currentGroup.widgets.push(widget)
  }

  return `${groups.map((group) => group.widgets.map((widget) => widget.text).join(STATUS_SEPARATOR)).join(STATUS_GROUP_SEPARATOR)} `
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
  const blocks = input.pulseBlocks ?? buildPulseBlocks(input)
  const busy = isBusy(input.status)
  const color = input.color !== false
  const totals = input.metrics
    ? { input: input.metrics.exact.input ?? 0, output: input.metrics.exact.output ?? 0, cache: input.metrics.exact.cache ?? 0 }
    : tokenTotals(input.messages, input.session)
  const statusView = buildStatusView({ ...input, busyFallback: blocks.length === 0 })

  if (blocks.length === 0) {
    const tokens = totals.output || totals.input || totals.cache
    if (tokens > 0) {
      const pulseWidth = Number.isFinite(input.pulseWidth) ? Math.max(0, Math.floor(input.pulseWidth)) : Math.max(input.width, MIN_BLOCK_WIDTH)
      const pulseBlocks = renderBlockSegments([{ kind: "success", height: heightIndex(tokens) }], busy, input.tick, pulseWidth)
      return pulseView(pulseBlocks, statusView, color)
    }

    return pulseView(busy ? [{ kind: "misc", glyph: "●", color: COLOR_BY_KIND.misc.tui }] : [], statusView, color)
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
  buildPulseBlocks,
  collectAssistantParts,
  buildStatusView,
  formatDuration,
  formatNumber,
  MAX_ESTIMATE_CHARS,
  heightIndex,
  partKind,
  partTokenEstimate,
  renderBlockSegments,
  renderBlocks,
  visibleLength,
}
