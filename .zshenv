#!/bin/sh

export EDITOR='nvim'
export VISUAL='nvim'
export DIFFPROG='nvim -d'
# export MANPAGER='kak-man-pager'
export WORDCHARS='*?_.[]~&!#$%^(){}<>'
export WINIT_HIDPI_FACTOR=1

[ -z "$SSH_AUTH_SOCK" ] && export SSH_AUTH_SOCK="${XDG_RUNTIME_DIR}/ssh-agent.socket" 

if [[ -z ${HOST_TYPE+x} ]]; then
    if [[ -f ~/.hosttype ]]; then
       HOST_TYPE=`cat $HOME/.hosttype`
   else
       HOST_TYPE="unknown"
   fi
fi

# My own binaries
export PATH="$HOME/bin:$PATH"
export PATH="$HOME/.local/bin/:$PATH"

export PASSWORD_STORE_CHARACTER_SET='a-zA-Z0-9~!@#$%^&*()-_=+[]{};:,.<>?'
export PASSWORD_STORE_GENERATED_LENGTH=40

# export JAVA_HOME="/usr/lib/jvm/java-8-jdk"
# export PATH="$JAVA_HOME/bin:$PATH"

export ANDROID_SDK_ROOT="$HOME/.android/sdk"

export GOPATH="$HOME/.go"
export PATH="$GOPATH/bin:$PATH"
export PATH="$PATH:/usr/local/go/bin"

export PATH="$HOME/.node_modules/bin:$PATH"

# Java configuration
#export JAVA_HOME="/usr/lib/jvm/java-8-jdk"
#export PATH="$JAVA_HOME/bin:$PATH"

# Rust configuration
export PATH="$HOME/.cargo/bin:$PATH"

export rvm_silence_path_mismatch_check_flag=1

# Ruby configuration
export PATH="$PATH:$(ruby -e 'puts Gem.user_dir')/bin"


#HELLO KUBE
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"

export BUP_DIR="$HOME/encfs/private/backups/bup/"