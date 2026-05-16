import { describe, test, expect, beforeEach } from 'bun:test';
import { initRateLimiter, checkRateLimit } from '../../src/model-gateway/rate-limit.js';

describe('rate limiter', () => {
  beforeEach(() => {
    initRateLimiter();
  });

  test('allows first request within limit', () => {
    const result = checkRateLimit('/v1/chat/completions', '127.0.0.1');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(60);
    expect(result.remaining).toBe(59);
  });

  test('decrements tokens on subsequent requests', () => {
    let result = checkRateLimit('/v1/chat/completions', '10.0.0.1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);

    result = checkRateLimit('/v1/chat/completions', '10.0.0.1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(58);
  });

  test('independent limits per IP', () => {
    const a = checkRateLimit('/v1/chat/completions', '1.1.1.1');
    const b = checkRateLimit('/v1/chat/completions', '2.2.2.2');
    expect(a.remaining).toBe(59);
    expect(b.remaining).toBe(59);
  });

  test('independent limits per endpoint', () => {
    const chat = checkRateLimit('/v1/chat/completions', '3.3.3.3');
    const resp = checkRateLimit('/v1/responses', '3.3.3.3');
    expect(chat.limit).toBe(60);
    expect(resp.limit).toBe(30);
  });

  test('unconfigured path is not rate limited', () => {
    const result = checkRateLimit('/v1/models', '4.4.4.4');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(0);
  });

  test('returns reset time when tokens are low', () => {
    const result = checkRateLimit('/v1/chat/completions', '5.5.5.5');
    expect(result.resetSeconds).toBeGreaterThanOrEqual(0);
  });
});
