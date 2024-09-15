if [[ -z "$TMUX" ]]; then
  # todo - добавить название программы которая вызвала шелл
  exec tmux new
fi
