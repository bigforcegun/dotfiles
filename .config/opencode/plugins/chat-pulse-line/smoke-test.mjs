import assert from "node:assert/strict"
import { __testing as pulseTesting, buildPulseView } from "./pulse-line.js"
import plugin, { __testing as tuiTesting, renderForSession } from "./tui.js"

const sessionID = "ses_smoke"
const assistantID = "msg_assistant"
const messages = [
  { id: "msg_user", sessionID, role: "user" },
  {
    id: assistantID,
    sessionID,
    role: "assistant",
    tokens: { input: 18_120, output: 2_140, reasoning: 300, cache: { read: 9_100, write: 0 } },
  },
]
const parts = new Map([
  [assistantID, [
    { id: "p1", sessionID, messageID: assistantID, type: "reasoning", text: "thinking", time: { start: 1 } },
    { id: "p2", sessionID, messageID: assistantID, type: "tool", tool: "read", state: { status: "completed", input: {}, output: "x".repeat(900), title: "read", metadata: {}, time: { start: 2, end: 3 } } },
    { id: "p3", sessionID, messageID: assistantID, type: "tool", tool: "apply_patch", state: { status: "running", input: {}, title: "patch", metadata: {}, time: { start: 4 } } },
    { id: "p4", sessionID, messageID: assistantID, type: "step-finish", reason: "stop", cost: 0, tokens: { input: 1, output: 1_200, reasoning: 0, cache: { read: 0, write: 0 } } },
  ]],
])

const disposeEvents = []
const lifecycleDisposers = []
const registered = []
const keymapLayers = []
const intervals = []
let renderRequests = 0

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "")
}

function assertSplitViewAliases(view) {
  assert.equal(view.pulseBlocks, view.blocks)
  assert.equal(view.statusText, view.tokenText)
}

function assertStatusWidgetTexts(view, expected) {
  assert.deepEqual(view.statusWidgets.map((widget) => widget.text), expected)
  const groups = []
  let currentGroup
  for (const widget of view.statusWidgets) {
    if (!currentGroup || currentGroup.name !== widget.group) {
      currentGroup = { name: widget.group, widgets: [] }
      groups.push(currentGroup)
    }
    currentGroup.widgets.push(widget)
  }
  assert.equal(view.statusText, groups.map((group) => group.widgets.map((widget) => widget.text).join(" | ")).join(" ▌ "))
}

function buildStatusViewForApi(targetApi) {
  return pulseTesting.buildStatusView({
    messages: targetApi.state.session.messages(sessionID),
    session: targetApi.state.session.get(sessionID),
    status: targetApi.state.session.status(sessionID),
    partForMessage(messageID) {
      return targetApi.state.part(messageID)
    },
  })
}

function assertStatusRightPinned(line, statusText, workWidth) {
  assert.equal(tuiTesting.terminalWidth(line), workWidth)
  if (statusText) assert.equal(line.endsWith(Array.from(statusText).at(-1)), true)
}

const originalSetInterval = globalThis.setInterval
const originalClearInterval = globalThis.clearInterval
globalThis.setInterval = (callback, delay) => {
  const interval = { callback, delay, cleared: false }
  intervals.push(interval)
  return interval
}
globalThis.clearInterval = (interval) => {
  interval.cleared = true
}

const api = {
  renderer: {
    width: 120,
    requestRender() {
      renderRequests += 1
    },
  },
  route: { current: { name: "session", params: { sessionID } } },
  state: {
    session: {
      get(id) {
        if (id !== sessionID) return { id }
        return { id: sessionID, tokens: { input: 18_120, output: 2_140, reasoning: 300, cache: { read: 9_100, write: 0 } } }
      },
      messages(id) {
        if (id !== sessionID) return []
        return messages
      },
      status(id) {
        if (id !== sessionID) return { type: "idle" }
        return { type: "busy" }
      },
    },
    part(messageID) {
      return parts.get(messageID) ?? []
    },
  },
  slots: {
    register(registration) {
      registered.push(registration)
      return "slot-smoke"
    },
  },
  keymap: {
    registerLayer(layer) {
      keymapLayers.push(layer)
      return () => {}
    },
  },
  event: {
    on(eventName, handler) {
      disposeEvents.push({ eventName, handler, disposed: false })
      return () => {
        const event = disposeEvents.find((candidate) => candidate.eventName === eventName)
        if (event) event.disposed = true
      }
    },
  },
  lifecycle: {
    onDispose(dispose) {
      lifecycleDisposers.push(dispose)
      return () => {}
    },
  },
}

function buildViewForApi(targetApi, width = targetApi.renderer.width) {
  return buildPulseView({
    messages: targetApi.state.session.messages(sessionID),
    session: targetApi.state.session.get(sessionID),
    status: targetApi.state.session.status(sessionID),
    tick: 0,
    width,
    partForMessage(messageID) {
      return targetApi.state.part(messageID)
    },
  })
}

await plugin.tui(api)

assert.equal(registered.length, 1)
assert.equal(registered[0].order, 100_000)
assert.equal(typeof registered[0].slots.app_bottom, "function")
assert.equal(keymapLayers.length, 1)
assert.equal(keymapLayers[0].priority, 1_000)
assert.deepEqual(keymapLayers[0].bindings, [
  { key: "ctrl+g", cmd: "chat_pulse_line.layout_cycle", desc: "Cycle pulse layout" },
  { key: "alt+g", cmd: "chat_pulse_line.layout_cycle", desc: "Cycle pulse layout" },
])
assert.equal(keymapLayers[0].commands[0].name, "chat_pulse_line.layout_cycle")
assert.equal(disposeEvents.length, 8)
assert.ok(disposeEvents.some((event) => event.eventName === "message.removed"))

const wideRenderApi = { ...api, renderer: { ...api.renderer, width: 240 } }
const slotOutput = renderForSession(wideRenderApi, sessionID, 0)
assert.match(slotOutput, /↓ 18k \| ↑ 2\.1k/)
assert.match(slotOutput, /◇ 9\.1k/)
assert.match(slotOutput, /\u001b\[38;5;141m▁\u001b\[0m/)
assert.match(slotOutput, /\u001b\[38;5;75m▄\u001b\[0m/)
assert.match(slotOutput, /\u001b\[38;5;214m▁\u001b\[0m/)
assert.match(slotOutput, /\u001b\[38;5;114m▇\u001b\[0m/)
assert.equal(stripAnsi(slotOutput).startsWith("▁▄▁▇"), true)
assert.equal(intervals.length, 0)

const directOutput = renderForSession(wideRenderApi, sessionID, 0)
assert.equal(directOutput, slotOutput)

const normalView = buildViewForApi(wideRenderApi, 240)
assertSplitViewAliases(normalView)
assert.equal(normalView.pulseBlocks.length, 4)
assert.match(normalView.statusText, /↓ 18k \| ↑ 2\.1k/)
assert.match(normalView.statusText, /◇ 9\.1k/)
assert.deepEqual(normalView.statusWidgets.map((widget) => widget.id), ["input", "output", "cache", "tps", "streamTps", "turnTotal", "chatTotal", "toolCount", "toolAverage", "toolTotal", "user", "assistant", "toolResults"])
assert.deepEqual(normalView.statusWidgets.map((widget) => widget.label), ["↓", "↑", "◇", "⚡", "↯", "🖨️ ", "Σ", "🔧", "⏱", "⌛", "👤", "🖨️ ", "🧰"])
assertStatusWidgetTexts(normalView, ["↓ 18k", "↑ 2.1k", "◇ 9.1k", "⚡ 00.00", "↯ 00.00", "🖨️  ?", "Σ 00:00", "🔧 2", "⏱ 00.00s", "⌛ 00:00", "👤 0", "🖨️  0", "🧰 225"])
assert.equal(normalView.metricSnapshot.exact.output, 2_140)
assert.equal(normalView.metricSnapshot.tools.count, 2)
const statusViewForApi = buildStatusViewForApi(api)
assert.deepEqual(statusViewForApi.widgets, normalView.statusWidgets)
assert.equal(statusViewForApi.text, normalView.statusText)

assert.equal(pulseTesting.approximateTokens("abcdé"), 2)
assert.equal(pulseTesting.approximateTokens(""), 0)

const metricFixtureMessages = [
  {
    info: { id: "metric_user", sessionID, role: "user", system: "abcd" },
    parts: [{ id: "metric_user_text", sessionID, messageID: "metric_user", type: "text", text: "abcdefgh" }],
  },
  {
    info: {
      id: "metric_assistant",
      sessionID,
      role: "assistant",
      time: { created: 1_000, completed: 3_000 },
      tokens: { input: 40, output: 100, reasoning: 7, cache: { read: 5, write: 3 } },
    },
    parts: [
      { id: "metric_reason", sessionID, messageID: "metric_assistant", type: "reasoning", text: "hidden" },
      { id: "metric_text", sessionID, messageID: "metric_assistant", type: "text", text: "visible answer", time: { start: 1_000, end: 2_000 } },
      { id: "metric_tool_done", sessionID, messageID: "metric_assistant", type: "tool", tool: "read", state: { status: "completed", input: {}, output: "abcdefgh", time: { start: 1_000, end: 2_000 } } },
      { id: "metric_tool_running", sessionID, messageID: "metric_assistant", type: "tool", tool: "write", state: { status: "running", input: {}, time: { start: 2_000 } } },
      { id: "metric_tool_bad", sessionID, messageID: "metric_assistant", type: "tool", tool: "read", state: { status: "completed", input: {}, output: "", time: { start: 5, end: 1 } } },
    ],
  },
]
const metricSnapshot = pulseTesting.buildPulseMetrics({
  messages: metricFixtureMessages,
  status: { type: "busy" },
  now: 2_500,
  partForMessage() {
    return []
  },
})
assert.deepEqual(metricSnapshot.exact, { input: 40, output: 100, cache: 8, cacheRead: 5, cacheWrite: 3, reasoning: 7, tps: 50, tpsLoading: false, streamTps: 4 })
assert.deepEqual(metricSnapshot.tools, { count: 3, totalMs: 1_500, averageMs: 500 })
assert.deepEqual(metricSnapshot.segments, { system: 1, user: 2, assistant: 4, toolResults: 2 })
const streamStatus = pulseTesting.buildStatusView({ messages: metricFixtureMessages, status: { type: "idle" }, now: 2_500, partForMessage() { return [] } })
assert.ok(streamStatus.text.includes("⚡ 50.00"))
assert.ok(streamStatus.text.includes("↯ 04.00"))

const lifetimeToolSnapshot = pulseTesting.buildPulseMetrics({
  messages: [
    {
      id: "first_tool_assistant",
      sessionID,
      role: "assistant",
      parts: [{ id: "first_tool", sessionID, messageID: "first_tool_assistant", type: "tool", tool: "read", state: { status: "completed", input: {}, output: "a", time: { start: 1, end: 2 } } }],
    },
    {
      id: "second_tool_assistant",
      sessionID,
      role: "assistant",
      parts: [
        { id: "second_tool", sessionID, messageID: "second_tool_assistant", type: "tool", tool: "write", state: { status: "completed", input: {}, output: "b", time: { start: 3, end: 4 } } },
        { id: "live_tool", sessionID, messageID: "second_tool_assistant", type: "tool", tool: "bash", state: { status: "running", input: {}, time: { start: 10 } } },
      ],
    },
  ],
  status: { type: "busy" },
  now: 15,
  partForMessage() {
    return []
  },
})
assert.equal(lifetimeToolSnapshot.tools.count, 3)
assert.equal(lifetimeToolSnapshot.tools.totalMs, 7)
assert.equal(lifetimeToolSnapshot.tools.averageMs, 7 / 3)

const pendingDurationSnapshot = pulseTesting.buildPulseMetrics({
  messages: [{
    id: "pending_assistant",
    sessionID,
    role: "assistant",
    parts: [{ id: "pending_tool", sessionID, messageID: "pending_assistant", type: "tool", tool: "read", state: { status: "pending", input: {}, time: { start: 1, end: 10 } } }],
  }],
  status: { type: "busy" },
  now: 20,
  partForMessage() {
    return []
  },
})
assert.equal(pendingDurationSnapshot.tools.totalMs, 0)
assert.equal(pendingDurationSnapshot.tools.averageMs, 0)

const idleRunningDurationSnapshot = pulseTesting.buildPulseMetrics({
  messages: [{
    id: "idle_running_assistant",
    sessionID,
    role: "assistant",
    parts: [{ id: "idle_running_tool", sessionID, messageID: "idle_running_assistant", type: "tool", tool: "read", state: { status: "running", input: {}, time: { start: 1 } } }],
  }],
  status: { type: "idle" },
  now: 20,
  partForMessage() {
    return []
  },
})
assert.equal(idleRunningDurationSnapshot.tools.totalMs, 0)
assert.equal(idleRunningDurationSnapshot.tools.averageMs, 0)

const errorDurationSnapshot = pulseTesting.buildPulseMetrics({
  messages: [{
    id: "error_assistant",
    sessionID,
    role: "assistant",
    parts: [{ id: "error_tool", sessionID, messageID: "error_assistant", type: "tool", tool: "read", state: { status: "error", input: {}, time: { start: 3, end: 13 } } }],
  }],
  status: { type: "idle" },
  partForMessage() {
    return []
  },
})
assert.equal(errorDurationSnapshot.tools.totalMs, 10)
assert.equal(errorDurationSnapshot.tools.averageMs, 10)

const cappedText = "x".repeat(pulseTesting.MAX_ESTIMATE_CHARS + 100)
assert.equal(pulseTesting.approximateTokens(cappedText), Math.ceil(pulseTesting.MAX_ESTIMATE_CHARS / 4))

const noTpsSnapshot = pulseTesting.buildPulseMetrics({
  messages: [{ id: "bad_time", sessionID, role: "assistant", time: { created: 3_000, completed: 1_000 }, tokens: { output: 100, cache: {} } }],
  status: { type: "idle" },
  partForMessage() {
    return []
  },
})
assert.equal(noTpsSnapshot.exact.tps, undefined)

const wideMetrics = tuiTesting.computePulseLayoutMetrics({ viewportWidth: 120, layout: "wide", statusText: normalView.statusText })
assert.equal(wideMetrics.workWidth, 120)
assert.equal(wideMetrics.statusWidth, Math.min(tuiTesting.terminalWidth(normalView.statusText), wideMetrics.workWidth - 2))
assert.equal(wideMetrics.gapWidth, 2)
assert.equal(wideMetrics.pulseWidth, wideMetrics.workWidth - wideMetrics.statusWidth - wideMetrics.gapWidth)
assert.equal(wideMetrics.justifyContent, "flex-start")
assert.equal(wideMetrics.paddingLeft, 0)
assertStatusRightPinned(tuiTesting.renderSplitLine({ pulseText: "abcd", statusText: normalView.statusText, metrics: wideMetrics }), normalView.statusText, wideMetrics.workWidth)

const leftMetrics = tuiTesting.computePulseLayoutMetrics({ viewportWidth: 120, layout: "left", statusText: normalView.statusText })
assert.equal(leftMetrics.workWidth, 120)
assert.equal(leftMetrics.pulseWidth, wideMetrics.pulseWidth)
assert.equal(leftMetrics.justifyContent, "flex-start")
assert.equal(leftMetrics.paddingLeft, 0)
assertStatusRightPinned(tuiTesting.renderSplitLine({ pulseText: "abcd", statusText: normalView.statusText, metrics: leftMetrics }), normalView.statusText, leftMetrics.workWidth)

const centerMetrics = tuiTesting.computePulseLayoutMetrics({ viewportWidth: 120, layout: "center", statusText: normalView.statusText })
assert.equal(centerMetrics.workWidth, 120)
assert.equal(centerMetrics.pulseWidth, wideMetrics.pulseWidth)
assert.equal(centerMetrics.justifyContent, "flex-start")
assert.equal(centerMetrics.paddingLeft, 0)

const splitLine = tuiTesting.renderSplitLine({ pulseText: "abcd", statusText: normalView.statusText, metrics: centerMetrics })
assertStatusRightPinned(splitLine, normalView.statusText, centerMetrics.workWidth)

const narrowMetrics = tuiTesting.computePulseLayoutMetrics({ viewportWidth: tuiTesting.terminalWidth(normalView.statusText) + 1, layout: "wide", statusText: normalView.statusText })
assert.equal(narrowMetrics.pulseWidth, 0)
assert.equal(narrowMetrics.statusWidth, tuiTesting.terminalWidth(normalView.statusText) - 1)
const crampedLine = tuiTesting.renderSplitLine({ pulseText: "abcd", statusText: normalView.statusText, metrics: narrowMetrics })
assert.equal(tuiTesting.terminalWidth(crampedLine), narrowMetrics.workWidth)
assertStatusRightPinned(crampedLine, normalView.statusText, narrowMetrics.workWidth)
assert.equal(tuiTesting.computeSplitSegments({ pulseText: "abcd", statusText: normalView.statusText, metrics: narrowMetrics }).pulseText, "")

const clippedMetrics = tuiTesting.computePulseLayoutMetrics({ viewportWidth: 12, layout: "wide", statusText: normalView.statusText })
const clippedLine = tuiTesting.renderSplitLine({ pulseText: "abcd", statusText: normalView.statusText, metrics: clippedMetrics })
assert.equal(tuiTesting.terminalWidth(clippedLine), clippedMetrics.workWidth)
assertStatusRightPinned(clippedLine, normalView.statusText, clippedMetrics.workWidth)
assert.equal(tuiTesting.computeSplitSegments({ pulseText: "abcd", statusText: normalView.statusText, metrics: clippedMetrics }).pulseText, "")

const restoredLongStatus = "↓ 907k | ↑ 63k | ◇ 25.4m ▌ ⚡ 00.00 | ↯ 00.00"
const restoredPulseMetrics = tuiTesting.computePulseLayoutMetrics({ viewportWidth: 120, layout: "wide", statusText: restoredLongStatus, hasPulse: true })
assert.equal(restoredPulseMetrics.workWidth, 120)
assert.equal(restoredPulseMetrics.pulseWidth > 0, true)
assert.equal(tuiTesting.computeSplitSegments({ pulseText: "▇", statusText: restoredLongStatus, metrics: restoredPulseMetrics }).pulseText, "▇")

const exportShapeMessages = [
  { info: { id: "msg_user_export", sessionID, role: "user" }, parts: [] },
  {
    info: {
      id: assistantID,
      sessionID,
      role: "assistant",
      tokens: { input: 18_120, output: 2_140, reasoning: 300, cache: { read: 9_100, write: 0 } },
    },
    parts: parts.get(assistantID),
  },
]
const exportShapeApi = {
  ...api,
  renderer: { ...api.renderer, width: 240 },
  state: {
    ...api.state,
    session: {
      ...api.state.session,
      messages() {
        return exportShapeMessages
      },
    },
  },
}
const exportShapeOutput = renderForSession(exportShapeApi, sessionID, 0)
assert.match(exportShapeOutput, /↓ 18k \| ↑ 2\.1k/)
assert.equal(stripAnsi(exportShapeOutput).startsWith("▁▄▁▇"), true)

const tokenOnlyApi = {
  ...api,
  renderer: { ...api.renderer, width: 240 },
  state: {
    ...api.state,
    session: {
      ...api.state.session,
      messages() {
        return [{ id: assistantID, sessionID, role: "assistant", tokens: { input: 18_120, output: 2_140, cache: { read: 9_100, write: 0 } } }]
      },
    },
    part() {
      return []
    },
  },
}
const tokenOnlyOutput = renderForSession(tokenOnlyApi, sessionID, 0)
assert.match(tokenOnlyOutput, /↓ 18k \| ↑ 2\.1k/)
assert.equal(/[▁▂▃▄▅▆▇█]/.test(stripAnsi(tokenOnlyOutput)), true)

const tokenOnlyView = buildViewForApi(tokenOnlyApi)
assertSplitViewAliases(tokenOnlyView)
assert.equal(tokenOnlyView.pulseBlocks.length, 1)
assert.match(tokenOnlyView.statusText, /↓ 18k \| ↑ 2\.1k/)

const sessionTokenOnlyApi = {
  ...api,
  renderer: { ...api.renderer, width: 240 },
  state: {
    ...api.state,
    session: {
      ...api.state.session,
      get() {
        return { id: sessionID, tokens: { input: 18_120, output: 2_140, cache: { read: 9_100, write: 0 } } }
      },
      messages() {
        return []
      },
    },
  },
}
const sessionTokenOnlyOutput = renderForSession(sessionTokenOnlyApi, sessionID, 0)
assert.match(sessionTokenOnlyOutput, /↓ 18k \| ↑ 2\.1k/)
assert.equal(/[▁▂▃▄▅▆▇█]/.test(stripAnsi(sessionTokenOnlyOutput)), true)

const sessionTokenOnlyView = buildViewForApi(sessionTokenOnlyApi)
assertSplitViewAliases(sessionTokenOnlyView)
assert.equal(sessionTokenOnlyView.pulseBlocks.length, 1)
assert.match(sessionTokenOnlyView.statusText, /↓ 18k \| ↑ 2\.1k/)

const outputOnlyApi = {
  ...api,
  state: {
    ...api.state,
    session: {
      ...api.state.session,
      get() {
        return { id: sessionID, tokens: { output: 2_140 } }
      },
      messages() {
        return []
      },
      status() {
        return { type: "idle" }
      },
    },
  },
}
const outputOnlyView = buildViewForApi(outputOnlyApi)
assertStatusWidgetTexts(outputOnlyView, ["↓ ?", "↑ 2.1k", "◇ ?", "⚡ 00.00", "↯ 00.00", "🏁 ?", "Σ 00:00", "🔧 0", "⏱ ?", "⌛ 00:00"])

const cacheOnlyApi = {
  ...api,
  state: {
    ...api.state,
    session: {
      ...api.state.session,
      get() {
        return { id: sessionID, tokens: { cache: { read: 9_100, write: 0 } } }
      },
      messages() {
        return []
      },
      status() {
        return { type: "idle" }
      },
    },
  },
}
const cacheOnlyView = buildViewForApi(cacheOnlyApi)
assertStatusWidgetTexts(cacheOnlyView, ["↓ ?", "↑ ?", "◇ 9.1k", "⚡ 00.00", "↯ 00.00", "🏁 ?", "Σ 00:00", "🔧 0", "⏱ ?", "⌛ 00:00"])

const busyOnlyApi = {
  ...api,
  state: {
    ...api.state,
    session: {
      ...api.state.session,
      get() {
        return { id: sessionID }
      },
      messages() {
        return []
      },
      status() {
        return { type: "busy" }
      },
    },
  },
}
const busyOnlyView = buildViewForApi(busyOnlyApi)
assertStatusWidgetTexts(busyOnlyView, ["⚡ 00.00", "↯ 00.00"])

const narrowStatusApi = { ...api, renderer: { ...api.renderer, width: 10 } }
const narrowStatusView = buildViewForApi(narrowStatusApi, 10)
assertSplitViewAliases(narrowStatusView)
assert.equal(narrowStatusView.pulseBlocks.length, 1)
assert.match(narrowStatusView.statusText, /↓ 18k \| ↑ 2\.1k/)

disposeEvents[0].handler({ type: disposeEvents[0].eventName, properties: { sessionID: "ses_other" } })
assert.equal(renderRequests, 0)

disposeEvents[1].handler({ type: disposeEvents[1].eventName, properties: { info: { sessionID: "ses_other" } } })
assert.equal(renderRequests, 0)

disposeEvents[0].handler({ type: disposeEvents[0].eventName, properties: { sessionID } })
assert.equal(renderRequests, 1)
await new Promise((resolve) => setTimeout(resolve, 360))
assert.equal(renderRequests, 1)

const manyParts = Array.from({ length: 24 }, (_, index) => ({
  id: `layout_${index}`,
  sessionID,
  messageID: assistantID,
  type: index % 2 === 0 ? "reasoning" : "tool",
  text: "x",
  tool: index % 2 === 0 ? undefined : "read",
  state: index % 2 === 0 ? undefined : { status: "completed", output: "x" },
}))
const narrowApi = {
  ...api,
  renderer: { ...api.renderer, width: 20 },
  state: {
    ...api.state,
    session: {
      ...api.state.session,
      get() {
        return { id: sessionID }
      },
      messages() {
        return [{ id: assistantID, sessionID, role: "assistant" }]
      },
      status() {
        return { type: "idle" }
      },
    },
    part() {
      return manyParts
    },
  },
}
const layoutCommand = keymapLayers[0].commands[0]
assert.equal(tuiTesting.currentLayout(), "wide")
assert.equal(tuiTesting.computeCurrentPulseLayoutMetrics({ viewportWidth: 20, statusText: "" }).workWidth, 20)
layoutCommand.run()
assert.equal(renderRequests, 2)
assert.equal(tuiTesting.currentLayout(), "left")
assert.equal(tuiTesting.computeCurrentPulseLayoutMetrics({ viewportWidth: 20, statusText: "" }).workWidth, 20)
layoutCommand.run()
assert.equal(renderRequests, 3)
assert.equal(tuiTesting.currentLayout(), "center")
assert.equal(tuiTesting.computeCurrentPulseLayoutMetrics({ viewportWidth: 20, statusText: "" }).workWidth, 20)
layoutCommand.run()
assert.equal(renderRequests, 4)
assert.equal(tuiTesting.currentLayout(), "wide")
assert.equal(tuiTesting.computeCurrentPulseLayoutMetrics({ viewportWidth: 20, statusText: "" }).workWidth, 20)

for (const dispose of lifecycleDisposers) dispose()
assert.equal(disposeEvents.every((event) => event.disposed), true)
assert.equal(intervals.every((interval) => interval.cleared), true)

globalThis.setInterval = originalSetInterval
globalThis.clearInterval = originalClearInterval

console.log(slotOutput)
