# MCP Stack legacy helpers.
# Runtime CLIs live in ~/bin: mcpctx, mcpd.
# Zsh completions live in ~/.zsh/completions/_mcpctx and _mcpd.

MCP_CTX_ROOT="${MCP_CTX_ROOT:-$HOME/.config/rulesync/contexts}"

# mcp-proxy-restart — перезапустить старый TBXark backup-демон.
mcp-proxy-restart() {
  launchctl kickstart -k "gui/$(id -u)/com.bigforcegun.mcp-proxy"
}

# mcp-proxy-log — хвост логов старого TBXark backup-демона.
mcp-proxy-log() {
  tail -f /tmp/com.bigforcegun.mcp-proxy.{out,err}.log
}
