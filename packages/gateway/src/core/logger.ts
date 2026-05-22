import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, data?: Record<string, any>): void;
  info(msg: string, data?: Record<string, any>): void;
  warn(msg: string, data?: Record<string, any>): void;
  error(msg: string, data?: Record<string, any>): void;
}

interface PinoLike {
  debug: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel: LogLevel = 'info';
let logDir: string | null = null;
let logFile: string | null = null;
let pinoInstance: PinoLike | null = null;

export function initLogger(opts: { level?: LogLevel; dir?: string; pino?: any } = {}) {
  currentLevel = opts.level || 'info';
  if (opts.pino && typeof opts.pino.child === 'function') {
    pinoInstance = opts.pino as PinoLike;
  }
  if (opts.dir) {
    logDir = opts.dir;
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    logFile = join(logDir, `agentmesh-${date}.log`);
  }
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function writeLine(level: LogLevel, msg: string, data?: Record<string, any>): void {
  const ts = new Date().toISOString();
  const extra = data ? ' ' + JSON.stringify(data) : '';
  const line = `[${ts}] [${level.toUpperCase()}] ${msg}${extra}`;

  if (pinoInstance) {
    // 委托给 Pino: 将 data 序列化到消息中
    pinoInstance[level](line);
  } else {
    process.stderr.write(line + '\n');
  }

  if (logFile) {
    try { Bun.write(logFile, line + '\n').catch(() => {}); } catch {}
  }
}

export const logger: Logger = {
  debug(msg, data) { if (shouldLog('debug')) writeLine('debug', msg, data); },
  info(msg, data) { if (shouldLog('info')) writeLine('info', msg, data); },
  warn(msg, data) { if (shouldLog('warn')) writeLine('warn', msg, data); },
  error(msg, data) { if (shouldLog('error')) writeLine('error', msg, data); },
};

export function createLogger(bindings?: Record<string, any>): Logger {
  if (!pinoInstance) return logger;
  // 直接从全局 pino 实例获取 child，当前版本用 context 前缀
  return logger;
}
