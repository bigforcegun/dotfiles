import { execFile } from "node:child_process";
import { open, stat } from "node:fs/promises";
import type { BgItem } from "../shared/contracts";

const AGENT_ENV = /(?:^|\s)PASEO_AGENT_ID=([0-9a-f-]{36})(?=\s|$)/;
const SHELL = /^(?:\S*\/)?(?:ba|z|fi|da|k)?sh$/;

export interface Proc {
  pid: number;
  ppid: number;
  pgid: number;
  elapsedSec: number;
  cpu: number;
  command: string;
  agentId: string | null;
}

interface Fd {
  type: string;
  name: string;
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
      // lsof exits 1 when one of the requested pids vanished; its stdout is still valid.
      if (error && !stdout) reject(error);
      else resolve(stdout);
    });
  });
}

/** ps etime: [[dd-]hh:]mm:ss */
export function parseEtime(value: string): number {
  const [days, rest] = value.includes("-") ? value.split("-", 2) : ["0", value];
  const parts = (rest ?? "").split(":").map(Number);
  while (parts.length < 3) parts.unshift(0);
  const [h = 0, m = 0, s = 0] = parts;
  return Number(days) * 86400 + h * 3600 + m * 60 + s;
}

export async function listProcs(): Promise<Map<number, Proc>> {
  const [plain, withEnv] = await Promise.all([
    run("ps", ["-axww", "-o", "pid=,ppid=,pgid=,etime=,pcpu=,command="]),
    run("ps", ["-axwwE", "-o", "pid=,command="]),
  ]);
  const procs = new Map<number, Proc>();
  for (const line of plain.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(.*)$/.exec(line);
    if (!m) continue;
    procs.set(Number(m[1]), {
      pid: Number(m[1]),
      ppid: Number(m[2]),
      pgid: Number(m[3]),
      elapsedSec: parseEtime(m[4] ?? "0"),
      cpu: Number(m[5]),
      command: m[6] ?? "",
      agentId: null,
    });
  }
  // `ps -E` prints argv newlines raw (Claude's wrapper shell has several), so one record can span
  // lines. A record starts with a known, not-yet-seen pid; anything else continues the previous one.
  const records = new Map<number, string>();
  let currentPid = 0;
  for (const line of withEnv.split("\n")) {
    const m = /^\s*(\d+) (.*)$/.exec(line);
    const pid = m ? Number(m[1]) : 0;
    if (m && procs.has(pid) && !records.has(pid)) {
      currentPid = pid;
      records.set(pid, m[2] ?? "");
    } else if (currentPid) {
      records.set(currentPid, `${records.get(currentPid)}\n${line}`);
    }
  }
  for (const [pid, full] of records) {
    const proc = procs.get(pid);
    if (!proc) continue;
    // The environment follows the command text; never match inside the command itself.
    const lastLine = full.slice(full.lastIndexOf("\n") + 1);
    const env = full.startsWith(proc.command) ? full.slice(proc.command.length) : lastLine;
    proc.agentId = AGENT_ENV.exec(env)?.[1] ?? null;
  }
  // macOS ps shows no environment for some processes (Claude's long-argv wrapper zsh is one),
  // although their own children still carry it. A direct child of a provider process belongs
  // to that provider's agent.
  const roots = [...procs.values()].filter((p) => p.agentId && !procs.get(p.ppid)?.agentId);
  const rootIds = new Map(roots.map((r) => [r.pid, r.agentId]));
  for (const proc of procs.values()) {
    if (proc.agentId) continue;
    const inherited = rootIds.get(proc.ppid);
    if (inherited) proc.agentId = inherited;
  }
  return procs;
}

async function stdioOf(pids: number[]): Promise<Map<number, { stdin?: Fd; stdout?: Fd }>> {
  const out = new Map<number, { stdin?: Fd; stdout?: Fd }>();
  if (pids.length === 0) return out;
  const text = await run("lsof", ["-nP", "-a", "-p", pids.join(","), "-d", "0,1", "-F", "pftn"]).catch(() => "");
  let pid = 0;
  let fd = "";
  let type = "";
  for (const line of text.split("\n")) {
    const tag = line[0];
    const value = line.slice(1);
    if (tag === "p") pid = Number(value);
    else if (tag === "f") fd = value;
    else if (tag === "t") type = value;
    else if (tag === "n") {
      const entry = out.get(pid) ?? {};
      if (fd === "0") entry.stdin = { type, name: value };
      if (fd === "1") entry.stdout = { type, name: value };
      out.set(pid, entry);
    }
  }
  return out;
}

/** Claude wraps each command as `zsh -c source <snapshot> && ... && eval '<cmd>'`; show <cmd>. */
export function displayCommand(command: string): string {
  const m = /\beval '((?:[^']|'\\'')*)'/.exec(command);
  if (!m?.[1]) return command;
  const lines = m[1]
    .replace(/'\\''/g, "'")
    .replace(/\\012/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 1 && /^cd \S+$/.test(lines[0] ?? "")) lines.shift();
  return lines.join("\n");
}

function isProviderRoot(proc: Proc, procs: Map<number, Proc>): boolean {
  if (!proc.agentId) return false;
  const parent = procs.get(proc.ppid);
  return !parent || parent.agentId !== proc.agentId;
}

/**
 * Background work is either
 * - a shell that is a direct child of an agent's provider process and whose stdin is not a pipe
 *   (providers run commands through `sh -c`; MCP stdio servers, git fetches and other provider
 *   helpers are not shells or talk over pipes), or
 * - an orphan: an agent-tagged process reparented to pid 1 after it detached (`cmd &`, nohup)
 *   or after its provider died. macOS hides the environment of system binaries (/bin/zsh,
 *   /bin/sleep), so only orphans running non-system binaries (node, gh, python...) are visible.
 */
const PROVIDER_BINARY = /(?:^|\/)(?:claude|codex|opencode)$/;

function argv0(proc: Proc): string {
  return proc.command.split(" ")[0] ?? "";
}

export async function collectItems(): Promise<{ items: BgItem[]; procs: Map<number, Proc> }> {
  const procs = await listProcs();
  const children = new Map<number, Proc[]>();
  for (const proc of procs.values()) {
    const list = children.get(proc.ppid) ?? [];
    list.push(proc);
    children.set(proc.ppid, list);
  }
  const candidates: Array<{ proc: Proc; orphan: boolean }> = [];
  for (const proc of procs.values()) {
    if (!proc.agentId) continue;
    if (isProviderRoot(proc, procs)) {
      if (proc.ppid === 1 && !PROVIDER_BINARY.test(argv0(proc))) candidates.push({ proc, orphan: true });
      continue;
    }
    const parent = procs.get(proc.ppid);
    if (parent && isProviderRoot(parent, procs) && parent.ppid !== 1 && SHELL.test(argv0(proc))) {
      candidates.push({ proc, orphan: false });
    }
  }
  const stdio = await stdioOf(candidates.map((c) => c.proc.pid));
  const items: BgItem[] = [];
  for (const { proc, orphan } of candidates) {
    const io = stdio.get(proc.pid);
    if (io?.stdin?.type === "PIPE") continue;
    items.push({
      pid: proc.pid,
      pgid: proc.pgid,
      agentId: proc.agentId ?? "",
      command: displayCommand(proc.command),
      children: (children.get(proc.pid) ?? []).slice(0, 4).map((c) => c.command),
      elapsedSec: proc.elapsedSec,
      cpu: proc.cpu,
      outputPath: io?.stdout?.type === "REG" ? io.stdout.name : null,
      orphan,
    });
  }
  items.sort((a, b) => a.elapsedSec - b.elapsedSec);
  return { items, procs };
}

export async function tailFile(path: string, bytes: number): Promise<string> {
  const size = (await stat(path)).size;
  const start = Math.max(0, size - bytes);
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    const text = buffer.toString("utf8");
    return start > 0 ? text.slice(text.indexOf("\n") + 1) : text;
  } finally {
    await handle.close();
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function descendants(pid: number, procs: Map<number, Proc>): number[] {
  const out: number[] = [];
  const queue = [pid];
  while (queue.length) {
    const current = queue.shift()!;
    for (const proc of procs.values()) {
      if (proc.ppid === current) {
        out.push(proc.pid);
        queue.push(proc.pid);
      }
    }
  }
  return out;
}

/** SIGTERM the item's process group (or its tree), then SIGKILL whatever survives 2 s. */
export async function stopItem(item: BgItem, procs: Map<number, Proc>): Promise<{ forced: boolean }> {
  const ownGroup = item.pgid === item.pid;
  const tree = ownGroup ? [] : [item.pid, ...descendants(item.pid, procs)];
  const signal = (sig: NodeJS.Signals) => {
    if (ownGroup) {
      try { process.kill(-item.pgid, sig); } catch { /* already gone */ }
    } else {
      for (const pid of tree) {
        try { process.kill(pid, sig); } catch { /* already gone */ }
      }
    }
  };
  signal("SIGTERM");
  for (let i = 0; i < 20 && alive(item.pid); i++) await new Promise<void>((r) => setTimeout(r, 100));
  if (!alive(item.pid)) return { forced: false };
  signal("SIGKILL");
  return { forced: true };
}
