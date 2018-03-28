#!/usr/bin/env bash


stage_setup_bin(){
    link "bin"
}

stage_setup_configs(){
    link ".bundle/config"
    link ".gitconfig"
    link ".gitignore"

    link ".tmux.conf"

    link ".zprofile"
    link ".zshrc"
    link ".zsh"

    link ".config/nvim"
    link ".config/libinput-gestures.conf"


    link ".config/systemd/user/urlwatch.service"
    link ".config/systemd/user/urlwatch.timer"

    link ".urlwatch/urls.yaml"

}