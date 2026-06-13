#tmodload zsh/zprof

# echo "i am rc"


# FIXME: fuck fuck fuck
# https://stackoverflow.com/questions/25614613/how-to-disable-zsh-substitution-autocomplete-with-url-and-backslashes
# https://github.com/ohmyzsh/ohmyzsh/issues/5499
DISABLE_MAGIC_FUNCTIONS=true

# Own history file: /etc/zshrc hardcodes HISTFILE=~/.zsh_history & SAVEHIST=1000,
# so any shell that skips this .zshrc trims ~/.zsh_history (decoy). Our real
# history lives here and is re-pinned AFTER /etc/zshrc ran, so it stays safe.
export HISTFILE=~/.zsh_history_bfpc
HISTSIZE=1000000000
SAVEHIST=1000000000
setopt EXTENDED_HISTORY

include () {
    [[ -f "$1" ]] && source "$1"
}


source ~/.zsh/prompt.zsh

zstyle ':antidote:compatibility-mode' 'antibody'

source /opt/homebrew/opt/antidote/share/antidote/antidote.zsh

# TODO: разобраться с комбинацией prezto+antibody - что настраиваешь сам, что через презто, когда надобно инклудить файлы
source ~/.zsh/prezto.zsh

source ~/.zsh/completions.zsh
source ~/.zsh/zsh-notify.zsh

source ~/.zsh/antibody.zsh
source ~/.zsh/environment.zsh

#source ~/.zsh/keybindings.zsh
source ~/.zsh/aliases/aliases.zsh
source ~/.zsh/aliases/git.zsh
source ~/.zsh/aliases/kube.zsh
source ~/.zsh/fuzzy.zsh
source ~/.zsh/ssh.zsh
source ~/.zsh/mcp.zsh

# Added by LM Studio CLI (lms)
# export PATH="$PATH:/Users/bigforcegun/.lmstudio/bin"
# End of LM Studio CLI section

