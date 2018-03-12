#!/usr/bin/env bash


stage_setup_bin(){
    link "bin"
}

stage_setup_configs(){
    link ".bundle/config"
    link ".gitconfig"
    link ".gitignore"
    link ".config/nvim"
}