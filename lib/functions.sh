#!/usr/bin/env bash

head(){
    echo ""
    echo "======================================="
    echo $1
    echo "======================================="
}

add_ppa() {
  grep -h "^deb.*$1" /etc/apt/sources.list.d/* > /dev/null 2>&1
  if [ $? -ne 0 ]
  then
    echo "Adding ppa:$1"
    sudo add-apt-repository -y ppa:$1
    return 0
  fi

  echo "ppa:$1 already exists"
  return 1
}

install_remote_deb(){
    PATH_TO_DEB=$1
    TEMP_DEB="$(mktemp)" &&
    wget -O "$TEMP_DEB" ${PATH_TO_DEB} &&
    sudo dpkg -i "$TEMP_DEB"
    rm -f "$TEMP_DEB"
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

systemctl_enable_start() {
  if [ "$#" -eq 1 ]; then
    target="system"
    name="$1"
  else
    target="$1"
    name="$2"
  fi
  if [[ "$target" == "user" ]]; then
    echo "systemctl --user enable & start "$name""
    systemctl --user enable "$name"
    systemctl --user start  "$name"
  else
    echo "systemctl enable & start "$name""
    systemctl enable "$name"
    systemctl start  "$name"
  fi
}
