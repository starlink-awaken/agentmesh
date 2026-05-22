/**
 * Retry 模块 - 可重试客户端
 *
 * @author PAI
 * @version 1.0.0
 */

import { RetryConfig, RetryResult, DEFAULT_RETRY_CONFIG } from './types.js';

/**
 * 计算指数退避延迟
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelay);
}

/**
 * 可重试客户端 - 包装任意函数并提供重试机制
 */
export class RetryableClient {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      ...DEFAULT_RETRY_CONFIG,
      ...config,
    };
  }

  /**
   * 包装一个函数，使其具有重试能力
   *
   * @param fn 要包装的函数
   * @param config 可选的重试配置覆盖
   * @returns 包装后的函数
   */
  wrap<T, Args extends unknown[]>(
    fn: (...args: Args) => Promise<T>,
    config?: Partial<RetryConfig>
  ): (...args: Args) => Promise<RetryResult<T>> {
    const mergedConfig = { ...this.config, ...config };

    return async (...args: Args): Promise<RetryResult<T>> => {
      return this.execute<T>(() => fn(...args), mergedConfig);
    };
  }

  /**
   * 执行函数并自动重试
   *
   * @param fn 要执行的函数
   * @param config 可选的重试配置覆盖
   * @returns 重试结果
   */
  async execute<T>(
    fn: () => Promise<T>,
    config?: Partial<RetryConfig>
  ): Promise<RetryResult<T>> {
    const mergedConfig = { ...this.config, ...config };
    const startTime = Date.now();
    let lastError: Error;

    for (let attempt = 0; attempt <= mergedConfig.maxRetries; attempt++) {
      try {
        const result = await fn();
        return {
          success: true,
          attempts: attempt + 1,
          totalTime: Date.now() - startTime,
          result,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 如果是最后一次尝试或者错误不应该重试
        if (attempt >= mergedConfig.maxRetries || !mergedConfig.retryOn(lastError)) {
          return {
            success: false,
            attempts: attempt + 1,
            totalTime: Date.now() - startTime,
            error: lastError,
          };
        }

        // 计算延迟并等待
        const delay = calculateDelay(attempt, mergedConfig);
        await this.sleep(delay);
      }
    }

    // 这是一个安全返回，但实际上不应该到达这里
    return {
      success: false,
      attempts: mergedConfig.maxRetries + 1,
      totalTime: Date.now() - startTime,
      error: lastError!,
    };
  }

  /**
   * 异步等待指定时间
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 更新配置
   */
  setConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }
}

/**
 * 创建默认的重试客户端
 */
export function createRetryableClient(config?: Partial<RetryConfig>): RetryableClient {
  return new RetryableClient(config);
}

/**
 * 便捷函数：使用默认配置执行可重试操作
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<RetryResult<T>> {
  const client = new RetryableClient(config);
  return client.execute(fn);
}
