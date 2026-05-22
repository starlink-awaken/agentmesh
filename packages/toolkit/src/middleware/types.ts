/**
 * Middleware Types - 中间件系统类型定义
 *
 * 提供中间件/拦截器的核心类型定义
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * 中间件上下文
 * 在整个请求-响应生命周期中传递
 */
export interface MiddlewareContext {
  /** 请求 ID */
  id: string;
  /** 请求时间戳 */
  timestamp: number;
  /** 请求对象 */
  request: Request;
  /** 响应对象 */
  response?: Response;
  /** 请求参数 */
  params?: Record<string, any>;
  /** 额外数据 */
  metadata?: Record<string, any>;
  /** 错误信息 */
  error?: MiddlewareError;
  /** 中间件链执行状态 */
  state: MiddlewareState;
}

/**
 * 请求对象
 */
export interface Request {
  /** 请求方法 */
  method: string;
  /** 请求路径 */
  path: string;
  /** 请求头 */
  headers: Record<string, string>;
  /** 请求体 */
  body?: any;
  /** 查询参数 */
  query?: Record<string, string>;
  /** 用户信息 */
  user?: any;
}

/**
 * 响应对象
 */
export interface Response {
  /** 状态码 */
  status: number;
  /** 响应头 */
  headers: Record<string, string>;
  /** 响应体 */
  body?: any;
  /** 响应时间 */
  duration?: number;
}

/**
 * 中间件状态
 */
export interface MiddlewareState {
  /** 当前执行的中间件索引 */
  currentIndex: number;
  /** 是否已终止 */
  stopped: boolean;
  /** 执行结果 */
  result?: any;
  /** 额外状态 */
  [key: string]: any;
}

/**
 * 下一个中间件函数
 * 返回 Promise 以支持异步中间件
 */
export type MiddlewareNext = (context: MiddlewareContext) => Promise<MiddlewareContext>;

/**
 * 中间件函数签名
 * (context, next) => Promise<MiddlewareContext>
 */
export type MiddlewareFunc = (
  context: MiddlewareContext,
  next: MiddlewareNext
) => Promise<MiddlewareContext>;

/**
 * 中间件错误类型
 */
export interface MiddlewareError extends Error {
  /** 错误码 */
  code?: string;
  /** HTTP 状态码 */
  statusCode?: number;
  /** 错误来源中间件 */
  source?: string;
  /** 原始错误 */
  originalError?: Error;
  /** 错误上下文 */
  context?: Partial<MiddlewareContext>;
}

/**
 * 请求拦截器
 * 在请求处理前执行
 */
export interface RequestInterceptor {
  /** 拦截器名称 */
  name: string;
  /** 优先级，数字越小越先执行 */
  priority?: number;
  /** 预处理 */
  preProcess?(context: MiddlewareContext): Promise<MiddlewareContext>;
  /** 验证请求 */
  validateRequest?(context: MiddlewareContext): Promise<boolean>;
  /** 转换请求 */
  transformRequest?(context: MiddlewareContext): Promise<MiddlewareContext>;
}

/**
 * 响应拦截器
 * 在响应返回前执行
 */
export interface ResponseInterceptor {
  /** 拦截器名称 */
  name: string;
  /** 优先级，数字越小越先执行 */
  priority?: number;
  /** 后处理 */
  postProcess?(context: MiddlewareContext): Promise<MiddlewareContext>;
  /** 转换响应 */
  transformResponse?(context: MiddlewareContext): Promise<MiddlewareContext>;
}

/**
 * 中间件配置
 */
export interface MiddlewareConfig {
  /** 是否启用 */
  enabled?: boolean;
  /** 错误处理策略 */
  errorStrategy?: 'throw' | 'catch' | 'skip';
  /** 超时时间 (ms) */
  timeout?: number;
  /** 异步并行执行 */
  parallel?: boolean;
}

/**
 * 中间件链配置
 */
export interface MiddlewareChainConfig {
  /** 中间件名称 */
  name?: string;
  /** 全局配置 */
  config?: MiddlewareConfig;
  /** 错误处理器 */
  errorHandler?: ErrorHandler;
}

/**
 * 错误处理器
 */
export type ErrorHandler = (
  error: MiddlewareError,
  context: MiddlewareContext
) => Promise<MiddlewareContext>;

/**
 * 速率限制配置
 */
export interface RateLimitConfig {
  /** 限制数量 */
  limit: number;
  /** 时间窗口 (ms) */
  windowMs: number;
  /** 滑动窗口 */
  slidingWindow?: boolean;
  /** 自定义 key 生成器 */
  keyGenerator?: (context: MiddlewareContext) => string;
  /** 超过限制时的回调 */
  onLimit?: (context: MiddlewareContext) => void;
}

/**
 * 速率限制条目
 */
export interface RateLimitEntry {
  /** 请求数量 */
  count: number;
  /** 重置时间 */
  resetTime: number;
  /** 请求时间戳列表 (滑动窗口用) */
  timestamps?: number[];
}

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 日志配置
 */
export interface LoggingConfig {
  /** 日志级别 */
  level?: LogLevel;
  /** 是否包含时间戳 */
  timestamp?: boolean;
  /** 是否包含请求 ID */
  requestId?: boolean;
  /** 是否记录请求体 */
  logRequestBody?: boolean;
  /** 是否记录响应体 */
  logResponseBody?: boolean;
  /** 自定义日志器 */
  logger?: Logger;
}

/**
 * 日志器接口
 */
export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/**
 * 默认日志器 (Console)
 */
export class ConsoleLogger implements Logger {
  debug(message: string, ...args: any[]): void {
    console.debug(`[DEBUG] ${message}`, ...args);
  }

  info(message: string, ...args: any[]): void {
    console.info(`[INFO] ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }
}
