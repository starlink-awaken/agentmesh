/**
 * ErrorMiddleware - 错误处理中间件
 *
 * 提供统一的错误处理和恢复能力 (Factor 9: 错误压缩)
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  MiddlewareContext,
  MiddlewareNext,
  MiddlewareError,
  MiddlewareFunc,
} from './types.js';

/**
 * 错误恢复选项
 */
export interface ErrorRecoveryOptions {
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟 (ms) */
  retryDelay?: number;
  /** 是否使用指数退避 */
  exponentialBackoff?: boolean;
  /** 重试条件 */
  shouldRetry?: (error: MiddlewareError) => boolean;
}

/**
 * 错误恢复上下文
 */
export interface ErrorRecoveryContext {
  /** 当前重试次数 */
  retryCount: number;
  /** 恢复状态 */
  state: 'idle' | 'recovering' | 'recovered' | 'failed';
  /** 错误历史 */
  errorHistory: MiddlewareError[];
}

/**
 * ErrorMiddleware 类
 *
 * 提供错误处理和恢复功能
 */
export class ErrorMiddleware {
  private errorMap: Map<string, MiddlewareFunc> = new Map();
  private recoveryOptions: ErrorRecoveryOptions = {
    maxRetries: 3,
    retryDelay: 1000,
    exponentialBackoff: true,
  };

  constructor(options?: ErrorRecoveryOptions) {
    if (options) {
      this.recoveryOptions = { ...this.recoveryOptions, ...options };
    }
  }

  /**
   * 创建错误处理中间件
   */
  create(): MiddlewareFunc {
    return async (context: MiddlewareContext, next: MiddlewareNext): Promise<MiddlewareContext> => {
      try {
        return await next(context);
      } catch (error) {
        return this.handleError(error as MiddlewareError, context);
      }
    };
  }

  /**
   * 处理错误
   * @param error 错误对象
   * @param context 中间件上下文
   */
  async handleError(
    error: MiddlewareError,
    context: MiddlewareContext
  ): Promise<MiddlewareContext> {
    // 压缩错误信息
    const compressedError = this.compressError(error);

    // 设置错误到上下文
    context.error = compressedError;

    // 尝试恢复
    const recoveryContext: ErrorRecoveryContext = {
      retryCount: 0,
      state: 'idle',
      errorHistory: [compressedError],
    };

    const shouldRetry = this.recoveryOptions.shouldRetry || this.defaultShouldRetry;
    const canRetry = shouldRetry(compressedError) && this.recoveryOptions.maxRetries! > 0;

    if (canRetry) {
      recoveryContext.state = 'recovering';
      return this.errorRecovery(compressedError, context, recoveryContext);
    }

    // 直接返回错误响应
    return this.createErrorResponse(context, compressedError);
  }

  /**
   * 默认重试条件
   */
  private defaultShouldRetry(error: MiddlewareError): boolean {
    // 网络错误、临时错误可重试
    const retryableCodes = ['NETWORK_ERROR', 'TIMEOUT', 'SERVICE_UNAVAILABLE', 'RATE_LIMIT'];
    const code = error.code || '';
    const statusCode = error.statusCode;
    return retryableCodes.includes(code) || (statusCode !== undefined && statusCode >= 500);
  }

  /**
   * 错误恢复
   * @param error 错误对象
   * @param context 中间件上下文
   * @param recoveryContext 恢复上下文
   */
  async errorRecovery(
    error: MiddlewareError,
    context: MiddlewareContext,
    recoveryContext: ErrorRecoveryContext
  ): Promise<MiddlewareContext> {
    const { maxRetries, retryDelay, exponentialBackoff } = this.recoveryOptions;
    const effectiveMaxRetries = maxRetries ?? 3;
    const effectiveRetryDelay = retryDelay ?? 1000;

    while (recoveryContext.retryCount < effectiveMaxRetries) {
      recoveryContext.retryCount++;

      // 计算延迟
      const delay = exponentialBackoff
        ? effectiveRetryDelay * Math.pow(2, recoveryContext.retryCount - 1)
        : effectiveRetryDelay;

      // 等待
      await this.sleep(delay);

      try {
        // 重试执行
        const result = await this.retryExecute(context);
        if (!result.error) {
          recoveryContext.state = 'recovered';
          context.metadata = {
            ...context.metadata,
            recovery: {
              ...recoveryContext,
              state: 'recovered',
            },
          };
          return result;
        }
        recoveryContext.errorHistory.push(result.error!);
      } catch (e) {
        recoveryContext.errorHistory.push(e as MiddlewareError);
      }
    }

    // 所有重试失败
    recoveryContext.state = 'failed';
    context.metadata = {
      ...context.metadata,
      recovery: recoveryContext,
    };

    return this.createErrorResponse(context, error);
  }

  /**
   * 重试执行
   */
  private async retryExecute(context: MiddlewareContext): Promise<MiddlewareContext> {
    // 创建一个新的上下文用于重试
    const retryContext: MiddlewareContext = {
      ...context,
      timestamp: Date.now(),
      state: {
        ...context.state,
        currentIndex: 0,
        stopped: false,
      },
    };

    // 如果有重试逻辑处理器，使用它
    const handler = this.errorMap.get('retry');
    if (handler) {
      return handler(retryContext, async (ctx) => ctx);
    }

    return retryContext;
  }

  /**
   * 创建错误响应
   */
  private createErrorResponse(
    context: MiddlewareContext,
    error: MiddlewareError
  ): MiddlewareContext {
    context.response = {
      status: error.statusCode || 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        error: {
          message: error.message,
          code: error.code || 'INTERNAL_ERROR',
          ...(process.env.NODE_ENV === 'development' && {
            details: error.context,
            stack: error.stack,
          }),
        },
        requestId: context.id,
        timestamp: new Date().toISOString(),
      },
    };

    return context;
  }

  /**
   * 错误压缩 (Factor 9)
   * 将复杂错误转换为统一的错误格式
   */
  compressError(error: MiddlewareError): MiddlewareError {
    // 保留关键信息，去除冗余
    const compressed: MiddlewareError = {
      name: error.name || 'Error',
      message: error.message || 'Unknown error',
      code: error.code || this.inferCode(error),
      statusCode: error.statusCode || this.inferStatusCode(error),
      source: error.source,
      // 不保留完整的原始错误链，避免内存泄漏
      originalError: undefined,
    };

    return compressed;
  }

  /**
   * 推断错误码
   */
  private inferCode(error: MiddlewareError): string {
    if (error.code) return error.code;
    if (error.statusCode === 401) return 'UNAUTHORIZED';
    if (error.statusCode === 403) return 'FORBIDDEN';
    if (error.statusCode === 404) return 'NOT_FOUND';
    if (error.statusCode === 429) return 'RATE_LIMIT';
    if (error.statusCode && error.statusCode >= 500) return 'SERVER_ERROR';
    if (error.message.includes('timeout')) return 'TIMEOUT';
    if (error.message.includes('network')) return 'NETWORK_ERROR';
    return 'UNKNOWN_ERROR';
  }

  /**
   * 推断 HTTP 状态码
   */
  private inferStatusCode(error: MiddlewareError): number {
    if (error.statusCode) return error.statusCode;
    if (error.code === 'UNAUTHORIZED') return 401;
    if (error.code === 'FORBIDDEN') return 403;
    if (error.code === 'NOT_FOUND') return 404;
    if (error.code === 'RATE_LIMIT') return 429;
    if (error.code === 'VALIDATION_ERROR') return 400;
    if (error.code === 'SERVER_ERROR' || error.code === 'TIMEOUT') return 500;
    return 500;
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 注册错误处理函数
   * @param errorCode 错误码
   * @param handler 处理函数
   */
  registerHandler(errorCode: string, handler: MiddlewareFunc): void {
    this.errorMap.set(errorCode, handler);
  }

  /**
   * 设置恢复选项
   */
  setRecoveryOptions(options: ErrorRecoveryOptions): void {
    this.recoveryOptions = { ...this.recoveryOptions, ...options };
  }
}

/**
 * 创建错误处理中间件工厂
 */
export function createErrorMiddleware(options?: ErrorRecoveryOptions): MiddlewareFunc {
  const middleware = new ErrorMiddleware(options);
  return middleware.create();
}

/**
 * 创建统一错误响应中间件
 */
export function createErrorResponder(): MiddlewareFunc {
  return async (context: MiddlewareContext, next: MiddlewareNext): Promise<MiddlewareContext> => {
    try {
      const result = await next(context);

      // 如果有错误但没有响应，创建错误响应
      if (result.error && !result.response) {
        result.response = {
          status: result.error.statusCode || 500,
          headers: { 'Content-Type': 'application/json' },
          body: {
            error: {
              message: result.error.message,
              code: result.error.code || 'ERROR',
            },
            requestId: result.id,
          },
        };
      }

      return result;
    } catch (error) {
      const err = error as MiddlewareError;
      context.error = err;
      context.response = {
        status: err.statusCode || 500,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: {
            message: err.message,
            code: err.code || 'ERROR',
          },
        },
      };
      return context;
    }
  };
}

export default ErrorMiddleware;
