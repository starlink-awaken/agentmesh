/**
 * Agent Mesh — 多进程启动器
 *
 * 启动并管理 gateway（HTTP API）和 MCP server 进程。
 * 支持健康检查、自动重启（指数退避）、优雅停机、日志前缀。
 *
 * 只使用 Node.js 内置模块，无外部依赖。
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';

// ── 类型定义 ──

interface ManagedProcess {
  /** 内部标识名 */
  name: string;
  /** 日志前缀标签 */
  tag: string;
  /** 子进程对象（运行时设置） */
  proc: ChildProcess | null;
  /** 已重启次数 */
  restartCount: number;
  /** 最大重启次数 */
  maxRestarts: number;
  /** 可选的健康检查函数（null 表示跳过） */
  healthCheck: (() => Promise<boolean>) | null;
}

// ── 常量 ──

const __dirname = dirname(fileURLToPath(import.meta.url));
/** monorepo 根目录：apps/server/src/ → 上三级 */
const ROOT = resolve(__dirname, '..', '..', '..');

/** 重启退避延迟（毫秒） */
const BACKOFF_DELAYS = [1_000, 2_000, 4_000];

/** 健康检查轮询间隔（毫秒） */
const HEALTH_CHECK_INTERVAL = 10_000;

/** 优雅停机等待时间（毫秒），超时后发 SIGKILL */
const SHUTDOWN_GRACE_MS = 5_000;

/** 健康检查超时（毫秒） */
const HEALTH_CHECK_TIMEOUT = 3_000;

/** 受管理的进程列表 */
const processes: ManagedProcess[] = [];

// ── 工具函数 ──

/** 带标签的日志输出 */
function log(tag: string, message: string): void {
  console.error(`[${tag}] ${message}`);
}

/**
 * 解析 gateway 启动脚本路径。
 * 优先使用 dist（已构建），否则回退到 src。
 */
function resolveGatewayScript(): string {
  const distPath = join(ROOT, 'packages', 'gateway', 'dist', 'index.js');
  const srcPath = join(ROOT, 'packages', 'gateway', 'src', 'index.ts');

  if (fs.existsSync(distPath)) {
    log('launcher', `Gateway dist found: ${distPath}`);
    return distPath;
  }
  log('launcher', `Gateway dist not found, falling back to src: ${srcPath}`);
  return srcPath;
}

// ── 进程管理 ──

/** 启动单个进程 */
function startProcess(mp: ManagedProcess): void {
  log(mp.tag, `Starting ${mp.name}...`);

  let script: string;
  let cwd: string;

  if (mp.name === 'gateway') {
    script = resolveGatewayScript();
    cwd = ROOT;
  } else {
    // MCP server 在 apps/server/src/mcp/ 下
    script = join(__dirname, 'mcp', 'index.ts');
    cwd = ROOT;
  }

  const child = spawn('bun', ['run', script], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  mp.proc = child;
  const procRef = child;

  // stdout 加日志前缀
  child.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      console.log(`[${mp.tag}] ${line}`);
    }
  });

  // stderr 加日志前缀
  child.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      console.error(`[${mp.tag}] ${line}`);
    }
  });

  // 进程退出处理
  child.on('exit', (code: number | null, signal: string | null) => {
    // 如果 proc 被清空（stopProcess 主动终止），不重启
    if (!mp.proc || mp.proc !== procRef) return;

    log(mp.tag, `Exited with code ${code}, signal ${signal}`);

    if (mp.restartCount < mp.maxRestarts) {
      const delay =
        BACKOFF_DELAYS[mp.restartCount] ??
        BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1]!;
      mp.restartCount++;
      log(
        mp.tag,
        `Restarting in ${delay}ms (attempt ${mp.restartCount}/${mp.maxRestarts})...`,
      );
      setTimeout(() => startProcess(mp), delay);
    } else {
      log(mp.tag, `Max restarts (${mp.maxRestarts}) reached, giving up.`);
    }
  });

  child.on('error', (err: Error) => {
    log(mp.tag, `Process error: ${err.message}`);
  });
}

/** 优雅停止单个进程 */
function stopProcess(mp: ManagedProcess): Promise<void> {
  return new Promise<void>((resolveStop) => {
    const child = mp.proc;
    if (!child) {
      resolveStop();
      return;
    }

    const pid = child.pid;
    if (pid === undefined) {
      mp.proc = null;
      resolveStop();
      return;
    }

    log(mp.tag, `Stopping (PID ${pid})...`);

    // 标记为已停止，防止 exit 处理器触发重启
    mp.proc = null;

    // 发送 SIGTERM
    if (!child.kill('SIGTERM')) {
      // 进程已死亡
      resolveStop();
      return;
    }

    // 超时后 SIGKILL
    const timer = setTimeout(() => {
      try {
        process.kill(pid, 'SIGKILL');
        log(mp.tag, `Sent SIGKILL to PID ${pid}`);
      } catch {
        // 进程可能已经退出
      }
      resolveStop();
    }, SHUTDOWN_GRACE_MS);

    child.on('exit', () => {
      clearTimeout(timer);
      resolveStop();
    });
  });
}

/** 优雅停止所有进程 */
async function stopAll(): Promise<void> {
  log('launcher', 'Stopping all processes gracefully...');
  await Promise.all(processes.map(stopProcess));
  log('launcher', 'All processes stopped.');
}

// ── 健康检查 ──

/** 对指定 URL 执行 HTTP 健康检查 */
function httpHealthCheck(url: string): Promise<boolean> {
  return new Promise<boolean>((resolveCheck) => {
    const req = http.get(url, (res) => {
      resolveCheck(res.statusCode === 200);
      res.resume(); // 消费响应体以防止内存泄漏
    });

    req.on('error', () => {
      resolveCheck(false);
    });

    req.setTimeout(HEALTH_CHECK_TIMEOUT, () => {
      req.destroy();
      resolveCheck(false);
    });
  });
}

/** 启动健康检查轮询 */
function startHealthCheckLoop(): void {
  const check = async () => {
    for (const mp of processes) {
      if (!mp.healthCheck) continue;
      if (!mp.proc) continue; // 进程未运行，跳过

      const alive = await mp.healthCheck();
      if (!alive) {
        log(
          mp.tag,
          'Health check failed — process may be unresponsive',
        );
        // 如果进程真的挂了，exit 事件会触发重启逻辑
      }
    }
  };

  setInterval(check, HEALTH_CHECK_INTERVAL);
}

// ── 主入口 ──

/**
 * 启动所有进程。
 * 这是模块的主入口函数，供 CLI 或其他模块调用。
 */
export function startAll(): void {
  log('launcher', 'Initializing process manager...');

  // Gateway — HTTP API 服务
  processes.push({
    name: 'gateway',
    tag: 'gateway',
    proc: null,
    restartCount: 0,
    maxRestarts: 3,
    healthCheck: () =>
      httpHealthCheck('http://127.0.0.1:3000/v1/health'),
  });

  // MCP Server — stdio 模式（无 HTTP 健康检查）
  processes.push({
    name: 'mcp-server',
    tag: 'mcp',
    proc: null,
    restartCount: 0,
    maxRestarts: 3,
    healthCheck: null,
  });

  // 启动所有进程
  for (const mp of processes) {
    startProcess(mp);
  }

  // 启动健康检查轮询
  startHealthCheckLoop();

  // 注册信号处理器
  const handleSignal = async (signal: string) => {
    log('launcher', `Received ${signal}, shutting down...`);
    await stopAll();
    process.exit(0);
  };

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));

  log('launcher', 'All processes started. Ctrl+C to stop.');
}

/** 直接运行时的入口 */
if (import.meta.main) {
  startAll();
}
