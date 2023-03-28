#tmodload zsh/zprof

# echo "i am rc"

include () {
    [[ -f "$1" ]] && source "$1"
}

source ~/.zsh/autorun-tmux.zsh

source ~/.zsh/prompt.zsh

source <(antibody init)

# TODO: разобраться с комбинацией prezto+antibody - что настраиваешь сам, что через презто, когда надобно инклудить файлы

source ~/.zsh/prezto.zsh

source ~/.zsh/completions.zsh
source ~/.zsh/zsh-notify.zsh


source ~/.zsh/antibody.zsh
source ~/.zsh/environment.zsh

#source ~/.zsh/keybindings.zsh
source ~/.zsh/aliases.zsh
source ~/.zsh/git.zsh
source ~/.zsh/fuzzy.zsh
source ~/.zsh/ssh.zsh