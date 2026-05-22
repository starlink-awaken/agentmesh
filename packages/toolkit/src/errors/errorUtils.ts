/**
 * Agent Toolkit 错误工具函数
 *
 * 提供错误处理的工具函数，包括错误判断、消息获取、压缩和包装等
 *
 * @author PAI
 * @version 1.0.0
 */

import { AgentToolkitError } from './types.js';

/**
 * 判断错误是否可重试
 *
 * 根据错误类型和状态码判断是否应该重试操作
 */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof AgentToolkitError)) {
    // 非AgentToolkitError默认不可重试
    return false;
  }

  // 根据错误类型判断
  switch (error.code) {
    case 'NETWORK_ERROR':
    case 'TIMEOUT_ERROR':
    case 'RATE_LIMIT_ERROR':
      return true;
    case 'AUTHENTICATION_ERROR':
    case 'VALIDATION_ERROR':
    case 'CONFIGURATION_ERROR':
      return false;
    default:
      // 根据状态码判断
      if (error.statusCode) {
        return (
          error.statusCode === 408 || // Request Timeout
          error.statusCode === 429 || // Too Many Requests
          error.statusCode === 500 || // Internal Server Error
          error.statusCode === 502 || // Bad Gateway
          error.statusCode === 503 || // Service Unavailable
          error.statusCode === 504    // Gateway Timeout
        );
      }
      return false;
  }
}

/**
 * 获取友好的错误消息
 *
 * 将错误转换为用户友好的消息，隐藏技术细节
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AgentToolkitError) {
    // 对于已知错误类型，返回友好的消息
    switch (error.code) {
      case 'NETWORK_ERROR':
        return '网络连接失败，请检查网络连接后重试';
      case 'TIMEOUT_ERROR':
        return '操作超时，请稍后重试';
      case 'AUTHENTICATION_ERROR':
        return '认证失败，请检查API密钥或权限设置';
      case 'RATE_LIMIT_ERROR':
        return '请求频率过高，请稍后重试';
      case 'VALIDATION_ERROR':
        return '输入数据验证失败，请检查输入格式';
      case 'CONFIGURATION_ERROR':
        return '配置错误，请检查配置文件';
      case 'LLM_ERROR':
        return 'AI服务调用失败，请稍后重试';
      default:
        return error.message || '发生未知错误';
    }
  }

  if (error instanceof Error) {
    // 对于普通Error，返回消息
    return error.message || '发生未知错误';
  }

  if (typeof error === 'string') {
    return error;
  }

  return '发生未知错误';
}

/**
 * 压缩错误信息（Factor 9）
 *
 * 将错误信息压缩为最小表示形式，用于日志记录和传输
 */
export function compressError(error: unknown): {
  type: string;
  code?: string;
  message: string;
  timestamp?: string;
} {
  const timestamp = new Date().toISOString();

  if (error instanceof AgentToolkitError) {
    return {
      type: error.name,
      code: error.code,
      message: error.message.substring(0, 200), // 限制消息长度
      timestamp,
    };
  }

  if (error instanceof Error) {
    return {
      type: error.name || 'Error',
      message: error.message.substring(0, 200),
      timestamp,
    };
  }

  if (typeof error === 'string') {
    return {
      type: 'StringError',
      message: error.substring(0, 200),
      timestamp,
    };
  }

  return {
    type: 'UnknownError',
    message: 'Unknown error occurred',
    timestamp,
  };
}

/**
 * 包装错误
 *
 * 将任意错误包装为AgentToolkitError，保持原始错误信息
 */
export function wrapError(
  error: unknown,
  defaultCode: string = 'UNKNOWN_ERROR',
  defaultMessage: string = 'An unexpected error occurred'
): AgentToolkitError {
  if (error instanceof AgentToolkitError) {
    return error;
  }

  if (error instanceof Error) {
    return new AgentToolkitError(error.message, defaultCode, {
      cause: error,
    });
  }

  if (typeof error === 'string') {
    return new AgentToolkitError(error, defaultCode);
  }

  return new AgentToolkitError(defaultMessage, defaultCode, {
    details: error,
  });
}

/**
 * 提取错误堆栈
 *
 * 从错误中提取堆栈信息，支持嵌套错误
 */
export function extractErrorStack(error: unknown): string[] {
  const stacks: string[] = [];

  let currentError = error;
  while (currentError) {
    if (currentError instanceof Error) {
      if (currentError.stack) {
        stacks.push(currentError.stack);
      }

      // 检查是否有cause属性
      if ('cause' in currentError && currentError.cause) {
        currentError = currentError.cause;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return stacks;
}

/**
 * 创建错误工厂函数
 *
 * 创建特定错误类型的工厂函数，便于批量创建相同类型的错误
 */
export function createErrorFactory<T extends AgentToolkitError>(
  ErrorClass: new (message: string, options?: any) => T
) {
  return (message: string, options?: any): T => {
    return new ErrorClass(message, options);
  };
}

/**
 * 判断是否为特定类型的错误
 */
export function isErrorType<T extends AgentToolkitError>(
  error: unknown,
  errorClass: new (...args: any[]) => T
): error is T {
  return error instanceof errorClass;
}

/**
 * 合并错误详情
 *
 * 将多个错误详情合并为一个对象
 */
export function mergeErrorDetails(...details: unknown[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  details.forEach((detail, index) => {
    if (detail === null || detail === undefined) {
      return;
    }

    if (typeof detail === 'object' && !Array.isArray(detail)) {
      Object.assign(result, detail);
    } else {
      result[`detail_${index}`] = detail;
    }
  });

  return result;
}

/**
 * 计算重试延迟
 *
 * 根据错误类型和重试次数计算下次重试的延迟时间（毫秒）
 */
export function calculateRetryDelay(
  error: unknown,
  attempt: number,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): number {
  if (error instanceof AgentToolkitError) {
    // 对于速率限制错误，使用retryAfter（如果提供）
    if (error.code === 'RATE_LIMIT_ERROR' && 'retryAfter' in error) {
      const retryAfter = (error as any).retryAfter;
      if (typeof retryAfter === 'number' && retryAfter > 0) {
        return Math.min(retryAfter * 1000, maxDelay);
      }
    }

    // 对于网络错误，使用指数退避
    if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT_ERROR') {
      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
      return Math.min(exponentialDelay, maxDelay);
    }
  }

  // 默认使用指数退避
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
  return Math.min(exponentialDelay, maxDelay);
}