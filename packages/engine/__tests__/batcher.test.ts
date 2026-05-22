/**
 * RequestBatcher 单元测试
 *
 * 测试批处理器的完整功能：
 * - 批次合并与发送
 * - 超时触发机制
 * - 并发批处理控制
 * - 错误处理与降级
 * - 统计信息准确性
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SimulationProvider } from '../src/llm/simulation.js';
import type { LLMProvider, CompletionResult, CompletionRequest, CompletionOptions } from '../src/llm/types.js';

// ============================================================
// 测试辅助工具
// ============================================================

/**
 * 创建模拟 Provider
 */
function createMockProvider(options: {
  delay?: number;
  shouldFail?: boolean;
  failAtIndex?: number;
  supportsBatch?: boolean;
} = {}): LLMProvider {
  const {
    delay = 10,
    shouldFail = false,
    failAtIndex = -1,
    supportsBatch = true,
  } = options;

  let callCount = 0;

  return {
    name: 'mock-provider',
    type: 'custom',

    async complete(prompt: string, options?: CompletionOptions): Promise<CompletionResult> {
      callCount++;

      // 模拟延迟
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // 检查是否应该失败
      if (shouldFail && (failAtIndex === -1 || callCount === failAtIndex)) {
        throw new Error('Simulated API error');
      }

      // 返回模拟结果
      return {
        content: `Response to: ${prompt.substring(0, 50)}`,
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: 20,
        totalTokens: Math.ceil(prompt.length / 4) + 20,
        model: options?.model || 'mock',
        finishReason: 'stop',
        provider: 'mock-provider',
        timestamp: Date.now(),
      };
    },

    async *stream(prompt: string, options?: CompletionOptions) {
      // 流式响应测试不需要
      yield { delta: '', done: true };
    },

    async batch(requests: CompletionRequest[]): Promise<CompletionResult[]> {
      if (!supportsBatch) {
        throw new Error('Batch not supported');
      }

      callCount++;

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      if (shouldFail && (failAtIndex === -1 || callCount === failAtIndex)) {
        throw new Error('Simulated batch error');
      }

      return requests.map(req => ({
        content: `Batch response to: ${req.prompt.substring(0, 50)}`,
        inputTokens: Math.ceil(req.prompt.length / 4),
        outputTokens: 20,
        totalTokens: Math.ceil(req.prompt.length / 4) + 20,
        model: 'mock',
        finishReason: 'stop' as const,
        provider: 'mock-provider',
        timestamp: Date.now(),
      }));
    },

    estimateTokens(text: string): number {
      return Math.ceil(text.length / 4);
    },

    async isAvailable(): Promise<boolean> {
      return true;
    },

    getConfig() {
      return {
        name: 'mock-provider',
        type: 'custom',
        defaultModel: 'mock',
        supportedModels: ['mock'],
        maxTokens: 100000,
        supportsStreaming: true,
        supportsTools: false,
        supportsBatch,
        timeout: 30000,
        maxRetries: 3,
      };
    },
  };
}

/**
 * 简单的 logger mock
 */
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// ============================================================
// 导入 RequestBatcher - 需要动态导入以避免初始化顺序问题
// ============================================================

async function importBatcher() {
  const module = await import('../src/llm/batcher.js');
  return module.RequestBatcher;
}

// ============================================================
// 测试套件
// ============================================================

describe('RequestBatcher - 基础批处理功能', () => {
  it('正确合并和发送批次', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider();

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 5, maxWaitTime: 100 },
      mockLogger,
      mockProvider
    );

    // 添加 5 个请求
    const promises = Array.from({ length: 5 }, (_, i) =>
      batcher.add({ id: `req-${i}`, prompt: `Test prompt ${i}` })
    );

    // 等待所有请求完成
    const results = await Promise.all(promises);

    // 验证：所有请求都成功
    expect(results).toHaveLength(5);
    results.forEach(result => {
      expect(result.content).toBeTruthy();
    });

    // 验证：统计信息正确
    const stats = batcher.getStats();
    expect(stats.totalRequests).toBe(5);
    expect(stats.totalBatches).toBeGreaterThanOrEqual(1);
  });

  it('处理单个请求', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider();

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 10, maxWaitTime: 50 },
      mockLogger,
      mockProvider
    );

    const result = await batcher.add({ id: '1', prompt: 'Single request' });

    expect(result.content).toBeTruthy();
    expect(result.provider).toBe('mock-provider');
  });

  it('正确传递请求选项', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider();

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 3, maxWaitTime: 50 },
      mockLogger,
      mockProvider
    );

    const options: CompletionOptions = {
      model: 'custom-model',
      temperature: 0.8,
      maxTokens: 1000,
    };

    const result = await batcher.add({
      id: '1',
      prompt: 'Test with options',
      options,
    });

    expect(result.content).toBeTruthy();
  });
});

describe('RequestBatcher - 超时机制', () => {
  it('超时触发批处理', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider();

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 10, maxWaitTime: 50 }, // 50ms 超时
      mockLogger,
      mockProvider
    );

    // 添加 2 个请求（不足 maxBatchSize）
    const promise1 = batcher.add({ id: '1', prompt: 'Test 1' });
    const promise2 = batcher.add({ id: '2', prompt: 'Test 2' });

    // 等待 60ms（超过 maxWaitTime）
    await new Promise(resolve => setTimeout(resolve, 60));

    // 验证：请求应该已完成
    const results = await Promise.all([promise1, promise2]);
    expect(results).toHaveLength(2);
    expect(results[0].content).toBeTruthy();
    expect(results[1].content).toBeTruthy();
  });

  it('达到最大批次大小时立即刷新（不等待超时）', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider({ delay: 50 });
    let flushStartTime = 0;

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 3, maxWaitTime: 1000 }, // 长超时
      {
        ...mockLogger,
        debug: () => {
          if (flushStartTime === 0) {
            flushStartTime = Date.now();
          }
        },
      },
      mockProvider
    );

    // 快速添加 3 个请求（达到 maxBatchSize）
    const start = Date.now();
    await Promise.all([
      batcher.add({ id: '1', prompt: 'Test 1' }),
      batcher.add({ id: '2', prompt: 'Test 2' }),
      batcher.add({ id: '3', prompt: 'Test 3' }),
    ]);
    const elapsed = Date.now() - start;

    // 验证：应该在约 50ms（模拟延迟）内完成，而不是等待 1000ms 超时
    expect(elapsed).toBeLessThan(500); // 留出余量
  });

  it('超时不影响其他批次的处理', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider({ delay: 20 });

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 2, maxWaitTime: 30 },
      mockLogger,
      mockProvider
    );

    // 第一批次：添加 2 个请求，立即触发
    const batch1 = Promise.all([
      batcher.add({ id: '1', prompt: 'Batch 1 - 1' }),
      batcher.add({ id: '2', prompt: 'Batch 1 - 2' }),
    ]);

    // 等待第一批次完成
    await batch1;

    // 第二批次：添加 1 个请求，等待超时
    const batch2 = batcher.add({ id: '3', prompt: 'Batch 2 - 1' });

    // 等待超时触发
    await new Promise(resolve => setTimeout(resolve, 40));

    const result = await batch2;
    expect(result.content).toBeTruthy();

    // 验证统计：应该有 2 个批次
    const stats = batcher.getStats();
    expect(stats.totalBatches).toBeGreaterThanOrEqual(2);
  });
});

describe('RequestBatcher - 并发控制', () => {
  it('限制并发批处理数量', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider({ delay: 100 }); // 100ms 延迟

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 5, maxWaitTime: 10, maxConcurrent: 2 },
      mockLogger,
      mockProvider
    );

    // 快速添加 15 个请求（应该分成 3 个批次，但最多 2 个并发）
    const promises = Array.from({ length: 15 }, (_, i) =>
      batcher.add({ id: `req-${i}`, prompt: `Test ${i}` })
    );

    const start = Date.now();
    await Promise.all(promises);
    const elapsed = Date.now() - start;

    // 验证：由于并发限制为 2，3 个批次需要串行执行
    // 预期时间：约 200-300ms（2 个批次并发 100ms，然后第 3 个批次 100ms）
    expect(elapsed).toBeGreaterThan(150); // 至少一个批次的时间
    expect(elapsed).toBeLessThan(500); // 不应该太长

    const stats = batcher.getStats();
    expect(stats.totalRequests).toBe(15);
    expect(stats.totalBatches).toBe(3);
  });

  it('队列中等待的请求最终会被处理', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider({ delay: 50 });

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 2, maxWaitTime: 10, maxConcurrent: 1 },
      mockLogger,
      mockProvider
    );

    // 添加 6 个请求
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        batcher.add({ id: `req-${i}`, prompt: `Test ${i}` })
      )
    );

    // 所有请求都应该成功
    expect(results).toHaveLength(6);
    results.forEach(r => expect(r.content).toBeTruthy());
  });
});

describe('RequestBatcher - 错误处理', () => {
  it('批处理失败时正确拒绝请求', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider({ shouldFail: true });

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 3, maxWaitTime: 10 },
      mockLogger,
      mockProvider
    );

    // 添加请求
    const promises = Array.from({ length: 3 }, (_, i) =>
      batcher.add({ id: `req-${i}`, prompt: `Test ${i}` })
    );

    // 验证：所有请求都应该被拒绝
    await expect(Promise.all(promises)).rejects.toThrow();
  });

  it('单个批次失败不影响其他批次', async () => {
    const RequestBatcher = await importBatcher();

    // 创建自定义 Provider，在外部控制失败
    let shouldFail = false;
    let batchCount = 0;

    const conditionalFailProvider: LLMProvider = {
      name: 'conditional-fail-provider',
      type: 'custom',

      async complete(prompt: string, options?: CompletionOptions): Promise<CompletionResult> {
        if (shouldFail) {
          throw new Error('Simulated failure');
        }
        return {
          content: `Response to: ${prompt.substring(0, 50)}`,
          inputTokens: Math.ceil(prompt.length / 4),
          outputTokens: 20,
          totalTokens: Math.ceil(prompt.length / 4) + 20,
          model: options?.model || 'mock',
          finishReason: 'stop',
          provider: 'conditional-fail-provider',
          timestamp: Date.now(),
        };
      },

      async *stream() {
        yield { delta: '', done: true };
      },

      async batch(requests: CompletionRequest[]): Promise<CompletionResult[]> {
        batchCount++;
        if (shouldFail) {
          throw new Error('Simulated batch failure');
        }
        return requests.map(req => ({
          content: `Batch response to: ${req.prompt.substring(0, 50)}`,
          inputTokens: Math.ceil(req.prompt.length / 4),
          outputTokens: 20,
          totalTokens: Math.ceil(req.prompt.length / 4) + 20,
          model: 'mock',
          finishReason: 'stop' as const,
          provider: 'conditional-fail-provider',
          timestamp: Date.now(),
        }));
      },

      estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
      },

      async isAvailable(): Promise<boolean> {
        return true;
      },

      getConfig() {
        return {
          name: 'conditional-fail-provider',
          type: 'custom',
          defaultModel: 'mock',
          supportedModels: ['mock'],
          maxTokens: 100000,
          supportsStreaming: true,
          supportsTools: false,
          supportsBatch: true,
          timeout: 30000,
          maxRetries: 3,
        };
      },
    };

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 2, maxWaitTime: 10 },
      mockLogger,
      conditionalFailProvider
    );

    // 第一批次：应该成功（shouldFail = false）
    const batch1Results = await Promise.all([
      batcher.add({ id: '1', prompt: 'Batch 1 - 1' }),
      batcher.add({ id: '2', prompt: 'Batch 1 - 2' }),
    ]);

    expect(batch1Results).toHaveLength(2);
    expect(batch1Results[0].content).toBeTruthy();

    // 等待第一批次完成
    await new Promise(resolve => setTimeout(resolve, 20));

    // 设置失败标志
    shouldFail = true;

    // 第二批次：应该失败
    const batch2Promise = Promise.all([
      batcher.add({ id: '3', prompt: 'Batch 2 - 1' }),
      batcher.add({ id: '4', prompt: 'Batch 2 - 2' }),
    ]);

    await expect(batch2Promise).rejects.toThrow();

    // 等待批次完成
    await new Promise(resolve => setTimeout(resolve, 20));

    // 清除失败标志
    shouldFail = false;

    // 第三批次：应该成功
    const batch3Results = await Promise.all([
      batcher.add({ id: '5', prompt: 'Batch 3 - 1' }),
      batcher.add({ id: '6', prompt: 'Batch 3 - 2' }),
    ]);

    expect(batch3Results).toHaveLength(2);
    expect(batch3Results[0].content).toBeTruthy();
  });

  it('不支持的 batch 方法降级到并发单个请求', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider({ supportsBatch: false });

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 3, maxWaitTime: 50 },
      mockLogger,
      mockProvider
    );

    const results = await Promise.all([
      batcher.add({ id: '1', prompt: 'Test 1' }),
      batcher.add({ id: '2', prompt: 'Test 2' }),
      batcher.add({ id: '3', prompt: 'Test 3' }),
    ]);

    expect(results).toHaveLength(3);
    results.forEach(r => expect(r.content).toBeTruthy());
  });
});

describe('RequestBatcher - 统计信息', () => {
  it('正确追踪请求数量和批次数', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider();

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 3, maxWaitTime: 50 },
      mockLogger,
      mockProvider
    );

    // 添加 7 个请求（应该分成 3 个批次）
    await Promise.all(
      Array.from({ length: 7 }, (_, i) =>
        batcher.add({ id: `req-${i}`, prompt: `Test ${i}` })
      )
    );

    // 等待所有批次完成
    await new Promise(resolve => setTimeout(resolve, 100));

    const stats = batcher.getStats();
    expect(stats.totalRequests).toBe(7);
    expect(stats.totalBatches).toBe(3);
  });

  it('计算平均批次大小', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider();

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 5, maxWaitTime: 50 },
      mockLogger,
      mockProvider
    );

    // 添加 12 个请求（批次大小：5, 5, 2）
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        batcher.add({ id: `req-${i}`, prompt: `Test ${i}` })
      )
    );

    await new Promise(resolve => setTimeout(resolve, 100));

    const stats = batcher.getStats();
    expect(stats.avgBatchSize).toBeCloseTo(4, 0); // (5 + 5 + 2) / 3 = 4
  });

  it('重置统计信息', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider();

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 3, maxWaitTime: 50 },
      mockLogger,
      mockProvider
    );

    // 添加一些请求
    await Promise.all([
      batcher.add({ id: '1', prompt: 'Test 1' }),
      batcher.add({ id: '2', prompt: 'Test 2' }),
    ]);

    await new Promise(resolve => setTimeout(resolve, 100));

    // 重置统计
    batcher.resetStats();

    const stats = batcher.getStats();
    expect(stats.totalRequests).toBe(0);
    expect(stats.totalBatches).toBe(0);
    expect(stats.avgBatchSize).toBe(0);
  });
});

describe('RequestBatcher - 资源管理', () => {
  it('dispose 清理定时器并阻止新请求', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider();

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 10, maxWaitTime: 1000 },
      mockLogger,
      mockProvider
    );

    // 添加一个请求（会设置定时器）
    const promise1 = batcher.add({ id: '1', prompt: 'Test 1' });

    // 立即刷新以处理请求
    await batcher.flush();

    // 请求应该已完成
    await promise1;

    // 释放
    batcher.dispose();

    // 释放后不能再添加新请求
    await expect(
      batcher.add({ id: '2', prompt: 'Test 2' })
    ).rejects.toThrow('RequestBatcher has been disposed');

    // 再次调用 dispose 应该是安全的
    batcher.dispose();
  });

  it('clear 拒绝队列中的所有请求', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider();

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 10, maxWaitTime: 1000 },
      mockLogger,
      mockProvider
    );

    // 添加请求（不等待，保持在队列中）
    const promises = [
      batcher.add({ id: '1', prompt: 'Test 1' }),
      batcher.add({ id: '2', prompt: 'Test 2' }),
    ];

    // 立即清空队列
    batcher.clear();

    // 验证：所有请求都应该被拒绝
    await expect(Promise.all(promises)).rejects.toThrow();
  });

  it('getQueueSize 返回正确的队列大小', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider();

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 10, maxWaitTime: 1000 },
      mockLogger,
      mockProvider
    );

    // 添加请求但不等待
    batcher.add({ id: '1', prompt: 'Test 1' });
    batcher.add({ id: '2', prompt: 'Test 2' });
    batcher.add({ id: '3', prompt: 'Test 3' });

    // 队列应该有 3 个请求
    expect(batcher.getQueueSize()).toBe(3);

    // 刷新后队列应该为空
    await batcher.flush();
    expect(batcher.getQueueSize()).toBe(0);
  });
});

describe('RequestBatcher - 手动刷新', () => {
  it('flush 立即处理队列中的请求', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider();

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 10, maxWaitTime: 1000 },
      mockLogger,
      mockProvider
    );

    // 添加请求
    const promises = [
      batcher.add({ id: '1', prompt: 'Test 1' }),
      batcher.add({ id: '2', prompt: 'Test 2' }),
    ];

    // 手动刷新
    await batcher.flush();

    // 验证：请求应该已完成
    const results = await Promise.all(promises);
    expect(results).toHaveLength(2);
  });

  it('多次 flush 是安全的', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider();

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 10, maxWaitTime: 1000 },
      mockLogger,
      mockProvider
    );

    // 多次 flush
    await batcher.flush();
    await batcher.flush();
    await batcher.flush();

    // 不应该抛出错误
    expect(true).toBe(true);
  });
});

describe('RequestBatcher - 边界情况', () => {
  it('处理空请求', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider();

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 10, maxWaitTime: 50 },
      mockLogger,
      mockProvider
    );

    const result = await batcher.add({ id: '1', prompt: '' });
    expect(result.content).toBeTruthy();
  });

  it('处理特殊字符', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider();

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 3, maxWaitTime: 50 },
      mockLogger,
      mockProvider
    );

    const specialPrompts = [
      'Test with "quotes"',
      "Test with 'apostrophes'",
      'Test with \n newlines',
      'Test with \t tabs',
      'Test with <special> & characters',
    ];

    const results = await Promise.all(
      specialPrompts.map((prompt, i) =>
        batcher.add({ id: `req-${i}`, prompt })
      )
    );

    expect(results).toHaveLength(specialPrompts.length);
  });

  it('批处理禁用时抛出错误', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider();

    const batcher = new RequestBatcher(
      { enabled: false }, // 禁用批处理
      mockLogger,
      mockProvider
    );

    await expect(
      batcher.add({ id: '1', prompt: 'Test' })
    ).rejects.toThrow('Batching is disabled');
  });

  it('设置新的 Provider', async () => {
    const RequestBatcher = await importBatcher();
    const provider1 = createMockProvider({ delay: 50 });
    const provider2 = createMockProvider({ delay: 10 });

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 3, maxWaitTime: 50 },
      mockLogger,
      provider1
    );

    // 使用第一个 provider
    const result1 = await batcher.add({ id: '1', prompt: 'Test 1' });
    expect(result1.provider).toBe('mock-provider');

    // 切换到第二个 provider
    batcher.setProvider(provider2);

    const result2 = await batcher.add({ id: '2', prompt: 'Test 2' });
    expect(result2.provider).toBe('mock-provider');
  });
});

describe('RequestBatcher - 性能验证', () => {
  it('批处理比串行调用更快', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider({ delay: 50 });

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 5, maxWaitTime: 50 },
      mockLogger,
      mockProvider
    );

    // 使用批处理
    const startBatch = Date.now();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        batcher.add({ id: `req-${i}`, prompt: `Test ${i}` })
      )
    );
    const batchTime = Date.now() - startBatch;

    // 验证：批处理时间应该显著少于串行时间
    // 串行：10 * 50ms = 500ms
    // 批处理：2 * 50ms = 100ms（2 个批次并发）
    expect(batchTime).toBeLessThan(300);
  });

  it('高吞吐量场景', async () => {
    const RequestBatcher = await importBatcher();
    const mockProvider = createMockProvider({ delay: 10 });

    const batcher = new RequestBatcher(
      { enabled: true, maxBatchSize: 20, maxWaitTime: 50, maxConcurrent: 5 },
      mockLogger,
      mockProvider
    );

    // 添加 100 个请求
    const start = Date.now();
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        batcher.add({ id: `req-${i}`, prompt: `Test ${i}` })
      )
    );
    const elapsed = Date.now() - start;

    expect(results).toHaveLength(100);

    const stats = batcher.getStats();
    expect(stats.totalRequests).toBe(100);
    expect(stats.totalBatches).toBe(5);

    // 5 个批次并发，每个 10ms，约 10-20ms 总时间
    expect(elapsed).toBeLessThan(100);
  });
});
