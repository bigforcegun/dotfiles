import { execFile } from "node:child_process"
import { basename } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const MAX_TMUX_WINDOW_NAME = 80
const TMUX_WINDOW_PREFIX = "oc://"

function cleanTmuxName(value) {
  const cleaned = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return cleaned.slice(0, MAX_TMUX_WINDOW_NAME)
}

function compactWorkdir(value) {
  return cleanTmuxName(basename(value || process.cwd()))
}

async function renameTmuxWindow(name) {
  if (!process.env.TMUX) return

  try {
    await execFileAsync("tmux", ["rename-window", name], { timeout: 1000 })
  } catch {
  }
}

async function sessionWindowName(api, sessionID) {
  const result = await api.client.session.get({ sessionID })
  const session = result.data
  const title = cleanTmuxName(session?.title)
  const directory = compactWorkdir(session?.directory)

  if (title && directory) return cleanTmuxName(`${TMUX_WINDOW_PREFIX}${directory}/${title}`)
  if (title) return cleanTmuxName(`${TMUX_WINDOW_PREFIX}${title}`)

  return cleanTmuxName(`${TMUX_WINDOW_PREFIX}${directory || "session"}`)
}

const plugin = {
  id: "oc-tmux-window-title",
  async tui(api) {
    let lastWindowName

    function currentSessionID() {
      const route = api.route.current
      if (route.name !== "session") return

      const sessionID = route.params.sessionID
      if (typeof sessionID === "string") return sessionID
    }

    async function renameCurrentSession() {
      const sessionID = currentSessionID()
      if (!sessionID) return

      try {
        const windowName = await sessionWindowName(api, sessionID)
        if (windowName === lastWindowName) return

        lastWindowName = windowName
        await renameTmuxWindow(windowName)
      } catch {
      }
    }

    async function renameSelectedSession(sessionID) {
      try {
        const windowName = await sessionWindowName(api, sessionID)
        lastWindowName = windowName
        await renameTmuxWindow(windowName)
      } catch {
      }
    }

    queueMicrotask(renameCurrentSession)

    const interval = setInterval(renameCurrentSession, 500)

    const disposeSelect = api.event.on("tui.session.select", (event) => {
      lastWindowName = undefined
      renameSelectedSession(event.properties.sessionID)
    })

    api.lifecycle.onDispose(() => {
      clearInterval(interval)
      disposeSelect()
    })
  },
}

export default plugin
