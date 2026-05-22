/**
 * RequestInterceptor - 请求拦截器
 *
 * 提供请求预处理、验证和转换能力
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  MiddlewareContext,
  MiddlewareNext,
  RequestInterceptor,
} from './types.js';

/**
 * RequestInterceptorManager 类
 *
 * 管理请求拦截器的注册和执行
 */
export class RequestInterceptorManager {
  private interceptors: RequestInterceptor[] = [];

  /**
   * 添加拦截器
   * @param interceptor 请求拦截器
   */
  add(interceptor: RequestInterceptor): this {
    this.interceptors.push(interceptor);
    // 按优先级排序
    this.interceptors.sort((a, b) => (a.priority || 100) - (b.priority || 100));
    return this;
  }

  /**
   * 批量添加拦截器
   * @param interceptors 请求拦截器数组
   */
  addMany(interceptors: RequestInterceptor[]): this {
    this.interceptors.push(...interceptors);
    this.interceptors.sort((a, b) => (a.priority || 100) - (b.priority || 100));
    return this;
  }

  /**
   * 预处理
   * 在所有验证和转换之前执行
   * @param context 中间件上下文
   */
  async preProcess(context: MiddlewareContext): Promise<MiddlewareContext> {
    let ctx = context;

    for (const interceptor of this.interceptors) {
      if (interceptor.preProcess && !ctx.state.stopped) {
        ctx = await interceptor.preProcess(ctx);
      }
    }

    return ctx;
  }

  /**
   * 验证请求
   * @param context 中间件上下文
   */
  async validateRequest(context: MiddlewareContext): Promise<boolean> {
    for (const interceptor of this.interceptors) {
      if (interceptor.validateRequest) {
        const isValid = await interceptor.validateRequest(context);
        if (!isValid) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * 转换请求
   * @param context 中间件上下文
   */
  async transformRequest(context: MiddlewareContext): Promise<MiddlewareContext> {
    let ctx = context;

    for (const interceptor of this.interceptors) {
      if (interceptor.transformRequest && !ctx.state.stopped) {
        ctx = await interceptor.transformRequest(ctx);
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
    // 1. 预处理
    let ctx = await this.preProcess(context);

    // 2. 验证请求
    const isValid = await this.validateRequest(ctx);
    if (!isValid) {
      ctx.state.stopped = true;
      ctx.response = {
        status: 400,
        headers: {},
        body: { error: { message: '请求验证失败' } },
      };
      return ctx;
    }

    // 3. 转换请求
    ctx = await this.transformRequest(ctx);

    // 4. 执行下一个中间件
    if (!ctx.state.stopped) {
      ctx = await next(ctx);
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
 * 创建内置的请求头验证拦截器
 */
export function createHeaderValidator(requiredHeaders: string[]): RequestInterceptor {
  return {
    name: 'header-validator',
    priority: 10,
    validateRequest: async (context: MiddlewareContext): Promise<boolean> => {
      const headers = context.request.headers;
      for (const header of requiredHeaders) {
        if (!headers[header]) {
          console.warn(`Missing required header: ${header}`);
          return false;
        }
      }
      return true;
    },
  };
}

/**
 * 创建内置的请求体大小限制拦截器
 */
export function createBodySizeLimiter(maxSize: number): RequestInterceptor {
  return {
    name: 'body-size-limiter',
    priority: 20,
    validateRequest: async (context: MiddlewareContext): Promise<boolean> => {
      const body = context.request.body;
      if (body && typeof body === 'string') {
        const size = new Blob([body]).size;
        if (size > maxSize) {
          console.warn(`Request body too large: ${size} > ${maxSize}`);
          return false;
        }
      }
      return true;
    },
  };
}

/**
 * 创建内置的请求路径规范化拦截器
 */
export function createPathNormalizer(): RequestInterceptor {
  return {
    name: 'path-normalizer',
    priority: 5,
    transformRequest: async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      const path = context.request.path;
      // 移除多余的斜杠，保持以斜杠开头
      const normalized = '/' + path.replace(/^\/+/, '').replace(/\/+$/, '');
      context.request.path = normalized;
      return context;
    },
  };
}

/**
 * 创建内置的请求体 JSON 解析拦截器
 */
export function createJSONBodyParser(): RequestInterceptor {
  return {
    name: 'json-body-parser',
    priority: 15,
    transformRequest: async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      const contentType = context.request.headers['content-type'] || '';
      if (contentType.includes('application/json') && typeof context.request.body === 'string') {
        try {
          context.request.body = JSON.parse(context.request.body);
        } catch (e) {
          context.error = {
            name: 'JSONParseError',
            message: 'Invalid JSON in request body',
          } as any;
        }
      }
      return context;
    },
  };
}

/**
 * 创建内置的 CORS 预检请求处理拦截器
 */
export function createCORSPreflightHandler(allowedOrigins: string[]): RequestInterceptor {
  return {
    name: 'cors-preflight',
    priority: 1,
    preProcess: async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      if (context.request.method === 'OPTIONS') {
        const origin = context.request.headers['origin'] || '';
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          context.state.stopped = true;
          context.response = {
            status: 204,
            headers: {
              'Access-Control-Allow-Origin': origin || '*',
              'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
              'Access-Control-Max-Age': '86400',
            },
          };
        }
      }
      return context;
    },
  };
}

/**
 * 创建默认请求拦截器管理器
 */
export function createRequestInterceptorManager(): RequestInterceptorManager {
  const manager = new RequestInterceptorManager();
  return manager;
}

export default RequestInterceptorManager;
