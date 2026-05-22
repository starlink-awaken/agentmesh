import { describe, test, expect } from 'bun:test';
import {
  configureRetry,
  getRetryConfig,
  getRetryDelay,
  isRetryable,
} from '../../src/model-gateway/retry.js';

describe('retry config', () => {
  test('default config values', () => {
    const cfg = getRetryConfig();
    expect(cfg.maxRetries).toBe(3);
    expect(cfg.baseDelayMs).toBe(500);
    expect(cfg.maxDelayMs).toBe(10000);
  });

  test('retryable status codes', () => {
    expect(isRetryable(429)).toBe(true);
    expect(isRetryable(500)).toBe(true);
    expect(isRetryable(502)).toBe(true);
    expect(isRetryable(503)).toBe(true);
    expect(isRetryable(504)).toBe(true);
    expect(isRetryable(400)).toBe(false);
    expect(isRetryable(401)).toBe(false);
    expect(isRetryable(404)).toBe(false);
    expect(isRetryable(200)).toBe(false);
  });

  test('config overrides', () => {
    configureRetry({ maxRetries: 5, baseDelayMs: 1000 });
    const cfg = getRetryConfig();
    expect(cfg.maxRetries).toBe(5);
    expect(cfg.baseDelayMs).toBe(1000);
    // Reset
    configureRetry({ maxRetries: 3, baseDelayMs: 500 });
  });
});

describe('retry delay', () => {
  test('exponential backoff with base 500', () => {
    const delay0 = getRetryDelay(0); // 500 * 2^0 = 500ms ± jitter
    const delay1 = getRetryDelay(1); // 500 * 2^1 = 1000ms ± jitter
    const delay2 = getRetryDelay(2); // 500 * 2^2 = 2000ms ± jitter

    // 由于 jitter (+/-25%)，检查范围
    expect(delay0).toBeGreaterThanOrEqual(375);
    expect(delay0).toBeLessThanOrEqual(750);

    expect(delay1).toBeGreaterThanOrEqual(750);
    expect(delay1).toBeLessThanOrEqual(1500);

    expect(delay2).toBeGreaterThanOrEqual(1500);
    expect(delay2).toBeLessThanOrEqual(3000);
  });

  test('capped at maxDelayMs', () => {
    const delay = getRetryDelay(10); // 500 * 2^10 = 512000ms, capped at 10000ms
    expect(delay).toBeLessThanOrEqual(10000);
  });
});
