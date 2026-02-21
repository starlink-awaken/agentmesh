import { writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

interface Metric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  data?: any;
}

export class Metrics {
  private metrics: Map<string, Metric[]> = new Map();
  private logs: LogEntry[] = [];
  private logDir: string;
  private maxMetricsHistory = 1000;
  private maxLogsHistory = 1000;

  constructor(logDir: string = './logs') {
    this.logDir = logDir;
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 记录指标
   */
  record(name: string, value: number, tags?: Record<string, string>): void {
    const metric: Metric = {
      name,
      value,
      timestamp: Date.now(),
      tags
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const history = this.metrics.get(name)!;
    history.push(metric);

    // 保持历史记录数量
    if (history.length > this.maxMetricsHistory) {
      history.shift();
    }
  }

  /**
   * 递增计数器
   */
  increment(name: string, tags?: Record<string, string>): void {
    const current = this.get(name);
    this.record(name, current + 1, tags);
  }

  /**
   * 记录执行时间
   */
  timing(name: string, duration: number, tags?: Record<string, string>): void {
    this.record(`${name}.duration`, duration, tags);
  }

  /**
   * 获取指标值
   */
  get(name: string): number {
    const history = this.metrics.get(name);
    if (!history || history.length === 0) return 0;
    const last = history[history.length - 1];
    return last?.value ?? 0;
  }

  /**
   * 获取指标历史
   */
  getHistory(name: string, limit?: number): Metric[] {
    const history = this.metrics.get(name);
    if (!history) return [];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * 获取所有指标摘要
   */
  getSummary(): Record<string, { count: number; last: number; avg: number }> {
    const summary: Record<string, { count: number; last: number; avg: number }> = {};

    for (const [name, history] of this.metrics) {
      if (history.length === 0) continue;

      const values = history.map(m => m.value);
      const sum = values.reduce((a, b) => a + b, 0);

      summary[name] = {
        count: history.length,
        last: values[values.length - 1],
        avg: sum / values.length
      };
    }

    return summary;
  }

  /**
   * 记录日志
   */
  log(level: LogEntry['level'], message: string, data?: any): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      data
    };

    this.logs.push(entry);

    // 保持日志数量
    if (this.logs.length > this.maxLogsHistory) {
      this.logs.shift();
    }

    // 写入文件
    this.writeLogToFile(entry);
  }

  private writeLogToFile(entry: LogEntry): void {
    try {
      const date = new Date(entry.timestamp).toISOString().split('T')[0];
      const logFile = join(this.logDir, `gateway-${date}.log`);
      const line = `[${new Date(entry.timestamp).toISOString()}] [${entry.level.toUpperCase()}] ${entry.message}${entry.data ? ' ' + JSON.stringify(entry.data) : ''}\n`;
      appendFileSync(logFile, line);
    } catch (error) {
      console.error('Failed to write log to file:', error);
    }
  }

  /**
   * 获取日志
   */
  getLogs(level?: LogEntry['level'], limit?: number): LogEntry[] {
    let filtered = this.logs;

    if (level) {
      filtered = filtered.filter(l => l.level === level);
    }

    return limit ? filtered.slice(-limit) : filtered;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    uptime: number;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    activeAgents: number;
    metricsCount: number;
    logsCount: number;
  } {
    const taskHistory = this.metrics.get('tasks.submitted') || [];
    const completedHistory = this.metrics.get('tasks.completed') || [];
    const failedHistory = this.metrics.get('tasks.failed') || [];

    return {
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      totalTasks: taskHistory.length,
      completedTasks: completedHistory.length,
      failedTasks: failedHistory.length,
      activeAgents: this.metrics.get('agents.active')?.[0]?.value || 0,
      metricsCount: this.metrics.size,
      logsCount: this.logs.length
    };
  }

  private startTime = Date.now();

  /**
   * 启动计时
   */
  start(): void {
    this.startTime = Date.now();
  }

  /**
   * 重置指标
   */
  reset(): void {
    this.metrics.clear();
    this.logs = [];
    this.startTime = Date.now();
  }
}

export const metrics = new Metrics();

// 便捷方法
export const logger = {
  debug: (message: string, data?: any) => metrics.log('debug', message, data),
  info: (message: string, data?: any) => metrics.log('info', message, data),
  warn: (message: string, data?: any) => metrics.log('warn', message, data),
  error: (message: string, data?: any) => metrics.log('error', message, data)
};
