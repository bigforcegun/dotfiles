import { createComponent, createElement, insert, setProp } from "@opentui/solid"
import { createRoot, createSignal } from "solid-js"
import { buildPulseBlocks, buildPulseLine, buildPulseMetrics, buildPulseView } from "./pulse-line.js"

const DEFAULT_WIDTH = 48
const SLOT_ORDER = 100_000
const PULSE_ROW_LAYOUT = "wide"
const PULSE_ROW_LAYOUTS = ["wide", "left", "center"]
const PULSE_ROW_LEFT_PADDING = 5
const PULSE_ROW_PADDING_BOTTOM = 0
const RESTORED_PULSE_MIN_WIDTH = 8
const PULSE_MIN_WIDTH = 12
const STATUS_WIDTH_SAFETY = 2
const CYCLE_LAYOUT_COMMAND = "chat_pulse_line.layout_cycle"
const METRIC_DEBOUNCE_MS = 50
const METRIC_BATCH_SIZE = 8
const METRIC_CPU_BUDGET_MS = 8
const CACHE_MAX_ESTIMATE_CHARS = 20_000
const MIN_STREAM_SECONDS = 0.5
const RENDER_THROTTLE_MS = 250
const CACHE_READ_TOOL_PREFIXES = ["read", "list", "get", "fetch", "search", "find", "query", "inspect", "analyze"]
const CACHE_WRITE_TOOL_PREFIXES = ["write", "edit", "apply", "create", "update", "patch", "delete", "remove", "move", "rename"]
const WIDE_STATUS_SYMBOLS = new Set([0x231b, 0x26a1])
const RENDER_EVENTS = [
  "message.removed",
  "message.updated",
  "message.part.delta",
  "message.part.updated",
  "message.part.removed",
  "session.status",
  "session.idle",
  "session.updated",
]

const [pulseRowLayout, setPulseRowLayout] = createSignal(PULSE_ROW_LAYOUTS.includes(PULSE_ROW_LAYOUT) ? PULSE_ROW_LAYOUT : PULSE_ROW_LAYOUTS[0])

function rendererWidth(api) {
  const width = api.renderer?.width
  if (!Number.isFinite(width)) return DEFAULT_WIDTH
  return Math.max(0, Math.floor(width))
}

function viewportWidth(api) {
  const width = api.renderer?.width
  return Number.isFinite(width) ? Math.max(0, Math.floor(width)) : DEFAULT_WIDTH
}

function computePulseLayoutMetrics(input) {
  const viewportWidth = Number.isFinite(input.viewportWidth) ? Math.max(0, Math.floor(input.viewportWidth)) : DEFAULT_WIDTH
  const layout = PULSE_ROW_LAYOUTS.includes(input.layout) ? input.layout : PULSE_ROW_LAYOUT
  const workWidth = viewportWidth
  const safeWorkWidth = Math.max(0, workWidth - STATUS_WIDTH_SAFETY)
  const statusLength = terminalWidth(input.statusText)
  const reservedPulseWidth = input.hasPulse ? Math.min(RESTORED_PULSE_MIN_WIDTH, safeWorkWidth) : 0
  const maxStatusWidth = Math.max(0, safeWorkWidth - reservedPulseWidth - (reservedPulseWidth > 0 && statusLength > 0 ? 2 : 0))
  const statusWidth = Math.min(statusLength, maxStatusWidth || safeWorkWidth)
  const gapCapacity = Math.max(0, workWidth - statusWidth - reservedPulseWidth)
  const gapWidth = statusWidth > 0 && (reservedPulseWidth > 0 || gapCapacity > 0) ? Math.min(2, gapCapacity) : 0

  return {
    layout,
    viewportWidth,
    workWidth,
    statusWidth,
    gapWidth,
    pulseWidth: Math.max(0, workWidth - statusWidth - gapWidth),
    justifyContent: "flex-start",
    paddingLeft: 0,
  }
}

function terminalCharWidth(char) {
  const codePoint = char.codePointAt(0)
  if (!Number.isFinite(codePoint)) return 0
  if (codePoint === 0 || codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) return 0
  if ((codePoint >= 0xfe00 && codePoint <= 0xfe0f) || (codePoint >= 0xe0100 && codePoint <= 0xe01ef)) return 0
  if ((codePoint >= 0x300 && codePoint <= 0x36f) || (codePoint >= 0x1ab0 && codePoint <= 0x1aff) || (codePoint >= 0x1dc0 && codePoint <= 0x1dff) || (codePoint >= 0x20d0 && codePoint <= 0x20ff) || (codePoint >= 0xfe20 && codePoint <= 0xfe2f)) return 0
  if (WIDE_STATUS_SYMBOLS.has(codePoint)) return 2
  if ((codePoint >= 0x1100 && codePoint <= 0x115f) || codePoint === 0x2329 || codePoint === 0x232a || (codePoint >= 0x2e80 && codePoint <= 0xa4cf) || (codePoint >= 0xac00 && codePoint <= 0xd7a3) || (codePoint >= 0xf900 && codePoint <= 0xfaff) || (codePoint >= 0xfe10 && codePoint <= 0xfe19) || (codePoint >= 0xfe30 && codePoint <= 0xfe6f) || (codePoint >= 0xff00 && codePoint <= 0xff60) || (codePoint >= 0xffe0 && codePoint <= 0xffe6) || (codePoint >= 0x1f000 && codePoint <= 0x1faff)) return 2
  return 1
}

function terminalWidth(value) {
  let width = 0
  for (const char of String(value ?? "").replace(/\u001b\[[0-9;]*m/g, "")) width += terminalCharWidth(char)
  return width
}

function sliceStartColumns(value, maxWidth) {
  let width = 0
  let output = ""
  for (const char of String(value ?? "")) {
    const charWidth = terminalCharWidth(char)
    if (width + charWidth > maxWidth) break
    output += char
    width += charWidth
  }
  return output
}

function sliceEndColumns(value, maxWidth) {
  const chars = Array.from(String(value ?? ""))
  let width = 0
  let output = ""
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const char = chars[index]
    const charWidth = terminalCharWidth(char)
    if (width + charWidth > maxWidth) break
    output = `${char}${output}`
    width += charWidth
  }
  return output
}

function statusTextForWidth(value, width) {
  const targetWidth = Math.max(0, Math.floor(width))
  const text = sliceEndColumns(value, targetWidth)
  return `${" ".repeat(Math.max(0, targetWidth - terminalWidth(text)))}${text}`
}

function computeSplitSegments(input) {
  const pulseText = sliceStartColumns(input.pulseText, input.metrics.pulseWidth)
  const rawStatusText = String(input.statusText ?? "")
  const statusText = sliceEndColumns(rawStatusText, input.metrics.statusWidth)
  const prefixWidth = Math.max(0, input.metrics.workWidth - terminalWidth(statusText))
  const pulseSlotWidth = Math.max(0, prefixWidth - input.metrics.gapWidth)
  const visiblePulseText = sliceStartColumns(pulseText, pulseSlotWidth)

  return {
    pulseText: visiblePulseText,
    pulsePadding: " ".repeat(Math.max(0, prefixWidth - terminalWidth(visiblePulseText))),
    statusText,
  }
}

function renderSplitLine(input) {
  const segments = computeSplitSegments(input)
  return `${segments.pulseText}${segments.pulsePadding}${segments.statusText}`
}

function currentLayout() {
  return pulseRowLayout()
}

function computeCurrentPulseLayoutMetrics(input) {
  return computePulseLayoutMetrics({ ...input, layout: pulseRowLayout() })
}

function requestRender(api) {
  api.renderer?.requestRender?.()
}

function currentSessionID(api) {
  const route = api.route.current
  return route.name === "session" ? route.params.sessionID : undefined
}

function eventSessionID(event) {
  const properties = event?.properties
  if (!properties || typeof properties !== "object") return undefined
  if (typeof properties.sessionID === "string") return properties.sessionID
  if (typeof properties.session_id === "string") return properties.session_id
  if (properties.info && typeof properties.info === "object" && typeof properties.info.sessionID === "string") return properties.info.sessionID
  if (properties.part && typeof properties.part === "object" && typeof properties.part.sessionID === "string") return properties.part.sessionID
  if (properties.message && typeof properties.message === "object" && typeof properties.message.sessionID === "string") return properties.message.sessionID
  return undefined
}

function isEventForCurrentSession(api, event) {
  const activeSessionID = currentSessionID(api)
  if (!activeSessionID) return false
  return eventSessionID(event) === activeSessionID
}

function sessionIsPulsing(api) {
  const sessionID = currentSessionID(api)
  if (!sessionID) return false
  const status = api.state.session.status(sessionID)
  if (status?.type === "busy" || status?.type === "retry") return true

  const messages = api.state.session.messages(sessionID)
  if (!Array.isArray(messages) || messages.length === 0) return false
  const lastInfo = cacheMessageInfo(messages[messages.length - 1])
  if (lastInfo?.role === "user") return true
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const info = cacheMessageInfo(messages[index])
    if (info?.role === "assistant") return !Number.isFinite(info.time?.completed)
  }
  return false
}

function cacheMessageInfo(message) {
  return message?.info ?? message
}

function cacheApproximateTokens(text) {
  if (typeof text !== "string" || text.length === 0) return 0
  const value = text.length > CACHE_MAX_ESTIMATE_CHARS ? text.slice(0, CACHE_MAX_ESTIMATE_CHARS) : text
  let ascii = 0
  let nonAscii = 0
  for (const char of value) {
    if (char.codePointAt(0) <= 0x7f) ascii += 1
    else nonAscii += 1
  }
  return Math.ceil(ascii / 4 + nonAscii / 2)
}

function cacheNormalizeToolName(value) {
  return typeof value === "string" ? value.toLowerCase().replace(/^[^:]+:/, "") : ""
}

function cacheToolKind(part) {
  if (part.state?.status === "error") return "error"
  const name = cacheNormalizeToolName(part.tool)
  if (CACHE_READ_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix))) return "read"
  if (CACHE_WRITE_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix))) return "write"
  return "tool"
}

function cachePartKind(part) {
  switch (part.type) {
    case "text":
      return part.synthetic || part.ignored ? undefined : "text"
    case "reasoning":
      return "reasoning"
    case "tool":
      return cacheToolKind(part)
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

function cacheHeightIndex(tokens) {
  if (tokens <= 16) return 0
  if (tokens <= 64) return 1
  if (tokens <= 128) return 2
  if (tokens <= 256) return 3
  if (tokens <= 512) return 4
  if (tokens <= 1_024) return 5
  if (tokens <= 2_048) return 6
  return 7
}

function cachePositiveTokenEstimate(text) {
  return Math.max(1, cacheApproximateTokens(text))
}

function cacheToolTokenEstimate(part) {
  const state = part.state
  if (!state) return 1
  if (typeof state.output === "string") return cachePositiveTokenEstimate(state.output)
  if (typeof state.error === "string") return cachePositiveTokenEstimate(state.error)
  if (typeof state.raw === "string") return cachePositiveTokenEstimate(state.raw)
  if (typeof state.title === "string") return cachePositiveTokenEstimate(state.title)
  return 1
}

function cachePartTokenEstimate(part) {
  switch (part.type) {
    case "text":
    case "reasoning":
      return cachePositiveTokenEstimate(part.text)
    case "tool":
      return cacheToolTokenEstimate(part)
    case "step-finish":
      return Math.max(1, part.tokens?.output ?? part.tokens?.total ?? 1)
    case "patch":
      return Math.max(1, (part.files?.length ?? 1) * 20)
    case "retry":
      return cachePositiveTokenEstimate(part.error?.data?.message)
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

function cachePulseBlock(part) {
  const kind = cachePartKind(part)
  if (!kind) return undefined
  return { kind, height: cacheHeightIndex(cachePartTokenEstimate(part)) }
}

function cacheFiniteNonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

function cachePartStartTime(part) {
  const direct = part.time?.start
  if (Number.isFinite(direct)) return direct
  const state = part.state?.time?.start
  return Number.isFinite(state) ? state : undefined
}

function cachePartEndTime(part, now) {
  const direct = part.time?.end
  if (Number.isFinite(direct)) return direct
  const state = part.state?.time?.end
  if (Number.isFinite(state)) return state
  return Number.isFinite(now) ? now : undefined
}

function cacheTextStreamDurationSeconds(parts, now) {
  let start
  let end
  for (const part of parts ?? []) {
    if (part.type !== "text") continue
    const partStart = cachePartStartTime(part)
    if (!Number.isFinite(partStart)) continue
    const partEnd = cachePartEndTime(part, now)
    if (!Number.isFinite(start) || partStart < start) start = partStart
    if (Number.isFinite(partEnd) && (!Number.isFinite(end) || partEnd > end)) end = partEnd
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined
  const seconds = (end - start) / 1000
  return seconds >= MIN_STREAM_SECONDS ? seconds : undefined
}

function cacheTextPartTokens(parts) {
  return (parts ?? []).reduce((total, part) => total + (part.type === "text" ? cacheApproximateTokens(part.text) : 0), 0)
}

function cacheMessageStartMs(entry, parts) {
  const info = cacheMessageInfo(entry)
  if (Number.isFinite(info?.time?.created)) return info.time.created
  if (Number.isFinite(info?.time_created)) return info.time_created
  let start
  for (const part of parts ?? []) {
    const candidate = cachePartStartTime(part)
    if (Number.isFinite(candidate) && (!Number.isFinite(start) || candidate < start)) start = candidate
  }
  return start
}

function cacheMessageEndMs(entry, parts, now) {
  const info = cacheMessageInfo(entry)
  if (Number.isFinite(info?.time?.completed)) return info.time.completed
  if (Number.isFinite(info?.time_updated)) return info.time_updated
  let end
  for (const part of parts ?? []) {
    const candidate = cachePartEndTime(part, now)
    if (Number.isFinite(candidate) && (!Number.isFinite(end) || candidate > end)) end = candidate
  }
  return Number.isFinite(end) ? end : now
}

function cacheTurnTotalMs(latest, latestParts, previousUser, previousUserParts, now) {
  const start = cacheMessageStartMs(previousUser, previousUserParts)
  const fallbackStart = cacheMessageStartMs(latest, latestParts)
  const end = cacheMessageEndMs(latest, latestParts, now)
  const actualStart = Number.isFinite(start) ? start : fallbackStart
  if (!Number.isFinite(actualStart) || !Number.isFinite(end) || end < actualStart) return undefined
  return end - actualStart
}

function cacheChatSpentTotalMs(messages, partsForMessage, now, active) {
  let total = 0
  const activeTurn = active && Number.isFinite(now)
  for (let index = 0; index < messages.length; index += 1) {
    const userInfo = cacheMessageInfo(messages[index])
    if (userInfo?.role !== "user") continue
    const userParts = partsForMessage(messages[index])
    const start = cacheMessageStartMs(messages[index], userParts)
    if (!Number.isFinite(start)) continue

    let end
    for (let next = index + 1; next < messages.length; next += 1) {
      const nextInfo = cacheMessageInfo(messages[next])
      if (nextInfo?.role === "user") break
      if (nextInfo?.role !== "assistant") continue
      const assistantParts = partsForMessage(messages[next])
      const assistantEnd = cacheMessageEndMs(messages[next], assistantParts, now)
      if (Number.isFinite(assistantEnd) && (!Number.isFinite(end) || assistantEnd > end)) end = assistantEnd
    }
    if (activeTurn && !messages.slice(index + 1).some((message) => cacheMessageInfo(message)?.role === "user")) end = now
    if (Number.isFinite(end) && end >= start) total += end - start
  }
  return total
}

function cacheExactMetrics(latestMessage, session, parts, now) {
  const info = cacheMessageInfo(latestMessage)
  const tokens = info?.tokens ?? session?.tokens
  const cacheRead = cacheFiniteNonNegative(tokens?.cache?.read)
  const cacheWrite = cacheFiniteNonNegative(tokens?.cache?.write)
  const input = cacheFiniteNonNegative(tokens?.input)
  const output = cacheFiniteNonNegative(tokens?.output)
  const reasoning = cacheFiniteNonNegative(tokens?.reasoning)
  const created = info?.time?.created
  const completed = info?.time?.completed
  const seconds = Number.isFinite(created) && Number.isFinite(completed) ? (completed - created) / 1000 : 0
  const streamTokens = cacheTextPartTokens(parts)
  const streamSeconds = cacheTextStreamDurationSeconds(parts, now)
  return {
    input,
    output,
    cache: Number.isFinite(cacheRead) || Number.isFinite(cacheWrite) ? (cacheRead ?? 0) + (cacheWrite ?? 0) : undefined,
    cacheRead,
    cacheWrite,
    reasoning,
    tps: Number.isFinite(output) && output > 0 && seconds > 0 ? output / seconds : undefined,
    streamTps: streamTokens > 0 && streamSeconds > 0 ? streamTokens / streamSeconds : undefined,
  }
}

function cacheToolDurationMs(part, status, now) {
  const toolStatus = part.state?.status
  const start = part.state?.time?.start
  const end = part.state?.time?.end
  if (!Number.isFinite(start)) return 0
  if ((toolStatus === "completed" || toolStatus === "error") && Number.isFinite(end)) return Math.max(0, end - start)
  if (toolStatus === "running" && sessionBusy(status) && Number.isFinite(now)) return Math.max(0, now - start)
  return 0
}

function sessionBusy(status) {
  return status?.type === "busy" || status?.type === "retry"
}

function cacheTurnIsActive(messages, status) {
  if (sessionBusy(status)) return true
  const lastInfo = cacheMessageInfo(messages[messages.length - 1])
  if (lastInfo?.role === "user") return true
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const info = cacheMessageInfo(messages[index])
    if (info?.role === "assistant") return !Number.isFinite(info.time?.completed)
  }
  return false
}

function createMetricCache(api, requestRenderFn = requestRender) {
  const partTokenCache = new Map()
  const messageMetricCache = new Map()
  const sessionMetricCache = new Map()
  const streamMetricCache = new Map()
  const dirtySessions = new Set()
  const renderSessions = new Set()
  const dirtyMessages = new Set()
  const dirtyParts = new Set()
  const rebuildJobs = new Map()
  let processTimer
  let renderTimer
  let disposed = false

  const emptySnapshot = {
    hasData: false,
    pulseBlocks: [],
    exact: { input: undefined, output: undefined, cache: undefined, cacheRead: undefined, cacheWrite: undefined, reasoning: undefined, tps: undefined, streamTps: undefined },
    tools: { count: 0, totalMs: 0, averageMs: undefined },
    turn: { totalMs: undefined },
    chat: { totalMs: undefined },
  }

  function metricInput(sessionID) {
    return {
      messages: api.state.session.messages(sessionID),
      session: api.state.session.get(sessionID),
      status: api.state.session.status(sessionID),
      now: Date.now(),
      partForMessage(messageID) {
        return api.state.part(messageID)
      },
    }
  }
 
  function rebuildSession(sessionID) {
    if (!sessionID || disposed) return undefined
    const job = startRebuild(sessionID)
    while (job && !job.done) processRebuildChunk(job, Number.POSITIVE_INFINITY)
    return sessionMetricCache.get(sessionID)
  }

  function restoreSessionSnapshot(sessionID) {
    if (!sessionID || disposed) return undefined
    const input = {
      messages: sessionMessages(sessionID),
      session: api.state.session.get(sessionID),
      status: api.state.session.status(sessionID),
      now: Date.now(),
      partForMessage() {
        return []
      },
    }
    const metrics = buildPulseMetrics(input)
    metrics.pulseBlocks = buildPulseBlocks(input)
    return metrics
  }

  function sessionMessages(sessionID) {
    const messages = api.state.session.messages(sessionID)
    return Array.isArray(messages) ? messages : []
  }

  function messagePartsFor(message) {
    if (Array.isArray(message?.parts)) return message.parts
    const info = cacheMessageInfo(message)
    return info?.id ? (api.state.part(info.id) ?? []) : []
  }

  function latestAssistantIndex(messages) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (cacheMessageInfo(messages[index])?.role === "assistant") return index
    }
    return -1
  }

  function latestUserIndexBefore(messages, index) {
    for (let current = index - 1; current >= 0; current -= 1) {
      if (cacheMessageInfo(messages[current])?.role === "user") return current
    }
    return -1
  }

  function streamPartText(event, part, messageID, partID) {
    const stream = streamMetricCache.get(messageID)
    if (typeof part?.text === "string") return part.text
    const properties = event?.properties ?? {}
    const delta = properties.delta ?? properties.text ?? properties.content ?? properties.value ?? part?.delta
    if (typeof delta === "string") return `${stream?.parts.get(partID) ?? ""}${delta}`
    if (typeof delta?.text === "string") return `${stream?.parts.get(partID) ?? ""}${delta.text}`
    return undefined
  }

  function markStreamDelta(event) {
    const properties = event?.properties ?? {}
    const part = properties.part
    const type = part?.type ?? properties.type
    if (type !== "text") return
    const messageID = part?.messageID ?? properties.messageID ?? properties.message?.id ?? properties.info?.id
    if (!messageID) return
    const partID = part?.id ?? properties.partID ?? messageID
    const text = streamPartText(event, part, messageID, partID)
    if (typeof text !== "string") return
    const now = Date.now()
    const stream = streamMetricCache.get(messageID) ?? { sessionID: eventSessionID(event), started: now, ended: now, parts: new Map() }
    stream.sessionID = stream.sessionID ?? eventSessionID(event)
    stream.started = Math.min(stream.started, now)
    stream.ended = Math.max(stream.ended, now)
    stream.parts.set(partID, text)
    streamMetricCache.set(messageID, stream)
  }

  function streamTpsForMessage(messageID) {
    const stream = streamMetricCache.get(messageID)
    if (!stream) return undefined
    const seconds = (stream.ended - stream.started) / 1000
    if (seconds < MIN_STREAM_SECONDS) return undefined
    const text = Array.from(stream.parts.values()).join("")
    const tokens = cacheApproximateTokens(text)
    return tokens > 0 ? tokens / seconds : undefined
  }

  function startRebuild(sessionID) {
    if (!sessionID || disposed) return undefined
    const messages = sessionMessages(sessionID)
    const latestIndex = latestAssistantIndex(messages)
    const job = {
      sessionID,
      messages,
      session: api.state.session.get(sessionID),
      status: api.state.session.status(sessionID),
      now: Date.now(),
      latestIndex,
      previousIndex: latestIndex - 1,
      index: 0,
      partIndex: 0,
      currentParts: undefined,
      latestToolCount: 0,
      latestToolTotalMs: 0,
      pulseBlocks: [],
      latestParts: [],
      previousParts: [],
      touchedMessages: [],
      done: false,
    }
    rebuildJobs.set(sessionID, job)
    return job
  }

  function publishRebuild(job) {
    const latestMessage = job.messages[job.latestIndex]
    const previousUserIndex = latestUserIndexBefore(job.messages, job.latestIndex)
    const previousUser = previousUserIndex >= 0 ? job.messages[previousUserIndex] : undefined
    const previousUserParts = previousUser ? messagePartsFor(previousUser) : []
    const exact = cacheExactMetrics(latestMessage, job.session, job.latestParts, job.now)
    const liveStreamTps = streamTpsForMessage(cacheMessageInfo(latestMessage)?.id)
    const activeTurn = cacheTurnIsActive(job.messages, job.status)
    if (Number.isFinite(liveStreamTps)) exact.streamTps = liveStreamTps
    const metrics = {
      exact,
      tools: {
        count: job.latestToolCount,
        totalMs: job.latestToolTotalMs,
        averageMs: job.latestToolCount > 0 ? job.latestToolTotalMs / job.latestToolCount : undefined,
      },
      turn: {
        active: activeTurn,
        totalMs: cacheTurnTotalMs(latestMessage, job.latestParts, previousUser, previousUserParts, job.now),
      },
      chat: {
        totalMs: cacheChatSpentTotalMs(job.messages, messagePartsFor, job.now, activeTurn),
      },
      pulseBlocks: job.pulseBlocks,
    }
    metrics.hasData = [exact.input, exact.output, exact.cache, exact.reasoning, exact.tps].some(Number.isFinite) || metrics.tools.count > 0

    for (const messageID of job.touchedMessages) messageMetricCache.set(messageID, { messageID, sessionID: job.sessionID, metrics })
    sessionMetricCache.set(job.sessionID, metrics)
    rebuildJobs.delete(job.sessionID)
    job.done = true
    return metrics
  }

  function processRebuildChunk(job, budgetMs = METRIC_CPU_BUDGET_MS) {
    const started = Date.now()
    let processed = 0
    while (job.index < job.messages.length && processed < METRIC_BATCH_SIZE && Date.now() - started <= budgetMs) {
      const message = job.messages[job.index]
      const info = cacheMessageInfo(message)
      const parts = job.currentParts ?? messagePartsFor(message)
      job.currentParts = parts
      if (info?.id) job.touchedMessages.push(info.id)
      while (job.partIndex < parts.length && processed < METRIC_BATCH_SIZE && Date.now() - started <= budgetMs) {
        const part = parts[job.partIndex]
        if (part?.id) partTokenCache.set(part.id, { messageID: info?.id, sessionID: job.sessionID, type: part.type })
        if (job.index === job.latestIndex) {
          if (part.type === "tool") {
            job.latestToolCount += 1
            job.latestToolTotalMs += cacheToolDurationMs(part, job.status, job.now)
          }
          const block = cachePulseBlock(part)
          if (block) job.pulseBlocks.push(block)
        }
        job.partIndex += 1
        processed += 1
      }
      if (job.partIndex < parts.length) break
      if (job.index === job.previousIndex) job.previousParts = parts
      if (job.index === job.latestIndex) job.latestParts = parts
      if (job.index === job.latestIndex && parts.length === 0) {
        const tokens = info?.tokens?.output ?? info?.tokens?.total
        if (tokens) job.pulseBlocks.push({ kind: "success", height: cacheHeightIndex(tokens) })
      }
      job.index += 1
      job.partIndex = 0
      job.currentParts = undefined
      if (parts.length === 0) processed += 1
    }
    if (job.index >= job.messages.length) return publishRebuild(job)
    return undefined
  }

  function throttledRender() {
    if (disposed || renderTimer) return
    renderTimer = setTimeout(() => {
      renderTimer = undefined
      if (!disposed) requestRenderFn(api)
    }, RENDER_THROTTLE_MS)
  }

  function processDirty() {
    processTimer = undefined
    if (disposed) return
    const started = Date.now()
    const completed = []
    for (const sessionID of dirtySessions) {
      const job = rebuildJobs.get(sessionID) ?? startRebuild(sessionID)
      const metrics = job ? processRebuildChunk(job, Math.max(0, METRIC_CPU_BUDGET_MS - (Date.now() - started))) : undefined
      if (metrics) completed.push(sessionID)
      if (completed.length >= METRIC_BATCH_SIZE || Date.now() - started >= METRIC_CPU_BUDGET_MS) break
    }
    for (const messageID of Array.from(dirtyMessages).slice(0, METRIC_BATCH_SIZE)) dirtyMessages.delete(messageID)
    for (const partID of Array.from(dirtyParts).slice(0, METRIC_BATCH_SIZE)) dirtyParts.delete(partID)
    if (completed.some((sessionID) => renderSessions.has(sessionID))) throttledRender()
    for (const sessionID of completed) {
      dirtySessions.delete(sessionID)
      renderSessions.delete(sessionID)
    }
    if (dirtySessions.size > 0 || rebuildJobs.size > 0) schedule()
  }

  function schedule() {
    if (disposed || processTimer) return
    processTimer = setTimeout(processDirty, METRIC_DEBOUNCE_MS)
  }

  function markDirty(sessionID, render = true) {
    if (!sessionID || disposed) return
    dirtySessions.add(sessionID)
    if (render) renderSessions.add(sessionID)
    schedule()
  }

  function markEvent(event, render = true, eventName) {
    if (eventName === "message.part.delta") markStreamDelta(event)
    const sessionID = eventSessionID(event)
    const part = event?.properties?.part
    const message = event?.properties?.message ?? event?.properties?.info
    if (part?.id) dirtyParts.add(part.id)
    if (part?.messageID) dirtyMessages.add(part.messageID)
    if (message?.id) dirtyMessages.add(message.id)
    markDirty(sessionID, render)
  }

  function removePart(sessionID, partID, render = true) {
    if (!partID && !sessionID) return
    const part = partTokenCache.get(partID)
    if (partID) partTokenCache.delete(partID)
    if (part?.messageID) dirtyMessages.add(part.messageID)
    markDirty(part?.sessionID ?? sessionID, render)
  }

  function removeMessage(sessionID, messageID, render = true) {
    if (!sessionID) return
    if (messageID) messageMetricCache.delete(messageID)
    if (messageID) streamMetricCache.delete(messageID)
    for (const [partID, part] of partTokenCache) {
      if (part.messageID === messageID || (!messageID && part.sessionID === sessionID)) partTokenCache.delete(partID)
    }
    sessionMetricCache.delete(sessionID)
    markDirty(sessionID, render)
  }

  function removeSession(sessionID, render = true) {
    if (!sessionID) return
    const removedMetrics = sessionMetricCache.get(sessionID)
    dirtySessions.delete(sessionID)
    renderSessions.delete(sessionID)
    rebuildJobs.delete(sessionID)
    sessionMetricCache.delete(sessionID)
    for (const [messageID, messageMetrics] of messageMetricCache) {
      if (messageMetrics.sessionID === sessionID || messageMetrics.metrics === removedMetrics) messageMetricCache.delete(messageID)
    }
    for (const [messageID, stream] of streamMetricCache) if (stream.sessionID === sessionID) streamMetricCache.delete(messageID)
    for (const [partID, part] of partTokenCache) {
      if (part.sessionID === sessionID) partTokenCache.delete(partID)
    }
    if (render) throttledRender()
  }

  function snapshot(sessionID) {
    if (!sessionID) return undefined
    if (!sessionMetricCache.has(sessionID)) {
      const restored = restoreSessionSnapshot(sessionID)
      if (restored?.hasData || restored?.pulseBlocks?.length > 0) sessionMetricCache.set(sessionID, restored)
      markDirty(sessionID, true)
    }
    return sessionMetricCache.get(sessionID) ?? emptySnapshot
  }

  function dispose() {
    disposed = true
    if (processTimer) clearTimeout(processTimer)
    if (renderTimer) clearTimeout(renderTimer)
    dirtySessions.clear()
    renderSessions.clear()
    dirtyMessages.clear()
    dirtyParts.clear()
    rebuildJobs.clear()
    partTokenCache.clear()
    messageMetricCache.clear()
    sessionMetricCache.clear()
    streamMetricCache.clear()
  }

  return { markDirty, markEvent, removeMessage, removePart, removeSession, snapshot, dispose, rebuildSession, dirtyParts, dirtyMessages, dirtySessions, renderSessions, rebuildJobs, partTokenCache, messageMetricCache, sessionMetricCache }
}

function createStreamTracker() {
  // Keep this isolated from createMetricCache: the general metric cache is known
  // to break TUI status rendering in real sessions. Only ↯ uses this live state.
  const streams = new Map()

  function textDelta(event, part, messageID, partID) {
    if (typeof part?.text === "string") return { text: part.text, mode: "replace" }
    const properties = event?.properties ?? {}
    const delta = properties.delta ?? properties.text ?? properties.content ?? properties.value ?? part?.delta
    if (typeof delta === "string") return { text: `${streams.get(messageID)?.parts.get(partID) ?? ""}${delta}`, mode: "append" }
    if (typeof delta?.text === "string") return { text: `${streams.get(messageID)?.parts.get(partID) ?? ""}${delta.text}`, mode: "append" }
    return undefined
  }

  function mark(event) {
    const properties = event?.properties ?? {}
    const part = properties.part
    const type = part?.type ?? properties.type
    if (type !== "text") return
    const messageID = part?.messageID ?? properties.messageID ?? properties.message?.id ?? properties.info?.id
    if (!messageID) return
    const partID = part?.id ?? properties.partID ?? messageID
    const delta = textDelta(event, part, messageID, partID)
    if (!delta) return
    const now = Date.now()
    const stream = streams.get(messageID) ?? { sessionID: eventSessionID(event), started: now, ended: now, parts: new Map() }
    stream.sessionID = stream.sessionID ?? eventSessionID(event)
    stream.started = Math.min(stream.started, now)
    stream.ended = Math.max(stream.ended, now)
    stream.parts.set(partID, delta.text)
    streams.set(messageID, stream)
  }

  function streamTps(sessionID) {
    let latest
    for (const stream of streams.values()) {
      if (stream.sessionID !== sessionID) continue
      if (!latest || stream.ended > latest.ended) latest = stream
    }
    if (!latest) return undefined
    const seconds = (latest.ended - latest.started) / 1000
    if (seconds < MIN_STREAM_SECONDS) return undefined
    const tokens = cacheApproximateTokens(Array.from(latest.parts.values()).join(""))
    return tokens > 0 ? tokens / seconds : undefined
  }

  function dispose() {
    streams.clear()
  }

  return { mark, streamTps, dispose }
}

function renderForSession(api, sessionID, tick) {
  return buildPulseLine({
    messages: api.state.session.messages(sessionID),
    session: api.state.session.get(sessionID),
    status: api.state.session.status(sessionID),
    tick,
    width: rendererWidth(api),
    partForMessage(messageID) {
      return api.state.part(messageID)
    },
  })
}

function pulseViewInput(api, sessionID, tick, width, pulseWidth, metrics, streamTps) {
  return {
    messages: api.state.session.messages(sessionID),
    session: api.state.session.get(sessionID),
    status: api.state.session.status(sessionID),
    metrics,
    now: Date.now(),
    tick,
    width,
    pulseWidth,
    streamTps,
    partForMessage(messageID) {
      return api.state.part(messageID)
    },
  }
}

function renderViewForSession(api, sessionID, tick, streamTracker) {
  const layout = pulseRowLayout()
  const streamTps = streamTracker?.streamTps(sessionID)
  const baseView = buildPulseView(pulseViewInput(api, sessionID, tick, rendererWidth(api), undefined, undefined, streamTps))
  const metrics = computePulseLayoutMetrics({ viewportWidth: viewportWidth(api), layout, statusText: baseView.statusText, hasPulse: baseView.pulseBlocks.length > 0 })
  const view = buildPulseView(pulseViewInput(api, sessionID, tick, metrics.workWidth, metrics.pulseWidth, undefined, streamTps))

  return { ...view, metrics }
}

function PulseLine(props) {
  const element = createElement("text")
  setProp(element, "selectable", false)
  setProp(element, "width", PULSE_MIN_WIDTH)
  setProp(element, "minWidth", PULSE_MIN_WIDTH)
  setProp(element, "height", 1)
  setProp(element, "flexGrow", 1)
  setProp(element, "flexShrink", 0)
  const blocks = props.view.pulseBlocks

  for (const block of blocks) {
    appendText(element, block.glyph, block.color)
  }

  return element
}

function GapLine(props) {
  const element = createElement("text")
  setProp(element, "selectable", false)
  setProp(element, "width", props.metrics.gapWidth)
  setProp(element, "height", 1)
  setProp(element, "flexGrow", 0)
  setProp(element, "flexShrink", 1)
  return element
}

function StatusLine(props) {
  const element = createElement("text")
  setProp(element, "selectable", false)
  setProp(element, "width", props.metrics.statusWidth)
  setProp(element, "height", 1)
  setProp(element, "flexGrow", 0)
  setProp(element, "flexShrink", 0)
  appendText(element, statusTextForWidth(props.view.statusText, props.metrics.statusWidth), props.textColor)
  return element
}

function SplitText(props) {
  const element = createElement("box")
  setProp(element, "width", "100%")
  setProp(element, "height", 1)
  setProp(element, "flexDirection", "row")
  insert(element, createComponent(PulseLine, { view: props.view, metrics: props.view.metrics }))
  insert(element, createComponent(GapLine, { metrics: props.view.metrics }))
  insert(element, createComponent(StatusLine, { view: props.view, metrics: props.view.metrics, textColor: props.textColor }))
  return element
}

function themeTextColor(api) {
  return api.theme?.current?.text
}

function PulseRow(props) {
  const element = createElement("box")
  setProp(element, "width", "100%")
  setProp(element, "flexDirection", "row")
  setProp(element, "paddingBottom", PULSE_ROW_PADDING_BOTTOM)
  setProp(element, "justifyContent", props.view.metrics.justifyContent)
  setProp(element, "paddingLeft", props.view.metrics.paddingLeft)
  insert(element, createComponent(SplitText, props))
  return element
}

function cyclePulseRowLayout(api) {
  const index = PULSE_ROW_LAYOUTS.indexOf(pulseRowLayout())
  setPulseRowLayout(PULSE_ROW_LAYOUTS[(index + 1) % PULSE_ROW_LAYOUTS.length])
  requestRender(api)
}

function appendText(element, value, color) {
  if (!value) return
  const span = createElement("span")
  if (color) setProp(span, "style", { fg: color })
  insert(span, value)
  insert(element, span)
}

function initializeTui(api, disposeRoot) {
  let tick = 0
  let pulseInterval
  const streamTracker = createStreamTracker()

  api.keymap.registerLayer({
    priority: 1_000,
    commands: [
      {
        name: CYCLE_LAYOUT_COMMAND,
        title: "Cycle chat pulse line layout",
        category: "Plugin",
        namespace: "palette",
        run() {
          cyclePulseRowLayout(api)
        },
      },
    ],
    bindings: [
      { key: "ctrl+g", cmd: CYCLE_LAYOUT_COMMAND, desc: "Cycle pulse layout" },
      { key: "alt+g", cmd: CYCLE_LAYOUT_COMMAND, desc: "Cycle pulse layout" },
    ],
  })

  function stopPulseTimer() {
    if (!pulseInterval) return
    clearInterval(pulseInterval)
    pulseInterval = undefined
  }

  function syncPulseTimer() {
    if (!sessionIsPulsing(api)) {
      stopPulseTimer()
      return
    }
    if (pulseInterval) return
    pulseInterval = setInterval(() => {
      if (!sessionIsPulsing(api)) {
        stopPulseTimer()
        return
      }
      tick += 1
      requestRender(api)
    }, 450)
  }

  api.slots.register({
    order: SLOT_ORDER,
    slots: {
      app_bottom() {
        const sessionID = currentSessionID(api)
        if (!sessionID) return undefined
        syncPulseTimer()
        return createComponent(PulseRow, { view: renderViewForSession(api, sessionID, tick, streamTracker), textColor: themeTextColor(api) })
      },
    },
  })

  const disposers = RENDER_EVENTS.map((eventName) => api.event.on(eventName, (event) => {
    const isCurrent = isEventForCurrentSession(api, event)
    if (!isCurrent) return
    syncPulseTimer()
    if (eventName === "message.part.delta") streamTracker.mark(event)
    requestRender(api)
  }))

  api.lifecycle.onDispose(() => {
    stopPulseTimer()
    streamTracker.dispose()
    for (const dispose of disposers) dispose()
    disposeRoot()
  })
}

const plugin = {
  id: "chat-pulse-line",
  async tui(api) {
    createRoot((disposeRoot) => initializeTui(api, disposeRoot))
  },
}

export default plugin
export const __testing = { computeCurrentPulseLayoutMetrics, computePulseLayoutMetrics, computeSplitSegments, createMetricCache, currentLayout, renderSplitLine, statusTextForWidth, terminalWidth }
export { renderForSession }
