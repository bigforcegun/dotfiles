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
  robbyrussell/oh-my-zsh plugins/cargo
  hlissner/zsh-autopair
  marzocchi/zsh-notify
  rupa/z
  changyuheng/fz
  Tarrasch/zsh-bd
  zsh-users/zsh-syntax-highlighting
  zsh-users/zsh-history-substring-search
EOB

antigen theme maximbaz/spaceship-prompt

antigen apply
