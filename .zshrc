#tmodload zsh/zprof

# echo "i am rc"


# FIXME: fuck fuck fuck
# https://stackoverflow.com/questions/25614613/how-to-disable-zsh-substitution-autocomplete-with-url-and-backslashes
# https://github.com/ohmyzsh/ohmyzsh/issues/5499
DISABLE_MAGIC_FUNCTIONS=true

# Own history file: /etc/zshrc hardcodes HISTFILE=~/.zsh_history & SAVEHIST=1000,
# so any shell that skips this .zshrc trims ~/.zsh_history (decoy). Our real
# history lives here and is re-pinned AFTER /etc/zshrc ran, so it stays safe.
# Keep HISTFILE process-local: a child zsh with incomplete startup must not
# inherit the real file while using a different SAVEHIST.
HISTFILE=~/.zsh_history_bfpc
typeset +x HISTFILE
HISTSIZE=1000000000
SAVEHIST=1000000000
setopt EXTENDED_HISTORY

_zsh_history_writer_log() {
    emulate -L zsh

    local log_file="${HISTFILE}.writers.log"
    local parent process terminal
    parent=$(command ps -p "$PPID" -o command= 2>/dev/null || print -r -- '<unknown>')
    process=$(command ps -p "$$" -o command= 2>/dev/null || print -r -- '<unknown>')
    if [[ -t 0 ]]; then
        terminal=$(command tty)
    else
        terminal='<no-tty>'
    fi

    umask 077
    printf '%s pid=%s ppid=%s tty=%q histfile=%q histsize=%s savehist=%s appendhistory=%s incappendhistory=%s sharehistory=%s command=%q parent=%q\n' \
        "$(command date '+%Y-%m-%dT%H:%M:%S%z')" "$$" "$PPID" "$terminal" "$HISTFILE" \
        "$HISTSIZE" "$SAVEHIST" "$options[appendhistory]" "$options[incappendhistory]" \
        "$options[sharehistory]" "$process" "$parent" >> "$log_file"
}

autoload -Uz add-zsh-hook
add-zsh-hook zshexit _zsh_history_writer_log

zsh-history-watch() {
    emulate -L zsh

    local target=${1:-$HISTFILE}
    [[ -n $target ]] || { print -u2 -r -- 'usage: zsh-history-watch [path]'; return 2; }
    target=${target:a}
    command sudo fs_usage -w -f pathname 2>&1 |
        command grep --line-buffered -F -- "$target" |
        command tee -a "${HISTFILE}.fs_usage.log"
}

include () {
    [[ -f "$1" ]] && source "$1"
}


source ~/.zsh/prompt.zsh

zstyle ':antidote:compatibility-mode' 'antibody'

source /opt/homebrew/opt/antidote/share/antidote/antidote.zsh

# TODO: разобраться с комбинацией prezto+antibody - что настраиваешь сам, что через презто, когда надобно инклудить файлы
source ~/.zsh/prezto.zsh

source ~/.zsh/zsh-notify.zsh

source ~/.zsh/antibody.zsh
source ~/.zsh/completions.zsh
source ~/.zsh/environment.zsh

source ~/.zsh/keybindings.zsh
source ~/.zsh/aliases/aliases.zsh
source ~/.zsh/aliases/git.zsh
source ~/.zsh/aliases/kube.zsh
source ~/.zsh/fuzzy.zsh
source ~/.zsh/ssh.zsh

# Added by LM Studio CLI (lms)
# export PATH="$PATH:/Users/bigforcegun/.lmstudio/bin"
# End of LM Studio CLI section
