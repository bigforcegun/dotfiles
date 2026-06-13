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

# zsh-автодополнение имён контекстов для mcpctx
_mcpctx() {
  local -a ctxs
  ctxs=("$MCP_CTX_ROOT"/*/.rulesync(N/:h:t))
  compadd -- $ctxs
}
compdef _mcpctx mcpctx 2>/dev/null
