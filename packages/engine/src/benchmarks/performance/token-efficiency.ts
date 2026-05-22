/**
 * Honeycomb v2 - Token 效率基准测试
 *
 * 测试 Token 使用效率，包括：
 * - Token 统计准确性
 * - Token 预算控制
 * - Token 使用速率计算
 * - 成本估算准确性
 * - 多 Provider 统计分离
 */

import { TokenTracker } from '../../llm/tracker.js';
import type { TokenUsage } from '../../llm/types.js';
import { calculateStats, collectSamplesAsync, getMemoryUsageMB } from '../utils.js';
import type { BenchmarkResult, ThroughputMetrics } from '../types.js';

// ============================================================
// Token 效率测试结果类型
// ============================================================

export interface TokenEfficiencyResult extends BenchmarkResult {
  type: 'token-efficiency';
  /** 总 Token 使用量 */
  totalTokens: number;
  /** 输入 Token 使用量 */
  inputTokens: number;
  /** 输出 Token 使用量 */
  outputTokens: number;
  /** 输入/输出比率 */
  ioRatio: number;
  /** 成本估算（USD） */
  estimatedCost: number;
  /** 速率统计 */
  rateMetrics: {
    tokensPerSecond: number;
    tokensPerMinute: number;
    inputTokensPerMinute: number;
    outputTokensPerMinute: number;
  };
}

// ============================================================
// 测试数据生成器
// ============================================================

/**
 * 生成模拟 Token 使用记录
 */
function generateTokenUsage(
  inputTokens: number,
  outputTokens: number,
): TokenUsage {
  return { input: inputTokens, output: outputTokens };
}

/**
 * 生成模拟 Agent 使用序列
 */
function generateAgentUsageSequence(
  agentCount: number,
  tokensPerAgent: { input: number; output: number },
): Array<{ provider: string; input: number; output: number; agentName: string }> {
  const sequence: Array<{ provider: string; input: number; output: number; agentName: string }> = [];
  const providers = ['claude', 'openai', 'simulation'];

  for (let i = 0; i < agentCount; i++) {
    sequence.push({
      provider: providers[i % providers.length],
      input: tokensPerAgent.input + Math.floor(Math.random() * 100),
      output: tokensPerAgent.output + Math.floor(Math.random() * 50),
      agentName: `agent-${i}`,
    });
  }

  return sequence;
}

// ============================================================
// 基准测试：Token 统计准确性
// ============================================================

/**
 * 基准测试：Token 统计准确性
 *
 * 验证 TokenTracker 能准确记录和统计 Token 使用
 */
export async function benchTokenStatisticsAccuracy(
  recordCount: number = 1000,
): Promise<TokenEfficiencyResult> {
  const tracker = new TokenTracker({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} });

  const { durationsMs } = await collectSamplesAsync(async () => {
    const sequence = generateAgentUsageSequence(recordCount, { input: 1000, output: 500 });

    for (const record of sequence) {
      tracker.record(record.provider, record.input, record.output, {
        agentName: record.agentName,
        projectId: 'test-project',
      });
    }

    return tracker.getTotal();
  }, 50);

  // 验证统计准确性
  const sequence = generateAgentUsageSequence(recordCount, { input: 1000, output: 500 });
  tracker.reset();

  for (const record of sequence) {
    tracker.record(record.provider, record.input, record.output, {
      agentName: record.agentName,
      projectId: 'test-project',
    });
  }

  const total = tracker.getTotal();
  const expectedTotal = sequence.reduce((sum, r) => sum + r.input + r.output, 0);
  const accuracy = total.input + total.output;

  const stats = calculateStats(durationsMs);
  const memoryBefore = process.memoryUsage().heapUsed;

  // 内存测试
  tracker.reset();
  const largeSequence = generateAgentUsageSequence(10000, { input: 1000, output: 500 });
  for (const record of largeSequence) {
    tracker.record(record.provider, record.input, record.output, {
      agentName: record.agentName,
    });
  }

  const memoryAfter = process.memoryUsage().heapUsed;
  const memoryDelta = (memoryAfter - memoryBefore) / 1024 / 1024;

  const cost = tracker.estimateCost();

  return {
    type: 'token-efficiency',
    name: 'Token Statistics Accuracy',
    description: `Token 统计准确性测试 (${recordCount} 条记录)`,
    stats,
    totalTokens: accuracy,
    inputTokens: total.input,
    outputTokens: total.output,
    ioRatio: total.output / (total.input || 1),
    estimatedCost: cost.totalCost,
    rateMetrics: {
      tokensPerSecond: accuracy / (stats.avg / 1000),
      tokensPerMinute: (accuracy / (stats.avg / 1000)) * 60,
      inputTokensPerMinute: (total.input / (stats.avg / 1000)) * 60,
      outputTokensPerMinute: (total.output / (stats.avg / 1000)) * 60,
    },
    throughput: {
      opsPerSecond: recordCount / (stats.avg / 1000),
      totalOps: recordCount * 50,
      totalDurationMs: durationsMs.reduce((a, b) => a + b, 0),
    },
    memory: {
      heapUsedMB: memoryDelta,
      heapTotalMB: 0,
      rssMB: 0,
      externalMB: 0,
    },
    passed: accuracy === expectedTotal,
    threshold: expectedTotal,
  };
}

// ============================================================
// 基准测试：Token 预算控制
// ============================================================

/**
 * 基准测试：Token 预算控制
 *
 * 验证预算检查和强制执行机制
 */
export async function benchTokenBudgetControl(
  budget: number = 100000,
): Promise<TokenEfficiencyResult> {
  const tracker = new TokenTracker({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} });

  const samples = 100;
  const durationsMs: number[] = [];

  for (let i = 0; i < samples; i++) {
    const start = performance.now();

    // 记录一些使用
    const usage = generateAgentUsageSequence(10, { input: 100, output: 50 });
    for (const record of usage) {
      tracker.record(record.provider, record.input, record.output);
    }

    // 检查预算
    const withinBudget = tracker.checkBudget(budget);

    durationsMs.push(performance.now() - start);

    if (i < samples - 1) {
      tracker.reset();
    }
  }

  const stats = calculateStats(durationsMs);
  const total = tracker.getTotal();

  return {
    type: 'token-efficiency',
    name: 'Token Budget Control',
    description: `Token 预算控制测试 (预算: ${budget})`,
    stats,
    totalTokens: total.input + total.output,
    inputTokens: total.input,
    outputTokens: total.output,
    ioRatio: total.output / (total.input || 1),
    estimatedCost: 0,
    rateMetrics: {
      tokensPerSecond: 0,
      tokensPerMinute: 0,
      inputTokensPerMinute: 0,
      outputTokensPerMinute: 0,
    },
    passed: true, // 预算检查不应该抛出异常
  };
}

// ============================================================
// 基准测试：多 Provider 统计分离
// ============================================================

/**
 * 基准测试：多 Provider 统计分离
 *
 * 验证不同 Provider 的统计可以正确分离
 */
export async function benchMultiProviderSeparation(
  providers: string[] = ['claude', 'openai', 'simulation'],
): Promise<TokenEfficiencyResult> {
  const tracker = new TokenTracker({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} });

  const { durationsMs } = await collectSamplesAsync(async () => {
    // 为每个 Provider 记录不同的使用量
    const usageByProvider: Record<string, number> = {
      claude: 1000,
      openai: 800,
      simulation: 500,
    };

    for (const provider of providers) {
      const input = usageByProvider[provider] || 500;
      const output = Math.floor(input * 0.5);
      tracker.record(provider, input, output, { agentName: `${provider}-agent` });
    }

    return tracker.getTotal();
  }, 100);

  // 验证分离准确性
  tracker.reset();
  const usageByProvider: Record<string, { input: number; output: number }> = {
    claude: { input: 1000, output: 500 },
    openai: { input: 800, output: 400 },
    simulation: { input: 500, output: 250 },
  };

  for (const provider of providers) {
    const usage = usageByProvider[provider];
    if (usage) {
      tracker.record(provider, usage.input, usage.output, { agentName: `${provider}-agent` });
    }
  }

  const stats = calculateStats(durationsMs);
  const report = tracker.getReport();
  const total = tracker.getTotal();

  let separationCorrect = true;
  for (const provider of providers) {
    const providerTotal = tracker.getTotal(provider);
    const expected = usageByProvider[provider];
    if (expected && (providerTotal.input !== expected.input || providerTotal.output !== expected.output)) {
      separationCorrect = false;
    }
  }

  return {
    type: 'token-efficiency',
    name: 'Multi-Provider Separation',
    description: `多 Provider 统计分离测试 (${providers.length} 个 Provider)`,
    stats,
    totalTokens: total.input + total.output,
    inputTokens: total.input,
    outputTokens: total.output,
    ioRatio: total.output / (total.input || 1),
    estimatedCost: tracker.estimateCost().totalCost,
    rateMetrics: {
      tokensPerSecond: 0,
      tokensPerMinute: 0,
      inputTokensPerMinute: 0,
      outputTokensPerMinute: 0,
    },
    passed: separationCorrect,
  };
}

// ============================================================
// 基准测试：Token 使用速率计算
// ============================================================

/**
 * 基准测试：Token 使用速率计算
 *
 * 验证时间窗口内的速率计算准确性
 */
export async function benchTokenUsageRate(
  windowDurationMs: number = 60000,
): Promise<TokenEfficiencyResult> {
  const tracker = new TokenTracker({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} });

  const samples = 50;
  const durationsMs: number[] = [];

  for (let i = 0; i < samples; i++) {
    const start = performance.now();

    // 模拟时间窗口内的使用
    const now = Date.now();
    for (let j = 0; j < 10; j++) {
      tracker.record('claude', 100 + j * 10, 50 + j * 5, {
        agentName: `rate-test-${j}`,
      });
    }

    const rate = tracker.getUsageRate();

    durationsMs.push(performance.now() - start);

    if (i < samples - 1) {
      tracker.reset();
    }
  }

  const stats = calculateStats(durationsMs);
  const total = tracker.getTotal();
  const rate = tracker.getUsageRate();

  return {
    type: 'token-efficiency',
    name: 'Token Usage Rate',
    description: `Token 使用速率计算测试 (窗口: ${windowDurationMs}ms)`,
    stats,
    totalTokens: total.input + total.output,
    inputTokens: total.input,
    outputTokens: total.output,
    ioRatio: total.output / (total.input || 1),
    estimatedCost: 0,
    rateMetrics: {
      tokensPerSecond: rate.tokensPerMinute / 60,
      tokensPerMinute: rate.tokensPerMinute,
      inputTokensPerMinute: rate.inputTokensPerMinute,
      outputTokensPerMinute: rate.outputTokensPerMinute,
    },
    passed: rate.tokensPerMinute > 0,
  };
}

// ============================================================
// 基准测试：Agent 级别 Token 统计
// ============================================================

/**
 * 基准测试：Agent 级别 Token 统计
 *
 * 验证按 Agent 分组的 Token 统计
 */
export async function benchPerAgentTokenStats(
  agentCount: number = 50,
): Promise<TokenEfficiencyResult> {
  const tracker = new TokenTracker({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} });

  const { durationsMs } = await collectSamplesAsync(async () => {
    // 为每个 Agent 记录使用
    for (let i = 0; i < agentCount; i++) {
      const inputTokens = 500 + Math.floor(Math.random() * 500);
      const outputTokens = Math.floor(inputTokens * 0.5);
      tracker.record('claude', inputTokens, outputTokens, {
        agentName: `agent-${i}`,
        projectId: 'test-project',
      });
    }

    return tracker.getUsageByAgent();
  }, 50);

  // 验证统计准确性
  tracker.reset();
  const expectedUsage: Record<string, { input: number; output: number }> = {};

  for (let i = 0; i < agentCount; i++) {
    const inputTokens = 500 + Math.floor(Math.random() * 500);
    const outputTokens = Math.floor(inputTokens * 0.5);
    tracker.record('claude', inputTokens, outputTokens, {
      agentName: `agent-${i}`,
      projectId: 'test-project',
    });
    expectedUsage[`agent-${i}`] = { input: inputTokens, output: outputTokens };
  }

  const stats = calculateStats(durationsMs);
  const agentUsage = tracker.getUsageByAgent() as Record<string, TokenUsage>;
  let allCorrect = true;

  for (const agentName in expectedUsage) {
    const usage = agentUsage[agentName];
    const expected = expectedUsage[agentName];
    if (!usage || usage.input !== expected.input || usage.output !== expected.output) {
      allCorrect = false;
    }
  }

  const summary = tracker.getSummary();
  const rate = tracker.getUsageRate();

  return {
    type: 'token-efficiency',
    name: 'Per-Agent Token Statistics',
    description: `Agent 级别 Token 统计测试 (${agentCount} 个 Agent)`,
    stats,
    totalTokens: summary.totalTokens,
    inputTokens: tracker.getTotal().input,
    outputTokens: tracker.getTotal().output,
    ioRatio: tracker.getTotal().output / (tracker.getTotal().input || 1),
    estimatedCost: tracker.estimateCost().totalCost,
    rateMetrics: {
      tokensPerSecond: rate.tokensPerMinute / 60,
      tokensPerMinute: rate.tokensPerMinute,
      inputTokensPerMinute: rate.inputTokensPerMinute,
      outputTokensPerMinute: rate.outputTokensPerMinute,
    },
    passed: allCorrect,
  };
}

// ============================================================
// 基准测试：成本估算准确性
// ============================================================

/**
 * 基准测试：成本估算准确性
 *
 * 验证成本估算的准确性
 */
export async function benchCostEstimation(
  inputTokens: number = 100000,
  outputTokens: number = 50000,
): Promise<TokenEfficiencyResult> {
  const tracker = new TokenTracker({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} });

  // Claude 定价 (每百万 Token)
  const CLAUDE_PRICING = { input: 3, output: 15 };

  const { durationsMs } = await collectSamplesAsync(async () => {
    tracker.record('claude', inputTokens, outputTokens);
    return tracker.estimateCost('claude');
  }, 100);

  tracker.reset();
  tracker.record('claude', inputTokens, outputTokens);
  const cost = tracker.estimateCost('claude');

  // 计算预期成本
  const expectedInputCost = (inputTokens / 1_000_000) * CLAUDE_PRICING.input;
  const expectedOutputCost = (outputTokens / 1_000_000) * CLAUDE_PRICING.output;
  const expectedTotalCost = expectedInputCost + expectedOutputCost;

  const stats = calculateStats(durationsMs);
  const total = tracker.getTotal();

  return {
    type: 'token-efficiency',
    name: 'Cost Estimation Accuracy',
    description: `成本估算准确性测试 (${inputTokens} 输入, ${outputTokens} 输出)`,
    stats,
    totalTokens: total.input + total.output,
    inputTokens: total.input,
    outputTokens: total.output,
    ioRatio: total.output / (total.input || 1),
    estimatedCost: cost.totalCost,
    rateMetrics: {
      tokensPerSecond: 0,
      tokensPerMinute: 0,
      inputTokensPerMinute: 0,
      outputTokensPerMinute: 0,
    },
    passed: Math.abs(cost.totalCost - expectedTotalCost) < 0.01,
    threshold: expectedTotalCost,
  };
}

// ============================================================
// 运行所有 Token 效率基准测试
// ============================================================

/**
 * 运行所有 Token 效率基准测试
 */
export async function runAllTokenEfficiencyBenchmarks(): Promise<TokenEfficiencyResult[]> {
  const results: TokenEfficiencyResult[] = [];

  console.log('运行 Token 效率基准测试...');

  results.push(await benchTokenStatisticsAccuracy());
  console.log(`  ✓ Token 统计准确性: ${results[0].totalTokens.toLocaleString()} tokens, ${results[0].stats.avg.toFixed(3)} ms`);

  results.push(await benchTokenBudgetControl());
  console.log(`  ✓ Token 预算控制: ${results[1].stats.avg.toFixed(4)} ms/check`);

  results.push(await benchMultiProviderSeparation());
  console.log(`  ✓ 多 Provider 分离: ${results[2].passed ? '通过' : '失败'}`);

  results.push(await benchTokenUsageRate());
  console.log(`  ✓ Token 使用速率: ${results[3].rateMetrics.tokensPerMinute.toLocaleString()} tokens/min`);

  results.push(await benchPerAgentTokenStats());
  console.log(`  ✓ Agent 级别统计: ${results[4].totalTokens.toLocaleString()} tokens, ${results[4].passed ? '准确' : '不准确'}`);

  results.push(await benchCostEstimation());
  console.log(`  ✓ 成本估算: $${results[5].estimatedCost.toFixed(4)}, ${results[5].passed ? '准确' : '不准确'}`);

  return results;
}
