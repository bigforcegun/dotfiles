#!/bin/sh

export EDITOR='nvim'
export VISUAL='nvim'
export DIFFPROG='nvim -d'
# export MANPAGER='kak-man-pager'
export WORDCHARS='*?_.[]~&!#$%^(){}<>'
export WINIT_HIDPI_FACTOR=1

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

export FZ_CMD=j
export FZ_SUBDIR_CMD=jj

export ANDROID_SDK_ROOT="$HOME/.android/sdk"

export GOPATH="$HOME/.go"
export PATH="$GOPATH/bin:$PATH"

export PATH="$HOME/.node_modules/bin:$PATH"

# Java configuration
#export JAVA_HOME="/usr/lib/jvm/java-8-jdk"
#export PATH="$JAVA_HOME/bin:$PATH"

# Rust configuration
export PATH="$HOME/.cargo/bin:$PATH"

export rvm_silence_path_mismatch_check_flag=1
# Ruby configuration
#[[ -s /usr/local/rvm/scripts/rvm ]] && source /usr/local/rvm/scripts/rvm
