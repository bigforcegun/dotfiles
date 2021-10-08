RVM_RUBIES=(
	#"ruby-2.3.4"
	#"ruby-2.4.3"
	#"ruby-2.5.0"
	#"ruby-2.5.3"
  "ruby-2.6.5"
)


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
	
	apt install ${DESKTOP_DEV_PACKAGES[@]} -y
}

stage_install_kde_packages() {
	apt install ${DESKTOP_KDE_PACKAGES[@]} -y
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


stage_rvm_rubies(){
    for rv in "${RVM_RUBIES[@]}"
    do
    echo "${rv}"
        rvm install ${rv}
    done
}