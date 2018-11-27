#!/usr/bin/env bash

stage_setup_user_bin(){
  link "bin"
}

stage_setup_user_configs(){
  link ".bundle/config"
  link ".gitconfig"
  link ".gitignore"
  link ".agignore"
  if [[ "$SETUP_HOST_TYPE" =~ "desktop" ]]; then
    link ".tmux.conf"
    link ".tmux.conf.local"
  fi

  link ".zprofile"
  link ".zshrc"
  link ".zsh"
  link ".config/nvim"
  link ".config/ranger/rc.conf"


  if [[ "$SETUP_HOST_TYPE" =~ "desktop" ]]; then
    link ".config/alacritty/alacritty.yml"
    link ".config/qalculate/qalc.cfg"
    link ".config/libinput-gestures.conf"

    link ".config/systemd/user/urlwatch.service"
    link ".config/systemd/user/urlwatch.timer"
    link ".config/systemd/user/tmux.service"

    link ".urlwatch/urls.yaml"
  fi
}

stage_setup_user_services(){
  systemctl --user daemon-reload
  if [[ "$SETUP_HOST_TYPE" =~ "desktop" ]]; then
    systemctl_enable_start "user" "tmux.service"
    systemctl_enable_start "user" "urlwatch.timer"
  fi
}

stage_setup_etc_configs(){
  copy "etc/environment"
  copy "etc/profile.d/zz_custom.sh"
  copy "etc/zsh/zprofile"
}