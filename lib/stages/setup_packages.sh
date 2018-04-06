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
)

USER_PACKAGES=(
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

DEV_PACKAGES=(
    "mongodb"
    "mongodb-dev"
    "whois"
    "goaccess"
	"postgresql-client"
	"postgresql-client-common"
	"build-essential"
	"nodejs"
	"git"
	"git-flow"
	"redis-server"
	"mysql-server"
	"mysql-client"
	"postgresql"
	"postgresql-contrib"
	"libmysqlclient-dev"
	"libreadline6-dev"
	"libpq-dev"
	"neovim"
	"yarn"
	"docker-ce"
	"insomnia"
	"gdb"
	"lldb"
	"libxml2-dev"
	"python3-pip"
)

KDE_PACKAGES=(
    "kdesrc-build"
    "kipi-plugins"
    "kde-config-systemd"
    "kcron"
    "plasma-vault"
    "plasma-workspace-dev"
    "qml-module-org-kde-kio"
    "arc-kde"
    "adapta-kde"
    "kio-extras"
    "kio-dev"
    "kio gettext"
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
)

UTILITIES_PACKAGES=(
    # "urlwatch"
    "samba"
    "apt-transport-https"
    "ca-certificates"
    "jq"
    "apache2-utils"
    "wrk"
	"net-tools"
	"htop"
	"mc"
    "linux-tools-common"
	"linux-tools-generic"
	"software-properties-common"
	"curl"
	"wget"
    "apache2-utils"
    "screenfetch"
    "neofetch"
    "hardinfo"
	"rar"
	#"laptop-mode-tools"
	"tlp"
	"tlp-rdw"
	"unrar"
	"finger"
    "tmux"
    "tree"
    "unrar"
    "unzip"
	"powertop"
	"stress"
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
	# "ruby-2.4.1"
	# "ruby-2.4.2"
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

stage_install_user_packages() {
	apt install ${USER_PACKAGES[@]} -y
}

stage_install_utils_packages() {
	apt install ${UTILITIES_PACKAGES[@]} -y
}

stage_install_dev_packages() {
	export DEBIAN_FRONTEND=noninteractive
	apt install ${DEV_PACKAGES[@]} -y
}

stage_install_kde_packages() {
	apt install ${KDE_PACKAGES[@]} -y
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

    echo "deb https://dl.bintray.com/getinsomnia/Insomnia /" \
    | sudo tee -a /etc/apt/sources.list.d/insomnia.list
    wget --quiet -O - https://insomnia.rest/keys/debian-public.key.asc \
    | sudo apt-key add -
}
