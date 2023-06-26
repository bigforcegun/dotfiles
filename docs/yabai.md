#

```sh
brew install koekeishiya/formulae/yabai
brew install koekeishiya/formulae/skhd

skhd --start-service
yabai --start-service

```

Configure scripting addition
yabai uses the macOS Mach APIs to inject code into Dock.app; this requires elevated (root) privileges. You can configure your user to execute yabai --load-sa as the root user without having to enter a password. To do this, we add a new configuration entry that is loaded by /etc/sudoers.

# create a new file for writing - visudo uses the vim editor by default

# go read about this if you have no idea what is going on

sudo visudo -f /private/etc/sudoers.d/yabai

# input the line below into the file you are editing

# replace <yabai> with the path to the yabai binary (output of: which yabai)

# replace <user> with your username (output of: whoami)

# replace <hash> with the sha256 hash of the yabai binary (output of: shasum -a 256 $(which yabai))

# this hash must be updated manually after running brew upgrade

<user> ALL=(root) NOPASSWD: sha256:<hash> <yabai> --load-sa
After the above edit has been made, add the command to load the scripting addition at the top of your yabairc config file

# for this to work you must configure sudo such that

# it will be able to run the command without password

yabai -m signal --add event=dock_did_restart action="sudo yabai --load-sa"
sudo yabai --load-sa

# .. more yabai startup stuff


---

# Stacking

# stack target_window_sel onto source_window_sel
yabai -m window [<source_window_sel>] --stack <target_window_sel>

# next window is inserted onto source_window_sel
yabai -m window [<source_window_sel>] --insert stack

# focus the prev window in a stack
yabai -m window --focus stack.prev

# focus the next window in a stack
yabai -m window --focus stack.next

# focus the first window in a stack
yabai -m window --focus stack.first

# focus the last window in a stack
yabai -m window --focus stack.last

# focus the most recently focused window in a stack
yabai -m window --focus stack.recent


---

https://github.com/koekeishiya/yabai/issues/203#issuecomment-706675848

Shout-out! - Very nice contribution.

Is there a way to unstack only a single window?
wrap works if there already is another peer node already, but often I end up with a single stack node and want to pop-up one window?
Right now my work-around is to set yabai -m space --layout bsp, but then the entire tree gets unstacked.
Thanks for any help!

@stefandeml what about yabai -m window --toggle float ? If your space layout is bsp, doing it two times should do the job

---