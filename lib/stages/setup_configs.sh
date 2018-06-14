#!/usr/bin/env bash


stage_setup_user_bin(){
    link "bin"
}

stage_setup_user_configs(){
    link ".bundle/config"
    link ".gitconfig"
    link ".gitignore"
    link ".agignore"
    link ".tmux.conf"
    link ".tmux.conf.local"
    link ".zprofile"
    link ".zshrc"
    link ".zsh"
    link ".config/nvim"
    link ".config/ranger/rc.conf"


    if [[ "$MYHOSTTYPE" =~ "desktop" ]]; then
        link ".config/alacritty/alacritty.yml"
        link ".config/qalculate/qalc.cfg"
        link ".config/libinput-gestures.conf"
        link ".config/systemd/user/urlwatch.service"
        link ".config/systemd/user/urlwatch.timer"
        link ".config/systemd/user/tmux.service"
        link ".urlwatch/urls.yaml"
    fi
}


state_setup_user_services(){
    sudo systemctl daemon-reload
    if [[ "$MYHOSTTYPE" =~ "desktop" ]]; then
        systemctl_enable_start "user" "tmux.service"
        systemctl_enable_start "user" "urlwatch.timer"
    fi
}