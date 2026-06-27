bindkey -M emacs "$key_info[Up]" history-substring-search-up
bindkey -M emacs "$key_info[Down]" history-substring-search-down
#bindkey -M emacs "$key_info[Control]K" backward-kill-line
#bindkey -M emacs "$key_info[Control]V$key_info[Control]V" edit-command-line
#bindkey -M emacs "^_" pound-toggle
bindkey -M emacs "\e[1;3D" backward-word
bindkey -M emacs "\e[1;3C" forward-word
