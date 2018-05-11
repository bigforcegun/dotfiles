export TERMINAL='alacritty'
export EDITOR='nvim'
export VISUAL='nvim'
export DIFFPROG='nvim -d'
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export WORDCHARS='*?_.[]~&!#$%^(){}<>'

if [ -z ${HOSTTYPE+x} ]; then
    if [[ -f ~/.hosttype ]]; then
       HOSTTYPE=`cat ~/.hosttype`
   else
       HOSTTYPE="unknown"
   fi
fi

# My own binaries
export PATH="$HOME/bin:$PATH"

# Use gpg-agent as ssh-agent
#if [[ "$HOST" =~ "desktop-" ]]; then
#  export SSH_AUTH_SOCK="$XDG_RUNTIME_DIR/gnupg/S.gpg-agent.ssh"
#fi

# FZ configuration
export FZ_CMD=j
export FZ_SUBDIR_CMD=jj

# Pass configuration
#export PASSWORD_STORE_CHARACTER_SET='a-zA-Z0-9~!@#$%^&*()-_=+[]{};:,.<>?'
#export PASSWORD_STORE_GENERATED_LENGTH=40

# Java configuration
#export JAVA_HOME="/usr/lib/jvm/java-8-jdk"
#export PATH="$JAVA_HOME/bin:$PATH"

# Ruby configuration
[[ -s /usr/local/rvm/scripts/rvm ]] && source /usr/local/rvm/scripts/rvm  

# RVM configuration
#sandbox_init_rvm() {
 
# if [ -f /usr/share/rvm/scripts/rvm ]; then
#     source /usr/share/rvm/scripts/rvm
#  fi
#}
#sandbox_hook rvm rvm
#sandbox_hook rvm eyaml

# Go configuration
export GOPATH=$HOME/.go
export PATH="$GOPATH/bin:$PATH"

# NPM configuration
export PATH="$HOME/.node_modules/bin:$PATH"

export PATH="$HOME/.cargo/bin:$PATH"
