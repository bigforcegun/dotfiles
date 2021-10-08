#FIXME
# Система гавна с этими PPA, надо найти способ быстро их накатывать, бекапить и мигрировать на новую версию ебучей убунты =(


curl -sS https://download.spotify.com/debian/pubkey_0D811D58.gpg | sudo apt-key add -
echo "deb http://repository.spotify.com stable non-free" | sudo tee /etc/apt/sources.list.d/spotify.list

curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -

