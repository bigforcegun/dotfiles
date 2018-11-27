source /usr/share/zsh-antigen/antigen.zsh

antigen use prezto

antigen bundles <<EOB
  robbyrussell/oh-my-zsh plugins/encode64
  robbyrussell/oh-my-zsh plugins/fancy-ctrl-z
  robbyrussell/oh-my-zsh plugins/rust
  robbyrussell/oh-my-zsh plugins/rvm
  robbyrussell/oh-my-zsh plugins/ruby
  robbyrussell/oh-my-zsh plugins/systemd
  robbyrussell/oh-my-zsh plugins/redis-cli
  robbyrussell/oh-my-zsh plugins/rake
  robbyrussell/oh-my-zsh plugins/jira
  robbyrussell/oh-my-zsh plugins/git-flow
  robbyrussell/oh-my-zsh plugins/docker
  robbyrussell/oh-my-zsh plugins/capistrano
  hlissner/zsh-autopair
  marzocchi/zsh-notify
  rupa/z
  aperezdc/zsh-fzy
  changyuheng/fz
  Tarrasch/zsh-bd
  zsh-users/zsh-syntax-highlighting
  zsh-users/zsh-history-substring-search
  zsh-users/zsh-completions
  zsh-users/zaw
  mafredri/zsh-async
EOB
# soimort/translate-shell

antigen theme maximbaz/spaceship-prompt

antigen apply
