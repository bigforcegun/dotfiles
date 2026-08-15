# Handoff — zsh history truncation

## User goal

The user requires a complete durable zsh history. The real file is `~/.zsh_history_bfpc`; it has repeatedly been observed truncated to about 500 entries despite normal interactive shells reporting huge limits. A backup exists, but the live history must not be overwritten during diagnosis.

## Confirmed findings

1. The original configuration exported `HISTFILE`. A child zsh could inherit the real history pathname while using incomplete or different history configuration. This was a real unsafe channel even though the exact historical `SAVEHIST=500` writer was not captured.
2. A live tmux server had `HISTFILE=/Users/bigforcegun/.zsh_history_bfpc` in its global environment. Its environment was manually cleared during the investigation.
3. Every valid record currently captured in `~/.zsh_history_bfpc.writers.log` has `HISTSIZE=SAVEHIST=1000000000`. No record identifies a shell with a 500-entry limit.
4. `writers.log` records normal interactive zsh exit state only. It cannot prove which process wrote the file and misses processes that skip `.zshrc` or non-zsh writers.
5. `fs_usage` is noisy if matched by path substring: Finder metadata and similarly named files dominate. Its process/thread token is a suspect, not authoritative PID attribution; pathname output can be truncated/wrapped.
6. macOS sudo timestamps are per-TTY by default. A `sudo -v` in a caller terminal cannot authorize `sudo -n` launched later in a detached tmux pane. Multiple self-daemon designs were rejected and rolled back because they could falsely report success or leave a privileged tracer behind.

## Active configuration

### History hardening

- `.zshenv:47` sets `HISTFILE="$HOME/.zsh_history_bfpc"` and immediately removes export with `typeset +x HISTFILE`.
- `.zshrc:16` repeats the real history path after `/etc/zshrc` and also removes its export.
- `.tmux.conf.local:487` clears `HISTFILE`, `HISTSIZE`, and `SAVEHIST` from the long-lived tmux server environment.
- Existing open panes created before the fix should run `typeset +x HISTFILE` once.

### History behavior

- `.zsh/environment.zsh` has `INC_APPEND_HISTORY` and `APPEND_HISTORY` enabled, `SHARE_HISTORY` disabled.
- `HIST_FIND_NO_DUPS` is enabled. It affects only line-editor search results and does not modify stored history.
- `HIST_SAVE_NO_DUPS` and `HIST_IGNORE_ALL_DUPS` remain disabled. Do not enable compaction/deduplication against the live shared history until an offline, audited workflow is deliberately designed.

### Forensics

- `~/.zsh_history_bfpc.writers.log` is written by `_zsh_history_writer_log` in `.zshrc` through `zshexit`; each ordinary interactive shell exit records PID, PPID, TTY, history limits/options, shell command, and parent command.
- `~/.zsh_history_bfpc.fs_usage.log` is legacy raw output from the earlier noisy watcher. Do not treat it as trustworthy evidence without exact operation/path filtering.
- `bin/zsh-history-trace` is the current supported foreground tracer. It does not daemonize or use `launchctl`.

## Current supported command

Run this manually in a dedicated ordinary terminal or tmux pane:

```zsh
~/.dotfiles/bin/zsh-history-trace
```

Optional explicit target and log path:

```zsh
~/.dotfiles/bin/zsh-history-trace -l /secure/path/events.log ~/.zsh_history_bfpc
```

Behavior:

- Requests `sudo` directly in the current TTY for `fs_usage`.
- Runs in the foreground; stop with `Ctrl-C`.
- Logs to `~/.zsh_history_bfpc.manual-trace.log` by default, mode `0600`.
- Filters metadata/read noise and similarly named `.old`, `copy`, and sidecar files.
- Records only observed write/truncate/rename/unlink activity for the exact target or `${target}.new`, plus the `fs_usage` process/thread token marked `attribution=fs_usage_suspect`.
- Re-stats device/inode/size after relevant events and sends a macOS Notification Center alert when the file shrinks, disappears, or is replaced.
- Does not save history commands, full argv, or history contents.

## Validation already performed

- `zsh -n bin/zsh-history-trace` passes.
- `bin/zsh-history-trace --help` passes and the file is executable (`0755`).
- Worker-run synthetic tmux QA exercised write, truncate, rename, unlink, shrink, replacement, disappearance, sidecar exclusion, log mode `0600`, notification path, and cleanup. It did not access the live history file.
- The real privileged `fs_usage` stream was not automated because no password was requested; run the command above to validate it on this machine.

## Abandoned designs — do not resurrect casually

1. A foreground function piping `sudo fs_usage` through a plain substring `grep`: too noisy and not size-aware.
2. A self-daemon with custom PID/state files and root tracer child: rejected by independent review for sudo-expiry cleanup, PID reuse, stale state, parser blind spots, and potential orphaned privileged tracer.
3. A detached tmux daemon that authenticated sudo before creating the pane: rejected because sudo authorization is per-TTY and does not cross into the detached pane.

## Strict safety boundaries

- Never test a watcher by truncating or replacing `~/.zsh_history_bfpc`; use synthetic data in a mode-0700 temporary directory.
- Never run a detached/root watcher until authentication and child-cleanup semantics have been redesigned and independently reviewed.
- Never claim `fs_usage` process/thread text is a definitive PID or causal proof.
- Do not copy raw history, raw `fs_usage`, credentials, or full command lines into this context.
- The root cause remains unconfirmed; current evidence indicates the actual truncator bypassed the regular `.zshrc` exit logger or is not a normal zsh writer.
