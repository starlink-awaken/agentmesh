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
  const withJitter = base * (0.75 + Math.random() * 0.5);
  return Math.min(withJitter, globalConfig.maxDelayMs);
}

export async function withRetry<T>(
  provider: string,
  fn: () => Promise<{ ok: boolean; status: number } & T>,
  onRetry?: (attempt: number, status: number, delayMs: number) => void,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= globalConfig.maxRetries; attempt++) {
    try {
      const result = await fn();

      if (!result.ok && isRetryable(result.status) && attempt < globalConfig.maxRetries) {
        const delay = getRetryDelay(attempt);
        onRetry?.(attempt + 1, result.status, delay);
        await sleep(delay);
        continue;
      }

      return result;
    } catch (err) {
      lastError = err as Error;
      if (attempt < globalConfig.maxRetries) {
        const delay = getRetryDelay(attempt);
        onRetry?.(attempt + 1, 0, delay);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`${provider}: max retries exhausted`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
