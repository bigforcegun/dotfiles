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
  assert.equal(view.statusText, expected.join(" / "))
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
  assert.equal(line.length, workWidth)
  const visibleStatus = statusText.slice(Math.max(0, statusText.length - workWidth))
  assert.equal(line.indexOf(visibleStatus), workWidth - visibleStatus.length)
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
        assert.equal(id, sessionID)
        return { id: sessionID, tokens: { input: 18_120, output: 2_140, reasoning: 300, cache: { read: 9_100, write: 0 } } }
      },
      messages(id) {
        assert.equal(id, sessionID)
        return messages
      },
      status(id) {
        assert.equal(id, sessionID)
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

const slotOutput = renderForSession(api, sessionID, 0)
assert.match(slotOutput, /↓ 18k \/ ↑ 2\.1k/)
assert.match(slotOutput, /◇ 9\.1k/)
assert.match(slotOutput, /\u001b\[38;5;141m▁\u001b\[0m/)
assert.match(slotOutput, /\u001b\[38;5;75m▄\u001b\[0m/)
assert.match(slotOutput, /\u001b\[38;5;214m▁\u001b\[0m/)
assert.match(slotOutput, /\u001b\[38;5;114m▇\u001b\[0m/)
assert.equal(stripAnsi(slotOutput).startsWith("▁▄▁▇"), true)
assert.equal(intervals.length, 0)

const directOutput = renderForSession(api, sessionID, 0)
assert.equal(directOutput, slotOutput)

const normalView = buildViewForApi(api)
assertSplitViewAliases(normalView)
assert.equal(normalView.pulseBlocks.length, 4)
assert.match(normalView.statusText, /↓ 18k \/ ↑ 2\.1k/)
assert.match(normalView.statusText, /◇ 9\.1k/)
assert.deepEqual(normalView.statusWidgets.map((widget) => widget.id), ["input", "output", "cache", "toolCount", "toolAverage", "toolTotal", "toolResults", "thinking", "answer"])
assert.deepEqual(normalView.statusWidgets.map((widget) => widget.label), ["↓", "↑", "◇", "🔧", "⏱", "⌛", "📦", "🧠", "💬"])
assertStatusWidgetTexts(normalView, ["↓ 18k", "↑ 2.1k", "◇ 9.1k", "🔧 2", "⏱ 1ms", "⌛ 1ms", "📦 225", "🧠 300", "💬 2.1k"])
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
      { id: "metric_text", sessionID, messageID: "metric_assistant", type: "text", text: "visible answer" },
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
assert.deepEqual(metricSnapshot.exact, { input: 40, output: 100, cache: 8, cacheRead: 5, cacheWrite: 3, reasoning: 7, tps: 50 })
assert.deepEqual(metricSnapshot.tools, { count: 3, totalMs: 1_500, averageMs: 500 })
assert.deepEqual(metricSnapshot.categories, { system: 1, user: 2, context: 3, schema: 0, toolResults: 2, thinking: 7, answer: 100 })

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
assert.equal(wideMetrics.statusWidth, normalView.statusText.length)
assert.equal(wideMetrics.gapWidth, 2)
assert.equal(wideMetrics.pulseWidth, 120 - normalView.statusText.length - 2)
assert.equal(wideMetrics.justifyContent, "flex-start")
assert.equal(wideMetrics.paddingLeft, 0)
assertStatusRightPinned(tuiTesting.renderSplitLine({ pulseText: "abcd", statusText: normalView.statusText, metrics: wideMetrics }), normalView.statusText, wideMetrics.workWidth)

const leftMetrics = tuiTesting.computePulseLayoutMetrics({ viewportWidth: 120, layout: "left", statusText: normalView.statusText })
assert.equal(leftMetrics.workWidth, 60)
assert.equal(leftMetrics.pulseWidth, Math.max(0, 60 - normalView.statusText.length - 2))
assert.equal(leftMetrics.justifyContent, "flex-start")
assert.equal(leftMetrics.paddingLeft, 5)
assertStatusRightPinned(tuiTesting.renderSplitLine({ pulseText: "abcd", statusText: normalView.statusText, metrics: leftMetrics }), normalView.statusText, leftMetrics.workWidth)

const centerMetrics = tuiTesting.computePulseLayoutMetrics({ viewportWidth: 120, layout: "center", statusText: normalView.statusText })
assert.equal(centerMetrics.workWidth, 60)
assert.equal(centerMetrics.pulseWidth, Math.max(0, 60 - normalView.statusText.length - 2))
assert.equal(centerMetrics.justifyContent, "center")
assert.equal(centerMetrics.paddingLeft, 0)

const splitLine = tuiTesting.renderSplitLine({ pulseText: "abcd", statusText: normalView.statusText, metrics: centerMetrics })
assertStatusRightPinned(splitLine, normalView.statusText, centerMetrics.workWidth)

const narrowMetrics = tuiTesting.computePulseLayoutMetrics({ viewportWidth: normalView.statusText.length + 1, layout: "wide", statusText: normalView.statusText })
assert.equal(narrowMetrics.pulseWidth, 0)
assert.equal(narrowMetrics.statusWidth, normalView.statusText.length)
const crampedLine = tuiTesting.renderSplitLine({ pulseText: "abcd", statusText: normalView.statusText, metrics: narrowMetrics })
assert.equal(crampedLine.length, narrowMetrics.workWidth)
assertStatusRightPinned(crampedLine, normalView.statusText, narrowMetrics.workWidth)
assert.equal(tuiTesting.computeSplitSegments({ pulseText: "abcd", statusText: normalView.statusText, metrics: narrowMetrics }).pulseText, "")

const clippedMetrics = tuiTesting.computePulseLayoutMetrics({ viewportWidth: 12, layout: "wide", statusText: normalView.statusText })
const clippedLine = tuiTesting.renderSplitLine({ pulseText: "abcd", statusText: normalView.statusText, metrics: clippedMetrics })
assert.equal(clippedLine.length, clippedMetrics.workWidth)
assert.equal(clippedLine, normalView.statusText.slice(-clippedMetrics.workWidth))
assert.equal(tuiTesting.computeSplitSegments({ pulseText: "abcd", statusText: normalView.statusText, metrics: clippedMetrics }).pulseText, "")

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
assert.match(exportShapeOutput, /↓ 18k \/ ↑ 2\.1k/)
assert.equal(stripAnsi(exportShapeOutput).startsWith("▁▄▁▇"), true)

const tokenOnlyApi = {
  ...api,
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
assert.match(tokenOnlyOutput, /↓ 18k \/ ↑ 2\.1k/)
assert.equal(/[▁▂▃▄▅▆▇█]/.test(stripAnsi(tokenOnlyOutput)), true)

const tokenOnlyView = buildViewForApi(tokenOnlyApi)
assertSplitViewAliases(tokenOnlyView)
assert.equal(tokenOnlyView.pulseBlocks.length, 1)
assert.match(tokenOnlyView.statusText, /↓ 18k \/ ↑ 2\.1k/)

const sessionTokenOnlyApi = {
  ...api,
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
assert.match(sessionTokenOnlyOutput, /↓ 18k \/ ↑ 2\.1k/)
assert.equal(/[▁▂▃▄▅▆▇█]/.test(stripAnsi(sessionTokenOnlyOutput)), true)

const sessionTokenOnlyView = buildViewForApi(sessionTokenOnlyApi)
assertSplitViewAliases(sessionTokenOnlyView)
assert.equal(sessionTokenOnlyView.pulseBlocks.length, 1)
assert.match(sessionTokenOnlyView.statusText, /↓ 18k \/ ↑ 2\.1k/)

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
assertStatusWidgetTexts(outputOnlyView, ["↓ 0", "↑ 2.1k", "💬 2.1k"])

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
assertStatusWidgetTexts(cacheOnlyView, ["◇ 9.1k"])

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
assertStatusWidgetTexts(busyOnlyView, ["busy"])

const narrowStatusApi = { ...api, renderer: { ...api.renderer, width: 10 } }
const narrowStatusView = buildViewForApi(narrowStatusApi, 10)
assertSplitViewAliases(narrowStatusView)
assert.equal(narrowStatusView.pulseBlocks.length, 1)
assert.match(narrowStatusView.statusText, /↓ 18k \/ ↑ 2\.1k/)

disposeEvents[0].handler({ type: disposeEvents[0].eventName, properties: { sessionID: "ses_other" } })
assert.equal(renderRequests, 0)

disposeEvents[1].handler({ type: disposeEvents[1].eventName, properties: { info: { sessionID: "ses_other" } } })
assert.equal(renderRequests, 0)

disposeEvents[0].handler({ type: disposeEvents[0].eventName, properties: { sessionID } })
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
assert.equal(tuiTesting.computeCurrentPulseLayoutMetrics({ viewportWidth: 20, statusText: "" }).workWidth, 10)
layoutCommand.run()
assert.equal(renderRequests, 3)
assert.equal(tuiTesting.currentLayout(), "center")
assert.equal(tuiTesting.computeCurrentPulseLayoutMetrics({ viewportWidth: 20, statusText: "" }).workWidth, 10)
layoutCommand.run()
assert.equal(renderRequests, 4)
assert.equal(tuiTesting.currentLayout(), "wide")
assert.equal(tuiTesting.computeCurrentPulseLayoutMetrics({ viewportWidth: 20, statusText: "" }).workWidth, 20)

let metricCacheRenderRequests = 0
const metricCache = tuiTesting.createMetricCache(api, () => {
  metricCacheRenderRequests += 1
})
const cachedSnapshot = metricCache.snapshot(sessionID)
assert.equal(cachedSnapshot.exact.input, 18_120)
assert.equal(cachedSnapshot.tools.count, 2)
assert.equal(metricCache.sessionMetricCache.has(sessionID), true)
metricCache.markDirty(sessionID)
assert.equal(metricCache.dirtySessions.has(sessionID), true)
metricCache.removeSession(sessionID)
assert.equal(metricCache.sessionMetricCache.has(sessionID), false)
assert.equal(metricCache.dirtySessions.has(sessionID), false)
metricCache.dispose()
assert.equal(metricCacheRenderRequests, 0)

for (const dispose of lifecycleDisposers) dispose()
assert.equal(disposeEvents.every((event) => event.disposed), true)
assert.equal(intervals.every((interval) => interval.cleared), true)

globalThis.setInterval = originalSetInterval
globalThis.clearInterval = originalClearInterval

console.log(slotOutput)
