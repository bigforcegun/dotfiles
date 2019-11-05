alias ag='ag --hidden -f'
alias cp='cp -r --reflink=auto'
#alias df='pydf'
alias diff='diff --color --unified'
alias dragall='dragon --and-exit --all'
alias dragon='dragon --and-exit'
alias e='nvim'
alias grep='grep --color'
alias http-serve='python3 -m http.server'
alias locate='locate -i'
alias mkdir='mkdir -p'
alias o='xdg-open'
alias rm='rmtrash -rf'
alias rm!='\rm -rf'
alias rsync='rsync --verbose --archive --info=progress2 --human-readable --compress --partial'
# alias ssudo='sudo'
# alias sudo='sudo -E '
alias vi='nvim'
alias vim='nvim'
alias hunspell='hunspell --with-ui'
alias cat='bat --theme="Monokai Extended" --style=plain --paging=never '
alias pcat='/bin/cat'
alias fcat='bat --theme="Monokai Extended" '
alias fpath="hpath | fzf"
alias fenv="env | fzf"
alias bfg='java -jar ~/bin/bfg-1.13.0.jar'

alias ls="exa --git --group-directories-first"
alias ll="ls -l"
alias la="ll -a"
alias lk="ll -s=size"                # Sorted by size
alias lm="ll -s=modified"            # Sorted by modified date
alias lc="ll --created -s=created"   # Sorted by created date

mkdcd(){
  [[ -n "$1" ]] && mkdir -p "$1" && builtin cd "$1"
}

tcat(){
  bat --list-themes | fzf --preview="bat --theme={} --color=always $1"
}

hpath(){
  tr ':' '\n' <<< ${PATH}
}

trtr(){
  tr ':' '\n' <<< $1
}

expose(){
  o https://lt.bigforcegun.com | ssh -vnNT -R 6688:localhost:$1 bigforcegun.com -p 322
}