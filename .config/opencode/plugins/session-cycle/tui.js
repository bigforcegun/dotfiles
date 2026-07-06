const NEXT_SESSION_COMMAND = "session_cycle.next"
const PREVIOUS_SESSION_COMMAND = "session_cycle.previous"

function currentSessionID(api) {
  const route = api.route.current
  if (route.name !== "session") return undefined

  const sessionID = route.params.sessionID
  if (typeof sessionID === "string") return sessionID

  return undefined
}

function wrapIndex(index, size) {
  return (index + size) % size
}

function isRootSession(session) {
  return !session.parentID
}

function pickTargetSession(sessions, sessionID, direction) {
  if (sessions.length === 0) return undefined
  if (!sessionID) return direction === 1 ? sessions[0] : sessions[sessions.length - 1]

  const currentIndex = sessions.findIndex((session) => session.id === sessionID)
  if (currentIndex === -1) return direction === 1 ? sessions[0] : sessions[sessions.length - 1]

  return sessions[wrapIndex(currentIndex + direction, sessions.length)]
}

async function cycleSession(api, direction) {
  const result = await api.client.session.list()
  const sessions = result.data
  const rootSessions = sessions.filter(isRootSession)

  if (rootSessions.length === 0) {
    api.ui.toast({
      variant: "info",
      message: "No top-level sessions available for this project",
    })
    return
  }

  const sessionID = currentSessionID(api)
  const currentSession = sessions.find((session) => session.id === sessionID)
  const anchorSessionID = currentSession?.parentID ?? sessionID
  const target = pickTargetSession(rootSessions, anchorSessionID, direction)

  if (!target) {
    api.ui.toast({
      variant: "warning",
      message: "Could not resolve the next session",
    })
    return
  }

  if (target.id === anchorSessionID) {
    api.ui.toast({
      variant: "info",
      message: "Only one top-level session is available",
    })
    return
  }

  api.route.navigate("session", { sessionID: target.id })
}

function showCycleError(api, error) {
  const message = error instanceof Error ? error.message : "Unknown session-switch error"
  api.ui.toast({
    variant: "error",
    message: `Session switch failed: ${message}`,
  })
}

const plugin = {
  id: "session-cycle",
  async tui(api) {
    api.keymap.registerLayer({
      priority: 1_000,
      commands: [
        {
          name: NEXT_SESSION_COMMAND,
          title: "Open next session",
          category: "Session",
          namespace: "palette",
          async run() {
            try {
              await cycleSession(api, 1)
            } catch (error) {
              showCycleError(api, error)
            }
          },
        },
        {
          name: PREVIOUS_SESSION_COMMAND,
          title: "Open previous session",
          category: "Session",
          namespace: "palette",
          async run() {
            try {
              await cycleSession(api, -1)
            } catch (error) {
              showCycleError(api, error)
            }
          },
        },
      ],
      bindings: [
        { key: "ctrl+l", cmd: NEXT_SESSION_COMMAND, desc: "Next session" },
        { key: "ctrl+k", cmd: PREVIOUS_SESSION_COMMAND, desc: "Previous session" },
      ],
    })
  },
}

export default plugin
