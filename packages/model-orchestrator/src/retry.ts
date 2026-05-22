/**
 * 重试工具 — 用于 Provider 调用的自动重试。
 * 原位于 gateway/src/model-gateway/retry.ts（包装 @agentmesh/toolkit）。
 * 迁入此处实现统一路由，零外部依赖。
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 10000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

function isRetryable(status: number, retryableStatuses: number[]): boolean {
  return retryableStatuses.includes(status);
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 计算指数退避延迟
 */
function backoff(attempt: number, config: RetryConfig): number {
  const ms = config.baseDelayMs * Math.pow(2, attempt - 1);
  return Math.min(ms, config.maxDelayMs);
}

/**
 * 带指数退避重试的 HTTP POST 调用。
 * 仅重试可重试状态码（默认 429/5xx）和网络错误。
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  onRetry?: (attempt: number, status: number | null, delayMs: number) => void,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY, ...config };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // 尝试解析 HTTP 状态码
      let status: number | null = null;
      if (err instanceof Response) status = err.status;
      if (err && typeof err === 'object' && 'status' in err) {
        status = (err as any).status as number;
      }

      if (status !== null && !isRetryable(status, cfg.retryableStatuses)) {
        throw err; // 不可重试，直接抛
      }

      if (attempt < cfg.maxRetries) {
        const waitMs = backoff(attempt, cfg);
        onRetry?.(attempt, status, waitMs);
        await delay(waitMs);
      }
    }
  }

  throw lastError || new Error('Retry failed');
}
