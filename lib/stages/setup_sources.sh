#!/usr/bin/env bash

ORIGINS=(
    "https://github.com/maximbaz/dotfiles"
    "https://github.com/spersson/Kup.git"
    "http://github.com/bulletmark/libinput-gestures"
    "https://github.com/stockrt/nginx2goaccess"
    "https://github.com/KDE/plasma-browser-integration"
    "https://github.com/crystal-lang-tools/scry.git"
    "https://github.com/d4nj1/TLPUI"
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