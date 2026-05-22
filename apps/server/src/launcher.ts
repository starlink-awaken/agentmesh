/**
 * Agent Mesh — 多进程启动器
 *
 * 启动并管理 gateway（HTTP API）和 MCP server 进程。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

interface ManagedProcess {
  name: string;
  cmd: string;
  args: string[];
  proc: ChildProcess | null;
  restartCount: number;
  maxRestarts: number;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const processes: ManagedProcess[] = [];

function createProcess(name: string, cmd: string, args: string[], maxRestarts = 3): ManagedProcess {
  return { name, cmd, args, proc: null, restartCount: 0, maxRestarts };
}

function startProcess(mp: ManagedProcess): void {
  console.error(`[Launcher] Starting ${mp.name}...`);
  mp.proc = spawn(mp.cmd, mp.args, {
    stdio: ['pipe', 'inherit', 'inherit'],
    env: { ...process.env },
  });
  const procRef = mp.proc;

  mp.proc.on('exit', (code: number | null) => {
    // 被 stopProcess 主动终止，不重启
    if (!mp.proc || mp.proc !== procRef) return;
    console.error(`[Launcher] ${mp.name} exited with code ${code}`);
    if (mp.restartCount < mp.maxRestarts) {
      mp.restartCount++;
      console.error(`[Launcher] Restarting ${mp.name} (attempt ${mp.restartCount}/${mp.maxRestarts})...`);
      startProcess(mp);
    } else {
      console.error(`[Launcher] ${mp.name} max restarts reached, giving up.`);
    }
  });

  mp.proc.on('error', (err) => {
    console.error(`[Launcher] ${mp.name} error:`, err.message);
  });
}

function stopProcess(mp: ManagedProcess): void {
  if (mp.proc) {
    mp.proc.kill('SIGTERM');
    mp.proc = null;
  }
}

function stopAll(): void {
  console.error('[Launcher] Stopping all processes...');
  for (const mp of processes) stopProcess(mp);
}

/** 启动所有进程 */
export function startAll(): void {
  // MCP 服务器（stdio 模式）
  processes.push(createProcess('mcp-server', 'bun', [
    join(__dirname, 'mcp', 'index.ts'),
  ]));

  for (const mp of processes) startProcess(mp);

  process.on('SIGTERM', stopAll);
  process.on('SIGINT', () => { stopAll(); process.exit(0); });

  console.error('[Launcher] All processes started. Ctrl+C to stop.');
}

/** 主入口 */
if (import.meta.main) {
  startAll();
}
