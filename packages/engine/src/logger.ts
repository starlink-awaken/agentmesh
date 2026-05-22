/**
 * Honeycomb v2 - 结构化日志记录器
 *
 * 提供彩色终端输出和可选的 JSON Lines 文件日志记录。
 * 支持日志级别过滤、Agent 作用域日志和阶段作用域日志。
 *
 * @since v2.0.0
 */

import * as fs from 'node:fs';
import type { LogEntry } from './types.js';

// ============================================================
// ANSI Color Codes
// ============================================================

const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
} as const;

const LEVEL_COLORS: Record<string, string> = {
  debug: COLORS.gray,
  info: COLORS.green,
  warn: COLORS.yellow,
  error: COLORS.red,
};

// ============================================================
// Log Level Priority
// ============================================================

const LEVEL_PRIORITY: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ============================================================
// Logger Configuration
// ============================================================

export interface LoggerConfig {
  level: string;
  file?: string;
}

// ============================================================
// Logger Class
// ============================================================

export class Logger {
  private readonly level: string;
  private readonly levelPriority: number;
  private readonly filePath?: string;
  private traceId: string | null = null;

  constructor(config: LoggerConfig) {
    this.level = config.level;
    this.levelPriority = LEVEL_PRIORITY[config.level] ?? LEVEL_PRIORITY.info;
    this.filePath = config.file;
  }

  // ----------------------------------------------------------
  // Trace ID Management
  // ----------------------------------------------------------

  /**
   * Set the current trace ID for all subsequent log entries.
   * Pass null to clear the trace ID.
   */
  setTraceId(id: string | null): void {
    this.traceId = id;
  }

  /**
   * Get the current trace ID.
   */
  getTraceId(): string | null {
    return this.traceId;
  }

  // ----------------------------------------------------------
  // Public API: Standard log levels
  // ----------------------------------------------------------

  debug(event: string, message: string, data?: Record<string, unknown>): void {
    this.log('debug', event, message, data);
  }

  info(event: string, message: string, data?: Record<string, unknown>): void {
    this.log('info', event, message, data);
  }

  warn(event: string, message: string, data?: Record<string, unknown>): void {
    this.log('warn', event, message, data);
  }

  error(event: string, message: string, data?: Record<string, unknown>): void {
    this.log('error', event, message, data);
  }

  // ----------------------------------------------------------
  // Public API: Scoped loggers
  // ----------------------------------------------------------

  agent(agentName: string, event: string, message: string, data?: Record<string, unknown>): void {
    this.log('info', event, message, data, { agent: agentName });
  }

  phase(phase: string, event: string, message: string, data?: Record<string, unknown>): void {
    this.log('info', event, message, data, { phase });
  }

  // ----------------------------------------------------------
  // Internal logging engine
  // ----------------------------------------------------------

  private log(
    level: string,
    event: string,
    message: string,
    data?: Record<string, unknown>,
    scope?: { agent?: string; phase?: string },
  ): void {
    // Level filtering
    const priority = LEVEL_PRIORITY[level] ?? 0;
    if (priority < this.levelPriority) {
      return;
    }

    const timestamp = new Date().toISOString();

    // Build log entry
    const entry: LogEntry = {
      timestamp,
      level: level as LogEntry['level'],
      event,
      message,
    };

    if (scope?.agent) entry.agent = scope.agent;
    if (scope?.phase) entry.phase = scope.phase;
    if (this.traceId) entry.trace_id = this.traceId;
    if (data && Object.keys(data).length > 0) entry.data = data;

    // Terminal output
    this.writeTerminal(entry);

    // File output (JSON Lines)
    if (this.filePath) {
      this.writeFile(entry);
    }
  }

  // ----------------------------------------------------------
  // Terminal output with ANSI colors
  // ----------------------------------------------------------

  private writeTerminal(entry: LogEntry): void {
    const color = LEVEL_COLORS[entry.level] ?? COLORS.reset;
    const levelTag = entry.level.toUpperCase().padEnd(5);

    // Build scope label: [agent] or [phase] or empty
    let scopeLabel = '';
    if (entry.agent) {
      scopeLabel = ` [${entry.agent}]`;
    } else if (entry.phase) {
      scopeLabel = ` [${entry.phase}]`;
    }

    // Add trace ID if present: [trace_id]
    const traceLabel = entry.trace_id ? ` [${entry.trace_id}]` : '';

    // Format: [timestamp] LEVEL [trace_id] [scope] event: message
    const line = `${color}[${entry.timestamp}] ${levelTag}${traceLabel}${scopeLabel} ${entry.event}: ${entry.message}${COLORS.reset}`;

    if (entry.level === 'error') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }

  // ----------------------------------------------------------
  // File output (JSON Lines, append mode)
  // ----------------------------------------------------------

  private writeFile(entry: LogEntry): void {
    if (!this.filePath) return;

    try {
      const json = JSON.stringify(entry);
      fs.appendFileSync(this.filePath, json + '\n', 'utf-8');
    } catch {
      // Silently swallow file write errors to avoid recursive logging
    }
  }
}

// ============================================================
// Factory & Global Instance
// ============================================================

/**
 * Create a new Logger instance with the given configuration.
 */
export function createLogger(config: LoggerConfig): Logger {
  return new Logger(config);
}

/**
 * Global logger instance with default 'info' level.
 * Can be replaced at engine startup with a configured instance.
 */
export const logger: Logger = createLogger({ level: 'info' });
