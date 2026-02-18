#!/bin/sh

# unset TERM_SESSION_ID
if [[ -z ${TERM_SESSION_ID+x} ]]; then
    TERM_SESSION_ID="$(uuidgen)"
fi
# echo "I am env"

export EDITOR='nvim'
export VISUAL='nvim'
export DIFFPROG='nvim -d'
export TERMINAL='alacritty'

# export MANPAGER='kak-man-pager'
export WORDCHARS='*?_.[]~&!#$%^(){}<>'
export WINIT_HIDPI_FACTOR=1

## set host type for future logic in case of separate home and work machines

if [[ -z ${HOST_TYPE+x} ]]; then
    if [[ -f ~/.hosttype ]]; then
        HOST_TYPE=$(cat $HOME/.hosttype)
    else
        HOST_TYPE="unknown"
    fi
fi

## set host os

unameOut="$(uname -s)"
case "${unameOut}" in
Linux*) HOST_OS=linux ;;
Darwin*) HOST_OS=mac ;;
*) HOST_OS="UNKNOWN:${unameOut}" ;;
esac

# My own binaries
export PATH="$HOME/bin:$PATH"

export PASSWORD_STORE_CHARACTER_SET='a-zA-Z0-9~!@#$%^&*()-_=+[]{};:,.<>?'
export PASSWORD_STORE_GENERATED_LENGTH=40

# export JAVA_HOME="/usr/lib/jvm/java-8-jdk"
# export PATH="$JAVA_HOME/bin:$PATH"

export ANDROID_SDK_ROOT="$HOME/.android/sdk"

export PATH="$HOME/.node_modules/bin:$PATH"

# Java configuration
#export JAVA_HOME="/usr/lib/jvm/java-8-jdk"
#export PATH="$JAVA_HOME/bin:$PATH"

# Rust configuration
export PATH="$HOME/.cargo/bin:$PATH"

export rvm_silence_path_mismatch_check_flag=1

# Ruby configuration
# export PATH="$PATH:$(ruby -e 'puts Gem.user_dir')/bin"

#HELLO KUBE
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"

## linux ssh-agent
if [[ $HOST_OS == 'linux' ]]; then
    [ -z "$SSH_AUTH_SOCK" ] && export SSH_AUTH_SOCK="${XDG_RUNTIME_DIR}/ssh-agent.socket"
    export PATH="$HOME/.local/bin/:$PATH"

    export GOPATH="$HOME/.go"
    export PATH="$GOPATH/bin:$PATH"
    export PATH="$PATH:/usr/local/go/bin"

    export BUP_DIR="$HOME/encfs/private/backups/bup/"
fi

if [[ $HOST_OS == 'mac' ]]; then
    export PATH="/opt/homebrew/opt/go@1.24/bin:$PATH"
    export GOPATH="$HOME/go"
    export PATH="$GOPATH/bin:$PATH"
fi

export GOPROXY=direct
export GOPRIVATE=github.com/KosyanMedia

export PATH="$PATH:$HOME/.rvm/bin"

# ring lang
export PATH="$PATH:$HOME/Opt/ring/bin"

export NVM_DIR="$HOME/.nvm"