/**
 * Honeycomb LLM Integration - Rate Limiter
 *
 * 速率限制器防止超过 API 速率限制。
 * 支持令牌桶算法和滑动窗口算法。
 *
 * 设计原则：
 * - 令牌桶：平滑处理突发流量
 * - 滑动窗口：精确控制请求速率
 * - 可配置：灵活的限制策略
 * - 分布式友好：可扩展支持分布式限流
 */

import type { RateLimitConfig } from './types.js';

// ============================================================
// 速率限制器
// ============================================================

/**
 * 速率限制器（滑动窗口算法）
 */
export class RateLimiter {
  // 每个 Provider 的请求时间戳队列
  private timestamps: Map<string, number[]> = new Map();

  // 配置
  private requestsPerMinute: number;
  private enabled: boolean;
  private logger: any;

  // 统计
  private stats = {
    allowedRequests: 0,
    throttledRequests: 0,
    totalWaitTime: 0,
  };

  constructor(config: RateLimitConfig, logger: any) {
    this.requestsPerMinute = config.requestsPerMinute || 60;
    this.enabled = config.enabled !== false;
    this.logger = logger;
  }

  /**
   * 检查是否允许请求（不阻塞）
   */
  async allowRequest(provider: string): Promise<boolean> {
    if (!this.enabled) {
      return true;
    }

    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    // 获取或初始化队列
    let queue = this.timestamps.get(provider);
    if (!queue) {
      queue = [];
      this.timestamps.set(provider, queue);
    }

    // 移除窗口外的时间戳
    queue = queue.filter(t => t > windowStart);
    this.timestamps.set(provider, queue);

    // 检查是否超过限制
    if (queue.length >= this.requestsPerMinute) {
      this.stats.throttledRequests++;
      return false;
    }

    // 添加当前时间戳
    queue.push(now);
    this.stats.allowedRequests++;
    return true;
  }

  /**
   * 等待直到可以请求
   */
  async waitUntilAllowed(provider: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    while (!(await this.allowRequest(provider))) {
      const queue = this.timestamps.get(provider);
      if (!queue || queue.length === 0) {
        break;
      }

      // 计算需要等待的时间
      const oldestTimestamp = queue[0];
      const waitTime = oldestTimestamp + 60000 - Date.now() + 100; // +100ms buffer

      if (waitTime > 0) {
        this.logger.debug('Rate limit reached, waiting...', {
          provider,
          waitTime,
          queueSize: queue.length,
        });

        this.stats.totalWaitTime += waitTime;
        await this.sleep(waitTime);
      }
    }
  }

  /**
   * 尝试获取许可（令牌桶算法）
   * @returns 获得的许可数量
   */
  async tryAcquire(provider: string, permits = 1): Promise<number> {
    if (!this.enabled) {
      return permits;
    }

    // 简化实现：每次申请一个许可
    for (let i = 0; i < permits; i++) {
      if (!(await this.allowRequest(provider))) {
        return i; // 返回实际获得的许可数
      }
    }

    return permits;
  }

  /**
   * 重置计数器
   */
  reset(provider?: string): void {
    if (provider) {
      this.timestamps.delete(provider);
    } else {
      this.timestamps.clear();
    }
    this.logger.debug('Rate limiter reset', { provider });
  }

  /**
   * 获取剩余请求数
   */
  getRemaining(provider: string): number {
    const queue = this.timestamps.get(provider);
    if (!queue) {
      return this.requestsPerMinute;
    }

    const now = Date.now();
    const windowStart = now - 60000;
    const recentCount = queue.filter(t => t > windowStart).length;

    return Math.max(0, this.requestsPerMinute - recentCount);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      allowedRequests: 0,
      throttledRequests: 0,
      totalWaitTime: 0,
    };
  }

  // ==================== 私有方法 ====================

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================
// 令牌桶速率限制器
// ============================================================

/**
 * 令牌桶速率限制器
 * 更平滑地处理突发流量
 */
export class TokenBucketRateLimiter {
  // 每个 Provider 的令牌桶状态
  private buckets: Map<string, TokenBucket> = new Map();

  // 默认配置
  private readonly refillRate: number; // tokens per second
  private readonly capacity: number; // max tokens
  private enabled: boolean;
  private logger: any;

  constructor(
    refillRate: number, // 每秒生成的令牌数
    capacity: number, // 桶容量
    enabled = true,
    logger: any
  ) {
    this.refillRate = refillRate;
    this.capacity = capacity;
    this.enabled = enabled;
    this.logger = logger;
  }

  /**
   * 尝试获取令牌
   */
  async tryAcquire(provider: string, tokens = 1): Promise<boolean> {
    if (!this.enabled) {
      return true;
    }

    const bucket = this.getOrCreateBucket(provider);
    const now = Date.now();

    // 计算需要补充的令牌
    const elapsed = (now - bucket.lastRefill) / 1000; // seconds
    const refill = Math.floor(elapsed * this.refillRate);

    bucket.tokens = Math.min(this.capacity, bucket.tokens + refill);
    bucket.lastRefill = now;

    // 检查是否有足够的令牌
    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * 等待直到获取到令牌
   */
  async acquire(provider: string, tokens = 1): Promise<void> {
    while (!(await this.tryAcquire(provider, tokens))) {
      // 计算需要等待的时间
      const bucket = this.buckets.get(provider);
      if (!bucket) {
        throw new Error('Bucket not found');
      }

      const neededTokens = tokens - bucket.tokens;
      const waitTime = Math.ceil((neededTokens / this.refillRate) * 1000);

      this.logger.debug('Waiting for tokens', {
        provider,
        waitTime,
        available: bucket.tokens,
        needed: tokens,
      });

      await this.sleep(waitTime);
    }
  }

  /**
   * 获取可用令牌数
   */
  getAvailableTokens(provider: string): number {
    const bucket = this.buckets.get(provider);
    if (!bucket) {
      return this.capacity;
    }

    // 更新令牌数
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;
    const refill = Math.floor(elapsed * this.refillRate);

    return Math.min(this.capacity, bucket.tokens + refill);
  }

  /**
   * 重置
   */
  reset(provider?: string): void {
    if (provider) {
      this.buckets.delete(provider);
    } else {
      this.buckets.clear();
    }
  }

  // ==================== 私有方法 ====================

  private getOrCreateBucket(provider: string): TokenBucket {
    let bucket = this.buckets.get(provider);
    if (!bucket) {
      bucket = {
        tokens: this.capacity,
        lastRefill: Date.now(),
      };
      this.buckets.set(provider, bucket);
    }
    return bucket;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 令牌桶状态
 */
interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

// RateLimiter 和 TokenBucketRateLimiter 已通过 export class 导出，无需重复导出
