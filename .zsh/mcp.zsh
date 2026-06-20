# MCP Stack — раздача контекстов через rulesync + управление прокси.
# См. docs/mcp-stack/PLAN.md

MCP_CTX_ROOT="${MCP_CTX_ROOT:-$HOME/.config/rulesync/contexts}"

# mcpctx <context> [output-roots]
#   Генерит native MCP/rules-конфиги во все агенты из contexts/<context>/.rulesync
#   в указанные репы (по умолчанию — cwd). output-roots можно списком через запятую.
#   Примеры:
#     mcpctx gamedev                 # в текущую папку
#     mcpctx dev repoA,repoB         # пачкой
mcpctx() {
  local ctx="$1"
  local out="${2:-.}"
  if [[ -z "$ctx" ]]; then
    echo "usage: mcpctx <context> [output-roots]" >&2
    mcpctx-ls
    return 2
  fi
  local root="$MCP_CTX_ROOT/$ctx"
  if [[ ! -d "$root/.rulesync" ]]; then
    echo "mcpctx: контекст '$ctx' не найден ($root/.rulesync)" >&2
    mcpctx-ls
    return 1
  fi
  rulesync generate \
    --input-root "$root" \
    --output-roots "$out" \
    --targets "*" \
    --features "*"
}

# mcpctx-ls — список доступных контекстов
mcpctx-ls() {
  echo "доступные контексты ($MCP_CTX_ROOT):" >&2
  local d
  for d in "$MCP_CTX_ROOT"/*/.rulesync(N/:h:t); do
    echo "  - $d" >&2
  done
}

# mcp-proxy-restart — перезапустить демон после правки config.json/env
mcp-proxy-restart() {
  launchctl kickstart -k "gui/$(id -u)/com.bigforcegun.mcp-proxy"
}

# mcp-proxy-log — хвост логов демона
mcp-proxy-log() {
  tail -f /tmp/com.bigforcegun.mcp-proxy.{out,err}.log
}

# ─── mcpproxy-go (mcpproxy-go + профили, /mcp/p/<ctx>) ────────────────────────
# Единый диспетчер демоном в стиле `systemctl --user <verb>`.
MCPD_LABEL="${MCPD_LABEL:-com.bigforcegun.mcpproxy}"
MCPD_PLIST="${MCPD_PLIST:-$HOME/Library/LaunchAgents/com.bigforcegun.mcpproxy.plist}"
MCPD_CONFIG="${MCPD_CONFIG:-$HOME/.config/mcpproxy/config.json}"

# mcpd <verb> — управление/дебаг демона mcpproxy
mcpd() {
  local uid; uid=$(id -u)
  local svc="gui/$uid/$MCPD_LABEL"
  local verb="${1:-status}"; shift 2>/dev/null
  case "$verb" in
    start)    launchctl bootstrap "gui/$uid" "$MCPD_PLIST" && echo "mcpd: started" ;;
    stop)     launchctl bootout   "$svc" && echo "mcpd: stopped" ;;
    restart)  launchctl kickstart -k "$svc" && echo "mcpd: restarted" ;;
    reload)   launchctl bootout "$svc" 2>/dev/null; launchctl bootstrap "gui/$uid" "$MCPD_PLIST" && echo "mcpd: reloaded (plist подхвачен)" ;;
    logs)     tail "${@:--f}" /tmp/$MCPD_LABEL.{out,err}.log ;;
    health)   mcpproxy status ;;
    doctor)   mcpproxy doctor ;;
    profiles) command -v jq >/dev/null && jq -r '.profiles[] | "\(.name): \(.servers | join(", "))"' "$MCPD_CONFIG" || grep -A99 '"profiles"' "$MCPD_CONFIG" ;;
    run)      exec mcpproxy serve --config "$MCPD_CONFIG" --log-level debug ;;
    help|-h|--help)
      cat >&2 <<EOF
mcpd <verb> — управление демоном mcpproxy ($MCPD_LABEL)
  status            состояние launchd-job (pid/state)
  start|stop        bootstrap / bootout
  restart           kickstart -k (быстрый перезапуск)
  reload            bootout+bootstrap (подхватить правки plist)
  logs [-f|-n N]    хвост out/err логов
  health            mcpproxy status   (нативный self-check)
  doctor            mcpproxy doctor   (нативные health-checks)
  profiles          профили и их серверы (из config.json)
  run               foreground-дебаг (--log-level debug), мимо launchd

любой другой <verb> уходит как есть в 'mcpproxy <verb> [args...]'
EOF
      return 0 ;;
    *)        mcpproxy "$verb" "$@" ;;
  esac
}

# комплишен глаголов mcpd
_mcpd() { compadd -- status start stop restart reload logs health doctor profiles run help }
compdef _mcpd mcpd 2>/dev/null

# oc — OpenCode TUI client with auto-attach to a shared local backend.
#   Starts `opencode serve` on first use, then attaches TUI clients to it.
#   Examples:
#     oc
#     oc --continue
#     oc --session ses_xxx
#     OPENCODE_ATTACH_URL=http://127.0.0.1:4097 oc
oc() {
  local url="${OPENCODE_ATTACH_URL:-http://127.0.0.1:4096}"
  local port="${OPENCODE_ATTACH_PORT:-4096}"
  local state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/opencode"
  local log="$state_dir/serve.log"
  local code

  if ! command -v opencode >/dev/null 2>&1; then
    echo "oc: opencode not found in PATH" >&2
    return 127
  fi

  if ! command -v curl >/dev/null 2>&1; then
    echo "oc: curl not found in PATH" >&2
    return 127
  fi

  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 0.5 "$url/session" 2>/dev/null || true)
  if [[ "$code" != 200 && "$code" != 401 ]]; then
    mkdir -p "$state_dir"
    echo "oc: starting opencode backend at $url" >&2
    command opencode serve --hostname 127.0.0.1 --port "$port" >>"$log" 2>&1 &!

    local ready=0
    local i
    for i in {1..50}; do
      code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 0.5 "$url/session" 2>/dev/null || true)
      if [[ "$code" == 200 || "$code" == 401 ]]; then
        ready=1
        break
      fi
      sleep 0.1
    done

    if [[ "$ready" != 1 ]]; then
      echo "oc: backend did not become ready; see $log" >&2
      return 1
    fi
  fi

  command opencode attach "$url" --dir "$PWD" "$@"
}

# zsh-автодополнение имён контекстов для mcpctx
_mcpctx() {
  local -a ctxs
  ctxs=("$MCP_CTX_ROOT"/*/.rulesync(N/:h:t))
  compadd -- $ctxs
}
compdef _mcpctx mcpctx 2>/dev/null
