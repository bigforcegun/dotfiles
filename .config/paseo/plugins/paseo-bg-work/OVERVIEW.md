Shows the processes an agent left running after its turn ended: background shells, watch loops,
`gh run watch`, dev servers. A composer pill counts them, and the agent's Background work panel
(Explorer or workspace tab) lists each command with its age, CPU, live output tail and a Stop button.

It works for any provider by reading the daemon machine's process table. Paseo launches every
provider with `PASEO_AGENT_ID` in its environment; the plugin groups processes by that variable
and treats direct children of the provider process, without a pipe on stdin, as the agent's work.
Processes are shown as background work only while the agent is not running a turn. Processes
whose agent is archived or whose provider died appear as orphans in the panel.

Stop sends SIGTERM to the process group, then SIGKILL after two seconds. Output tail is available
when the process writes stdout to a file, which is the case for Claude Code tasks; PTY-backed
terminals have no tail. macOS only; it shells out to `ps` and `lsof` every three seconds while a
client is connected.
