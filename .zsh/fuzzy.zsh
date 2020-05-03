# тут сейчас два фуззи файндера
# - fzf
# - fzy
# я пока выбираю FZF, потому что
# - он асихронный, FZY на больших списках встревает секунд на 5, а FZF сразу начинает искать #TODO придумать как сделать так же в FZY
# - FZY не уммет в курсор в виджете - ставит непонятные символы
# В будущем надо переехать на FZY потому что он есть в репах, и по поиску круче


FUZZY_MODE="fzf"

if [[ ${FUZZY_MODE} = "fzf" ]]; then

  [[ -f ~/.fzf.zsh ]] && source ~/.fzf.zsh
  [[ -f /usr/share/doc/fzf/examples/key-bindings.zsh ]] && source /usr/share/doc/fzf/examples/key-bindings.zsh

  # Better FZF
  export FZF_DEFAULT_OPTS="--history=$HOME/.fzf_history --ansi"
  # export FZF_DEFAULT_COMMAND="fd --type file --color=always"
  export FZF_DEFAULT_COMMAND='ag --hidden  -g""'
  export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
  export FZF_ALT_C_COMMAND_EXCLUSIONS=$(sed -e '/^$/,$d' ~/.agignore | while read -r line; do printf "-path '*/%s' -o " "${line:0:-1}"; done | sed 's/ -o $//')
  export FZF_ALT_C_COMMAND="command find -L ~ \( $FZF_ALT_C_COMMAND_EXCLUSIONS \) -prune -o -type d -print 2> /dev/null | sed 1d"

  _fzf_compgen_path() {
    ag -g "" "$1"
  }

  export FZF_COMPLETION_TRIGGER=''
  bindkey '^T' fzf-completion
  bindkey '^I' $fzf_default_completion

elif [[ ${FUZZY_MODE} = "fzy" ]]; then

  bindkey '\ec' fzy-cd-widget
  bindkey '^T'  fzy-file-widget
  bindkey '^R'  fzy-history-widget
  bindkey '^P'  fzy-proc-widget

  fzy-file-widget-list-files() { rg --files --hidden --smart-case 2>/dev/null }
  zstyle :fzy:file command fzy-file-widget-list-files
  zstyle :fzy:tmux    enabled      no

  __fz_filter() { fzy }
fi




