typeset -gA ZSH_HIGHLIGHT_STYLES
ZSH_HIGHLIGHT_STYLES[comment]='fg=white,bold'

# @deprecated
#spaceship_reset_tmux_pane_title() {
#  # Reset tmux pane title
#  printf '\033]2;%s\033\\' ''
#}

export SPACESHIP_PROMPT_ORDER1=(
  time
  user
  dir
  host
  git_branch
  git_status
  kubecontext
  azure
  exec_time
  line_sep
  jobs
  char
)

export SPACESHIP_CHAR_SYMBOL="❯ "
export SPACESHIP_JOBS_SYMBOL="»"
export SPACESHIP_TIME_SHOW=true
export SPACESHIP_USER_PREFIX="as "
export SPACESHIP_USER_SHOW="needed"
export SPACESHIP_DIR_TRUNC_PREFIX=".../"
export SPACESHIP_DIR_TRUNC_REPO=false
