unsetopt EXTENDED_GLOB

if [[ $HOST_OS == 'linux' ]]; then
include "/usr/share/LS_COLORS/dircolors.sh"
include "/home/bigforcegun/.local/share/lscolors.sh"
fi

# а вот тут залупа коня - если неудачно прибить ZSH то он не успеет прочитать эти переменные и потрет историю при выходе :clown:
export SIZE=1000000000
export SAVEHIST=1000000000
export HISTFILE=~/.zsh_history
# all opts in https://github.com/sorin-ionescu/prezto/blob/master/modules/history/init.zsh
unsetopt SHARE_HISTORY

ZSH_HIGHLIGHT_MAXLENGTH=1024                 # don't colorize long command lines (slow)
ZSH_HIGHLIGHT_HIGHLIGHTERS=(main brackets)   # main syntax highlighting plus matching brackets
ZSH_AUTOSUGGEST_MANUAL_REBIND=1              # disable a very slow obscure feature
