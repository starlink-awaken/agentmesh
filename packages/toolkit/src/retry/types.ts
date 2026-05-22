/**
 * Retry 模块 - 重试机制类型定义
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number;
  /** 基础延迟时间（毫秒） */
  baseDelay: number;
  /** 最大延迟时间（毫秒） */
  maxDelay: number;
  /** 指数退避乘数 */
  backoffMultiplier: number;
  /** 判断错误是否应该重试的函数 */
  retryOn: (error: Error) => boolean;
}

/**
 * 重试结果
 */
export interface RetryResult<T> {
  /** 是否成功 */
  success: boolean;
  /** 尝试次数 */
  attempts: number;
  /** 总耗时（毫秒） */
  totalTime: number;
  /** 成功结果 */
  result?: T;
  /** 错误信息 */
  error?: Error;
}

/**
 * HTTP 请求配置
 */
export interface HTTPRequestConfig {
  /** 请求 URL */
  url: string;
  /** HTTP 方法 */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** 请求头 */
  headers?: Record<string, string>;
  /** 请求体 */
  body?: unknown;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 重试配置 */
  retry?: Partial<RetryConfig>;
}

/**
 * HTTP 响应
 */
export interface HTTPResponse<T = unknown> {
  /** 状态码 */
  status: number;
  /** 状态文本 */
  statusText: string;
  /** 响应头 */
  headers: Record<string, string>;
  /** 响应体 */
  data: T;
}

/**
 * HTTP 客户端配置
 */
export interface HTTPClientConfig {
  /** 默认超时时间 */
  defaultTimeout?: number;
  /** 默认重试配置 */
  defaultRetry?: Partial<RetryConfig>;
  /** 默认请求头 */
  defaultHeaders?: Record<string, string>;
}

/**
 * 默认重试配置
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 100,
  maxDelay: 5000,
  backoffMultiplier: 2,
  retryOn: (error: Error) => {
    // 默认重试所有错误
    return true;
  },
};

/**
 * HTTP 状态码重试判断
 */
export const HTTP_STATUS_RETRY = [408, 429, 500, 502, 503, 504];
