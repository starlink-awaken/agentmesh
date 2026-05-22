/**
 * RateLimitMiddleware - 速率限制中间件
 *
 * 提供基于令牌桶和滑动窗口的速率限制能力
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  MiddlewareContext,
  MiddlewareNext,
  MiddlewareFunc,
  RateLimitConfig,
  RateLimitEntry,
} from './types.js';

/**
 * 速率限制存储接口
 */
export interface RateLimitStore {
  /** 获取条目 */
  get(key: string): RateLimitEntry | undefined;
  /** 设置条目 */
  set(key: string, entry: RateLimitEntry): void;
  /** 删除条目 */
  delete(key: string): void;
  /** 清理过期条目 */
  cleanExpired(): void;
}

/**
 * 内存速率限制存储
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // 每分钟清理过期条目
    this.cleanupInterval = setInterval(() => this.cleanExpired(), 60000);
  }

  get(key: string): RateLimitEntry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    // 检查是否过期
    if (Date.now() > entry.resetTime) {
      this.store.delete(key);
      return undefined;
    }

    return entry;
  }

  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  cleanExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * RateLimitMiddleware 类
 *
 * 提供速率限制功能
 */
export class RateLimitMiddleware {
  private config: {
    limit: number;
    windowMs: number;
    slidingWindow: boolean;
    keyGenerator: (context: MiddlewareContext) => string;
    onLimit?: (context: MiddlewareContext) => void;
  };
  private store: RateLimitStore;
  private defaultKeyGenerator: (context: MiddlewareContext) => string;

  constructor(config: RateLimitConfig, store?: RateLimitStore) {
    this.config = {
      limit: config.limit,
      windowMs: config.windowMs,
      slidingWindow: config.slidingWindow || false,
      keyGenerator: config.keyGenerator || ((ctx) => this.defaultKeyGenerator(ctx)),
      onLimit: config.onLimit,
    };

    this.store = store || new MemoryRateLimitStore();
    this.defaultKeyGenerator = (ctx) => {
      // 默认使用 IP + 路径作为 key
      const ip = ctx.request.headers['x-forwarded-for'] ||
                  ctx.request.headers['x-real-ip'] ||
                  'unknown';
      return `${ip}:${ctx.request.path}`;
    };
  }

  /**
   * 创建速率限制中间件
   */
  create(): MiddlewareFunc {
    return async (context: MiddlewareContext, next: MiddlewareNext): Promise<MiddlewareContext> => {
      // 检查限制
      const result = await this.checkLimit(context);

      if (!result.allowed) {
        // 触发限制回调
        if (this.config.onLimit) {
          this.config.onLimit(context);
        }

        // 设置速率限制响应
        context.state.stopped = true;
        context.response = {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': String(this.config.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(result.resetTime! / 1000)),
          },
          body: {
            error: {
              message: '速率限制超出，请稍后重试',
              code: 'RATE_LIMIT_EXCEEDED',
            },
            retryAfter: result.retryAfter,
          },
        };

        return context;
      }

      // 添加速率限制头到响应
      const originalNext = next;
      next = async (ctx: MiddlewareContext) => {
        const result = await originalNext(ctx);
        if (result.response) {
          result.response.headers = {
            ...result.response.headers,
            'X-RateLimit-Limit': String(this.config.limit),
            'X-RateLimit-Remaining': String(result.metadata?.rateLimitRemaining ?? this.config.limit - 1),
            'X-RateLimit-Reset': String(Math.ceil(result.metadata?.rateLimitReset! / 1000)),
          };
        }
        return result;
      };

      return next(context);
    };
  }

  /**
   * 检查限制
   */
  async checkLimit(context: MiddlewareContext): Promise<{
    allowed: boolean;
    resetTime?: number;
    retryAfter?: number;
  }> {
    const key = this.config.keyGenerator(context);
    const now = Date.now();

    if (this.config.slidingWindow) {
      return this.windowSliding(key, now);
    } else {
      return this.windowFixed(key, now);
    }
  }

  /**
   * 固定窗口限流
   */
  private windowFixed(key: string, now: number): {
    allowed: boolean;
    resetTime?: number;
    retryAfter?: number;
  } {
    let entry = this.store.get(key);

    if (!entry) {
      // 新窗口
      entry = {
        count: 1,
        resetTime: now + this.config.windowMs,
      };
      this.store.set(key, entry);

      return {
        allowed: true,
        resetTime: entry.resetTime,
      };
    }

    if (now > entry.resetTime) {
      // 新窗口开始
      entry = {
        count: 1,
        resetTime: now + this.config.windowMs,
      };
      this.store.set(key, entry);

      return {
        allowed: true,
        resetTime: entry.resetTime,
      };
    }

    // 当前窗口内
    if (entry.count >= this.config.limit) {
      return {
        allowed: false,
        resetTime: entry.resetTime,
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      };
    }

    // 增加计数
    entry.count++;
    this.store.set(key, entry);

    return {
      allowed: true,
      resetTime: entry.resetTime,
    };
  }

  /**
   * 滑动窗口限流
   */
  private windowSliding(key: string, now: number): {
    allowed: boolean;
    resetTime?: number;
    retryAfter?: number;
  } {
    let entry = this.store.get(key);

    if (!entry || !entry.timestamps) {
      // 新记录
      entry = {
        count: 1,
        resetTime: now + this.config.windowMs,
        timestamps: [now],
      };
      this.store.set(key, entry);

      return {
        allowed: true,
        resetTime: entry.resetTime,
      };
    }

    // 清理过期的请求时间戳
    const windowStart = now - this.config.windowMs;
    entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);

    if (entry.timestamps.length >= this.config.limit) {
      // 超过限制
      const oldestTimestamp = entry.timestamps[0];
      const resetTime = oldestTimestamp + this.config.windowMs;

      return {
        allowed: false,
        resetTime,
        retryAfter: Math.ceil((resetTime - now) / 1000),
      };
    }

    // 添加新的请求时间戳
    entry.timestamps.push(now);
    entry.count = entry.timestamps.length;
    entry.resetTime = Math.max(...entry.timestamps) + this.config.windowMs;
    this.store.set(key, entry);

    return {
      allowed: true,
      resetTime: entry.resetTime,
    };
  }

  /**
   * 重置限制
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * 获取当前使用量
   */
  getUsage(context: MiddlewareContext): number {
    const key = this.config.keyGenerator(context);
    const entry = this.store.get(key);

    if (!entry) return 0;

    if (this.config.slidingWindow) {
      const now = Date.now();
      const windowStart = now - this.config.windowMs;
      return entry.timestamps?.filter(ts => ts > windowStart).length || 0;
    }

    return entry.count;
  }

  /**
   * 销毁
   */
  destroy(): void {
    if (this.store instanceof MemoryRateLimitStore) {
      (this.store as MemoryRateLimitStore).destroy();
    }
  }
}

/**
 * 创建速率限制中间件工厂
 */
export function createRateLimitMiddleware(config: RateLimitConfig): MiddlewareFunc {
  const middleware = new RateLimitMiddleware(config);
  return middleware.create();
}

/**
 * 创建基于 IP 的速率限制中间件
 */
export function createIPRateLimitMiddleware(
  limit: number = 100,
  windowMs: number = 60000
): MiddlewareFunc {
  return createRateLimitMiddleware({
    limit,
    windowMs,
    keyGenerator: (ctx) => {
      const ip = ctx.request.headers['x-forwarded-for'] ||
                  ctx.request.headers['x-real-ip'] ||
                  'unknown';
      return ip;
    },
  });
}

/**
 * 创建基于用户的速率限制中间件
 */
export function createUserRateLimitMiddleware(
  limit: number = 1000,
  windowMs: number = 60000
): MiddlewareFunc {
  return createRateLimitMiddleware({
    limit,
    windowMs,
    keyGenerator: (ctx) => {
      const userId = ctx.request.user?.id || ctx.request.headers['x-user-id'] || 'anonymous';
      return `user:${userId}`;
    },
  });
}

export default RateLimitMiddleware;
