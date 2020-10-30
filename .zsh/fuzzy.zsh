export FZF_COMPLETION_TRIGGER=''

FZF_MODE="FD"

export FZF_DEFAULT_OPTS="--history=$HOME/.fzf_history --ansi"

if [[ ${FZF_MODE} = "AG" ]]; then
  export FZF_DEFAULT_COMMAND='ag --hidden  -g""'
  export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
  export FZF_ALT_C_COMMAND_EXCLUSIONS=$(sed -e '/^$/,$d' ~/.ignore | while read -r line; do printf "-path '*/%s' -o " "${line:0:-1}"; done | sed 's/ -o $//')
  export FZF_ALT_C_COMMAND="command find -L ~ \( $FZF_ALT_C_COMMAND_EXCLUSIONS \) -prune -o -type d -print 2> /dev/null | sed 1d"

  _fzf_compgen_path() {
    ag -g "" "$1"
  }

elif [[ ${FZF_MODE} = "FD" ]]; then
  export FZF_DEFAULT_COMMAND='fd --hidden --follow --type=f --color=always'
  export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"

  _fzf_compgen_path() { fd --hidden --follow --type=f . "$1" }
  # Default directory search commands
  export FZF_ALT_C_COMMAND='fd --hidden --follow --type=d --color=always'
  _fzf_compgen_dir() { fd --hidden --follow --type=d . "$1" }
fi


include /usr/share/fzf/completion.zsh
include /usr/share/doc/fzf/examples/completion.zsh
include /usr/share/fzf/key-bindings.zsh
include /usr/share/doc/fzf/examples/key-bindings.zsh

#bindkey '^T' fzf-completion
#bindkey '^I' $fzf_default_completion

#bindkey -r '^[c'

bindkey '\t' expand-or-complete

#export FZ_CMD=j
#export FZ_SUBDIR_CMD=jj

antibody bundle <<EOB
  rupa/z
  changyuheng/fz
EOB


