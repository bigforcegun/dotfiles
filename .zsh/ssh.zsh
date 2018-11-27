# alias ssh='TERM=xterm-256color ssh_with_color'

ssh_with_color() {
  trap 'tmux_bg_color_reset' SIGINT
  tmux_bg_color_set $@
  \ssh $@
  retval=$?
  tmux_bg_color_reset
  return $retval
}

tmux_bg_color_reset() {
  tmux set window-style default
  trap - SIGINT
}

tmux_bg_color_set() {
  color='#FFBEBD'
  good_color='#B1D89D'
  danger_color='#FFBEBD'
  for arg in "$@"; do
    if [[ "${arg:0:1}" != "-" ]]; then
      if [[ "$arg" =~ '^prod[0-9]?-' ]]; then
        color=$danger_color
      elif [[ "$arg" =~ '.amazon' ]]; then
        color=$danger_color
      elif [[ "$arg" =~ '.office' ]]; then
        color=$good_color
      elif [[ "$arg" =~ '^int[0-9]?-' ]]; then
        color=$good_color
      fi
      break
    fi
  done
  tmux set window-style "bg=$color"
  # tmux setw -g window-active-style "bg=$color"
}
