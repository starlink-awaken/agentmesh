/**
 * Performance Optimization Integration Tests (Simplified)
 *
 * 验证批处理和缓存优化的实际性能提升效果
 */

import { describe, test, expect } from 'bun:test';
import { ResponseCache } from '../src/llm/cache.js';
import type { CompletionResult, CompletionOptions } from '../src/llm/types.js';

// ============================================================
// Mock Logger
// ============================================================

const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

// ============================================================
// 辅助函数
// ============================================================

function createResult(content: string): CompletionResult {
  return {
    content,
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    model: 'claude-3-5-sonnet-20241022',
    finishReason: 'stop'
  };
}

// ============================================================
// 缓存效果测试
// ============================================================

describe('Performance Optimization - Caching', () => {

  test('缓存命中率 > 30%（重复请求场景）', async () => {
    const cache = new ResponseCache({
      maxSize: 1000,
      ttl: 10000,
      enabled: true
    });

    let apiCalls = 0;

    // 100 个请求，但有 50% 重复
    const uniquePrompts = ['A', 'B', 'C', 'D', 'E'];
    const promises = Array.from({ length: 100 }, (_, i) => {
      const prompt = uniquePrompts[i % uniquePrompts.length];
      const options: CompletionOptions = { model: 'claude-3-5-sonnet' };

      // 先查缓存
      const cached = cache.get(prompt, options);
      if (cached) {
        return Promise.resolve(cached);
      }

      // 缓存未命中，调用 API
      apiCalls++;
      const result = createResult(`Response for ${prompt}`);
      cache.set(prompt, options, result);
      return Promise.resolve(result);
    });

    await Promise.all(promises);

    // 验证：应该只有 5 次 API 调用（5 个唯一 prompt）
    expect(apiCalls).toBe(5);

    // 验证：缓存命中率 > 30%
    const stats = cache.getStats();
    const hitRate = stats.hits / (stats.hits + stats.misses);

    console.log(`✓ 缓存命中: ${stats.hits}`);
    console.log(`✓ 缓存未命中: ${stats.misses}`);
    console.log(`✓ 缓存命中率: ${(hitRate * 100).toFixed(1)}%`);
    console.log(`✓ API 调用减少: ${((1 - apiCalls / 100) * 100).toFixed(1)}%`);

    expect(hitRate).toBeGreaterThan(0.3);
  });

  test('缓存减少 API 调用 > 30%', async () => {
    const cache = new ResponseCache({
      maxSize: 1000,
      ttl: 10000,
      enabled: true
    });

    let apiCalls = 0;

    // 100 个请求，50% 重复
    const prompts = Array.from({ length: 50 }, (_, i) => `Prompt ${i}`);
    const allPrompts = [...prompts, ...prompts]; // 重复一遍

    const promises = allPrompts.map(prompt => {
      const cached = cache.get(prompt, {});
      if (cached) return Promise.resolve(cached);

      apiCalls++;
      const result = createResult(`Response for ${prompt}`);
      cache.set(prompt, {}, result);
      return Promise.resolve(result);
    });

    await Promise.all(promises);

    // 验证：只有 50 次 API 调用（50% 减少）
    expect(apiCalls).toBe(50);

    const stats = cache.getStats();
    const reduction = (1 - apiCalls / 100) * 100;

    console.log(`✓ 原始请求: 100`);
    console.log(`✓ 实际 API 调用: ${apiCalls}`);
    console.log(`✓ API 调用减少: ${reduction.toFixed(1)}%`);
    console.log(`✓ 缓存命中率: ${((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)}%`);

    expect(reduction).toBeGreaterThanOrEqual(30);
  });

  test('缓存 TTL 过期机制正常工作', async () => {
    const cache = new ResponseCache({
      maxSize: 1000,
      ttl: 100, // 100ms TTL
      enabled: true
    });

    // 第一次请求（缓存未命中）
    const result1 = createResult('Response 1');
    cache.set('Test', {}, result1);

    // 立即第二次请求（缓存命中）
    const cached = cache.get('Test', {});
    expect(cached).toBeDefined();
    expect(cached?.content).toBe('Response 1');

    // 等待过期
    await new Promise(resolve => setTimeout(resolve, 150));

    // 过期后请求（缓存未命中）
    const cached2 = cache.get('Test', {});
    expect(cached2).toBeUndefined(); // 已过期

    console.log('✓ TTL 过期机制正常工作');
  });

  test('LRU 淘汰机制正常工作', () => {
    const cache = new ResponseCache({
      maxSize: 3,
      ttl: 10000,
      enabled: true
    });

    // 添加 3 个条目
    for (let i = 1; i <= 3; i++) {
      cache.set(`Prompt ${i}`, {}, createResult(`Response ${i}`));
    }

    // 访问第 1 个条目（使其变为最近使用）
    cache.get('Prompt 1', {});

    // 添加第 4 个条目（应该淘汰第 2 个，最少使用）
    cache.set('Prompt 4', {}, createResult('Response 4'));

    // 验证：第 2 个条目被淘汰
    expect(cache.get('Prompt 2', {})).toBeUndefined();

    // 验证：其他条目仍在
    expect(cache.get('Prompt 1', {})).toBeDefined();
    expect(cache.get('Prompt 3', {})).toBeDefined();
    expect(cache.get('Prompt 4', {})).toBeDefined();

    const stats = cache.getStats();
    expect(stats.evictions).toBe(1);

    console.log('✓ LRU 淘汰机制正常工作');
  });

  test('缓存键唯一性（不同参数生成不同键）', () => {
    const cache = new ResponseCache({
      maxSize: 100,
      ttl: 10000,
      enabled: true
    });

    cache.set('Same prompt', { model: 'claude-3' }, createResult('Response 1'));
    cache.set('Same prompt', { model: 'claude-3-5' }, createResult('Response 2'));

    // 验证：两个不同的条目都存在
    const result1 = cache.get('Same prompt', { model: 'claude-3' });
    const result2 = cache.get('Same prompt', { model: 'claude-3-5' });

    expect(result1?.content).toBe('Response 1');
    expect(result2?.content).toBe('Response 2');
    expect(result1).not.toEqual(result2);

    console.log('✓ 缓存键唯一性正常工作');
  });
});

// ============================================================
// 性能基准测试
// ============================================================

describe('Performance Optimization - Benchmarks', () => {

  test('缓存查询性能 < 0.1ms', () => {
    const cache = new ResponseCache({
      maxSize: 1000,
      ttl: 10000,
      enabled: true
    });

    // 预填充缓存
    for (let i = 0; i < 1000; i++) {
      cache.set(`Prompt ${i}`, {}, createResult(`Response ${i}`));
    }

    // 测量查询性能
    const start = Date.now();
    for (let i = 0; i < 10000; i++) {
      cache.get(`Prompt ${i % 1000}`, {});
    }
    const elapsed = Date.now() - start;

    const avgTime = elapsed / 10000;

    console.log(`✓ 10000 次缓存查询总耗时: ${elapsed}ms`);
    console.log(`✓ 平均查询时间: ${avgTime.toFixed(4)}ms`);

    // 验证：平均查询时间 < 0.1ms
    expect(avgTime).toBeLessThan(0.1);
  });

  test('缓存写入性能 < 0.1ms', () => {
    const cache = new ResponseCache({
      maxSize: 1000,
      ttl: 10000,
      enabled: true
    });

    // 测量写入性能
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      cache.set(`Prompt ${i}`, {}, createResult(`Response ${i}`));
    }
    const elapsed = Date.now() - start;

    const avgTime = elapsed / 1000;

    console.log(`✓ 1000 次缓存写入总耗时: ${elapsed}ms`);
    console.log(`✓ 平均写入时间: ${avgTime.toFixed(4)}ms`);

    // 验证：平均写入时间 < 0.1ms
    expect(avgTime).toBeLessThan(0.1);
  });
});

// ============================================================
// 综合性能测试
// ============================================================

describe('Performance Optimization - Summary', () => {

  test('生成性能优化总结报告', async () => {
    const cache = new ResponseCache({
      maxSize: 1000,
      ttl: 10000,
      enabled: true
    });

    let apiCalls = 0;

    // 模拟真实场景：100 个请求，部分重复
    const uniquePrompts = Array.from({ length: 30 }, (_, i) => `Prompt ${i}`);
    const allPrompts = Array.from({ length: 100 }, (_, i) =>
      uniquePrompts[i % uniquePrompts.length]
    );

    const startTime = Date.now();

    const promises = allPrompts.map(prompt => {
      const cached = cache.get(prompt, {});
      if (cached) return Promise.resolve(cached);

      apiCalls++;
      const result = createResult(`Response for ${prompt}`);
      cache.set(prompt, {}, result);
      return Promise.resolve(result);
    });

    await Promise.all(promises);

    const elapsedTime = Date.now() - startTime;
    const stats = cache.getStats();
    const hitRate = stats.hits / (stats.hits + stats.misses);
    const reduction = (1 - apiCalls / 100) * 100;

    console.log(`\n📊 性能优化总结报告`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`测试配置:`);
    console.log(`  - 总请求数: 100`);
    console.log(`  - 唯一请求数: 30`);
    console.log(`  - 重复率: 70%`);
    console.log(`\n缓存统计:`);
    console.log(`  - 命中: ${stats.hits}`);
    console.log(`  - 未命中: ${stats.misses}`);
    console.log(`  - 命中率: ${(hitRate * 100).toFixed(1)}%`);
    console.log(`  - 淘汰数: ${stats.evictions}`);
    console.log(`\n性能指标:`);
    console.log(`  - 原始 API 调用: 100`);
    console.log(`  - 实际 API 调用: ${apiCalls}`);
    console.log(`  - API 调用减少: ${reduction.toFixed(1)}%`);
    console.log(`  - 总耗时: ${elapsedTime}ms`);
    console.log(`  - 平均请求耗时: ${(elapsedTime / 100).toFixed(2)}ms`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // 验证：API 调用减少 > 50%
    expect(reduction).toBeGreaterThan(50);

    // 验证：性能提升显著
    expect(hitRate).toBeGreaterThan(0.5); // 70% 重复，应该 > 50% 命中
  });
});
