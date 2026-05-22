import { describe, it, expect } from 'bun:test';
import { withRetry } from '../src/retry.js';

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const result = await withRetry(async () => 'ok');
    expect(result).toBe('ok');
  });

  it('retries on failure and eventually succeeds', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw Object.assign(new Error('fail'), { status: 503 });
        return 'ok';
      },
      undefined,
      { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, retryableStatuses: [503] },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('throws after exhausting retries', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw Object.assign(new Error('persistent'), { status: 502 });
        },
        undefined,
        { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, retryableStatuses: [502] },
      ),
    ).rejects.toThrow('persistent');
    expect(attempts).toBe(3);
  });

  it('does not retry non-retryable statuses', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw Object.assign(new Error('bad request'), { status: 400 });
        },
        undefined,
        { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, retryableStatuses: [503] },
      ),
    ).rejects.toThrow('bad request');
    expect(attempts).toBe(1); // 只尝试一次
  });

  it('retries on network errors', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new Error('network error');
        },
        undefined,
        { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10, retryableStatuses: [503] },
      ),
    ).rejects.toThrow('network error');
    expect(attempts).toBe(2); // 网络错误也重试
  });

  it('calls onRetry callback', async () => {
    const retryCalls: number[] = [];
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw Object.assign(new Error('fail'), { status: 503 });
        },
        (attempt, status) => { retryCalls.push(attempt); },
        { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, retryableStatuses: [503] },
      ),
    ).rejects.toThrow();
    expect(retryCalls.length).toBe(2); // 3次尝试，2次重试回调
    expect(retryCalls[0]).toBe(1);
    expect(retryCalls[1]).toBe(2);
  });
});
