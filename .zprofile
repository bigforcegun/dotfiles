#!/bin/sh

# echo "i am profile"

if [[ $HOST_OS == 'mac' ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)" # а зачем мне брю при логине, мб он всегда мне нужен?
fi
