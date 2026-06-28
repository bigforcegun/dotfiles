const MAX_BLOCKS = 36
const MIN_BLOCK_WIDTH = 8
const APPROX_CHARS_PER_TOKEN = 4

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
  return Math.max(1, Math.ceil(String(text ?? "").length / APPROX_CHARS_PER_TOKEN))
}

function toolTokenEstimate(part) {
  const state = part.state
  if (!state) return 1

  if (typeof state.output === "string") return approximateTokens(state.output)
  if (typeof state.error === "string") return approximateTokens(state.error)
  if (typeof state.raw === "string") return approximateTokens(state.raw)
  if (typeof state.title === "string") return approximateTokens(state.title)

  return 1
}

function partTokenEstimate(part) {
  switch (part.type) {
    case "text":
    case "reasoning":
      return approximateTokens(part.text)
    case "tool":
      return toolTokenEstimate(part)
    case "step-finish":
      return Math.max(1, part.tokens?.output ?? part.tokens?.total ?? 1)
    case "patch":
      return Math.max(1, (part.files?.length ?? 1) * 20)
    case "retry":
      return approximateTokens(part.error?.data?.message)
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

function renderTokens(messages, session) {
  const totals = tokenTotals(messages, session)
  const input = formatNumber(totals.input)
  const output = formatNumber(totals.output)
  const cache = formatNumber(totals.cache)

  const chunks = []
  if (input || output) chunks.push(`in ${input ?? "0"} / out ${output ?? "0"}`)
  if (cache) chunks.push(`cache ${cache}`)

  return chunks.join(" / ")
}

function visibleLength(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "").length
}

export function buildPulseLine(input) {
  const view = buildPulseView(input)
  const blockText = view.blocks.map((block) => colorize(block.glyph, block.kind, view.color)).join("")

  if (!blockText) return view.tokenText
  if (!view.tokenText || input.width < view.blocks.length + view.tokenText.length + 2) return blockText

  return `${blockText}  ${view.tokenText}`
}

export function buildPulseView(input) {
  const blocks = collectAssistantParts(input.messages, input.partForMessage)
  const busy = isBusy(input.status)
  const color = input.color !== false
  const totals = tokenTotals(input.messages, input.session)

  if (blocks.length === 0) {
    const tokens = totals.output || totals.input || totals.cache
    if (tokens > 0) {
      const tokenText = renderTokens(input.messages, input.session)
      return {
        blocks: renderBlockSegments([{ kind: "success", height: heightIndex(tokens) }], busy, input.tick, Math.max(input.width, MIN_BLOCK_WIDTH)),
        tokenText,
        color,
      }
    }

    return {
      blocks: busy ? [{ kind: "other", glyph: "●", color: COLOR_BY_KIND.other.tui }] : [],
      tokenText: busy ? "busy" : "",
      color,
    }
  }

  const tokenText = renderTokens(input.messages, input.session)
  const availableWidth = Math.max(0, input.width - (tokenText ? tokenText.length + 2 : 0))
  const pulseBlocks = renderBlockSegments(blocks, busy, input.tick, availableWidth)

  return { blocks: pulseBlocks, tokenText, color }
}

export const __testing = {
  collectAssistantParts,
  formatNumber,
  heightIndex,
  partKind,
  partTokenEstimate,
  renderBlockSegments,
  renderBlocks,
  visibleLength,
}
