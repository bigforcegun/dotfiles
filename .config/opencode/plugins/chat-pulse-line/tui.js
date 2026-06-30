import { createComponent, createElement, insert, setProp } from "@opentui/solid"
import { createRoot, createSignal } from "solid-js"
import { buildPulseLine, buildPulseMetrics, buildPulseView } from "./pulse-line.js"

const DEFAULT_WIDTH = 48
const SLOT_ORDER = 100_000
const PULSE_ROW_LAYOUT = "wide"
const PULSE_ROW_LAYOUTS = ["wide", "left", "center"]
const PULSE_ROW_LEFT_PADDING = 5
const PULSE_ROW_PADDING_BOTTOM = 0
const CYCLE_LAYOUT_COMMAND = "chat_pulse_line.layout_cycle"
const METRIC_DEBOUNCE_MS = 50
const METRIC_BATCH_SIZE = 8
const RENDER_THROTTLE_MS = 250
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
  return pulseRowLayout() === "wide" ? Math.max(0, Math.floor(width)) : Math.max(0, Math.floor(width / 2))
}

function viewportWidth(api) {
  const width = api.renderer?.width
  return Number.isFinite(width) ? Math.max(0, Math.floor(width)) : DEFAULT_WIDTH
}

function computePulseLayoutMetrics(input) {
  const viewportWidth = Number.isFinite(input.viewportWidth) ? Math.max(0, Math.floor(input.viewportWidth)) : DEFAULT_WIDTH
  const layout = PULSE_ROW_LAYOUTS.includes(input.layout) ? input.layout : PULSE_ROW_LAYOUT
  const workWidth = layout === "wide" ? viewportWidth : Math.floor(viewportWidth / 2)
  const statusWidth = Math.min(String(input.statusText ?? "").length, workWidth)
  const gapCapacity = Math.max(0, workWidth - statusWidth)
  const gapWidth = statusWidth > 0 ? Math.min(2, gapCapacity) : 0

  return {
    layout,
    viewportWidth,
    workWidth,
    statusWidth,
    gapWidth,
    pulseWidth: Math.max(0, workWidth - statusWidth - gapWidth),
    justifyContent: layout === "center" ? "center" : "flex-start",
    paddingLeft: layout === "left" ? PULSE_ROW_LEFT_PADDING : 0,
  }
}

function computeSplitSegments(input) {
  const pulseText = String(input.pulseText ?? "").slice(0, input.metrics.pulseWidth)
  const rawStatusText = String(input.statusText ?? "")
  const statusText = rawStatusText.slice(Math.max(0, rawStatusText.length - input.metrics.statusWidth))
  const prefixWidth = Math.max(0, input.metrics.workWidth - statusText.length)
  const pulseSlotWidth = Math.max(0, prefixWidth - input.metrics.gapWidth)
  const visiblePulseText = pulseText.slice(0, pulseSlotWidth)

  return {
    pulseText: visiblePulseText,
    pulsePadding: " ".repeat(Math.max(0, prefixWidth - visiblePulseText.length)),
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
  return status?.type === "busy" || status?.type === "retry"
}

function createMetricCache(api, requestRenderFn = requestRender) {
  const sessionMetricCache = new Map()
  const dirtySessions = new Set()
  let processTimer
  let renderTimer
  let disposed = false

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
    const metrics = buildPulseMetrics(metricInput(sessionID))
    sessionMetricCache.set(sessionID, metrics)
    return metrics
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
    const batch = Array.from(dirtySessions).slice(0, METRIC_BATCH_SIZE)
    for (const sessionID of batch) {
      dirtySessions.delete(sessionID)
      rebuildSession(sessionID)
    }
    if (batch.length > 0) throttledRender()
    if (dirtySessions.size > 0) schedule()
  }

  function schedule() {
    if (disposed || processTimer) return
    processTimer = setTimeout(processDirty, METRIC_DEBOUNCE_MS)
  }

  function markDirty(sessionID) {
    if (!sessionID || disposed) return
    dirtySessions.add(sessionID)
    schedule()
  }

  function removeSession(sessionID) {
    if (!sessionID) return
    dirtySessions.delete(sessionID)
    sessionMetricCache.delete(sessionID)
  }

  function snapshot(sessionID) {
    if (!sessionID) return undefined
    return sessionMetricCache.get(sessionID) ?? rebuildSession(sessionID)
  }

  function dispose() {
    disposed = true
    if (processTimer) clearTimeout(processTimer)
    if (renderTimer) clearTimeout(renderTimer)
    dirtySessions.clear()
    sessionMetricCache.clear()
  }

  return { markDirty, removeSession, snapshot, dispose, rebuildSession, dirtySessions, sessionMetricCache }
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

function pulseViewInput(api, sessionID, tick, width, pulseWidth, metrics) {
  return {
    messages: api.state.session.messages(sessionID),
    session: api.state.session.get(sessionID),
    status: api.state.session.status(sessionID),
    metrics,
    tick,
    width,
    pulseWidth,
    partForMessage(messageID) {
      return api.state.part(messageID)
    },
  }
}

function renderViewForSession(api, sessionID, tick, metricCache) {
  const layout = pulseRowLayout()
  const metricsSnapshot = metricCache?.snapshot(sessionID)
  const baseView = buildPulseView(pulseViewInput(api, sessionID, tick, rendererWidth(api), undefined, metricsSnapshot))
  const metrics = computePulseLayoutMetrics({ viewportWidth: viewportWidth(api), layout, statusText: baseView.statusText })
  const view = buildPulseView(pulseViewInput(api, sessionID, tick, metrics.workWidth, metrics.pulseWidth, metricsSnapshot))

  return { ...view, metrics }
}

function PulseLine(props) {
  const element = createElement("text")
  setProp(element, "selectable", false)
  setProp(element, "width", props.metrics.pulseWidth)
  setProp(element, "flexGrow", 0)
  setProp(element, "flexShrink", 0)
  const blocks = props.view.pulseBlocks.slice(0, props.metrics.pulseWidth)

  for (const block of blocks) {
    appendText(element, block.glyph, block.color)
  }

  return element
}

function GapLine(props) {
  const element = createElement("text")
  setProp(element, "selectable", false)
  setProp(element, "width", props.metrics.gapWidth)
  setProp(element, "flexGrow", 0)
  setProp(element, "flexShrink", 0)
  insert(element, " ".repeat(props.metrics.gapWidth))
  return element
}

function StatusLine(props) {
  const element = createElement("text")
  setProp(element, "selectable", false)
  setProp(element, "width", props.metrics.statusWidth)
  setProp(element, "flexGrow", 0)
  setProp(element, "flexShrink", 0)
  const segments = computeSplitSegments({ pulseText: "", statusText: props.view.statusText, metrics: props.metrics })
  appendText(element, segments.statusText, props.textColor)
  return element
}

function SplitText(props) {
  const element = createElement("box")
  setProp(element, "width", props.view.metrics.workWidth)
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
  const metricCache = createMetricCache(api)

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
        return createComponent(PulseRow, { view: renderViewForSession(api, sessionID, tick, metricCache), textColor: themeTextColor(api) })
      },
    },
  })

  const disposers = RENDER_EVENTS.map((eventName) => api.event.on(eventName, (event) => {
    if (!isEventForCurrentSession(api, event)) return
    const sessionID = eventSessionID(event)
    if (eventName === "message.removed") metricCache.removeSession(sessionID)
    else metricCache.markDirty(sessionID)
    syncPulseTimer()
    requestRender(api)
  }))

  api.lifecycle.onDispose(() => {
    stopPulseTimer()
    metricCache.dispose()
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
export const __testing = { computeCurrentPulseLayoutMetrics, computePulseLayoutMetrics, computeSplitSegments, createMetricCache, currentLayout, renderSplitLine }
export { renderForSession }
