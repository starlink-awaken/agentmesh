/**
 * LLM Integration Basic Tests
 *
 * 基础测试验证 LLM 集成的核心功能。
 * 这些测试不需要真实的 API Key，使用模拟 Provider。
 */

import { describe, it, expect } from 'bun:test';
import { SimulationProvider } from '../src/llm/simulation.js';
import { ResponseCache } from '../src/llm/cache.js';
import { RateLimiter } from '../src/llm/rate-limiter.js';
import { TokenTracker } from '../src/llm/tracker.js';
import { RequestBatcher } from '../src/llm/batcher.js';

// 简单的 logger mock
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe('LLM Integration - Basic Tests', () => {
  describe('SimulationProvider', () => {
    it('should generate completion', async () => {
      const provider = new SimulationProvider({}, mockLogger);
      const result = await provider.complete('Test prompt');

      expect(result.content).toBeTruthy();
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.provider).toBe('simulation');
    });

    it('should estimate tokens', () => {
      const provider = new SimulationProvider({}, mockLogger);
      const tokens = provider.estimateTokens('Hello world');

      expect(tokens).toBeGreaterThan(0);
    });

    it('should be available', async () => {
      const provider = new SimulationProvider({}, mockLogger);
      const available = await provider.isAvailable();

      expect(available).toBe(true);
    });

    it('should support streaming', async () => {
      const provider = new SimulationProvider({}, mockLogger);
      const chunks: Array<{ delta: string; done: boolean }> = [];

      for await (const chunk of provider.stream('Test prompt')) {
        chunks.push(chunk);
        if (chunk.done) break;
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[chunks.length - 1].done).toBe(true);
    });
  });

  describe('ResponseCache', () => {
    it('should cache and retrieve results', () => {
      const cache = new ResponseCache({ enabled: true, maxSize: 100 }, mockLogger);
      const result = {
        content: 'Test result',
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        model: 'test',
        finishReason: 'stop' as const,
        provider: 'test',
        timestamp: Date.now(),
      };

      // 使用 setByKey/getByKey API（直接使用键）
      cache.setByKey('test-key', result);
      const retrieved = cache.getByKey('test-key');

      expect(retrieved).toBeTruthy();
      expect(retrieved?.content).toBe('Test result');
    });

    it('should track cache stats', () => {
      const cache = new ResponseCache({ enabled: true, maxSize: 100 }, mockLogger);
      const result = {
        content: 'Test result',
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        model: 'test',
        finishReason: 'stop' as const,
        provider: 'test',
        timestamp: Date.now(),
      };

      cache.setByKey('test-key', result);
      cache.getByKey('test-key');
      cache.getByKey('non-existent');

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.size).toBe(1);
    });

    it('should evict LRU entries when full', () => {
      const cache = new ResponseCache({ enabled: true, maxSize: 3 }, mockLogger);
      const result = {
        content: 'Test result',
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        model: 'test',
        finishReason: 'stop' as const,
        provider: 'test',
        timestamp: Date.now(),
      };

      // 添加 4 个条目（超过容量）
      cache.setByKey('key1', result);
      cache.setByKey('key2', result);
      cache.setByKey('key3', result);
      cache.setByKey('key4', result);

      // 第一个应该被淘汰
      expect(cache.getByKey('key1')).toBeUndefined();
      expect(cache.getByKey('key4')).toBeTruthy();

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });
  });

  describe('RateLimiter', () => {
    it('should allow requests within limit', async () => {
      const limiter = new RateLimiter(
        { enabled: true, requestsPerMinute: 10 },
        mockLogger
      );

      const allowed = await limiter.allowRequest('test-provider');
      expect(allowed).toBe(true);
    });

    it('should throttle requests over limit', async () => {
      const limiter = new RateLimiter(
        { enabled: true, requestsPerMinute: 2 },
        mockLogger
      );

      // 发送超过限制的请求
      await limiter.allowRequest('test-provider');
      await limiter.allowRequest('test-provider');
      const thirdRequest = await limiter.allowRequest('test-provider');

      expect(thirdRequest).toBe(false);
    });

    it('should track remaining requests', async () => {
      const limiter = new RateLimiter(
        { enabled: true, requestsPerMinute: 10 },
        mockLogger
      );

      await limiter.allowRequest('test-provider');
      const remaining = limiter.getRemaining('test-provider');

      expect(remaining).toBe(9);
    });
  });

  describe('TokenTracker', () => {
    it('should record token usage', () => {
      const tracker = new TokenTracker(mockLogger);

      tracker.record('claude', 100, 50);

      const total = tracker.getTotal('claude');
      expect(total.input).toBe(100);
      expect(total.output).toBe(50);
    });

    it('should check budget', () => {
      const tracker = new TokenTracker(mockLogger);

      tracker.record('claude', 100, 50);

      expect(tracker.checkBudget(200, 'claude')).toBe(true);
      expect(tracker.checkBudget(100, 'claude')).toBe(false);
    });

    it('should generate report', () => {
      const tracker = new TokenTracker(mockLogger);

      tracker.record('claude', 100, 50);
      tracker.record('openai', 200, 100);

      const report = tracker.getReport();
      expect(report.total.input).toBe(300);
      expect(report.total.output).toBe(150);
      expect(report.byProvider.claude?.input).toBe(100);
    });
  });

  describe('RequestBatcher', () => {
    it('should batch requests', async () => {
      const provider = new SimulationProvider({}, mockLogger);
      const batcher = new RequestBatcher(
        { enabled: true, maxBatchSize: 5, maxWaitTime: 50 },
        mockLogger,
        provider
      );

      const promises = [
        batcher.add({ id: '1', prompt: 'Test 1' }),
        batcher.add({ id: '2', prompt: 'Test 2' }),
        batcher.add({ id: '3', prompt: 'Test 3' }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results[0].content).toBeTruthy();
    });

    it('should flush on max batch size', async () => {
      const provider = new SimulationProvider({}, mockLogger);
      let flushCount = 0;
      const batcher = new RequestBatcher(
        { enabled: true, maxBatchSize: 2, maxWaitTime: 1000 },
        { ...mockLogger, debug: () => { flushCount++; } },
        provider
      );

      // 添加超过 maxBatchSize 的请求
      await batcher.add({ id: '1', prompt: 'Test 1' });
      await batcher.add({ id: '2', prompt: 'Test 2' });
      await batcher.add({ id: '3', prompt: 'Test 3' });

      // 应该触发至少一次刷新
      expect(flushCount).toBeGreaterThan(0);
    });
  });
});
