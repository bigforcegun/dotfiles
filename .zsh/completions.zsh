#fpath=($/usr/share/zsh/vendor-completions $fpath)
#fpath=+$HOME/.zsh/completions)

fpath=(~/.zsh/completions /Users/bigforcegun/Sources/osx-zsh-completions/ $fpath)

#path=(/etc/bash_completion.d $fpath)
#source /etc/bash_completion.d/climate_completion


#fpath+=~/.zsh-plugins/archive
#autoload -Uz archive lsarchive unarchive

autoload -Uz compinit

newest_completion=(~/.zsh/completions/*(N.om[1]))
if [[ -f ~/.zcompdump && -n "$newest_completion" && "$newest_completion" -nt ~/.zcompdump ]]; then
  rm -f ~/.zcompdump
fi
unset newest_completion

compinit -d ~/.zcompdump
