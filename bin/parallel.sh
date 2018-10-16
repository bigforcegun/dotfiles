# split password-list in e.g. 390-line-files:
split -l 390 pwlist.txt pwlist-split-

# run bruteforce in parallel:
for PWLIST in $(ls pwlist-split-*) ; do mkdir /tmp/${PWLIST} ; nice bash bruteforce-encfs.sh ~/encfs-dir /tmp/${PWLIST} ${PWLIST} >> /tmp/crack.log 2>&1 & done