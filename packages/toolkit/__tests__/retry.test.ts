/**
 * Retry 模块测试
 *
 * @author PAI
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  RetryableClient,
  HTTPRetryClient,
  createRetryableClient,
  createHTTPRetryClient,
  withRetry,
} from '../src/retry/index.js';
import { HTTP_STATUS_RETRY } from '../src/retry/types.js';

describe('RetryableClient', () => {
  let client: RetryableClient;

  beforeEach(() => {
    client = createRetryableClient({
      maxRetries: 3,
      baseDelay: 100,
    });
  });

  describe('execute', () => {
    it('should succeed on first attempt', async () => {
      const result = await client.execute(async () => {
        return 'success';
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
    });

    it('should retry on failure and succeed', async () => {
      let attempts = 0;
      const result = await client.execute(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary error');
        }
        return 'success';
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });

    it('should fail after max retries', async () => {
      const result = await client.execute(async () => {
        throw new Error('Permanent error');
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBe(4); // 1 initial + 3 retries
    });

    it('should respect custom retry config', async () => {
      const result = await client.execute(
        async () => {
          throw new Error('Network error');
        },
        { maxRetries: 1 }
      );

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(2); // 1 initial + 1 retry
    });
  });

  describe('wrap', () => {
    it('should wrap a function with retry capability', async () => {
      let attempts = 0;
      const fn = async (x: number) => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Error');
        }
        return x * 2;
      };

      const wrappedFn = client.wrap(fn);
      const result = await wrappedFn(5);

      expect(result.success).toBe(true);
      expect(result.result).toBe(10);
    });
  });
});

describe('withRetry', () => {
  it('should work as a convenience function', async () => {
    const result = await withRetry(async () => {
      return 'ok';
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe('ok');
  });
});

describe('HTTPRetryClient', () => {
  let httpClient: HTTPRetryClient;

  beforeEach(() => {
    httpClient = createHTTPRetryClient({
      defaultTimeout: 5000,
    });
  });

  describe('get', () => {
    it.skip('should make a GET request', async () => {
      const response = await httpClient.get('https://httpbin.org/get');

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
    });
  });

  describe('post', () => {
    it.skip('should make a POST request with body', async () => {
      const response = await httpClient.post(
        'https://httpbin.org/post',
        { test: 'data' }
      );

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
    });
  });

  describe('error handling', () => {
    it.skip('should throw on 404', async () => {
      try {
        await httpClient.get('https://httpbin.org/status/404');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});

describe('types', () => {
  it('should have correct HTTP_STATUS_RETRY', () => {
    expect(HTTP_STATUS_RETRY).toContain(500);
    expect(HTTP_STATUS_RETRY).toContain(502);
    expect(HTTP_STATUS_RETRY).toContain(503);
    expect(HTTP_STATUS_RETRY).toContain(504);
    expect(HTTP_STATUS_RETRY).toContain(429);
    expect(HTTP_STATUS_RETRY).toContain(408);
  });
});
