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

#alias rm='rmtrash -rf' #FIXME add rm-tools install
#alias rm!='\rm -rf'

alias rsync='rsync --verbose --archive --info=progress2 --human-readable --compress --partial'
# alias ssudo='sudo'
# alias sudo='sudo -E '
alias vi='nvim'
alias vim='nvim'
alias hunspell='hunspell --with-ui'
alias bat='bat --theme="Monokai Extended" --style=plain --paging=never ' #FIXME: sad, by i can not use bat normally when i need bynary
alias fcat='bat --theme="Monokai Extended" '
alias fzpath="hpath | fzf"
alias fenv="env | fzf"
# alias bfg='java -jar ~/bin/bfg-1.13.0.jar' #FIXME: plases for jar assets

alias ls="exa --git --group-directories-first --icons"
alias ll="ls -l"
alias la="ll -a"
alias lk="ll -s=size"                # Sorted by size
alias lm="ll -s=modified"            # Sorted by modified date
alias lc="ll --created -s=created"   # Sorted by created date

alias c1="awk '{print \$1}'"
alias c2="awk '{print \$2}'"
alias c3="awk '{print \$3}'"
alias c4="awk '{print \$4}'"
alias c5="awk '{print \$5}'"
alias c6="awk '{print \$6}'"
alias c7="awk '{print \$7}'"
alias c8="awk '{print \$8}'"
alias c9="awk '{print \$9}'"
alias c10="awk '{print \$10}'"
alias c11="awk '{print \$11}'"

alias print_dpi="xdpyinfo | grep dots"
alias nstat='stat -c "%a %n"'
alias dragon='dragon-drag-and-drop'


alias prm=". /usr/local/bin/prm.sh"

alias ods_to_csv="unoconv -f csv -e FilterOptions=\"59,34,0,1\""

mkdcd(){
  [[ -n "$1" ]] && mkdir -p "$1" && builtin cd "$1"
}

tcat(){
  bat --list-themes | fzf --preview="bat --theme={} --color=always $1"
}

hpath(){
  tr ':' '\n' <<< ${PATH}
}

hfpath(){
  tr ' ' '\n' <<< ${fpath}
}

trtr(){
  tr ':' '\n' <<< $1
}

expose(){
  ssh -p 2222 -R 80:localhost:$1 lt.bigforcegun.com #TODO: somehow parse server and port from sish output  -vnT
}

cathist() { fc -lim "*$@*" 1 }

split_csv() {
    if [ -n "$2" ]; then
        CHUNK=$2
    else
        CHUNK=1000
    fi
    tail -n +2 $1 | split -l $CHUNK - $1_ --additional-suffix=".csv"
}


list_from_file() {
  grep -v '^\s*$\|^\s*\#' $1 #removes comments
}

gourse_big_project(){
  gource --hide dirnames,filenames --seconds-per-day 0.1 --auto-skip-seconds 1 -1280x720 -o - | ffmpeg -y -r 30 -f image2pipe -vcodec ppm -i - -vcodec libx264 -preset ultrafast -pix_fmt yuv420p -crf 1 -threads 0 -bf 0 gource.mp4
}