#!/bin/sh


# echo "i am profile"

if [[ $HOST_OS == 'mac' ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)" # а зачем мне брю при логине, мб он всегда мне нужен?
fi

##
# Your previous /Users/bigforcegun/.zprofile file was backed up as /Users/bigforcegun/.zprofile.macports-saved_2023-11-07_at_20:18:29
##

# MacPorts Installer addition on 2023-11-07_at_20:18:29: adding an appropriate PATH variable for use with MacPorts.
export PATH="/opt/local/bin:/opt/local/sbin:$PATH"
# Finished adapting your PATH environment variable for use with MacPorts.


# MacPorts Installer addition on 2023-11-07_at_20:18:29: adding an appropriate MANPATH variable for use with MacPorts.
export MANPATH="/opt/local/share/man:$MANPATH"
# Finished adapting your MANPATH environment variable for use with MacPorts.


source ~/.zsh/autorun-tmux.zsh
