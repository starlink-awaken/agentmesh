/**
 * Retry — @agentmesh/toolkit RetryableClient 桥接包装
 *
 * API 向后兼容 v1.x，底层使用 @agentmesh/toolkit 重试机制
 */
import { createRetryableClient } from '@agentmesh/toolkit';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
}

const DEFAULTS: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

let globalConfig: RetryConfig = { ...DEFAULTS };

export function configureRetry(config: Partial<RetryConfig> = {}): void {
  globalConfig = { ...DEFAULTS, ...config };
}

export function getRetryConfig(): RetryConfig {
  return globalConfig;
}

export function isRetryable(status: number): boolean {
  return globalConfig.retryableStatuses.includes(status);
}

export function getRetryDelay(attempt: number): number {
  const base = globalConfig.baseDelayMs * Math.pow(2, attempt);
  return Math.min(base * (0.75 + Math.random() * 0.5), globalConfig.maxDelayMs);
}

export async function withRetry<T>(
  provider: string,
  fn: () => Promise<{ ok: boolean; status: number } & T>,
  onRetry?: (attempt: number, status: number, delayMs: number) => void,
): Promise<T> {
  const client = createRetryableClient({
    maxRetries: globalConfig.maxRetries,
    baseDelay: globalConfig.baseDelayMs,
    maxDelay: globalConfig.maxDelayMs,
  });

  const result = await client.execute<{ ok: boolean; status: number } & T>(async () => {
    const res = await fn();
    if (!res.ok && isRetryable(res.status)) {
      onRetry?.(0, res.status, 0);
      throw new Error(`Retryable status: ${res.status}`);
    }
    return res;
  });

  if (!result.success) throw result.error || new Error(`${provider}: max retries exhausted`);
  return result.result!;
}
