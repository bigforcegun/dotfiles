#fpath=($/usr/share/zsh/vendor-completions $fpath)
#fpath=+$HOME/.zsh/completions)

fpath+=~/.zsh/completions


fpath=(/Users/bigforcegun/Sources/osx-zsh-completions/ $fpath)

#path=(/etc/bash_completion.d $fpath)
#source /etc/bash_completion.d/climate_completion


#fpath+=~/.zsh-plugins/archive
#autoload -Uz archive lsarchive unarchive

autoload -Uz compinit
compinit -d ~/.zcompdump