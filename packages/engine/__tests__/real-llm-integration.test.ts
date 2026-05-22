/**
 * 真实 LLM API 集成测试
 *
 * 本测试套件验证 Claude/OpenAI API 的真实调用功能。
 *
 * 运行要求：
 * 1. 设置 ANTHROPIC_API_KEY 环境变量（用于 Claude 测试）
 * 2. 设置 OPENAI_API_KEY 环境变量（用于 OpenAI 测试）
 *
 * 运行方式：
 *   # 设置 API Key
 *   export ANTHROPIC_API_KEY=sk-ant-xxxxx
 *   export OPENAI_API_KEY=sk-xxxxx
 *
 *   # 运行测试
 *   bun test tests/real-llm-integration.test.ts
 *
 * 注意事项：
 * - 真实 API 调用会产生费用，请谨慎使用
 * - 测试使用简单的 prompt 以最小化 Token 消耗
 * - 未设置 API Key 时相关测试会被跳过（不标记为失败）
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { ClaudeProvider } from '../src/llm/claude.js';
import { OpenAIProvider } from '../src/llm/openai.js';
import type { CompletionChunk } from '../src/llm/types.js';
import { RequestBatcher } from '../src/llm/batcher.js';
import { ResponseCache } from '../src/llm/cache.js';

// ============================================================
// 测试辅助工具
// ============================================================

/**
 * 模拟 Logger（避免日志输出干扰测试结果）
 */
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * 测试配置
 */
const TEST_CONFIG = {
  // Claude 测试配置
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-5-sonnet-20241022',
    // 使用 haiku 可以降低成本
    // model: 'claude-3-5-haiku-20241022',
  },
  // OpenAI 测试配置
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini', // 使用 mini 降低成本
  },
  // 超时配置
  timeout: 30000, // 30 秒
};

// ============================================================
// 测试组 1：Claude API 基础调用
// ============================================================

describe('Real Claude API Integration', () => {
  let apiKey: string | undefined;
  let model: string;

  beforeAll(() => {
    apiKey = TEST_CONFIG.claude.apiKey;
    model = TEST_CONFIG.claude.model;

    if (!apiKey) {
      console.log('\n\u001B[33m\u26A0\u001B[0m  ANTHROPIC_API_KEY not set');
      console.log('   To run real API tests, set environment variable:');
      console.log('   \u001B[36mexport ANTHROPIC_API_KEY=sk-ant-xxxxx\u001B[0m\n');
    }
  });

  test('基础 API 调用 - 简单数学问题', async () => {
    if (!apiKey) return;

    const provider = new ClaudeProvider({
      apiKey,
      model,
    }, mockLogger);

    const startTime = Date.now();
    const result = await provider.complete(
      'What is 2+2? Answer with just the number.',
      { maxTokens: 10 }
    );
    const latency = Date.now() - startTime;

    expect(result.content).toBeDefined();
    expect(result.content.trim()).toContain('4');
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(result.model).toBe(model);
    expect(result.provider).toBe('claude');
    expect(result.finishReason).toBe('stop');

    console.log(`\u001B[32m\u2713\u001B[0m Claude API 调用成功`);
    console.log(`   延迟: ${latency}ms`);
    console.log(`   Tokens: ${result.totalTokens} (${result.inputTokens} + ${result.outputTokens})`);
    console.log(`   内容: ${result.content.trim()}`);
  });

  test('API 调用 - 文本生成（中文）', async () => {
    if (!apiKey) return;

    const provider = new ClaudeProvider({
      apiKey,
      model,
    }, mockLogger);

    const startTime = Date.now();
    const result = await provider.complete(
      '写一首关于技术的四句诗，每句七个字。',
      { maxTokens: 100 }
    );
    const latency = Date.now() - startTime;

    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);

    console.log(`\u001B[32m\u2713\u001B[0m 中文文本生成成功`);
    console.log(`   延迟: ${latency}ms`);
    console.log(`   内容预览: ${result.content.substring(0, 50)}...`);
  });

  test('API 调用 - 代码生成', async () => {
    if (!apiKey) return;

    const provider = new ClaudeProvider({
      apiKey,
      model,
    }, mockLogger);

    const startTime = Date.now();
    const result = await provider.complete(
      'Write a Python function to calculate factorial.',
      { maxTokens: 200 }
    );
    const latency = Date.now() - startTime;

    expect(result.content).toBeDefined();
    expect(result.content.toLowerCase()).toContain('python');

    console.log(`\u001B[32m\u2713\u001B[0m 代码生成成功`);
    console.log(`   延迟: ${latency}ms`);
    console.log(`   代码片段: ${result.content.substring(0, 100)}...`);
  });

  test('API 调用 - 使用 temperature 参数', async () => {
    if (!apiKey) return;

    const provider = new ClaudeProvider({
      apiKey,
      model,
    }, mockLogger);

    // 使用高温度应该产生更多变化
    const result = await provider.complete(
      'Generate a random word.',
      { maxTokens: 20, temperature: 0.9 }
    );

    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);

    console.log(`\u001B[32m\u2713\u001B[0m Temperature 参数测试成功`);
    console.log(`   内容: ${result.content.trim()}`);
  });

  test('API 调用 - 使用 maxTokens 限制', async () => {
    if (!apiKey) return;

    const provider = new ClaudeProvider({
      apiKey,
      model,
    }, mockLogger);

    const maxTokens = 5;
    const result = await provider.complete(
      'Tell me a very long story about a dragon.',
      { maxTokens }
    );

    expect(result.content).toBeDefined();
    // 输出 tokens 应该接近或等于 maxTokens
    expect(result.outputTokens).toBeLessThanOrEqual(maxTokens + 10); // 留一些余量

    console.log(`\u001B[32m\u2713\u001B[0m MaxTokens 限制测试成功`);
    console.log(`   输出 Tokens: ${result.outputTokens} (限制: ${maxTokens})`);
    console.log(`   内容: ${result.content.trim()}`);
  });
});

// ============================================================
// 测试组 2：Claude API 流式响应
// ============================================================

describe('Claude API Streaming', () => {
  let apiKey: string | undefined;
  let model: string;

  beforeAll(() => {
    apiKey = TEST_CONFIG.claude.apiKey;
    model = TEST_CONFIG.claude.model;
  });

  test('流式响应 - 完整内容接收', async () => {
    if (!apiKey) return;

    const provider = new ClaudeProvider({
      apiKey,
      model,
    }, mockLogger);

    const chunks: CompletionChunk[] = [];
    const startTime = Date.now();

    for await (const chunk of provider.stream(
      'Count from 1 to 5, one number per line.',
      {}
    )) {
      chunks.push(chunk);
      if (chunk.done) break;
    }

    const elapsed = Date.now() - startTime;
    const fullContent = chunks.map(c => c.delta).join('');

    expect(chunks.length).toBeGreaterThan(0);
    expect(fullContent).toContain('1');
    expect(fullContent).toContain('5');

    console.log(`\u001B[32m\u2713\u001B[0m 流式响应成功`);
    console.log(`   总耗时: ${elapsed}ms`);
    console.log(`   块数量: ${chunks.length}`);
    console.log(`   总内容长度: ${fullContent.length} 字符`);
    console.log(`   内容:\n${fullContent.substring(0, 200)}`);
  });

  test('流式响应 - 首字延迟（Time To First Token）', async () => {
    if (!apiKey) return;

    const provider = new ClaudeProvider({
      apiKey,
      model,
    }, mockLogger);

    const startTime = Date.now();
    let firstTokenTime = 0;

    const streamPromise = (async () => {
      for await (const chunk of provider.stream(
        'Say "Hello"',
        {}
      )) {
        if (firstTokenTime === 0 && chunk.delta) {
          firstTokenTime = Date.now();
        }
        if (chunk.done) break;
      }
    })();

    await streamPromise;
    const totalTime = Date.now() - startTime;
    const ttfb = firstTokenTime - startTime;

    expect(ttfb).toBeGreaterThan(0);
    expect(ttfb).toBeLessThan(totalTime);

    console.log(`\u001B[32m\u2713\u001B[0m 首字延迟测试成功`);
    console.log(`   首字延迟 (TTFB): ${ttfb}ms`);
    console.log(`   总时间: ${totalTime}ms`);
  });

  test('流式响应与完整响应一致性', async () => {
    if (!apiKey) return;

    const provider = new ClaudeProvider({
      apiKey,
      model,
    }, mockLogger);

    const prompt = 'What is the capital of France?';

    // 流式响应
    let streamedContent = '';
    for await (const chunk of provider.stream(prompt, {})) {
      streamedContent += chunk.delta;
      if (chunk.done) break;
    }

    // 完整响应
    const completeResult = await provider.complete(prompt, {});

    expect(streamedContent).toBeDefined();
    expect(completeResult.content).toBeDefined();
    expect(streamedContent.toLowerCase()).toContain('paris');
    expect(completeResult.content.toLowerCase()).toContain('paris');

    console.log(`\u001B[32m\u2713\u001B[0m 流式与完整响应一致性测试成功`);
    console.log(`   流式长度: ${streamedContent.length} 字符`);
    console.log(`   完整长度: ${completeResult.content.length} 字符`);
  });
});

// ============================================================
// 测试组 3：OpenAI API 基础调用
// ============================================================

describe('Real OpenAI API Integration', () => {
  let apiKey: string | undefined;
  let model: string;

  beforeAll(() => {
    apiKey = TEST_CONFIG.openai.apiKey;
    model = TEST_CONFIG.openai.model;

    if (!apiKey) {
      console.log('\n\u001B[33m\u26A0\u001B[0m  OPENAI_API_KEY not set');
      console.log('   To run real API tests, set environment variable:');
      console.log('   \u001B[36mexport OPENAI_API_KEY=sk-xxxxx\u001B[0m\n');
    }
  });

  test('基础 API 调用 - 简单数学问题', async () => {
    if (!apiKey) return;

    const provider = new OpenAIProvider({
      apiKey,
      model,
    }, mockLogger);

    const startTime = Date.now();
    const result = await provider.complete(
      'What is 3+3? Answer with just the number.',
      { maxTokens: 10 }
    );
    const latency = Date.now() - startTime;

    expect(result.content).toBeDefined();
    expect(result.content.trim()).toContain('6');
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(result.provider).toBe('openai');

    console.log(`\u001B[32m\u2713\u001B[0m OpenAI API 调用成功`);
    console.log(`   延迟: ${latency}ms`);
    console.log(`   Tokens: ${result.totalTokens} (${result.inputTokens} + ${result.outputTokens})`);
    console.log(`   内容: ${result.content.trim()}`);
  });

  test('API 调用 - 代码生成', async () => {
    if (!apiKey) return;

    const provider = new OpenAIProvider({
      apiKey,
      model,
    }, mockLogger);

    const startTime = Date.now();
    const result = await provider.complete(
      'Write a JavaScript function to calculate fibonacci.',
      { maxTokens: 200 }
    );
    const latency = Date.now() - startTime;

    expect(result.content).toBeDefined();
    expect(result.content.toLowerCase()).toContain('function');

    console.log(`\u001B[32m\u2713\u001B[0m OpenAI 代码生成成功`);
    console.log(`   延迟: ${latency}ms`);
    console.log(`   代码片段: ${result.content.substring(0, 100)}...`);
  });

  test('API 调用 - 带 system prompt', async () => {
    if (!apiKey) return;

    const provider = new OpenAIProvider({
      apiKey,
      model,
    }, mockLogger);

    const result = await provider.complete(
      'What is 2+2?',
      {
        maxTokens: 50,
        systemPrompt: 'You are a helpful math tutor. Always explain your answer.',
      }
    );

    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);

    console.log(`\u001B[32m\u2713\u001B[0m System Prompt 测试成功`);
    console.log(`   内容: ${result.content.substring(0, 100)}...`);
  });
});

// ============================================================
// 测试组 4：批处理与真实 API 集成
// ============================================================

describe('RequestBatcher with Real Claude API', () => {
  let apiKey: string | undefined;
  let model: string;

  beforeAll(() => {
    apiKey = TEST_CONFIG.claude.apiKey;
    model = TEST_CONFIG.claude.model;
  });

  test('RequestBatcher + Claude API - 基础批处理', async () => {
    if (!apiKey) return;

    const provider = new ClaudeProvider({
      apiKey,
      model,
    }, mockLogger);

    const batcher = new RequestBatcher(
      { maxBatchSize: 3, maxWaitTime: 50, enabled: true },
      mockLogger,
      provider
    );

    const prompts = Array.from({ length: 6 }, (_, i) =>
      `What is ${i}+${i}?`
    );

    const startTime = Date.now();
    const results = await Promise.all(
      prompts.map((p, i) => batcher.add({ id: `req-${i}`, prompt: p }))
    );
    const totalTime = Date.now() - startTime;

    expect(results).toHaveLength(6);
    results.forEach(r => {
      expect(r.content).toBeDefined();
      expect(r.totalTokens).toBeGreaterThan(0);
    });

    const stats = batcher.getStats();
    const avgTime = totalTime / results.length;

    console.log(`\n\u001B[36m\u2601\u001B[0m 批处理性能报告`);
    console.log(`\u001B[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001B[0m`);
    console.log(`总请求数: ${stats.totalRequests}`);
    console.log(`总批次数: ${stats.totalBatches}`);
    console.log(`平均批次大小: ${stats.avgBatchSize.toFixed(2)}`);
    console.log(`平均延迟: ${avgTime.toFixed(0)}ms`);
    console.log(`总耗时: ${totalTime}ms`);
    console.log(`\u001B[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001B[0m\n`);
  });

  test('RequestBatcher - 动态批次调整', async () => {
    if (!apiKey) return;

    const provider = new ClaudeProvider({
      apiKey,
      model,
    }, mockLogger);

    const batcher = new RequestBatcher(
      { maxBatchSize: 5, maxWaitTime: 100, enabled: true },
      mockLogger,
      provider
    );

    // 添加不同数量的请求
    const batch1 = Promise.all([
      batcher.add({ id: '1', prompt: '1+1?' }),
      batcher.add({ id: '2', prompt: '2+2?' }),
    ]);

    await batch1;

    const batch2 = Promise.all([
      batcher.add({ id: '3', prompt: '3+3?' }),
      batcher.add({ id: '4', prompt: '4+4?' }),
      batcher.add({ id: '5', prompt: '5+5?' }),
    ]);

    await batch2;

    const stats = batcher.getStats();
    expect(stats.totalBatches).toBeGreaterThanOrEqual(2);

    console.log(`\u001B[32m\u2713\u001B[0m 动态批次调整测试成功`);
    console.log(`   批次数: ${stats.totalBatches}`);
  });
});

// ============================================================
// 测试组 5：缓存与真实 API 集成
// ============================================================

describe('ResponseCache with Real Claude API', () => {
  let apiKey: string | undefined;
  let model: string;

  beforeAll(() => {
    apiKey = TEST_CONFIG.claude.apiKey;
    model = TEST_CONFIG.claude.model;
  });

  test('ResponseCache + Claude API - 缓存命中', async () => {
    if (!apiKey) return;

    const provider = new ClaudeProvider({
      apiKey,
      model,
    }, mockLogger);

    const cache = new ResponseCache({
      maxSize: 100,
      ttl: 60000, // 1 分钟
      enabled: true,
    }, mockLogger);

    const prompts = [
      'What is the capital of France?',
      'What is the capital of France?',
      'What is the capital of France?', // 重复
    ];

    const results = [];
    const startTime = Date.now();

    for (const prompt of prompts) {
      const cached = cache.get(prompt, {});
      if (cached) {
        results.push(cached);
        continue;
      }

      const result = await provider.complete(prompt, {});
      cache.set(prompt, {}, result);
      results.push(result);
    }

    const elapsed = Date.now() - startTime;
    const stats = cache.getStats();
    const hitRate = stats.hits / (stats.hits + stats.misses);

    console.log(`\n\u001B[36m\u2601\u001B[0m 缓存性能报告`);
    console.log(`\u001B[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001B[0m`);
    console.log(`总请求数: ${prompts.length}`);
    console.log(`缓存命中: ${stats.hits}`);
    console.log(`缓存未命中: ${stats.misses}`);
    console.log(`命中率: ${(hitRate * 100).toFixed(1)}%`);
    console.log(`总耗时: ${elapsed}ms`);
    console.log(`平均耗时: ${(elapsed / prompts.length).toFixed(0)}ms`);

    if (results[0]) {
      console.log(`Token 节省: ~${results[0].inputTokens * stats.hits} tokens`);
    }
    console.log(`\u001B[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001B[0m\n`);

    expect(hitRate).toBeGreaterThan(0.3); // 至少 33% 命中
  });

  test('ResponseCache - TTL 过期', async () => {
    if (!apiKey) return;

    const provider = new ClaudeProvider({
      apiKey,
      model,
    }, mockLogger);

    const cache = new ResponseCache({
      maxSize: 100,
      ttl: 500, // 500ms 短 TTL
      enabled: true,
    }, mockLogger);

    const prompt = 'What is 5+5?';

    // 第一次调用 - 缓存未命中
    const cached1 = cache.get(prompt, {});
    expect(cached1).toBeUndefined();

    const result1 = await provider.complete(prompt, {});
    cache.set(prompt, {}, result1);

    // 第二次调用 - 缓存命中
    const cached2 = cache.get(prompt, {});
    expect(cached2).toBeDefined();

    // 等待过期
    await new Promise(resolve => setTimeout(resolve, 600));

    // 第三次调用 - 缓存已过期
    const cached3 = cache.get(prompt, {});
    expect(cached3).toBeUndefined();

    console.log(`\u001B[32m\u2713\u001B[0m TTL 过期测试成功`);
  });

  test('ResponseCache - LRU 淘汰', async () => {
    if (!apiKey) return;

    const provider = new ClaudeProvider({
      apiKey,
      model,
    }, mockLogger);

    const maxSize = 3;
    const cache = new ResponseCache({
      maxSize,
      ttl: 10000,
      enabled: true,
    }, mockLogger);

    // 添加超过 maxSize 的条目
    for (let i = 0; i < maxSize + 1; i++) {
      const result = await provider.complete(`What is ${i}+${i}?`, {});
      cache.set(`prompt-${i}`, {}, result);
    }

    const stats = cache.getStats();
    expect(stats.size).toBeLessThanOrEqual(maxSize);
    expect(stats.evictions).toBe(1);

    console.log(`\u001B[32m\u2713\u001B[0m LRU 淘汰测试成功`);
    console.log(`   淘汰次数: ${stats.evictions}`);
    console.log(`   当前大小: ${stats.size}`);
  });
});

// ============================================================
// 测试组 6：综合性能测试
// ============================================================

describe('Comprehensive Performance Test', () => {
  let apiKey: string | undefined;
  let model: string;

  beforeAll(() => {
    apiKey = TEST_CONFIG.claude.apiKey;
    model = TEST_CONFIG.claude.model;
  });

  test('完整工作负载模拟 - 批处理 + 缓存', async () => {
    if (!apiKey) return;

    const provider = new ClaudeProvider({
      apiKey,
      model,
    }, mockLogger);

    const cache = new ResponseCache({
      maxSize: 1000,
      ttl: 120000,
      enabled: true,
    }, mockLogger);

    const batcher = new RequestBatcher(
      { maxBatchSize: 5, maxWaitTime: 100, enabled: true },
      mockLogger,
      provider
    );

    // 模拟 Agent 工作负载
    const tasks = [
      'Sum 1 to 10',
      'Explain REST API',
      'What is TypeScript?',
      'Write a haiku about code',
      'Calculate 15 * 3',
      'Define "microservices"',
      'What is Docker?',
      'Explain async/await',
    ];

    // 添加 30% 重复任务
    const allTasks = [...tasks, ...tasks.slice(0, 3)];

    const results = [];
    const startTime = Date.now();

    for (const task of allTasks) {
      const cached = cache.get(task, {});
      if (cached) {
        results.push(cached);
        continue;
      }

      const result = await batcher.add({ id: crypto.randomUUID(), prompt: task })
        .then(r => {
          cache.set(task, {}, r);
          return r;
        });

      results.push(result);
    }

    await Promise.all(results);
    const elapsed = Date.now() - startTime;

    const stats = cache.getStats();
    const batchStats = batcher.getStats();
    const hitRate = stats.hits / (stats.hits + stats.misses);

    console.log(`\n\u001B[36m\u2601\u001B[0m 综合性能报告`);
    console.log(`\u001B[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001B[0m`);
    console.log(`\u001B[1m任务配置:\u001B[0m`);
    console.log(`  - 总任务数: ${allTasks.length}`);
    console.log(`  - 唯一任务数: ${tasks.length}`);
    console.log(`  - 重复率: 30%`);
    console.log(`\n\u001B[1m缓存统计:\u001B[0m`);
    console.log(`  - 命中: ${stats.hits}`);
    console.log(`  - 未命中: ${stats.misses}`);
    console.log(`  - 命中率: ${(hitRate * 100).toFixed(1)}%`);

    if (results[0]) {
      console.log(`  - Token 节省: ~${results[0].inputTokens * stats.hits} tokens`);
    }

    console.log(`\n\u001B[1m批处理统计:\u001B[0m`);
    console.log(`  - 总请求数: ${batchStats.totalRequests}`);
    console.log(`  - 总批次数: ${batchStats.totalBatches}`);
    console.log(`  - 平均批次大小: ${batchStats.avgBatchSize.toFixed(2)}`);
    console.log(`\n\u001B[1m总体指标:\u001B[0m`);
    console.log(`  - 总耗时: ${elapsed}ms`);
    console.log(`  - 平均任务耗时: ${(elapsed / allTasks.length).toFixed(0)}ms`);

    const totalTokens = results.reduce((sum, r) => sum + r.totalTokens, 0);
    console.log(`  - 总 Token 使用: ${totalTokens}`);
    console.log(`\u001B[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001B[0m\n`);

    expect(results).toHaveLength(allTasks.length);
    expect(hitRate).toBeGreaterThan(0); // 应该有缓存命中
  });
});

// ============================================================
// 测试组 7：错误处理
// ============================================================

describe('Error Handling with Real API', () => {
  let apiKey: string | undefined;
  let model: string;

  beforeAll(() => {
    apiKey = TEST_CONFIG.claude.apiKey;
    model = TEST_CONFIG.claude.model;
  });

  test('无效 API Key 处理', async () => {
    if (apiKey) {
      // 如果有真实 API Key，跳过此测试（避免消耗配额）
      return;
    }

    const provider = new ClaudeProvider({
      apiKey: 'sk-ant-invalid-key',
      model,
    }, mockLogger);

    await expect(
      provider.complete('Test', { maxTokens: 10 })
    ).rejects.toThrow();

    console.log(`\u001B[32m\u2713\u001B[0m 无效 API Key 错误处理正常`);
  });

  test('超时处理', async () => {
    if (!apiKey) return;

    const provider = new ClaudeProvider({
      apiKey,
      model,
    }, mockLogger);

    // 设置非常短的超时
    await expect(
      provider.complete(
        'Write a very long detailed essay about everything',
        { timeout: 1 } // 1ms 超时
      )
    ).rejects.toThrow();

    console.log(`\u001B[32m\u2713\u001B[0m 超时错误处理正常`);
  });
});

// ============================================================
// 测试组 8：可用性检查
// ============================================================

describe('Provider Availability Check', () => {
  test('Claude Provider 可用性检查', async () => {
    const apiKey = TEST_CONFIG.claude.apiKey;

    if (!apiKey) {
      console.log(`\u001B[33m\u26A0\u001B[0m  Claude 可用性检查跳过（无 API Key）`);
      return;
    }

    const provider = new ClaudeProvider({
      apiKey,
      model: TEST_CONFIG.claude.model,
    }, mockLogger);

    const isAvailable = await provider.isAvailable();
    expect(isAvailable).toBe(true);

    console.log(`\u001B[32m\u2713\u001B[0m Claude Provider 可用`);
  });

  test('OpenAI Provider 可用性检查', async () => {
    const apiKey = TEST_CONFIG.openai.apiKey;

    if (!apiKey) {
      console.log(`\u001B[33m\u26A0\u001B[0m  OpenAI 可用性检查跳过（无 API Key）`);
      return;
    }

    const provider = new OpenAIProvider({
      apiKey,
      model: TEST_CONFIG.openai.model,
    }, mockLogger);

    const isAvailable = await provider.isAvailable();
    expect(isAvailable).toBe(true);

    console.log(`\u001B[32m\u2713\u001B[0m OpenAI Provider 可用`);
  });
});
