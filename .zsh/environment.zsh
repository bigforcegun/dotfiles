unsetopt EXTENDED_GLOB

include "/usr/share/LS_COLORS/dircolors.sh"
include "/home/bigforcegun/.local/share/lscolors.sh"

export SIZE=1000000000
export SAVEHIST=1000000000
export HISTFILE=~/.zsh_history
# all opts in https://github.com/sorin-ionescu/prezto/blob/master/modules/history/init.zsh
unsetopt SHARE_HISTORY

ZSH_HIGHLIGHT_MAXLENGTH=1024                 # don't colorize long command lines (slow)
ZSH_HIGHLIGHT_HIGHLIGHTERS=(main brackets)   # main syntax highlighting plus matching brackets
ZSH_AUTOSUGGEST_MANUAL_REBIND=1              # disable a very slow obscure feature

ZSH_HISTORY_FILE_NAME=.zsh_history
ZSH_HISTORY_FILE="${HOME}/${ZSH_HISTORY_FILE_NAME}"
#ZSH_HISTORY_PROJ="${HOME}/.zsh_history_backup" # БЛЯДСКИЕ БАГИ - СИНКЕР НЕ ВСЕГДА ЧИТАЕТ ЭТУ ПЕРЕМЕННУЮ - надо называть .zsh_history_proj
ZSH_HISTORY_PROJ="${HOME}/.zsh_history_proj"
ZSH_HISTORY_FILE_ENC_NAME="zsh_history"
ZSH_HISTORY_FILE_ENC="${ZSH_HISTORY_PROJ}/${ZSH_HISTORY_FILE_ENC_NAME}"
ZSH_HISTORY_COMMIT_MSG="latest $(date)"