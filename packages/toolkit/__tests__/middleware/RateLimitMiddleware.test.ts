/**
 * RateLimitMiddleware Tests - 速率限制中间件测试
 * @author PAI
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'bun:test';
import {
  RateLimitMiddleware,
  MemoryRateLimitStore,
  createRateLimitMiddleware,
  createIPRateLimitMiddleware,
  createUserRateLimitMiddleware
} from '../../src/middleware/RateLimitMiddleware';
import { createContext } from '../../src/middleware/MiddlewareChain';
import type { MiddlewareContext, RateLimitConfig } from '../../src/middleware/types';

describe('RateLimitMiddleware', () => {
  let middleware: RateLimitMiddleware;
  let store: MemoryRateLimitStore;
  let config: RateLimitConfig;

  beforeEach(() => {
    store = new MemoryRateLimitStore();
    config = {
      limit: 5,
      windowMs: 60000,
      slidingWindow: false
    };
    middleware = new RateLimitMiddleware(config, store);
  });

  afterEach(() => {
    if (middleware) {
      middleware.destroy();
    }
  });

  describe('MemoryRateLimitStore', () => {
    test('should store and retrieve entries', () => {
      const key = 'test-key';
      const entry = { count: 1, resetTime: Date.now() + 60000 };

      store.set(key, entry);
      const retrieved = store.get(key);

      expect(retrieved).toEqual(entry);
    });

    test('should delete entries', () => {
      const key = 'test-key';
      const entry = { count: 1, resetTime: Date.now() + 60000 };

      store.set(key, entry);
      store.delete(key);

      expect(store.get(key)).toBeUndefined();
    });

    test('should clean expired entries', () => {
      const expiredKey = 'expired-key';
      const validKey = 'valid-key';

      store.set(expiredKey, { count: 1, resetTime: Date.now() - 1000 });
      store.set(validKey, { count: 1, resetTime: Date.now() + 60000 });

      store.cleanExpired();

      expect(store.get(expiredKey)).toBeUndefined();
      expect(store.get(validKey)).toBeDefined();
    });
  });

  describe('windowFixed', () => {
    test('should allow requests within limit', () => {
      const key = 'test-key';
      const now = Date.now();

      // 第一次请求
      const result1 = middleware['windowFixed'](key, now);
      expect(result1.allowed).toBe(true);
      expect(result1.resetTime).toBeGreaterThan(now);

      // 第二次请求
      const result2 = middleware['windowFixed'](key, now + 1000);
      expect(result2.allowed).toBe(true);
    });

    test('should block requests exceeding limit', () => {
      const key = 'test-key';
      const now = Date.now();

      // 发送 limit 次请求
      for (let i = 0; i < config.limit; i++) {
        const result = middleware['windowFixed'](key, now + i * 1000);
        expect(result.allowed).toBe(true);
      }

      // 第 limit+1 次请求应该被拒绝
      const result = middleware['windowFixed'](key, now + config.limit * 1000);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    test('should reset window after time passes', () => {
      const key = 'test-key';
      const now = Date.now();

      // 填满当前窗口
      for (let i = 0; i < config.limit; i++) {
        middleware['windowFixed'](key, now + i * 1000);
      }

      // 等待窗口重置
      const afterReset = now + config.windowMs + 1000;
      const result = middleware['windowFixed'](key, afterReset);

      expect(result.allowed).toBe(true);
    });
  });

  describe('windowSliding', () => {
    beforeEach(() => {
      config.slidingWindow = true;
      middleware = new RateLimitMiddleware(config, store);
    });

    test('should allow requests within sliding window', () => {
      const key = 'test-key';
      const now = Date.now();

      // 发送请求
      for (let i = 0; i < config.limit; i++) {
        const result = middleware['windowSliding'](key, now + i * 1000);
        expect(result.allowed).toBe(true);
      }
    });

    test('should block requests exceeding sliding window', () => {
      const key = 'test-key';
      const now = Date.now();

      // 填满窗口
      for (let i = 0; i < config.limit; i++) {
        middleware['windowSliding'](key, now + i * 1000);
      }

      // 第 limit+1 次请求应该被拒绝
      const result = middleware['windowSliding'](key, now + config.limit * 1000);
      expect(result.allowed).toBe(false);
    });

    test('should slide window as time passes', () => {
      const key = 'test-key';
      const now = Date.now();

      // 填满窗口
      for (let i = 0; i < config.limit; i++) {
        middleware['windowSliding'](key, now + i * 1000);
      }

      // 等待第一个请求过期
      const afterFirstExpired = now + config.windowMs + 2000;
      const result = middleware['windowSliding'](key, afterFirstExpired);

      expect(result.allowed).toBe(true);
    });
  });

  describe('checkLimit', () => {
    test('should check limit with fixed window', async () => {
      const context = createContext({
        method: 'GET',
        path: '/test',
        headers: { 'x-forwarded-for': '127.0.0.1' }
      });

      const result = await middleware.checkLimit(context);
      expect(result.allowed).toBe(true);
    });

    test('should check limit with sliding window', async () => {
      config.slidingWindow = true;
      middleware = new RateLimitMiddleware(config, store);

      const context = createContext({
        method: 'GET',
        path: '/test',
        headers: { 'x-forwarded-for': '127.0.0.1' }
      });

      const result = await middleware.checkLimit(context);
      expect(result.allowed).toBe(true);
    });
  });

  describe('create()', () => {
    test('should create middleware that allows requests', async () => {
      const middlewareFunc = middleware.create();
      const context = createContext({
        method: 'GET',
        path: '/test',
        headers: { 'x-forwarded-for': '127.0.0.1' }
      });

      const next = vi.fn().mockResolvedValue(context);
      const result = await middlewareFunc(context, next);

      expect(result).toBe(context);
      expect(next).toHaveBeenCalled();
    });

    test('should create middleware that blocks requests on limit', async () => {
      const middlewareFunc = middleware.create();
      const context = createContext({
        method: 'GET',
        path: '/test',
        headers: { 'x-forwarded-for': '127.0.0.1' }
      });

      // 填满限制
      for (let i = 0; i < config.limit; i++) {
        await middleware.checkLimit(context);
      }

      const next = vi.fn();
      const result = await middlewareFunc(context, next);

      expect(result.state.stopped).toBe(true);
      expect(result.response?.status).toBe(429);
      expect(result.response?.headers['X-RateLimit-Limit']).toBe('5');
      expect(result.response?.headers['X-RateLimit-Remaining']).toBe('0');
      expect(next).not.toHaveBeenCalled();
    });

    test('should add rate limit headers to response', async () => {
      const middlewareFunc = middleware.create();
      const context = createContext({
        method: 'GET',
        path: '/test',
        headers: { 'x-forwarded-for': '127.0.0.1' }
      });

      const next = vi.fn().mockImplementation(async (ctx) => {
        ctx.response = { status: 200, headers: {} };
        return ctx;
      });

      const result = await middlewareFunc(context, next);

      expect(result.response?.headers['X-RateLimit-Limit']).toBe('5');
      expect(result.response?.headers['X-RateLimit-Remaining']).toBe('4');
      expect(result.response?.headers['X-RateLimit-Reset']).toBeDefined();
    });
  });

  describe('getUsage', () => {
    test('should return current usage', () => {
      const context = createContext({
        method: 'GET',
        path: '/test',
        headers: { 'x-forwarded-for': '127.0.0.1' }
      });

      // 第一次请求
      middleware.checkLimit(context);
      expect(middleware.getUsage(context)).toBe(1);

      // 第二次请求
      middleware.checkLimit(context);
      expect(middleware.getUsage(context)).toBe(2);
    });

    test('should return sliding window usage', () => {
      config.slidingWindow = true;
      middleware = new RateLimitMiddleware(config, store);

      const context = createContext({
        method: 'GET',
        path: '/test',
        headers: { 'x-forwarded-for': '127.0.0.1' }
      });

      middleware.checkLimit(context);
      expect(middleware.getUsage(context)).toBe(1);
    });
  });

  describe('reset', () => {
    test('should reset limit for key', () => {
      const context = createContext({
        method: 'GET',
        path: '/test',
        headers: { 'x-forwarded-for': '127.0.0.1' }
      });

      // 增加使用量
      middleware.checkLimit(context);
      expect(middleware.getUsage(context)).toBe(1);

      // 重置
      const key = middleware['config'].keyGenerator(context);
      middleware.reset(key);
      expect(middleware.getUsage(context)).toBe(0);
    });
  });

  describe('factory functions', () => {
    test('createRateLimitMiddleware should create middleware', () => {
      const middlewareFunc = createRateLimitMiddleware(config);
      expect(typeof middlewareFunc).toBe('function');
    });

    test('createIPRateLimitMiddleware should create IP-based middleware', () => {
      const middlewareFunc = createIPRateLimitMiddleware(10, 30000);
      expect(typeof middlewareFunc).toBe('function');
    });

    test('createUserRateLimitMiddleware should create user-based middleware', () => {
      const middlewareFunc = createUserRateLimitMiddleware(100, 60000);
      expect(typeof middlewareFunc).toBe('function');
    });
  });

  describe('concurrent requests', () => {
    test('should handle sequential requests correctly', async () => {
      const middlewareFunc = middleware.create();

      // 顺序发送请求
      const results = [];
      for (let i = 0; i < config.limit + 2; i++) {
        const context = createContext({
          method: 'GET',
          path: '/test',
          headers: { 'x-forwarded-for': '127.0.0.1' }
        });
        results.push(await middlewareFunc(context, async (c) => c));
      }

      // 检查哪些请求被限制
      const allowed = results.filter(r => !r.state.stopped);
      const blocked = results.filter(r => r.state.stopped);

      expect(allowed.length).toBe(config.limit);
      expect(blocked.length).toBe(2);
    });
  });

  describe('configuration', () => {
    test('should accept limit configuration', () => {
      const configWithLimit = { limit: 10, windowMs: 1000 };
      const mw = new RateLimitMiddleware(configWithLimit);
      expect(mw).toBeDefined();
      mw.destroy();
    });

    test('should accept windowMs configuration', () => {
      const configWithWindow = { limit: 5, windowMs: 5000 };
      const mw = new RateLimitMiddleware(configWithWindow);
      expect(mw).toBeDefined();
      mw.destroy();
    });
  });
});
