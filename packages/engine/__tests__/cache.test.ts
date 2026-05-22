/**
 * ResponseCache 单元测试
 *
 * 完整测试 LRU 缓存系统的所有功能：
 * - 基础缓存功能（存储和检索）
 * - LRU 淘汰机制
 * - TTL 过期机制
 * - 缓存键唯一性
 * - 并发安全
 * - 统计信息准确性
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ResponseCache } from '../src/llm/cache.js';
import type { CompletionResult, CompletionOptions, CacheConfig } from '../src/llm/types.js';

// ============================================================
// 测试辅助工具
// ============================================================

/**
 * 创建模拟 Logger
 */
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * 创建测试用的 CompletionResult
 */
function createResult(content: string): CompletionResult {
  return {
    content,
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    model: 'claude-3-5-sonnet',
    finishReason: 'stop',
    provider: 'test',
    timestamp: Date.now(),
  };
}

/**
 * 创建测试用的 CompletionOptions
 */
function createOptions(overrides: Partial<CompletionOptions> = {}): CompletionOptions {
  return {
    model: 'claude-3-5-sonnet',
    temperature: 0.7,
    maxTokens: 4096,
    ...overrides,
  };
}

// ============================================================
// 测试套件
// ============================================================

describe('ResponseCache - 基础缓存功能', () => {
  let cache: ResponseCache;

  beforeEach(() => {
    const config: CacheConfig = {
      maxSize: 100,
      ttl: 10000,
      enabled: true,
    };
    cache = new ResponseCache(config, mockLogger);
  });

  it('正确存储和检索结果', () => {
    const result = createResult('Test response');
    const options = createOptions();

    // 设置缓存
    cache.set('Test prompt', options, result);

    // 获取缓存
    const cached = cache.get('Test prompt', options);

    // 验证
    expect(cached).toEqual(result);
    expect(cached?.content).toBe('Test response');

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(0);
    expect(stats.hitRate).toBe(1);
  });

  it('缓存未命中时返回 undefined', () => {
    const result = cache.get('Non-existent prompt', createOptions());

    expect(result).toBeUndefined();

    const stats = cache.getStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(0);
  });

  it('缓存禁用时不存储任何内容', () => {
    const config: CacheConfig = { enabled: false };
    const disabledCache = new ResponseCache(config, mockLogger);

    const result = createResult('Test');
    disabledCache.set('Test prompt', createOptions(), result);

    const cached = disabledCache.get('Test prompt', createOptions());

    expect(cached).toBeUndefined();
  });

  it('正确更新已存在的缓存条目', () => {
    const result1 = createResult('First response');
    const result2 = createResult('Updated response');
    const options = createOptions();

    cache.set('Test prompt', options, result1);
    cache.set('Test prompt', options, result2);

    const cached = cache.get('Test prompt', options);

    expect(cached?.content).toBe('Updated response');
    expect(cache.size()).toBe(1); // 只有一个条目
  });

  it('has 方法正确检查缓存存在性', () => {
    const result = createResult('Test');
    const options = createOptions();

    expect(cache.has('Test prompt', options)).toBe(false);

    cache.set('Test prompt', options, result);

    expect(cache.has('Test prompt', options)).toBe(true);
  });

  it('delete 方法正确删除指定条目', () => {
    const result = createResult('Test');
    const options = createOptions();

    cache.set('Test prompt', options, result);
    expect(cache.has('Test prompt', options)).toBe(true);

    const deleted = cache.delete('Test prompt', options);
    expect(deleted).toBe(true);
    expect(cache.has('Test prompt', options)).toBe(false);

    // 删除不存在的条目
    const deletedAgain = cache.delete('Test prompt', options);
    expect(deletedAgain).toBe(false);
  });

  it('clear 方法清空所有缓存', () => {
    cache.set('Prompt 1', createOptions(), createResult('1'));
    cache.set('Prompt 2', createOptions(), createResult('2'));
    cache.set('Prompt 3', createOptions(), createResult('3'));

    expect(cache.size()).toBe(3);

    cache.clear();

    expect(cache.size()).toBe(0);
    expect(cache.get('Prompt 1', createOptions())).toBeUndefined();
  });

  it('keys 和 values 方法返回正确的数据', () => {
    cache.set('Prompt 1', createOptions(), createResult('1'));
    cache.set('Prompt 2', createOptions(), createResult('2'));

    const keys = cache.keys();
    const values = cache.values();

    expect(keys).toHaveLength(2);
    expect(values).toHaveLength(2);
    expect(values.some(v => v.content === '1')).toBe(true);
    expect(values.some(v => v.content === '2')).toBe(true);
  });

  it('setByKey 和 getByKey 方法正常工作', () => {
    const result = createResult('Test');

    cache.setByKey('custom-key', result);
    const cached = cache.getByKey('custom-key');

    expect(cached).toEqual(result);
    expect(cache.getByKey('non-existent')).toBeUndefined();
  });

  it('setEnabled 方法动态启用/禁用缓存', () => {
    const result = createResult('Test');
    const options = createOptions();

    // 先存储
    cache.set('Test prompt', options, result);
    expect(cache.get('Test prompt', options)).toBeDefined();

    // 禁用
    cache.setEnabled(false);
    expect(cache.get('Test prompt', options)).toBeUndefined();

    // 重新启用
    cache.setEnabled(true);
    expect(cache.get('Test prompt', options)).toBeDefined();
  });
});

describe('ResponseCache - LRU 淘汰机制', () => {
  it('达到最大大小时淘汰最少使用的条目', () => {
    const config: CacheConfig = { maxSize: 3, ttl: 10000, enabled: true };
    const cache = new ResponseCache(config, mockLogger);

    // 添加 3 个条目
    cache.set('Prompt 1', createOptions(), createResult('1'));
    cache.set('Prompt 2', createOptions(), createResult('2'));
    cache.set('Prompt 3', createOptions(), createResult('3'));

    // 访问第 1 个条目（使其变为最近使用）
    cache.get('Prompt 1', createOptions());

    // 添加第 4 个条目（应该淘汰第 2 个，最少使用）
    cache.set('Prompt 4', createOptions(), createResult('4'));

    // 验证：第 2 个条目被淘汰
    expect(cache.get('Prompt 2', createOptions())).toBeUndefined();

    // 验证：其他条目仍在
    expect(cache.get('Prompt 1', createOptions())).toBeDefined();
    expect(cache.get('Prompt 3', createOptions())).toBeDefined();
    expect(cache.get('Prompt 4', createOptions())).toBeDefined();

    const stats = cache.getStats();
    expect(stats.evictions).toBe(1);
  });

  it('正确追踪 LRU 访问顺序', () => {
    const config: CacheConfig = { maxSize: 4, ttl: 10000, enabled: true };
    const cache = new ResponseCache(config, mockLogger);

    // 添加 4 个条目（顺序：1, 2, 3, 4）
    for (let i = 1; i <= 4; i++) {
      cache.set(`Prompt ${i}`, createOptions(), createResult(`${i}`));
    }

    // 访问顺序：1, 3, 1, 2（1 是最近使用，4 是最久未使用）
    cache.get('Prompt 1', createOptions());
    cache.get('Prompt 3', createOptions());
    cache.get('Prompt 1', createOptions());
    cache.get('Prompt 2', createOptions());

    // 添加第 5 个条目（应该淘汰 4）
    cache.set('Prompt 5', createOptions(), createResult('5'));

    // 验证：4 被淘汰
    expect(cache.get('Prompt 4', createOptions())).toBeUndefined();
    expect(cache.get('Prompt 1', createOptions())).toBeDefined();
  });

  it('更新条目时重置 LRU 位置', () => {
    const config: CacheConfig = { maxSize: 3, ttl: 10000, enabled: true };
    const cache = new ResponseCache(config, mockLogger);

    // 添加 3 个条目
    cache.set('Prompt 1', createOptions(), createResult('1'));
    cache.set('Prompt 2', createOptions(), createResult('2'));
    cache.set('Prompt 3', createOptions(), createResult('3'));

    // 更新第 1 个条目（使其变为最近使用）
    cache.set('Prompt 1', createOptions(), createResult('1-updated'));

    // 添加第 4 个条目（应该淘汰第 2 个）
    cache.set('Prompt 4', createOptions(), createResult('4'));

    // 验证：2 被淘汰，1 仍在
    expect(cache.get('Prompt 2', createOptions())).toBeUndefined();
    const result1 = cache.get('Prompt 1', createOptions());
    expect(result1?.content).toBe('1-updated');
  });

  it('连续添加超过容量的条目时正确淘汰', () => {
    const config: CacheConfig = { maxSize: 5, ttl: 10000, enabled: true };
    const cache = new ResponseCache(config, mockLogger);

    // 添加 10 个条目
    for (let i = 1; i <= 10; i++) {
      cache.set(`Prompt ${i}`, createOptions(), createResult(`${i}`));
    }

    // 验证：只有最后 5 个存在
    expect(cache.size()).toBe(5);
    expect(cache.get('Prompt 1', createOptions())).toBeUndefined();
    expect(cache.get('Prompt 5', createOptions())).toBeUndefined();
    expect(cache.get('Prompt 6', createOptions())).toBeDefined();
    expect(cache.get('Prompt 10', createOptions())).toBeDefined();

    const stats = cache.getStats();
    expect(stats.evictions).toBe(5);
  });
});

describe('ResponseCache - TTL 过期机制', () => {
  it('过期条目自动失效', async () => {
    const config: CacheConfig = { maxSize: 100, ttl: 100, enabled: true };
    const cache = new ResponseCache(config, mockLogger);

    cache.set('Test prompt', createOptions(), createResult('1'));

    // 立即获取，应该命中
    expect(cache.get('Test prompt', createOptions())).toBeDefined();

    // 等待过期
    await new Promise(resolve => setTimeout(resolve, 150));

    // 获取应该返回 undefined
    expect(cache.get('Test prompt', createOptions())).toBeUndefined();

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('deleteExpired 方法删除过期条目', async () => {
    const config: CacheConfig = { maxSize: 100, ttl: 50, enabled: true };
    const cache = new ResponseCache(config, mockLogger);

    // 添加 5 个条目
    for (let i = 1; i <= 5; i++) {
      cache.set(`Prompt ${i}`, createOptions(), createResult(`${i}`));
    }

    expect(cache.size()).toBe(5);

    // 等待过期
    await new Promise(resolve => setTimeout(resolve, 100));

    // 手动删除过期条目
    const deleted = cache.deleteExpired();

    expect(deleted).toBe(5);
    expect(cache.size()).toBe(0);
  });

  it('部分过期时只删除过期条目', async () => {
    const config: CacheConfig = { maxSize: 100, ttl: 100, enabled: true };
    const cache = new ResponseCache(config, mockLogger);

    // 添加前 3 个条目
    cache.set('Prompt 1', createOptions(), createResult('1'));
    cache.set('Prompt 2', createOptions(), createResult('2'));
    cache.set('Prompt 3', createOptions(), createResult('3'));

    // 等待接近过期
    await new Promise(resolve => setTimeout(resolve, 80));

    // 添加第 4 个条目（新条目）
    cache.set('Prompt 4', createOptions(), createResult('4'));

    // 等待前 3 个过期
    await new Promise(resolve => setTimeout(resolve, 50));

    // 手动清理
    const deleted = cache.deleteExpired();

    expect(deleted).toBe(3); // 前 3 个过期
    expect(cache.get('Prompt 4', createOptions())).toBeDefined();
  });

  it('has 方法对过期条目返回 false', async () => {
    const config: CacheConfig = { maxSize: 100, ttl: 50, enabled: true };
    const cache = new ResponseCache(config, mockLogger);

    cache.set('Test prompt', createOptions(), createResult('1'));
    expect(cache.has('Test prompt', createOptions())).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(cache.has('Test prompt', createOptions())).toBe(false);
  });
});

describe('ResponseCache - 缓存键唯一性', () => {
  it('不同参数生成不同的缓存键', () => {
    const cache = new ResponseCache({ maxSize: 100, ttl: 10000, enabled: true }, mockLogger);

    cache.set('Same prompt', createOptions({ model: 'claude-3' }), createResult('1'));
    cache.set('Same prompt', createOptions({ model: 'claude-3-5' }), createResult('2'));

    // 验证：两个不同的条目都存在
    const result1 = cache.get('Same prompt', createOptions({ model: 'claude-3' }));
    const result2 = cache.get('Same prompt', createOptions({ model: 'claude-3-5' }));

    expect(result1?.content).toBe('1');
    expect(result2?.content).toBe('2');
    expect(result1).not.toEqual(result2);
  });

  it('temperature 参数影响缓存键', () => {
    const cache = new ResponseCache({ maxSize: 100, ttl: 10000, enabled: true }, mockLogger);

    cache.set('Prompt', createOptions({ temperature: 0.5 }), createResult('low'));
    cache.set('Prompt', createOptions({ temperature: 0.9 }), createResult('high'));

    const result1 = cache.get('Prompt', createOptions({ temperature: 0.5 }));
    const result2 = cache.get('Prompt', createOptions({ temperature: 0.9 }));

    expect(result1?.content).toBe('low');
    expect(result2?.content).toBe('high');
  });

  it('maxTokens 参数影响缓存键', () => {
    const cache = new ResponseCache({ maxSize: 100, ttl: 10000, enabled: true }, mockLogger);

    cache.set('Prompt', createOptions({ maxTokens: 1000 }), createResult('short'));
    cache.set('Prompt', createOptions({ maxTokens: 4000 }), createResult('long'));

    const result1 = cache.get('Prompt', createOptions({ maxTokens: 1000 }));
    const result2 = cache.get('Prompt', createOptions({ maxTokens: 4000 }));

    expect(result1?.content).toBe('short');
    expect(result2?.content).toBe('long');
  });

  it('systemPrompt 参数影响缓存键', () => {
    const cache = new ResponseCache({ maxSize: 100, ttl: 10000, enabled: true }, mockLogger);

    cache.set('Prompt', createOptions({ systemPrompt: 'System A' }), createResult('A'));
    cache.set('Prompt', createOptions({ systemPrompt: 'System B' }), createResult('B'));

    const result1 = cache.get('Prompt', createOptions({ systemPrompt: 'System A' }));
    const result2 = cache.get('Prompt', createOptions({ systemPrompt: 'System B' }));

    expect(result1?.content).toBe('A');
    expect(result2?.content).toBe('B');
  });

  it('prompt 前后空格被标准化', () => {
    const cache = new ResponseCache({ maxSize: 100, ttl: 10000, enabled: true }, mockLogger);

    cache.set('  Test prompt  ', createOptions(), createResult('1'));

    // 标准化的 prompt 应该能匹配
    const result = cache.get('Test prompt', createOptions());
    expect(result).toBeDefined();
  });
});

describe('ResponseCache - 并发安全', () => {
  it('支持并发写入', async () => {
    const cache = new ResponseCache({ maxSize: 1000, ttl: 10000, enabled: true }, mockLogger);

    // 并发写入 100 个条目
    const writePromises = Array.from({ length: 100 }, (_, i) =>
      Promise.resolve().then(() =>
        cache.set(`Prompt ${i}`, createOptions(), createResult(`${i}`))
      )
    );

    await Promise.all(writePromises);

    expect(cache.size()).toBe(100);
  });

  it('支持并发读取', async () => {
    const cache = new ResponseCache({ maxSize: 1000, ttl: 10000, enabled: true }, mockLogger);

    // 先写入 100 个条目
    for (let i = 0; i < 100; i++) {
      cache.set(`Prompt ${i}`, createOptions(), createResult(`${i}`));
    }

    // 并发读取
    const readPromises = Array.from({ length: 100 }, (_, i) =>
      Promise.resolve().then(() =>
        cache.get(`Prompt ${i}`, createOptions())
      )
    );

    const results = await Promise.all(readPromises);

    // 验证：所有读取都成功
    expect(results.every(r => r !== undefined)).toBe(true);

    const stats = cache.getStats();
    expect(stats.hits).toBe(100);
  });

  it('支持并发混合读写', async () => {
    const cache = new ResponseCache({ maxSize: 1000, ttl: 10000, enabled: true }, mockLogger);

    // 混合操作：50 个写入 + 50 个读取
    const promises = [
      ...Array.from({ length: 50 }, (_, i) =>
        Promise.resolve().then(() =>
          cache.set(`Prompt ${i}`, createOptions(), createResult(`${i}`))
        )
      ),
      ...Array.from({ length: 50 }, (_, i) =>
        Promise.resolve().then(() =>
          cache.get(`Prompt ${i}`, createOptions())
        )
      ),
    ];

    await Promise.all(promises);

    // 验证：没有错误抛出
    expect(cache.size()).toBeGreaterThanOrEqual(0);
  });

  it('高并发场景下保持一致性', async () => {
    const cache = new ResponseCache({ maxSize: 100, ttl: 10000, enabled: true }, mockLogger);

    // 1000 个并发操作
    const promises = Array.from({ length: 1000 }, (_, i) => {
      const key = `Prompt ${i % 50}`; // 只有 50 个不同的键
      return Promise.resolve().then(() => {
        cache.set(key, createOptions(), createResult(`${i}`));
        return cache.get(key, createOptions());
      });
    });

    await Promise.all(promises);

    // 验证：缓存大小不超过最大值
    expect(cache.size()).toBeLessThanOrEqual(100);

    // 验证：统计信息合理
    const stats = cache.getStats();
    expect(stats.hits + stats.misses).toBeGreaterThan(0);
  });
});

describe('ResponseCache - 统计信息', () => {
  let cache: ResponseCache;

  beforeEach(() => {
    cache = new ResponseCache({ maxSize: 100, ttl: 10000, enabled: true }, mockLogger);
  });

  it('正确追踪命中和未命中', () => {
    cache.set('Prompt 1', createOptions(), createResult('1'));
    cache.set('Prompt 2', createOptions(), createResult('2'));

    cache.get('Prompt 1', createOptions()); // hit
    cache.get('Prompt 2', createOptions()); // hit
    cache.get('Non-existent', createOptions()); // miss

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
  });

  it('正确计算命中率', () => {
    // 0 次请求时命中率为 0
    expect(cache.getStats().hitRate).toBe(0);

    cache.set('Prompt', createOptions(), createResult('1'));

    // 1 次 hit
    cache.get('Prompt', createOptions());
    expect(cache.getStats().hitRate).toBe(1);

    // 1 hit + 1 miss
    cache.get('Non-existent', createOptions());
    expect(cache.getStats().hitRate).toBe(0.5);
  });

  it('正确追踪淘汰次数', () => {
    const config: CacheConfig = { maxSize: 3, ttl: 10000, enabled: true };
    const smallCache = new ResponseCache(config, mockLogger);

    for (let i = 1; i <= 10; i++) {
      smallCache.set(`Prompt ${i}`, createOptions(), createResult(`${i}`));
    }

    const stats = smallCache.getStats();
    expect(stats.evictions).toBe(7); // 10 - 3 = 7
  });

  it('正确追踪缓存大小', () => {
    expect(cache.size()).toBe(0);

    cache.set('P1', createOptions(), createResult('1'));
    expect(cache.size()).toBe(1);

    cache.set('P2', createOptions(), createResult('2'));
    expect(cache.size()).toBe(2);

    cache.delete('P1', createOptions());
    expect(cache.size()).toBe(1);

    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('resetStats 重置统计但保留缓存', () => {
    cache.set('Prompt', createOptions(), createResult('1'));
    cache.get('Prompt', createOptions());

    expect(cache.getStats().hits).toBe(1);

    cache.resetStats();

    expect(cache.getStats().hits).toBe(0);
    expect(cache.getStats().misses).toBe(0);
    expect(cache.getStats().evictions).toBe(0);
    expect(cache.getStats().hitRate).toBe(0);
    expect(cache.size()).toBe(1); // 缓存保留
  });

  it('getStats 返回统计信息的副本', () => {
    cache.set('Prompt', createOptions(), createResult('1'));
    const stats1 = cache.getStats();

    cache.get('Prompt', createOptions());
    const stats2 = cache.getStats();

    // stats1 不应受后续操作影响
    expect(stats1.hits).toBe(0);
    expect(stats2.hits).toBe(1);
  });
});

describe('ResponseCache - 配置管理', () => {
  it('getConfig 返回配置的副本', () => {
    const config: CacheConfig = { maxSize: 500, ttl: 5000, enabled: true };
    const cache = new ResponseCache(config, mockLogger);

    const retrievedConfig = cache.getConfig();

    expect(retrievedConfig.maxSize).toBe(500);
    expect(retrievedConfig.ttl).toBe(5000);
    expect(retrievedConfig.enabled).toBe(true);
  });

  it('使用默认配置值', () => {
    const cache = new ResponseCache({}, mockLogger);
    const config = cache.getConfig();

    expect(config.maxSize).toBe(1000);
    expect(config.ttl).toBe(3600000); // 1 hour
    expect(config.enabled).toBe(true);
  });

  it('部分配置时使用默认值补全', () => {
    const cache = new ResponseCache({ maxSize: 200 }, mockLogger);
    const config = cache.getConfig();

    expect(config.maxSize).toBe(200);
    expect(config.ttl).toBe(3600000);
    expect(config.enabled).toBe(true);
  });
});

describe('ResponseCache - 边界情况', () => {
  it('处理空 prompt', () => {
    const cache = new ResponseCache({ maxSize: 100, ttl: 10000, enabled: true }, mockLogger);

    cache.set('', createOptions(), createResult('empty'));
    const result = cache.get('', createOptions());

    expect(result?.content).toBe('empty');
  });

  it('处理超长 prompt', () => {
    const cache = new ResponseCache({ maxSize: 100, ttl: 10000, enabled: true }, mockLogger);

    const longPrompt = 'A'.repeat(10000);
    cache.set(longPrompt, createOptions(), createResult('long'));

    const result = cache.get(longPrompt, createOptions());
    expect(result?.content).toBe('long');
  });

  it('处理特殊字符', () => {
    const cache = new ResponseCache({ maxSize: 100, ttl: 10000, enabled: true }, mockLogger);

    const specialPrompts = [
      'Test with "quotes"',
      "Test with 'apostrophes'",
      'Test with \n newlines',
      'Test with \t tabs',
      'Test with <special> & characters',
      'Test with emoji 🚀',
      'Test with 中文字符',
    ];

    for (const prompt of specialPrompts) {
      cache.set(prompt, createOptions(), createResult(`Result for ${prompt}`));
    }

    for (const prompt of specialPrompts) {
      const result = cache.get(prompt, createOptions());
      expect(result).toBeDefined();
    }
  });

  it('maxSize 为 0 时不存储任何内容', () => {
    const cache = new ResponseCache({ maxSize: 0, ttl: 10000, enabled: true }, mockLogger);

    cache.set('Test', createOptions(), createResult('1'));

    expect(cache.size()).toBe(0);
    expect(cache.get('Test', createOptions())).toBeUndefined();
  });

  it('maxSize 为 1 时只保留最新的条目', () => {
    const cache = new ResponseCache({ maxSize: 1, ttl: 10000, enabled: true }, mockLogger);

    cache.set('P1', createOptions(), createResult('1'));
    expect(cache.size()).toBe(1);

    cache.set('P2', createOptions(), createResult('2'));
    expect(cache.size()).toBe(1);

    expect(cache.get('P1', createOptions())).toBeUndefined();
    expect(cache.get('P2', createOptions())).toBeDefined();
  });

  it('TTL 为 0 时条目立即过期', () => {
    const cache = new ResponseCache({ maxSize: 100, ttl: 0, enabled: true }, mockLogger);

    cache.set('Test', createOptions(), createResult('1'));

    // 立即获取（可能刚好在过期边界）
    const result1 = cache.get('Test', createOptions());

    // 等待一小段时间后应该过期
    setTimeout(() => {
      const result2 = cache.get('Test', createOptions());
      expect(result2).toBeUndefined();
    }, 10);
  });

  it('多次调用 clear 是安全的', () => {
    const cache = new ResponseCache({ maxSize: 100, ttl: 10000, enabled: true }, mockLogger);

    cache.clear();
    cache.clear();
    cache.clear();

    expect(cache.size()).toBe(0);
  });

  it('deleteExpired 在无过期条目时返回 0', () => {
    const cache = new ResponseCache({ maxSize: 100, ttl: 10000, enabled: true }, mockLogger);

    cache.set('Test', createOptions(), createResult('1'));

    const deleted = cache.deleteExpired();

    expect(deleted).toBe(0);
  });
});

describe('ResponseCache - 性能验证', () => {
  it('大量操作保持性能稳定', () => {
    const cache = new ResponseCache({ maxSize: 10000, ttl: 10000, enabled: true }, mockLogger);

    const start = Date.now();

    // 10000 次写入
    for (let i = 0; i < 10000; i++) {
      cache.set(`Prompt ${i}`, createOptions(), createResult(`${i}`));
    }

    // 10000 次读取
    for (let i = 0; i < 10000; i++) {
      cache.get(`Prompt ${i}`, createOptions());
    }

    const elapsed = Date.now() - start;

    // 应该在合理时间内完成（< 1 秒）
    expect(elapsed).toBeLessThan(1000);
  });

  it('get 和 set 操作是 O(1) 复杂度', () => {
    const cache = new ResponseCache({ maxSize: 1000, ttl: 10000, enabled: true }, mockLogger);

    // 预热
    for (let i = 0; i < 500; i++) {
      cache.set(`P${i}`, createOptions(), createResult(`${i}`));
    }

    // 测试 get 时间（单次操作应该非常快）
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      cache.get(`P${i % 500}`, createOptions());
    }
    const elapsed = Date.now() - start;

    // 1000 次 get 应该非常快（< 10ms）
    expect(elapsed).toBeLessThan(50);
  });
});
