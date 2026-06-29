import { createComponent, createElement, insert, setProp } from "@opentui/solid"
import { createEffect, createRoot, createSignal } from "solid-js"
import { buildPulseLine, buildPulseView } from "./pulse-line.js"

const DEFAULT_WIDTH = 48
const SLOT_ORDER = 100_000
const PULSE_ROW_LAYOUT = "wide"
const PULSE_ROW_LAYOUTS = ["wide", "left", "center"]
const PULSE_ROW_LEFT_PADDING = 5
const PULSE_ROW_PADDING_BOTTOM = 0
const CYCLE_LAYOUT_COMMAND = "chat_pulse_line.layout_cycle"
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

function renderViewForSession(api, sessionID, tick) {
  return buildPulseView({
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

function themeTextColor(api) {
  return api.theme?.current?.text
}

function PulseText(props) {
  const element = createElement("text")
  setProp(element, "selectable", false)

  for (const block of props.view.blocks) {
    appendText(element, block.glyph, block.color)
  }

  if (props.view.blocks.length > 0 && props.view.tokenText) appendText(element, "  ", props.textColor)
  appendText(element, props.view.tokenText, props.textColor)

  return element
}

function PulseRow(props) {
  const element = createElement("box")
  setProp(element, "width", "100%")
  setProp(element, "flexDirection", "row")
  setProp(element, "paddingBottom", PULSE_ROW_PADDING_BOTTOM)
  createEffect(() => {
    const layout = pulseRowLayout()
    setProp(element, "justifyContent", layout === "center" ? "center" : "flex-start")
    setProp(element, "paddingLeft", layout === "left" ? PULSE_ROW_LEFT_PADDING : 0)
  })
  insert(element, createComponent(PulseText, props))
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
        return createComponent(PulseRow, { view: renderViewForSession(api, sessionID, tick), textColor: themeTextColor(api) })
      },
    },
  })

  const disposers = RENDER_EVENTS.map((eventName) => api.event.on(eventName, (event) => {
    if (!isEventForCurrentSession(api, event)) return
    syncPulseTimer()
    requestRender(api)
  }))

  api.lifecycle.onDispose(() => {
    stopPulseTimer()
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
export { renderForSession }
