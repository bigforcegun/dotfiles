#!/usr/bin/env bash

head(){
    echo ""
    echo "======================================="
    echo $1
    echo "======================================="
}

assign() {
  op="$1"
  if [[ "$op" != "link" && "$op" != "copy" ]]; then
    echo "Unknown operation: $op"
    exit 1
  fi

  orig_file="$2"
  dest_file="$3"

  mkdir -p "$(dirname "$orig_file")"
  mkdir -p "$(dirname "$dest_file")"

  rm -rf "$dest_file"

  if [[ "$op" == "link" ]]; then
    ln -s "$orig_file" "$dest_file"
    echo "$dest_file -> $orig_file"
  else
    cp -R "$orig_file" "$dest_file"
    echo "$dest_file <= $orig_file"
  fi
}

link() {
  assign "link" "$dotfiles_dir/$1" "$HOME/$1"
}

copy() {
  assign "copy" "$dotfiles_dir/$1" "/$1"
}


service_exists() {
  local target=$1
  local name=$2

  if [[ "$target" == "user" ]]; then
    systemctl_command='systemctl --user'
  else
    $systemctl_command="systemctl"
  fi
  if [[ $(systemctl --user --all -t service --full --no-legend | grep "$name.service" | cut -f1 -d' ') == "${name}.service" ]]; then
    return 0
  else
    return 1
  fi
}


systemctl_disable_stop(){
  name="$1"
  if service_exists $name; then
    echo "systemctl disable & stop "$name""
    systemctl disable "$name"
    systemctl stop  "$name"
  else
    echo "#${name} not exists; skipping systemctl"
  fi
}

systemctl_enable_start() {
  if [ "$#" -eq 1 ]; then
    target="system"
    name="$1"
  else
    target="$1"
    name="$2"
  fi

  if [[ "$target" == "user" ]]; then
    systemctl_command='systemctl --user'
    systemctl --user enable "$name"
    systemctl --user start  "$name"
  else
    $systemctl_command="systemctl"
  fi

  echo "$systemctl_command enable & start "$name""
  $systemctl_command enable "$name"
  $systemctl_command start  "$name"


}


list_from_file() {
  grep -v '^\s*$\|^\s*\#' $1 #removes comments
}