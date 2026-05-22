/**
 * Logger - 日志系统
 *
 * 支持日志级别控制、结构化日志、多输出目标和日志轮转
 *
 * @author PAI
 * @version 1.0.0
 */

import { createWriteStream, existsSync, statSync, mkdirSync, appendFileSync, renameSync } from 'fs';
import { dirname } from 'path';
import type { LogEntry, LogLevel, LoggerConfig, LogOutput } from './types.js';
import { EventEmitter } from './EventEmitter.js';

/**
 * 日志级别优先级
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Logger - 日志系统类
 */
export class Logger extends EventEmitter {
  private config: Required<LoggerConfig>;
  private fileStream?: ReturnType<typeof createWriteStream>;
  private currentFileSize: number = 0;

  /**
   * 构造函数
   */
  constructor(config: LoggerConfig = {}) {
    super({ verbose: false });
    this.config = {
      level: config.level ?? 'info',
      output: config.output ?? 'console',
      filePath: config.filePath ?? './logs/app.log',
      maxFileSize: config.maxFileSize ?? 10 * 1024 * 1024, // 10MB
      maxFiles: config.maxFiles ?? 5,
      enableColors: config.enableColors ?? true,
      enableTimestamp: config.enableTimestamp ?? true,
      format: config.format ?? 'json',
    };

    if (this.config.output === 'file' || this.config.output === 'both') {
      this.initFileStream();
    }
  }

  /**
   * 初始化文件流
   */
  private initFileStream(): void {
    const dir = dirname(this.config.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.fileStream = createWriteStream(this.config.filePath, { flags: 'a' });
    this.updateFileSize();
  }

  /**
   * 更新文件大小
   */
  private updateFileSize(): void {
    try {
      if (existsSync(this.config.filePath)) {
        const stats = statSync(this.config.filePath);
        this.currentFileSize = stats.size;
      }
    } catch {
      this.currentFileSize = 0;
    }
  }

  /**
   * 检查日志级别是否启用
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.level];
  }

  /**
   * 创建日志条目
   */
  private createLogEntry(level: LogLevel, message: string, metadata?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
    };

    // 触发事件
    this.emit('log', entry);

    return entry;
  }

  /**
   * 格式化日志为文本
   */
  private formatText(entry: LogEntry): string {
    const parts: string[] = [];

    if (this.config.enableTimestamp) {
      parts.push(`[${entry.timestamp}]`);
    }

    parts.push(`[${entry.level.toUpperCase()}]`);

    if (entry.context) {
      parts.push(`[${entry.context}]`);
    }

    parts.push(entry.message);

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      parts.push(JSON.stringify(entry.metadata));
    }

    return parts.join(' ') + '\n';
  }

  /**
   * 格式化日志为 JSON
   */
  private formatJson(entry: LogEntry): string {
    return JSON.stringify(entry) + '\n';
  }

  /**
   * 写入日志到文件
   */
  private writeToFile(entry: LogEntry): void {
    if (!this.fileStream) return;

    // 检查是否需要轮转
    if (this.currentFileSize >= this.config.maxFileSize) {
      this.rotateLogs();
    }

    const formatted = this.config.format === 'json'
      ? this.formatJson(entry)
      : this.formatText(entry);

    this.fileStream.write(formatted);
    this.currentFileSize += Buffer.byteLength(formatted, 'utf8');
  }

  /**
   * 日志轮转
   */
  private rotateLogs(): void {
    if (!this.fileStream) return;

    this.fileStream.end();

    // 轮转现有文件
    for (let i = this.config.maxFiles - 1; i >= 1; i--) {
      const oldPath = `${this.config.filePath}.${i}`;
      const newPath = `${this.config.filePath}.${i + 1}`;

      if (existsSync(oldPath)) {
        if (existsSync(newPath)) {
          renameSync(newPath, `${newPath}.bak`);
        }
        renameSync(oldPath, newPath);
      }
    }

    // 当前日志文件轮转为 .1
    if (existsSync(this.config.filePath)) {
      renameSync(this.config.filePath, `${this.config.filePath}.1`);
    }

    // 重新初始化文件流
    this.initFileStream();
  }

  /**
   * 控制台输出颜色
   */
  private getColor(level: LogLevel): string {
    if (!this.config.enableColors) return '';

    const colors: Record<LogLevel, string> = {
      debug: '\x1b[36m',    // cyan
      info: '\x1b[32m',     // green
      warn: '\x1b[33m',     // yellow
      error: '\x1b[31m',    // red
    };

    return colors[level];
  }

  private resetColor(): string {
    return '\x1b[0m';
  }

  /**
   * 写入日志到控制台
   */
  private writeToConsole(entry: LogEntry): void {
    const color = this.getColor(entry.level);
    const reset = this.resetColor();

    if (this.config.format === 'json') {
      console.log(color + this.formatJson(entry).trim() + reset);
    } else {
      const text = this.formatText(entry).trim();
      console.log(color + text + reset);
    }
  }

  /**
   * 写日志
   */
  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry = this.createLogEntry(level, message, metadata);

    if (this.config.output === 'console' || this.config.output === 'both') {
      this.writeToConsole(entry);
    }

    if (this.config.output === 'file' || this.config.output === 'both') {
      this.writeToFile(entry);
    }
  }

  /**
   * Debug 级别日志
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, metadata);
  }

  /**
   * Info 级别日志
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, metadata);
  }

  /**
   * Warn 级别日志
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, metadata);
  }

  /**
   * Error 级别日志
   */
  error(message: string, metadata?: Record<string, unknown>): void {
    this.log('error', message, metadata);
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * 获取日志级别
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * 创建子日志器
   */
  child(context: string): Logger {
    const childLogger = new Logger(this.config);
    const originalLog = childLogger.log.bind(childLogger);

    childLogger.log = (level: LogLevel, message: string, metadata?: Record<string, unknown>) => {
      originalLog(level, message, { ...metadata, context });
    };

    return childLogger;
  }

  /**
   * 刷新日志缓冲区
   */
  flush(): void {
    if (this.fileStream) {
      // WriteStream 没有 flush 方法，使用 sync 方法代替
      (this.fileStream as any).sync?.();
    }
  }

  /**
   * 关闭日志器
   */
  close(): void {
    this.flush();
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = undefined;
    }
  }
}

/**
 * 创建日志器的便捷函数
 */
export function createLogger(config: LoggerConfig = {}): Logger {
  return new Logger(config);
}

/**
 * 默认日志器实例
 */
let defaultLogger: Logger | null = null;

/**
 * 获取默认日志器
 */
export function getDefaultLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger({
      level: 'info',
      output: 'console',
      format: 'json',
    });
  }
  return defaultLogger;
}

/**
 * 设置默认日志器
 */
export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger;
}
