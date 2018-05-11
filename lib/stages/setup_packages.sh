#!/usr/bin/env bash

PPAS=(
	"papirus/papirus"
	"kubuntu-ppa/backports"
	"graphics-drivers/ppa"
	"gencfsm"
	"bit-team/stable"
	"nextcloud-devs/client"
	"jtaylor/keepass"
	"mhsabbagh/greenproject"
	"nilarimogard/webupd8"
	"pbek/qownnotes"
	"peek-developers/stable"
	"webupd8team/java"
	"yktooo/ppa"
	"andreas-angerer89/sni-qt-patched"
	"ubuntuhandbook1/corebird"
	"linrunner/tlp"
	"ubuntuhandbook1/apps"
	"costamagnagianfranco/borgbackup"
	"ppa:tista/adapta"
)


BASE_PACKAGES=(
    "trash-cli"
    "git"
	"git-flow"
    "whois"
    "goaccess"
    "neovim"
    "python3-pip"
    "apt-transport-https"
    "ca-certificates"
    "jq"
    "apache2-utils"
    "wrk"
    "net-tools"
    "htop"
    "mc"
    "curl"
    "wget"
    "apache2-utils"
    "screenfetch"
    "neofetch"
    "stress"
    "unrar"
    "rar"
    "finger"
    "tmux"
    "tree"
    "unrar"
    "unzip"
    "ranger"
    "zsh"
    "zsh-antigen"
)


DESKTOP_USER_PACKAGES=(
    "weechat"
    "thunderbird"
    "thunderbird-enigmail"
	"qownnotes"
	"papirus-icon-theme"
	"arc-theme"
	"indicator-sound-switcher"
	"krita"
	"gimp"
	"corebird"
	"vlc"
	"calibre"
	"qbittorrent"
	"cheese"
	"unetbootin"
	"nixnote2"
	"kazam"
	"comix"
	"sni-qt"
	"sni-qt:i386"
	"hardcode-tray"
	"peek"
	"tor"
	"selektor"
	"green-recorder"
	"shutter"
	"calligra"
	"keepass2"
	"corebird"
	"inkscape"
	"hardcode-tray"
	"nextcloud-client"
	"nextcloud-client-dolphin"
	"dolphin-plugins"
	"gnome-encfs-manager"
	"backintime-qt4"
	"liferea"
	"borgbackup"
	"fonts-powerline"
)

DESKTOP_DEV_PACKAGES=(
    "mongodb"
    "mongodb-dev"
	"postgresql-client"
	"postgresql-client-common"
	"build-essential"
	"nodejs"
	"redis-server"
	"mysql-server"
	"mysql-client"
	"postgresql"
	"postgresql-contrib"
	"yarn"
	"docker-ce"
	"insomnia"
	"gdb"
	"libmysqlclient-dev"
    "libreadline6-dev"
    "libpq-dev"
	"lldb"
	"libxml2-dev"
    "libmagickwand-dev"
    "libharfbuzz-dev"
    "libfontconfig1-dev"
    "libharfbuzz-dev"
    "libxi-dev"
    "libxrandr-dev"
    "libxinerama-dev"
    "libxcursor-dev"
    "libunistring-dev"
    "libxcb-xkb-dev"
    "libpng-dev"
    "python3-pil"
	)

DESKTOP_KDE_PACKAGES=(
    "kdesrc-build"
    "kipi-plugins"
    "kde-config-systemd"
    "kcron"
    "plasma-vault"
    "plasma-workspace-dev"
    "qml-module-org-kde-kio"
    "arc-kde"
    "adapta-kde"
    "adapta-gtk-theme"
    "adapta-kde"
    "kio-extras"
    "kio-dev"
    "kio gettext"
    "qtdeclarative5-dev"
    "libkf5activities-dev"
    "libkf5runner-dev"
    "libkf5notifications-dev"
    "yakuake"
    "krfb"
    "filelight"
    "kfind"
    "kfilereplace"
    "kleopatra"
    "kcharselect"
    "kronometer"
    "okteta"
    "sweeper"
    "kjots"
    "marble"
    # "kup-backup" - # need build from source
    "rsibreak"
    "kget"
    "kdenlive"
    "libqt5websockets5"
    "qml-module-qt-websockets"
    "libqt5websockets5-dev"
    "libcurl4-doc"
    "libidn11-dev"
    "libkrb5-dev"
    "libldap2-dev"
    "librtmp-dev"
    )

DESKTOP_UTILS_PACKAGES=(
    # "urlwatch"
    "samba"
    "linux-tools-common"
	"linux-tools-generic"
	"software-properties-common"
	"hardinfo"
	#"laptop-mode-tools"
	"tlp"
	"tlp-rdw"
	"powertop"
	"i7z"
	#"cpufreqd"
	#"cpufrequtils"
)

REMOTE_PACKAGES=(
    "https://atom.io/download/deb"
)

RVM_RUBIES=(
	"ruby-2.3.4"
	"ruby-2.3.5"
	"ruby-2.4.3"
	"ruby-2.5.0"
)

stage_add_ppas() {
	for i in "${PPAS[@]}"; do
		add_ppa ${i}
	done
	add_manual_ppas
	sudo apt update
}

# TODO: --install-recommends
stage_install_base_packgages(){
    apt install ${BASE_PACKAGES[@]} -y
}

stage_install_user_packages() {
	apt install ${DESKTOP_USER_PACKAGES[@]} -y
}

stage_install_utils_packages() {
	apt install ${DESKTOP_UTILS_PACKAGES[@]} -y
}

stage_install_dev_packages() {
	export DEBIAN_FRONTEND=noninteractive
	apt install ${DESKTOP_DEV_PACKAGES[@]} -y
}

stage_install_kde_packages() {
	apt install ${DESKTOP_KDE_PACKAGES[@]} -y
}

stage_install_remote_packages(){
    for i in "${REMOTE_PACKAGES[@]}"; do
		install_remote_deb $i
	done
}

stage_rvm(){
    [[ -s /usr/local/rvm/scripts/rvm ]] && source /usr/local/rvm/scripts/rvm
	(type rvm | head -1) | grep -q "rvm — "
	if [ $? -eq 0 ]
	then
		echo "WE NEED RVM"
		gpg --keyserver hkp://keys.gnupg.net --recv-keys 409B6B1796C275462A1703113804BB82D39DC0E3 7D2BAF1CF37B13E2069D6956105BD0E739499BDB
		curl -sSL https://get.rvm.io | sudo bash -s stable
	else
		echo "NOT NEED" #FIXME
	fi
}

stage_purge_packages(){
	apt purge irqbalance laptop-mode-tools -y
}

stage_disable_services(){
	systemctl disable redis-server
	systemctl disable mysql.service
	systemctl disable postgresql.service
	systemctl disable tor
	systemctl disable mongodb
	systemctl disable docker
}

stage_rvm_rubies(){
    for rv in "${RVM_RUBIES[@]}"
    do
    echo "${rv}"
        rvm install ${rv}
    done
}

stage_finalize_install(){
    usermod -a -G rvm bigforcegun
    usermod -a -G docker bigforcegun
    usermod -a -G input bigforcegun
}

add_manual_ppas(){
    curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
    echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list

    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
    sudo add-apt-repository \
       "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
       $(lsb_release -cs) \
       stable" -r

    sudo add-apt-repository \
        "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
        $(lsb_release -cs) \
        stable"

    wget --quiet -O - https://insomnia.rest/keys/debian-public.key.asc | sudo apt-key add -
    echo "deb https://dl.bintray.com/getinsomnia/Insomnia /" | sudo tee /etc/apt/sources.list.d/insomnia.list
}
