#!/usr/bin/env bash

ORIGINS=(
    "https://github.com/maximbaz/dotfiles"
    "https://github.com/amberframework/amber.git"
    "https://github.com/alexanderepstein/Bash-Snippets"
    # "https://github.com/spersson/Kup.git"
    # "https://github.com/KDE/plasma-browser-integration"
    "https://github.com/mwh/dragon"
    "http://github.com/bulletmark/libinput-gestures"
    "https://github.com/ryanoasis/nerd-fonts"
    "https://github.com/stockrt/nginx2goaccess"
    "git://github.com/magnumripper/JohnTheRipper"
    "https://github.com/LastPass/lastpass-cli"
    "https://github.com/crystal-lang-tools/scry.git"
    "https://github.com/d4nj1/TLPUI"
    "https://github.com/junegunn/fzf.git"
    "https://github.com/zsh-users/antigen"
    "https://github.com/hunspell/hunspell"
    "https://github.com/Fakerr/git-recall"
    "https://github.com/adtac/climate.git"
    "https://github.com/facebook/PathPicker.git"
    "https://github.com/PhrozenByte/rmtrash.git"
    "https://github.com/ikruglov/slapper"
)

SOURCES_DIR="${HOME}/sources"

stage_setup_sources(){
    mkdir -p ${SOURCES_DIR}
    cd ${SOURCES_DIR}
    for origin in "${ORIGINS[@]}"; do
        git clone ${origin}
    done
    cd -
}


stage_setup_rust_utils(){
  cargo install --git https://github.com/jwilm/alacritty --force
  cargo install bat --force
  cargo install exa --force
  sudo cp /home/bigforcegun/.cargo/bin/exa /usr/local/bin
  sudo cp /home/bigforcegun/.cargo/bin/bat /usr/local/bin
  sudo chmod +x /usr/local/bin/exa
  sudo chmod +x /usr/local/bin/bat
}


#install_fpp(){
    #git clone https://github.com/facebook/PathPicker.git
#}