/**
 * MiddlewareChain - 中间件链管理器
 *
 * 支持同步/异步中间件的顺序执行机制
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  MiddlewareContext,
  MiddlewareFunc,
  MiddlewareNext,
  MiddlewareError,
  MiddlewareChainConfig,
  ErrorHandler,
} from './types.js';

/**
 * 创建默认中间件上下文
 */
export function createContext(request: any = {}): MiddlewareContext {
  return {
    id: generateId(),
    timestamp: Date.now(),
    request: normalizeRequest(request),
    metadata: {},
    state: {
      currentIndex: 0,
      stopped: false,
    },
  };
}

/**
 * 规范化请求对象
 */
function normalizeRequest(request: any): MiddlewareContext['request'] {
  return {
    method: request.method || 'GET',
    path: request.path || '/',
    headers: request.headers || {},
    body: request.body,
    query: request.query,
    user: request.user,
  };
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * MiddlewareChain 类
 *
 * 管理中间件链的执行
 */
export class MiddlewareChain {
  private middlewares: MiddlewareFunc[] = [];
  private config: MiddlewareChainConfig;
  private errorHandlers: ErrorHandler[] = [];

  constructor(config: MiddlewareChainConfig = {}) {
    this.config = {
      name: config.name || 'middleware-chain',
      config: {
        enabled: true,
        errorStrategy: 'catch',
        timeout: 30000,
        parallel: false,
        ...config.config,
      },
      errorHandler: config.errorHandler,
    };
  }

  /**
   * 添加中间件
   * @param middleware 中间件函数
   */
  use(middleware: MiddlewareFunc): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * 批量添加中间件
   * @param middlewares 中间件函数数组
   */
  useMany(middlewares: MiddlewareFunc[]): this {
    this.middlewares.push(...middlewares);
    return this;
  }

  /**
   * 添加错误处理器
   * @param handler 错误处理函数
   */
  useError(handler: ErrorHandler): this {
    this.errorHandlers.push(handler);
    return this;
  }

  /**
   * 执行中间件链
   * @param context 中间件上下文
   */
  async execute(context: MiddlewareContext): Promise<MiddlewareContext> {
    if (!this.config.config?.enabled) {
      return context;
    }

    let currentIndex = 0;
    const total = this.middlewares.length;

    // 创建 next 函数
    const next: MiddlewareNext = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
      if (ctx.state.stopped) {
        return ctx;
      }

      if (currentIndex >= total) {
        return ctx;
      }

      const middleware = this.middlewares[currentIndex++];
      ctx.state.currentIndex = currentIndex;

      try {
        return await middleware(ctx, next);
      } catch (error) {
        return await this.handleError(error as MiddlewareError, ctx);
      }
    };

    try {
      // 开始执行链
      return await this.executeWithTimeout(next(context), context);
    } catch (error) {
      return await this.handleError(error as MiddlewareError, context);
    }
  }

  /**
   * 带超时的执行
   */
  private async executeWithTimeout(
    promise: Promise<MiddlewareContext>,
    context: MiddlewareContext
  ): Promise<MiddlewareContext> {
    const timeout = this.config.config?.timeout || 30000;

    return Promise.race([
      promise,
      new Promise<MiddlewareContext>((_, reject) =>
        setTimeout(() => {
          reject(createError('TIMEOUT', '中间件执行超时', 504, 'MiddlewareChain'));
        }, timeout)
      ),
    ]);
  }

  /**
   * 错误处理
   * @param error 错误对象
   * @param context 中间件上下文
   */
  async error(error: MiddlewareError, context: MiddlewareContext): Promise<MiddlewareContext> {
    return this.handleError(error, context);
  }

  /**
   * 处理错误
   */
  private async handleError(
    error: MiddlewareError,
    context: MiddlewareContext
  ): Promise<MiddlewareContext> {
    const strategy = this.config.config?.errorStrategy || 'catch';

    // 设置错误到上下文
    context.error = error;
    context.response = {
      status: error.statusCode || 500,
      headers: {},
      body: {
        error: {
          message: error.message,
          code: error.code,
        },
      },
    };

    if (strategy === 'skip') {
      return context;
    }

    // 尝试使用错误处理器
    for (const handler of this.errorHandlers) {
      try {
        const result = await handler(error, context);
        if (result.state.stopped) {
          return result;
        }
      } catch (handlerError) {
        // 错误处理器自身出错，继续下一个
        console.error('Error handler failed:', handlerError);
      }
    }

    if (strategy === 'throw') {
      throw error;
    }

    return context;
  }

  /**
   * 获取中间件数量
   */
  get length(): number {
    return this.middlewares.length;
  }

  /**
   * 清空中间件链
   */
  clear(): void {
    this.middlewares = [];
    this.errorHandlers = [];
  }

  /**
   * 创建中间件链的工厂函数
   */
  static create(config?: MiddlewareChainConfig): MiddlewareChain {
    return new MiddlewareChain(config);
  }
}

/**
 * 创建中间件错误
 */
export function createError(
  code: string,
  message: string,
  statusCode: number = 500,
  source?: string,
  originalError?: Error
): MiddlewareError {
  const error = new Error(message) as MiddlewareError;
  error.code = code;
  error.statusCode = statusCode;
  error.source = source;
  error.originalError = originalError;
  return error;
}

/**
 * 创建终止中间件链的中间件
 */
export function createStopMiddleware(): MiddlewareFunc {
  return async (context: MiddlewareContext, _next: MiddlewareNext) => {
    context.state.stopped = true;
    return context;
  };
}

/**
 * 组合多个中间件为一个
 */
export function compose(...middlewares: MiddlewareFunc[]): MiddlewareFunc {
  return async (context: MiddlewareContext, next: MiddlewareNext) => {
    let index = 0;

    const dispatch = async (i: number): Promise<MiddlewareContext> => {
      if (i >= middlewares.length) {
        return next(context);
      }

      const middleware = middlewares[i];
      return middleware(context, () => dispatch(i + 1));
    };

    return dispatch(index);
  };
}

export default MiddlewareChain;
