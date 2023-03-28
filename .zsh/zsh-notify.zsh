zstyle ':notify:*' command-complete-timeout 15
zstyle ':notify:*' error-title 'Error'
zstyle ':notify:*' success-title 'Success'

if [[ $HOST_OS == 'linux' ]]; then
zstyle ':notify:*' error-icon '/usr/share/icons/Papirus-Dark/64x64/categories/system-error.svg' # KDE
zstyle ':notify:*' success-icon '/usr/share/icons/Papirus-Dark/64x64/categories/hwinfo.svg' # KDE
fi

if [[ $HOST_OS == 'linux' ]]; then
zstyle ':notify:*' error-icon '/usr/share/icons/Papirus-Dark/64x64/categories/system-error.svg' # KDE
zstyle ':notify:*' success-icon '/usr/share/icons/Papirus-Dark/64x64/categories/hwinfo.svg' # KDE
fi

zstyle ':notify:*' expire-time 10000
zstyle ':notify:*' enable-on-ssh yes
