/**
 * Honeycomb v2 - 检查点性能基准测试
 *
 * 测试 CheckpointManager 的创建、恢复和批量操作性能
 */

import { CheckpointManager } from '../../checkpoint-manager.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateStats, collectSamples } from '../utils.js';
import type { CheckpointResult } from '../types.js';
import type { ProjectState } from '../../types.js';
import { Phase, DecisionPath, RiskLevel, AgentStatus } from '../../types.js';

// ============================================================
// 测试环境设置
// ============================================================

interface CheckpointTestEnv {
  tempDir: string;
  dbPath: string;
}

function setupCheckpointEnv(): CheckpointTestEnv {
  const tempDir = mkdtempSync(join(tmpdir(), 'hc-bench-cp-'));
  const dbPath = join(tempDir, 'test.db');
  return { tempDir, dbPath };
}

function cleanupCheckpointEnv(env: CheckpointTestEnv): void {
  try {
    rmSync(env.tempDir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

/**
 * 创建测试用的项目状态
 */
function createMockProjectState(projectId: string, size: 'small' | 'medium' | 'large' = 'medium'): ProjectState {
  const artifactCounts = { small: 10, medium: 50, large: 200 };
  const decisionCounts = { small: 5, medium: 20, large: 100 };
  const agentCounts = { small: 3, medium: 10, large: 30 };

  const artifactCount = artifactCounts[size];
  const decisionCount = decisionCounts[size];
  const agentCount = agentCounts[size];

  return {
    project_id: projectId,
    project_name: `Benchmark Test Project ${projectId}`,
    project_description: `A test project for benchmarking with ${size} state size`,
    archetype: 'software-dev',
    complexity: 'standard',
    decision_path: DecisionPath.STANDARD,
    risk_level: RiskLevel.MEDIUM,
    trace_id: `trace-${projectId}`,
    current_phase: Phase.EXECUTION,
    phase_history: [
      { from: Phase.INIT, to: Phase.RESEARCH, timestamp: Date.now() - 10000, reason: 'Start', decision_path: DecisionPath.STANDARD },
      { from: Phase.RESEARCH, to: Phase.DECISION, timestamp: Date.now() - 5000, reason: 'Research complete', decision_path: DecisionPath.STANDARD },
      { from: Phase.DECISION, to: Phase.EXECUTION, timestamp: Date.now(), reason: 'Approved', decision_path: DecisionPath.STANDARD },
    ],
    active_agents: Array.from({ length: agentCount }, (_, i) => `agent-${i}`),
    agent_states: Object.fromEntries(
      Array.from({ length: agentCount }, (_, i) => [
        `agent-${i}`,
        {
          agent_name: `agent-${i}`,
          status: AgentStatus.COMPLETED,
          current_task: `Task ${i}`,
          started_at: Date.now() - 1000,
          completed_at: Date.now(),
          output: `Output from agent ${i}`,
          token_usage: 1000 + i * 100,
          retry_count: 0,
        },
      ])
    ) as Record<string, import('../../types.js').AgentState>,
    artifacts: Array.from({ length: artifactCount }, (_, i) => ({
      id: `artifact-${i}`,
      name: `artifact-${i}`,
      type: 'document' as const,
      path: `/path/to/artifact-${i}`,
      created_at: Date.now() - i * 100,
      phase: Phase.EXECUTION,
      agent: `agent-${i % agentCount}`,
      description: `Test artifact ${i}`,
    })),
    decisions: Array.from({ length: decisionCount }, (_, i) => ({
      id: `decision-${i}`,
      phase: Phase.EXECUTION,
      type: 'go' as const,
      reasoning: `Rationale for decision ${i}`,
      risk_level: RiskLevel.MEDIUM,
      confidence: 0.8,
      made_by: `agent-${i % agentCount}`,
      timestamp: Date.now() - i * 200,
    })),
    total_token_usage: 50000,
    token_budget: 100000,
    created_at: Date.now() - 10000,
    updated_at: Date.now(),
  };
}

// ============================================================
// 基准测试：创建检查点时间
// ============================================================

/**
 * 基准测试：单个检查点创建时间
 */
export async function benchCheckpointCreate(size: 'small' | 'medium' | 'large' = 'medium'): Promise<CheckpointResult> {
  const env = setupCheckpointEnv();
  const manager = new CheckpointManager(env.dbPath);

  try {
    const samples = 100;
    const durationsMs: number[] = [];

    for (let i = 0; i < samples; i++) {
      const state = createMockProjectState(`project-${i}`, size);

      const start = performance.now();
      manager.createCheckpoint(state, `Benchmark checkpoint ${i}`);
      durationsMs.push(performance.now() - start);
    }

    const stats = calculateStats(durationsMs);

    // 计算状态大小
    const sampleState = createMockProjectState('size-test', size);
    const stateSizeBytes = JSON.stringify(sampleState).length;

    return {
      type: 'checkpoint',
      name: `Checkpoint Create (${size})`,
      description: `创建 ${size} 大小的检查点 (${samples} 个样本)`,
      stats,
      checkpointCount: samples,
      stateSizeBytes,
      passed: stats.avg < 10, // 目标：< 10ms
      threshold: 10,
    };
  } finally {
    cleanupCheckpointEnv(env);
  }
}

// ============================================================
// 基准测试：检查点恢复时间
// ============================================================

/**
 * 基准测试：检查点恢复时间
 */
export async function benchCheckpointRestore(size: 'small' | 'medium' | 'large' = 'medium'): Promise<CheckpointResult> {
  const env = setupCheckpointEnv();
  const manager = new CheckpointManager(env.dbPath);

  try {
    // 先创建一些检查点
    const checkpointCount = 50;
    const checkpointIds: string[] = [];

    for (let i = 0; i < checkpointCount; i++) {
      const state = createMockProjectState(`project-${i}`, size);
      const cp = manager.createCheckpoint(state, `Checkpoint ${i}`);
      checkpointIds.push(cp.id);
    }

    // 测试恢复性能
    const samples = 1000;
    const durationsMs: number[] = [];

    for (let i = 0; i < samples; i++) {
      const cpId = checkpointIds[i % checkpointCount];

      const start = performance.now();
      manager.restoreCheckpoint(cpId);
      durationsMs.push(performance.now() - start);
    }

    const stats = calculateStats(durationsMs);

    const sampleState = createMockProjectState('size-test', size);
    const stateSizeBytes = JSON.stringify(sampleState).length;

    return {
      type: 'checkpoint',
      name: `Checkpoint Restore (${size})`,
      description: `恢复 ${size} 大小的检查点 (${samples} 次恢复)`,
      stats,
      checkpointCount: samples,
      stateSizeBytes,
      passed: stats.avg < 1, // 目标：< 1ms
      threshold: 1,
    };
  } finally {
    cleanupCheckpointEnv(env);
  }
}

// ============================================================
// 基准测试：批量检查点操作
// ============================================================

/**
 * 基准测试：批量创建检查点
 */
export async function benchCheckpointBatchCreate(batchSize: number = 100): Promise<CheckpointResult> {
  const env = setupCheckpointEnv();
  const manager = new CheckpointManager(env.dbPath);

  try {
    const start = performance.now();

    for (let i = 0; i < batchSize; i++) {
      const state = createMockProjectState(`batch-project-${i}`, 'medium');
      manager.createCheckpoint(state, `Batch checkpoint ${i}`);
    }

    const totalDurationMs = performance.now() - start;
    const avgMs = totalDurationMs / batchSize;

    const stats = calculateStats([avgMs, avgMs, avgMs]); // 简化统计

    const sampleState = createMockProjectState('size-test', 'medium');
    const stateSizeBytes = JSON.stringify(sampleState).length;

    return {
      type: 'checkpoint',
      name: `Batch Checkpoint Create (${batchSize} checkpoints)`,
      description: `批量创建 ${batchSize} 个检查点`,
      stats,
      checkpointCount: batchSize,
      stateSizeBytes,
      throughput: {
        opsPerSecond: (batchSize * 1000) / totalDurationMs,
        totalOps: batchSize,
        totalDurationMs,
      },
      passed: totalDurationMs < 1000, // 目标：100 个检查点 < 1 秒
      threshold: 1000,
    };
  } finally {
    cleanupCheckpointEnv(env);
  }
}

// ============================================================
// 基准测试：检查点列表查询性能
// ============================================================

/**
 * 基准测试：检查点列表查询
 */
export async function benchCheckpointListQuery(checkpointCount: number = 50): Promise<CheckpointResult> {
  const env = setupCheckpointEnv();
  const manager = new CheckpointManager(env.dbPath);

  try {
    const projectId = 'list-test-project';

    // 创建检查点
    for (let i = 0; i < checkpointCount; i++) {
      const state = createMockProjectState(projectId, 'medium');
      manager.createCheckpoint(state, `Checkpoint ${i}`);
    }

    // 测试查询性能
    const samples = 100;
    const durationsMs: number[] = [];

    for (let i = 0; i < samples; i++) {
      const start = performance.now();
      manager.listCheckpoints(projectId);
      durationsMs.push(performance.now() - start);
    }

    const stats = calculateStats(durationsMs);

    return {
      type: 'checkpoint',
      name: `Checkpoint List Query (${checkpointCount} checkpoints)`,
      description: `查询包含 ${checkpointCount} 个检查点的列表`,
      stats,
      checkpointCount,
      stateSizeBytes: 0,
      passed: stats.avg < 5, // 目标：< 5ms
      threshold: 5,
    };
  } finally {
    cleanupCheckpointEnv(env);
  }
}

// ============================================================
// 基准测试：状态序列化时间
// ============================================================

/**
 * 基准测试：不同大小的状态序列化时间
 */
export async function benchStateSerialization(): Promise<CheckpointResult[]> {
  const results: CheckpointResult[] = [];
  const sizes: Array<{ name: string; size: 'small' | 'medium' | 'large' }> = [
    { name: 'Small', size: 'small' },
    { name: 'Medium', size: 'medium' },
    { name: 'Large', size: 'large' },
  ];

  for (const { name, size } of sizes) {
    const state = createMockProjectState('serialization-test', size);
    const stateJson = JSON.stringify(state);
    const stateSizeBytes = stateJson.length;

    const samples = 1000;
    const durationsMs: number[] = [];

    for (let i = 0; i < samples; i++) {
      const start = performance.now();
      JSON.stringify(state);
      durationsMs.push(performance.now() - start);
    }

    const stats = calculateStats(durationsMs);

    results.push({
      type: 'checkpoint',
      name: `State Serialization - ${name}`,
      description: `序列化 ${name} 大小的项目状态 (${stateSizeBytes} bytes)`,
      stats,
      checkpointCount: samples,
      stateSizeBytes,
      passed: stats.avg < 1, // 目标：< 1ms
      threshold: 1,
    });
  }

  return results;
}

// ============================================================
// 基准测试：状态反序列化时间
// ============================================================

/**
 * 基准测试：不同大小的状态反序列化时间
 */
export async function benchStateDeserialization(): Promise<CheckpointResult[]> {
  const results: CheckpointResult[] = [];
  const sizes: Array<{ name: string; size: 'small' | 'medium' | 'large' }> = [
    { name: 'Small', size: 'small' },
    { name: 'Medium', size: 'medium' },
    { name: 'Large', size: 'large' },
  ];

  for (const { name, size } of sizes) {
    const state = createMockProjectState('deserialization-test', size);
    const stateJson = JSON.stringify(state);
    const stateSizeBytes = stateJson.length;

    const samples = 1000;
    const durationsMs: number[] = [];

    for (let i = 0; i < samples; i++) {
      const start = performance.now();
      JSON.parse(stateJson) as ProjectState;
      durationsMs.push(performance.now() - start);
    }

    const stats = calculateStats(durationsMs);

    results.push({
      type: 'checkpoint',
      name: `State Deserialization - ${name}`,
      description: `反序列化 ${name} 大小的项目状态 (${stateSizeBytes} bytes)`,
      stats,
      checkpointCount: samples,
      stateSizeBytes,
      passed: stats.avg < 1, // 目标：< 1ms
      threshold: 1,
    });
  }

  return results;
}

// ============================================================
// 导出所有检查点基准测试
// ============================================================

/**
 * 运行所有检查点基准测试
 */
export async function runAllCheckpointBenchmarks(): Promise<CheckpointResult[]> {
  const results: CheckpointResult[] = [];

  console.log('运行检查点基准测试...');

  // 创建测试
  results.push(await benchCheckpointCreate('small'));
  console.log(`  ✓ Small 检查点创建: 平均 ${results[0].stats.avg.toFixed(3)} ms`);

  results.push(await benchCheckpointCreate('medium'));
  console.log(`  ✓ Medium 检查点创建: 平均 ${results[1].stats.avg.toFixed(3)} ms`);

  results.push(await benchCheckpointCreate('large'));
  console.log(`  ✓ Large 检查点创建: 平均 ${results[2].stats.avg.toFixed(3)} ms`);

  // 恢复测试
  results.push(await benchCheckpointRestore('medium'));
  console.log(`  ✓ Medium 检查点恢复: 平均 ${results[3].stats.avg.toFixed(4)} ms`);

  // 批量操作
  results.push(await benchCheckpointBatchCreate(100));
  console.log(`  ✓ 批量创建 100 个检查点: 总耗时 ${results[4].throughput?.totalDurationMs.toFixed(0)} ms`);

  // 查询测试
  results.push(await benchCheckpointListQuery(50));
  console.log(`  ✓ 检查点列表查询: 平均 ${results[5].stats.avg.toFixed(3)} ms`);

  // 序列化测试
  const serializationResults = await benchStateSerialization();
  results.push(...serializationResults);
  console.log(`  ✓ 状态序列化测试: ${serializationResults.length} 种大小`);

  // 反序列化测试
  const deserializationResults = await benchStateDeserialization();
  results.push(...deserializationResults);
  console.log(`  ✓ 状态反序列化测试: ${deserializationResults.length} 种大小`);

  return results;
}
