source /usr/share/zsh-antigen/antigen.zsh

antigen use prezto

antigen bundles <<EOB
  robbyrussell/oh-my-zsh plugins/encode64
  robbyrussell/oh-my-zsh plugins/fancy-ctrl-z
  robbyrussell/oh-my-zsh plugins/rust
  robbyrussell/oh-my-zsh plugins/ruby
  robbyrussell/oh-my-zsh plugins/rvm
  robbyrussell/oh-my-zsh plugins/systemd
  robbyrussell/oh-my-zsh plugins/redis-cli
  robbyrussell/oh-my-zsh plugins/git-flow
  robbyrussell/oh-my-zsh plugins/docker
  hlissner/zsh-autopair
  marzocchi/zsh-notify
  rupa/z
  changyuheng/fz
  Tarrasch/zsh-bd
  zsh-users/zsh-syntax-highlighting
  zsh-users/zsh-history-substring-search
  zsh-users/zsh-completions
  zsh-users/zaw
  mafredri/zsh-async
EOB
# soimort/translate-shell
# robbyrussell/oh-my-zsh plugins/capistrano
# aperezdc/zsh-fzy
# robbyrussell/oh-my-zsh plugins/rake
# robbyrussell/oh-my-zsh plugins/jira

#antigen theme maximbaz/spaceship-prompt
antigen theme denysdovhan/spaceship-prompt
antigen apply
