# https://rakhesh.com/linux-bsd/vscode-vscodium-unable-to-resolve-your-shell-environment/
if [[ -n "$VSCODE_RESOLVING_ENVIRONMENT" ]]; then
  return
fi

if [[ -z "$TMUX" ]]; then

  if [[ -n "$VSCODE_SHELL_INTEGRATION" || "$TERM_PROGRAM" == "vscode" || "$TERM_PROGRAM" == "cursor" ]]; then
    # шелл без тмукса - потому что всккод запускает в терминале команды агента
    return
    # exec tmux new -A -s vscode -n vscode \; new-window
  else
    # todo - добавить название программы которая вызвала шелл
    exec tmux new
  fi

fi
