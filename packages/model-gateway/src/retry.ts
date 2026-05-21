interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
}

let globalConfig: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

export function configureRetry(cfg: Partial<RetryConfig>): void {
  globalConfig = { ...globalConfig, ...cfg };
}

export function isRetryable(status: number): boolean {
  return globalConfig.retryableStatuses.includes(status);
}

export async function withRetry<T>(
  providerName: string,
  fn: () => Promise<T>,
  onRetry?: (attempt: number, status: number | string, delayMs: number) => void
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= globalConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err.status || err.message || 'unknown';

      if (attempt >= globalConfig.maxRetries) break;

      const delayMs = Math.min(
        globalConfig.baseDelayMs * Math.pow(2, attempt),
        globalConfig.maxDelayMs
      );

      if (onRetry) onRetry(attempt + 1, status, delayMs);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
