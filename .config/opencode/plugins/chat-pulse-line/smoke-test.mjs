import assert from "node:assert/strict"
import plugin, { renderForSession } from "./tui.js"

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
assert.match(slotOutput, /in 18k \/ out 2\.1k/)
assert.match(slotOutput, /cache 9\.1k/)
assert.match(slotOutput, /\u001b\[38;5;141m▁\u001b\[0m/)
assert.match(slotOutput, /\u001b\[38;5;75m▄\u001b\[0m/)
assert.match(slotOutput, /\u001b\[38;5;214m▁\u001b\[0m/)
assert.match(slotOutput, /\u001b\[38;5;114m▇\u001b\[0m/)
assert.equal(stripAnsi(slotOutput).startsWith("▁▄▁▇"), true)
assert.equal(intervals.length, 0)

const directOutput = renderForSession(api, sessionID, 0)
assert.equal(directOutput, slotOutput)

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
assert.match(exportShapeOutput, /in 18k \/ out 2\.1k/)
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
assert.match(tokenOnlyOutput, /in 18k \/ out 2\.1k/)
assert.equal(/[▁▂▃▄▅▆▇█]/.test(stripAnsi(tokenOnlyOutput)), true)

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
assert.match(sessionTokenOnlyOutput, /in 18k \/ out 2\.1k/)
assert.equal(/[▁▂▃▄▅▆▇█]/.test(stripAnsi(sessionTokenOnlyOutput)), true)

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
assert.equal(stripAnsi(renderForSession(narrowApi, sessionID, 0)).length, 20)
layoutCommand.run()
assert.equal(renderRequests, 2)
assert.equal(stripAnsi(renderForSession(narrowApi, sessionID, 0)).length, 10)
layoutCommand.run()
assert.equal(renderRequests, 3)
assert.equal(stripAnsi(renderForSession(narrowApi, sessionID, 0)).length, 10)
layoutCommand.run()
assert.equal(renderRequests, 4)
assert.equal(stripAnsi(renderForSession(narrowApi, sessionID, 0)).length, 20)

for (const dispose of lifecycleDisposers) dispose()
assert.equal(disposeEvents.every((event) => event.disposed), true)
assert.equal(intervals.every((interval) => interval.cleared), true)

globalThis.setInterval = originalSetInterval
globalThis.clearInterval = originalClearInterval

console.log(slotOutput)
