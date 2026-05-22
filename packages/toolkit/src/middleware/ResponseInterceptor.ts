/**
 * ResponseInterceptor - 响应拦截器
 *
 * 提供响应后处理和转换能力
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  MiddlewareContext,
  MiddlewareNext,
  ResponseInterceptor,
} from './types.js';

/**
 * ResponseInterceptorManager 类
 *
 * 管理响应拦截器的注册和执行
 */
export class ResponseInterceptorManager {
  private interceptors: ResponseInterceptor[] = [];

  /**
   * 添加拦截器
   * @param interceptor 响应拦截器
   */
  add(interceptor: ResponseInterceptor): this {
    this.interceptors.push(interceptor);
    // 按优先级排序
    this.interceptors.sort((a, b) => (a.priority || 100) - (b.priority || 100));
    return this;
  }

  /**
   * 批量添加拦截器
   * @param interceptors 响应拦截器数组
   */
  addMany(interceptors: ResponseInterceptor[]): this {
    this.interceptors.push(...interceptors);
    this.interceptors.sort((a, b) => (a.priority || 100) - (b.priority || 100));
    return this;
  }

  /**
   * 后处理
   * 在响应转换之后执行
   * @param context 中间件上下文
   */
  async postProcess(context: MiddlewareContext): Promise<MiddlewareContext> {
    let ctx = context;

    for (const interceptor of this.interceptors) {
      if (interceptor.postProcess && !ctx.state.stopped) {
        ctx = await interceptor.postProcess(ctx);
      }
    }

    return ctx;
  }

  /**
   * 转换响应
   * @param context 中间件上下文
   */
  async transformResponse(context: MiddlewareContext): Promise<MiddlewareContext> {
    let ctx = context;

    for (const interceptor of this.interceptors) {
      if (interceptor.transformResponse && !ctx.state.stopped) {
        ctx = await interceptor.transformResponse(ctx);
      }
    }

    return ctx;
  }

  /**
   * 执行完整的拦截流程
   * @param context 中间件上下文
   * @param next 下一个中间件函数
   */
  async execute(
    context: MiddlewareContext,
    next: MiddlewareNext
  ): Promise<MiddlewareContext> {
    // 1. 执行下一个中间件
    let ctx = await next(context);

    // 2. 转换响应
    if (!ctx.state.stopped) {
      ctx = await this.transformResponse(ctx);
    }

    // 3. 后处理
    if (!ctx.state.stopped) {
      ctx = await this.postProcess(ctx);
    }

    return ctx;
  }

  /**
   * 获取拦截器数量
   */
  get length(): number {
    return this.interceptors.length;
  }

  /**
   * 清空拦截器
   */
  clear(): void {
    this.interceptors = [];
  }
}

/**
 * 创建内置的响应时间记录拦截器
 */
export function createResponseTimeTracker(): ResponseInterceptor {
  return {
    name: 'response-time-tracker',
    priority: 90,
    postProcess: async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      if (context.response) {
        context.response.duration = Date.now() - context.timestamp;
      }
      return context;
    },
  };
}

/**
 * 创建内置的 CORS 头添加拦截器
 */
export function createCORSAdder(allowedOrigins: string[]): ResponseInterceptor {
  return {
    name: 'cors-adder',
    priority: 10,
    transformResponse: async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      if (context.response) {
        const origin = context.request.headers['origin'] || '';
        const allowedOrigin = allowedOrigins.includes('*')
          ? '*'
          : (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]);

        context.response.headers = {
          ...context.response.headers,
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };
      }
      return context;
    },
  };
}

/**
 * 创建内置的响应压缩拦截器
 */
export function createResponseCompressor(): ResponseInterceptor {
  return {
    name: 'response-compressor',
    priority: 50,
    transformResponse: async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      if (context.response?.body) {
        const acceptEncoding = context.request.headers['accept-encoding'] || '';
        if (acceptEncoding.includes('gzip')) {
          context.response.headers['Content-Encoding'] = 'gzip';
          // 注意：实际压缩逻辑需要 zlib，这里仅设置头
        } else if (acceptEncoding.includes('deflate')) {
          context.response.headers['Content-Encoding'] = 'deflate';
        }
      }
      return context;
    },
  };
}

/**
 * 创建内置的 JSON 响应格式化拦截器
 */
export function createJSONFormatter(): ResponseInterceptor {
  return {
    name: 'json-formatter',
    priority: 20,
    transformResponse: async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      if (context.response) {
        context.response.headers['Content-Type'] = 'application/json';
        if (typeof context.response.body === 'object') {
          context.response.body = JSON.stringify(context.response.body, null, 2);
        }
      }
      return context;
    },
  };
}

/**
 * 创建内置的错误响应格式化拦截器
 */
export function createErrorFormatter(): ResponseInterceptor {
  return {
    name: 'error-formatter',
    priority: 5,
    transformResponse: async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      if (context.response && context.response.status >= 400) {
        const error = context.error;
        context.response.body = {
          error: {
            message: error?.message || 'Unknown error',
            code: error?.code || 'UNKNOWN_ERROR',
            ...(process.env.NODE_ENV === 'development' && { stack: error?.stack }),
          },
          requestId: context.id,
          timestamp: context.timestamp,
        };
      }
      return context;
    },
  };
}

/**
 * 创建内置的成功响应包装拦截器
 */
export function createSuccessWrapper(): ResponseInterceptor {
  return {
    name: 'success-wrapper',
    priority: 15,
    transformResponse: async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      if (context.response && context.response.status < 400) {
        context.response.body = {
          success: true,
          data: context.response.body,
          requestId: context.id,
        };
      }
      return context;
    },
  };
}

/**
 * 创建默认响应拦截器管理器
 */
export function createResponseInterceptorManager(): ResponseInterceptorManager {
  const manager = new ResponseInterceptorManager();
  return manager;
}

export default ResponseInterceptorManager;
