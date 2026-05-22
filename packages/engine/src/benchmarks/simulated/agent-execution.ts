/**
 * Honeycomb v2 - Agent 执行性能基准测试
 *
 * 测试 AgentRunner 和 AgentPool 的执行性能
 */

import { AgentRunner, AgentPool } from '../../agent-runner.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateStats, collectSamples, collectSamplesAsync, getMemoryUsageMB } from '../utils.js';
import type { AgentExecutionResult } from '../types.js';

// ============================================================
// 测试环境设置
// ============================================================

interface TestEnv {
  tempDir: string;
  agentsDir: string;
}

function setupTestEnv(): TestEnv {
  const tempDir = mkdtempSync(join(tmpdir(), 'hc-bench-agent-'));
  const agentsDir = join(tempDir, 'agents');
  mkdirSync(agentsDir, { recursive: true });
  return { tempDir, agentsDir };
}

function cleanupTestEnv(env: TestEnv): void {
  try {
    rmSync(env.tempDir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

/**
 * 创建测试用的 Agent 定义文件
 */
function createTestAgent(
  agentsDir: string,
  name: string,
  layer: string,
  tools: string[] = ['read', 'write'],
): void {
  const layerDir = join(agentsDir, layer);
  mkdirSync(layerDir, { recursive: true });

  const content = `---
name: ${name}
description: Benchmark test agent ${name}
tools: [${tools.map((t) => `'${t}'`).join(', ')}]
argument-hint: Task for ${name}
---

# ${name}

Performance benchmark test agent.
`;

  writeFileSync(join(layerDir, `${name}.md`), content);
}

/**
 * 批量创建测试 Agent
 */
function createTestAgents(agentsDir: string, count: number): void {
  const layers = [
    'layer-1-research',
    'layer-2-decision',
    'layer-3-execution',
    'layer-4-feedback',
    'governance',
  ];
  const prefixes = ['researcher', 'decision', 'executor', 'reviewer', 'guardian'];

  for (let i = 0; i < count; i++) {
    const layerIndex = i % layers.length;
    createTestAgent(agentsDir, `${prefixes[layerIndex]}-${i}`, layers[layerIndex]);
  }
}

// ============================================================
// 基准测试：单个 Agent 执行
// ============================================================

/**
 * 基准测试：单个 Agent 执行时间
 */
export async function benchSingleAgentExecution(samples: number = 100): Promise<AgentExecutionResult> {
  const env = setupTestEnv();
  const runner = new AgentRunner();

  try {
    createTestAgent(env.agentsDir, 'test-agent', 'layer-3-execution');
    const definition = runner.parseAgentDefinition(join(env.agentsDir, 'layer-3-execution', 'test-agent.md'));

    const { durationsMs } = await collectSamplesAsync(
      async () => await runner.runAgent(definition, 'Test benchmark task'),
      samples,
    );

    const stats = calculateStats(durationsMs);
    const memoryBefore = process.memoryUsage().heapUsed;

    // 额外执行一次获取内存使用
    await runner.runAgent(definition, 'Memory test');
    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryDelta = (memoryAfter - memoryBefore) / 1024 / 1024;

    return {
      type: 'agent-execution',
      name: 'Single Agent Execution',
      description: `执行单个 Agent 的平均时间 (${samples} 个样本)`,
      stats,
      agentCount: 1,
      mode: 'serial',
      throughput: {
        opsPerSecond: 1000 / stats.avg,
        totalOps: samples,
        totalDurationMs: durationsMs.reduce((a, b) => a + b, 0),
      },
      memory: {
        heapUsedMB: memoryDelta,
        heapTotalMB: 0,
        rssMB: 0,
        externalMB: 0,
      },
      passed: stats.avg < 10, // 目标：< 10ms
      threshold: 10,
    };
  } finally {
    cleanupTestEnv(env);
  }
}

// ============================================================
// 基准测试：串行执行多个 Agent
// ============================================================

/**
 * 基准测试：10 个 Agent 串行执行
 */
export async function benchSerialExecution(agentCount: number = 10): Promise<AgentExecutionResult> {
  const env = setupTestEnv();
  const runner = new AgentRunner();

  try {
    createTestAgents(env.agentsDir, agentCount);
    const pool = new AgentPool(env.agentsDir);
    const agents = pool.listAll().slice(0, agentCount);

    const samples = 50;
    const durationsMs: number[] = [];

    for (let i = 0; i < samples; i++) {
      const start = performance.now();

      for (const agent of agents) {
        await runner.runAgent(agent, `Serial task ${i}`);
      }

      durationsMs.push(performance.now() - start);
    }

    const stats = calculateStats(durationsMs);
    const avgPerAgent = stats.avg / agentCount;

    return {
      type: 'agent-execution',
      name: `Serial Execution (${agentCount} agents)`,
      description: `串行执行 ${agentCount} 个 Agent 的平均时间`,
      stats: {
        ...stats,
        avg: avgPerAgent,
        min: stats.min / agentCount,
        max: stats.max / agentCount,
        median: stats.median / agentCount,
        p95: stats.p95 / agentCount,
        p99: stats.p99 / agentCount,
      },
      agentCount,
      mode: 'serial',
      throughput: {
        opsPerSecond: (agentCount * 1000) / stats.avg,
        totalOps: agentCount * samples,
        totalDurationMs: durationsMs.reduce((a, b) => a + b, 0),
      },
      passed: avgPerAgent < 10, // 目标：每个 Agent < 10ms
      threshold: 10,
    };
  } finally {
    cleanupTestEnv(env);
  }
}

// ============================================================
// 基准测试：并发执行多个 Agent
// ============================================================

/**
 * 基准测试：并发执行 100 个 Agent
 */
export async function benchConcurrentExecution(agentCount: number = 100): Promise<AgentExecutionResult> {
  const env = setupTestEnv();
  const runner = new AgentRunner();

  try {
    createTestAgents(env.agentsDir, agentCount);
    const pool = new AgentPool(env.agentsDir);
    const agents = pool.listAll().slice(0, agentCount);

    const samples = 20;
    const durationsMs: number[] = [];

    for (let i = 0; i < samples; i++) {
      const start = performance.now();

      await Promise.all(
        agents.map((agent) => runner.runAgent(agent, `Concurrent task ${i}`))
      );

      durationsMs.push(performance.now() - start);
    }

    const stats = calculateStats(durationsMs);
    const avgPerAgent = stats.avg / agentCount;

    return {
      type: 'agent-execution',
      name: `Concurrent Execution (${agentCount} agents)`,
      description: `并发执行 ${agentCount} 个 Agent 的平均时间`,
      stats: {
        ...stats,
        avg: avgPerAgent,
        min: stats.min / agentCount,
        max: stats.max / agentCount,
        median: stats.median / agentCount,
        p95: stats.p95 / agentCount,
        p99: stats.p99 / agentCount,
      },
      agentCount,
      mode: 'concurrent',
      throughput: {
        opsPerSecond: (agentCount * 1000) / stats.avg,
        totalOps: agentCount * samples,
        totalDurationMs: durationsMs.reduce((a, b) => a + b, 0),
      },
      passed: stats.avg < 5000, // 目标：100 个 Agent 并发 < 5 秒
      threshold: 5000,
    };
  } finally {
    cleanupTestEnv(env);
  }
}

// ============================================================
// 基准测试：Agent Pool 加载性能
// ============================================================

/**
 * 基准测试：Agent Pool 加载时间
 */
export async function benchAgentPoolLoading(agentCount: number = 100): Promise<AgentExecutionResult> {
  const env = setupTestEnv();

  try {
    createTestAgents(env.agentsDir, agentCount);

    const samples = 50;
    const durationsMs: number[] = [];

    for (let i = 0; i < samples; i++) {
      const start = performance.now();
      new AgentPool(env.agentsDir);
      durationsMs.push(performance.now() - start);
    }

    const stats = calculateStats(durationsMs);

    return {
      type: 'agent-execution',
      name: `Agent Pool Loading (${agentCount} agents)`,
      description: `加载 ${agentCount} 个 Agent 定义的时间`,
      stats,
      agentCount,
      mode: 'serial',
      passed: stats.avg < 1000, // 目标：加载 < 1 秒
      threshold: 1000,
    };
  } finally {
    cleanupTestEnv(env);
  }
}

// ============================================================
// 基准测试：Agent 查询性能
// ============================================================

/**
 * 基准测试：Agent Pool 查询性能
 */
export async function benchAgentPoolQueries(agentCount: number = 100): Promise<AgentExecutionResult> {
  const env = setupTestEnv();

  try {
    createTestAgents(env.agentsDir, agentCount);
    const pool = new AgentPool(env.agentsDir);

    const queriesPerSample = 1000;
    const samples = 10;
    const durationsMs: number[] = [];

    for (let i = 0; i < samples; i++) {
      const start = performance.now();

      for (let j = 0; j < queriesPerSample; j++) {
        pool.getAgent('executor-0');
        pool.getAgentsByLayer('L3');
        pool.getActiveAgents('standard');
      }

      durationsMs.push(performance.now() - start);
    }

    const stats = calculateStats(durationsMs.map((d) => d / queriesPerSample));

    return {
      type: 'agent-execution',
      name: `Agent Pool Queries (${agentCount} agents)`,
      description: `执行 ${queriesPerSample} 次查询的平均时间`,
      stats,
      agentCount,
      mode: 'serial',
      throughput: {
        opsPerSecond: 1000 / stats.avg,
        totalOps: queriesPerSample * samples,
        totalDurationMs: durationsMs.reduce((a, b) => a + b, 0),
      },
      passed: stats.avg < 0.1, // 目标：每次查询 < 0.1ms
      threshold: 0.1,
    };
  } finally {
    cleanupTestEnv(env);
  }
}

// ============================================================
// 导出所有 Agent 执行基准测试
// ============================================================

/**
 * 运行所有 Agent 执行基准测试
 */
export async function runAllAgentBenchmarks(): Promise<AgentExecutionResult[]> {
  const results: AgentExecutionResult[] = [];

  console.log('运行 Agent 执行基准测试...');

  results.push(await benchSingleAgentExecution());
  console.log(`  ✓ 单个 Agent 执行: 平均 ${results[0].stats.avg.toFixed(3)} ms`);

  results.push(await benchSerialExecution(10));
  console.log(`  ✓ 10 个 Agent 串行: 平均 ${results[1].stats.avg.toFixed(3)} ms/agent`);

  results.push(await benchConcurrentExecution(100));
  console.log(
    `  ✓ 100 个 Agent 并发: 总耗时 ${results[2].throughput?.totalDurationMs.toFixed(0)} ms, ` +
    `吞吐量 ${results[2].throughput?.opsPerSecond.toFixed(0)} ops/s`
  );

  results.push(await benchAgentPoolLoading(100));
  console.log(`  ✓ Agent Pool 加载: 平均 ${results[3].stats.avg.toFixed(2)} ms`);

  results.push(await benchAgentPoolQueries(100));
  console.log(
    `  ✓ Agent Pool 查询: 平均 ${results[4].stats.avg.toFixed(4)} ms/query, ` +
    `吞吐量 ${results[4].throughput?.opsPerSecond.toFixed(0)} query/s`
  );

  return results;
}
