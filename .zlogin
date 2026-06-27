if [[ ! -o interactive ]] && { [[ -n "$MCPPROXY_DAEMON" ]] || [[ "$(ps -p "$PPID" -o comm= 2>/dev/null)" == *mcpproxy* ]]; }; then
    return
fi

[[ -s "$HOME/.rvm/scripts/rvm" ]] && source "$HOME/.rvm/scripts/rvm" # Load RVM into a shell session *as a function*
