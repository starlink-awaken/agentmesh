/**
 * LoggingMiddleware - 日志中间件
 *
 * 提供请求、响应、错误的日志记录能力
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  MiddlewareContext,
  MiddlewareNext,
  MiddlewareFunc,
  LoggingConfig,
  LogLevel,
  Logger,
} from './types.js';

import { ConsoleLogger } from './types.js';

/**
 * 日志条目
 */
export interface LogEntry {
  /** 日志级别 */
  level: LogLevel;
  /** 日志消息 */
  message: string;
  /** 请求 ID */
  requestId?: string;
  /** 时间戳 */
  timestamp: number;
  /** 额外数据 */
  data?: Record<string, any>;
}

/**
 * LoggingMiddleware 类
 *
 * 提供日志记录功能
 */
export class LoggingMiddleware {
  private config: Required<LoggingConfig>;
  private logger: Logger;
  private logQueue: LogEntry[] = [];
  private isProcessing = false;

  constructor(config: LoggingConfig = {}) {
    this.config = {
      level: config.level || 'info',
      timestamp: config.timestamp !== false,
      requestId: config.requestId !== false,
      logRequestBody: config.logRequestBody || false,
      logResponseBody: config.logResponseBody || false,
      logger: config.logger || new ConsoleLogger(),
    };
    this.logger = this.config.logger;
  }

  /**
   * 创建日志中间件
   */
  create(): MiddlewareFunc {
    return async (context: MiddlewareContext, next: MiddlewareNext): Promise<MiddlewareContext> => {
      // 记录请求开始
      await this.logRequest(context);

      const startTime = Date.now();

      try {
        // 执行下一个中间件
        const result = await next(context);

        // 计算耗时
        const duration = Date.now() - startTime;

        // 记录响应
        await this.logResponse(result, duration);

        return result;
      } catch (error) {
        // 记录错误
        await this.logError(error as Error, context);

        throw error;
      }
    };
  }

  /**
   * 记录请求
   */
  async logRequest(context: MiddlewareContext): Promise<void> {
    const { request } = context;
    const logData: Record<string, any> = {
      method: request.method,
      path: request.path,
      query: request.query,
    };

    // 可选：记录请求体
    if (this.config.logRequestBody && request.body) {
      logData.body = request.body;
    }

    // 可选：记录用户
    if (request.user) {
      logData.user = request.user;
    }

    this.log('info', `${request.method} ${request.path}`, {
      ...logData,
      headers: this.sanitizeHeaders(request.headers),
    });
  }

  /**
   * 记录响应
   */
  async logResponse(context: MiddlewareContext, duration: number): Promise<void> {
    const { request, response } = context;

    if (!response) {
      this.log('warn', `No response for ${request.method} ${request.path}`);
      return;
    }

    const logData: Record<string, any> = {
      status: response.status,
      duration: `${duration}ms`,
    };

    // 可选：记录响应体
    if (this.config.logResponseBody && response.body) {
      logData.body = response.body;
    }

    // 根据状态码选择日志级别
    if (response.status >= 500) {
      this.log('error', `${request.method} ${request.path} - ${response.status}`, logData);
    } else if (response.status >= 400) {
      this.log('warn', `${request.method} ${request.path} - ${response.status}`, logData);
    } else {
      this.log('info', `${request.method} ${request.path} - ${response.status}`, logData);
    }
  }

  /**
   * 记录错误
   */
  async logError(error: Error, context: MiddlewareContext): Promise<void> {
    const { request } = context;

    this.log('error', `${request.method} ${request.path} - Error: ${error.message}`, {
      error: {
        name: error.name,
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      requestId: context.id,
    });
  }

  /**
   * 通用日志方法
   */
  log(level: LogLevel, message: string, data?: Record<string, any>): void {
    // 检查日志级别
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      requestId: this.config.requestId ? this.getRequestId() : undefined,
      timestamp: Date.now(),
      data,
    };

    // 异步处理日志
    this.queueLog(entry);
  }

  /**
   * 检查是否应该记录
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.config.level);
    const messageLevelIndex = levels.indexOf(level);

    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * 获取当前请求 ID (从上下文或生成新的)
   */
  private getRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * 清理敏感请求头
   */
  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = '***REDACTED***';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * 队列日志条目
   */
  private queueLog(entry: LogEntry): void {
    this.logQueue.push(entry);

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * 处理日志队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.logQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.logQueue.length > 0) {
      const entry = this.logQueue.shift()!;
      this.writeLog(entry);
    }

    this.isProcessing = false;
  }

  /**
   * 写入日志
   */
  private writeLog(entry: LogEntry): void {
    const parts: string[] = [];

    if (this.config.timestamp) {
      parts.push(`[${new Date(entry.timestamp).toISOString()}]`);
    }

    parts.push(`[${entry.level.toUpperCase()}]`);

    if (this.config.requestId && entry.requestId) {
      parts.push(`[${entry.requestId}]`);
    }

    parts.push(entry.message);

    const message = parts.join(' ');

    switch (entry.level) {
      case 'debug':
        this.logger.debug(message, entry.data || '');
        break;
      case 'info':
        this.logger.info(message, entry.data || '');
        break;
      case 'warn':
        this.logger.warn(message, entry.data || '');
        break;
      case 'error':
        this.logger.error(message, entry.data || '');
        break;
    }
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * 刷新日志队列
   */
  async flush(): Promise<void> {
    while (this.logQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

/**
 * 创建日志中间件工厂
 */
export function createLoggingMiddleware(config?: LoggingConfig): MiddlewareFunc {
  const middleware = new LoggingMiddleware(config);
  return middleware.create();
}

/**
 * 创建请求日志中间件
 */
export function createRequestLogger(config?: LoggingConfig): MiddlewareFunc {
  const middleware = new LoggingMiddleware({
    ...config,
    logResponseBody: false,
  });

  return async (context: MiddlewareContext, next: MiddlewareNext): Promise<MiddlewareContext> => {
    await middleware.logRequest(context);

    try {
      const result = await next(context);
      await middleware.logResponse(result, Date.now() - context.timestamp);
      return result;
    } catch (error) {
      await middleware.logError(error as Error, context);
      throw error;
    }
  };
}

/**
 * 创建调试日志中间件
 */
export function createDebugLogger(config?: LoggingConfig): MiddlewareFunc {
  return createLoggingMiddleware({
    ...config,
    level: 'debug',
    logRequestBody: true,
    logResponseBody: true,
  });
}

export default LoggingMiddleware;
