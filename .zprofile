# Commands to execute asynchronously once after a login
{
  dircolors -b >! "$HOME/.dircolors.zsh"
} &!

# Load machine-specific initialization
#if [[ "$HOST" =~ "desktop-" ]]; then
  # source ~/.zsh/autorun-startx.zsh
#fi

export SSH_AUTH_SOCK="${XDG_RUNTIME_DIR}/ssh-agent.socket" #FUCK
