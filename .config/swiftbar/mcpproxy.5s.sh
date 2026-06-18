#!/usr/bin/env bash
# <xbar.title>MCPProxy</xbar.title>
# <xbar.desc>Menu-bar control for the mcpproxy daemon — mirrors the native macOS tray, but CLI-driven.</xbar.desc>
# <xbar.dependencies>mcpproxy,jq,launchctl</xbar.dependencies>
# SwiftBar plugin; refresh interval is in the filename (mcpproxy.5s.sh).

export PATH="/opt/homebrew/bin:$HOME/go/bin:/usr/local/bin:$PATH"
MCP="$(command -v mcpproxy)"
JQ="$(command -v jq)"
SELF="$0"
LABEL="com.bigforcegun.mcpproxy"
UID_=$(id -u)
SVC="gui/$UID_/$LABEL"

# --- action dispatch (menu items call this script back) -----------------
case "$1" in
  enable|disable|restart) exec "$MCP" upstream "$1" "$2" ;;
  webui|add) exec open "$2" ;;
  config)    exec open -t "$2" ;;
  core-restart) exec launchctl kickstart -k "$SVC" ;;
  core-stop)    exec launchctl bootout "$SVC" ;;
  core-start)   exec launchctl bootstrap "gui/$UID_" "$HOME/Library/LaunchAgents/$LABEL.plist" ;;
esac

# --- guard rails --------------------------------------------------------
if [[ -z "$MCP" ]]; then echo ":bolt.slash.fill: | sfcolor=red"; echo "---"; echo "mcpproxy not on PATH"; exit 0; fi
if [[ -z "$JQ"  ]]; then echo ":bolt.slash.fill:"; echo "---"; echo "jq missing | bash=brew param1=install param2=jq terminal=false"; exit 0; fi

STATUS="$("$MCP" status -o json 2>/dev/null)"
if [[ -z "$STATUS" ]] || ! echo "$STATUS" | "$JQ" -e . >/dev/null 2>&1; then
  echo ":bolt.slash.fill: | sfcolor=red"
  echo "---"
  echo "MCPProxy Core stopped | size=12 color=gray"
  echo "Start Core | bash='$SELF' param1=core-start terminal=false refresh=true sfimage=play.fill"
  exit 0
fi

LIST="$("$MCP" upstream list -o json 2>/dev/null)"; [[ -z "$LIST" ]] && LIST='[]'

CONNECTED=$(echo "$LIST" | "$JQ" '[.[]|select(.connected)]|length')
TOTAL=$(echo "$LIST" | "$JQ" 'length')
TOOLS=$(echo "$LIST" | "$JQ" '[.[].tool_count // 0]|add // 0')
QUAR=$(echo "$LIST" | "$JQ" '[.[]|select(.quarantined)]|length')
WEBUI=$(echo "$STATUS" | "$JQ" -r '.web_ui_url // empty')
ADDR=$(echo "$STATUS" | "$JQ" -r '.listen_addr // empty')
CFG=$(echo "$STATUS" | "$JQ" -r '.config_path // empty')
# daemon's real config (from activity metadata) overrides CLI default
RCFG=$("$MCP" activity list -o json 2>/dev/null | "$JQ" -r '[.activities[]?.metadata.config_path // empty]|map(select(.!=""))|.[0] // empty')
[[ -n "$RCFG" ]] && CFG="$RCFG"

if   [[ "$CONNECTED" == "$TOTAL" && "$TOTAL" -gt 0 ]]; then COLOR=green
elif [[ "$CONNECTED" -gt 0 ]]; then COLOR=orange
else COLOR=red; fi

# ── menu-bar title ──────────────────────────────────────────────────────
echo ":bolt.horizontal.fill: ${CONNECTED}/${TOTAL} | sfcolor=$COLOR"
echo "---"
echo "MCPProxy · $ADDR | size=12 color=gray"
echo "$CONNECTED/$TOTAL servers, $TOOLS tools | size=12 color=gray"

# ── Needs Attention ─────────────────────────────────────────────────────
ATTN=$(echo "$LIST" | "$JQ" -r '
  .[] | select(.quarantined or (.enabled and (.connected|not)))
  | [.name,
     (if .quarantined then "Quarantined for review"
      elif (.authenticated|not) and (.health.level=="error") then (.health.summary // "Needs attention")
      else (.health.summary // "Disconnected") end)] | @tsv')
if [[ -n "$ATTN" ]]; then
  echo "---"
  echo "Needs Attention | size=12 color=gray"
  while IFS=$'\t' read -r name reason; do
    [[ -z "$name" ]] && continue
    echo ":exclamationmark.triangle.fill: ${name} — ${reason:0:40} | sfcolor=orange size=12"
  done <<< "$ATTN"
fi
[[ "$QUAR" -gt 0 ]] && echo ":shield.lefthalf.filled: $QUAR quarantined server(s) | sfcolor=orange size=12"

# ── Servers (N) submenu ─────────────────────────────────────────────────
echo "---"
echo "Servers ($TOTAL) | sfimage=server.rack"
echo "$LIST" | "$JQ" -r '.[] | [.name,(.connected|tostring),(.enabled|tostring),(.tool_count//0|tostring),(.health.summary//"")] | @tsv' |
while IFS=$'\t' read -r name conn en tools summary; do
  if   [[ "$en" != "true" ]];   then dot=":circle:";        col="color=gray"
  elif [[ "$conn" == "true" ]]; then dot=":circle.fill:";   col="sfcolor=green"
  else dot=":circle.dotted:";   col="sfcolor=orange"; fi
  echo "--${dot} ${name}  (${tools} tools) | $col"
  echo "----${summary:-no status} | size=11 color=gray"
  if [[ "$en" == "true" ]]; then
    echo "----Disable | bash='$SELF' param1=disable param2='$name' terminal=false refresh=true sfimage=pause.circle"
  else
    echo "----Enable | bash='$SELF' param1=enable param2='$name' terminal=false refresh=true sfimage=play.circle"
  fi
  echo "----Restart | bash='$SELF' param1=restart param2='$name' terminal=false refresh=true sfimage=arrow.clockwise.circle"
  echo "----Logs | bash='$MCP' param1=upstream param2=logs param3='$name' terminal=true sfimage=doc.text.magnifyingglass"
done

# ── Activity (24h) submenu ──────────────────────────────────────────────
SUM=$("$MCP" activity summary -o json 2>/dev/null)
echo "Activity (24h) | sfimage=chart.bar.doc.horizontal"
if [[ -n "$SUM" ]]; then
  OK=$(echo "$SUM" | "$JQ" -r '.success_count // 0')
  ERR=$(echo "$SUM" | "$JQ" -r '.error_count // 0')
  BLK=$(echo "$SUM" | "$JQ" -r '.blocked_count // 0')
  echo "--✅ $OK success   ❌ $ERR errors   ⛔ $BLK blocked | size=12"
  echo "-----"
  echo "$SUM" | "$JQ" -r '.top_servers[]? | "--\(.name) · \(.count) calls | size=12 color=gray"'
fi
echo "--Open full Activity Log | bash='$SELF' param1=webui param2='$WEBUI' terminal=false sfimage=arrow.up.forward.app"

# ── Web UI / config ─────────────────────────────────────────────────────
echo "---"
[[ -n "$WEBUI" ]] && echo "Open Web UI | bash='$SELF' param1=webui param2='$WEBUI' terminal=false sfimage=safari"
[[ -n "$WEBUI" ]] && echo "Add Server… | bash='$SELF' param1=add param2='${WEBUI%/ui/*}/ui/' terminal=false sfimage=plus.circle"
[[ -n "$CFG" ]] && echo "Edit config | bash='$SELF' param1=config param2='$CFG' terminal=false sfimage=doc.text"

# ── Core control (launchd) ──────────────────────────────────────────────
echo "---"
echo "Restart Core | bash='$SELF' param1=core-restart terminal=false refresh=true sfimage=arrow.clockwise"
echo "Stop Core | bash='$SELF' param1=core-stop terminal=false refresh=true sfimage=stop.fill"
echo "Refresh | refresh=true sfimage=arrow.clockwise"
