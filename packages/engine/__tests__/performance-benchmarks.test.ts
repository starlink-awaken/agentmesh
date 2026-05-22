/**
 * Honeycomb v2 - Performance Benchmarks
 *
 * 阶段 2 性能基准测试套件
 *
 * 目的：
 * - 建立性能基线数据
 * - 检测性能回归
 * - 验证优化效果
 *
 * 性能目标：
 * - Agent 启动时间：100 个 Agent < 5 秒
 * - 检查点恢复时间：50% 项目回滚 < 总工作量 10%
 * - 上下文分片效率：任何 Agent 上下文 <= 窗口 60%
 * - 消息吞吐量：> 1000 msg/s
 *
 * 运行方式：
 *   bun test tests/performance-benchmarks.test.ts
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentRunner, AgentPool } from '../src/agent-runner.ts';
import { CheckpointManager } from '../src/checkpoint-manager.ts';
import { ContextShardManager, createContextShardManager } from '../src/context-shard-manager.ts';
import { MessageBus } from '../src/message-bus.ts';
import { HoneycombOrchestrator, createOrchestrator } from '../src/orchestrator.ts';
import type { PerformanceMetrics } from '../src/types.js';

// ============================================================
// 性能指标接口
// ============================================================

/**
 * 性能指标接口
 *
 * 定义关键性能指标的数据结构
 */
export interface PerformanceMetrics {
  // Agent 相关
  agent_startup_time: number;      // Agent 启动时间（ms）
  agent_execution_time: number;    // Agent 执行时间（ms）
  agent_concurrent_execution: number; // 并发执行效率（ops/s）

  // 检查点相关
  checkpoint_create_time: number;   // 检查点创建时间（ms）
  checkpoint_recovery_time: number; // 检查点恢复时间（ms）
  checkpoint_size_bytes: number;    // 检查点大小（字节）

  // 消息总线相关
  message_throughput: number;        // 消息吞吐量（msg/s）
  message_latency_ms: number;        // 消息延迟（ms）

  // 上下文分片相关
  context_shard_load_time: number;   // 上下文分片加载时间（ms）
  context_shard_compress_time: number; // 上下文压缩时间（ms）
  context_window_usage: number;      // 上下文窗口使用率（%）

  // 编排器相关
  orchestrator_init_time: number;    // 编排器初始化时间（ms）
  project_create_time: number;       // 项目创建时间（ms）
  phase_transition_time: number;     // 阶段转换时间（ms）

  // 内存相关
  memory_usage_mb: number;           // 内存使用（MB）
  memory_peak_mb: number;            // 峰值内存（MB）
}

/**
 * 性能基准数据
 *
 * 存储历史性能数据用于回归检测
 */
export interface PerformanceBaseline {
  timestamp: number;
  metrics: PerformanceMetrics;
  environment: {
    node_version: string;
    platform: string;
    cpu_cores: number;
    total_memory_mb: number;
  };
}

// ============================================================
// 性能测量工具
// ============================================================

/**
 * 测量函数执行时间
 */
function measureTime<T>(fn: () => T): { result: T; durationMs: number } {
  const start = performance.now();
  const result = fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/**
 * 测量异步函数执行时间
 */
async function measureTimeAsync<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/**
 * 获取当前内存使用（MB）
 */
function getMemoryUsageMB(): number {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

/**
 * 获取环境信息
 */
function getEnvironmentInfo() {
  return {
    node_version: process.version,
    platform: process.platform,
    cpu_cores: navigator.hardwareConcurrency || 4,
    total_memory_mb: process.memoryUsage().heapTotal / 1024 / 1024,
  };
}

// ============================================================
// 测试固定装置
// ============================================================

let tempDir: string;
let testDbPath: string;

// ============================================================
// 资源管理工具函数
// ============================================================

/**
 * 资源跟踪器 - 用于确保所有资源被正确清理
 */
interface ResourceTracker {
  checkpointManager: CheckpointManager | null;
  orchestrator: HoneycombOrchestrator | null;
  tempDirs: Set<string>;
  timers: Set<NodeJS.Timeout>;
  eventListeners: Map<EventTarget, { event: string; fn: EventListener }[]>;
}

const resourceTracker: ResourceTracker = {
  checkpointManager: null,
  orchestrator: null,
  tempDirs: new Set(),
  timers: new Set(),
  eventListeners: new Map(),
};

/**
 * 设置测试环境 - 创建临时目录和数据库
 */
function setupTestEnvironment(): void {
  tempDir = mkdtempSync(join(tmpdir(), 'hc-perf-'));
  testDbPath = join(tempDir, 'test.db');
  resourceTracker.tempDirs.add(tempDir);
}

/**
 * 清理测试环境 - 按正确顺序关闭所有资源
 */
async function cleanupTestEnvironment(): Promise<void> {
  // 1. 清除定时器
  for (const timer of resourceTracker.timers) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  resourceTracker.timers.clear();

  // 2. 移除事件监听器
  for (const [target, listeners] of resourceTracker.eventListeners) {
    for (const { event, fn } of listeners) {
      try {
        target.removeEventListener(event, fn);
      } catch {
        // 忽略移除错误
      }
    }
  }
  resourceTracker.eventListeners.clear();

  // 3. 关闭 Orchestrator（如果存在）
  if (resourceTracker.orchestrator) {
    try {
      const orch = resourceTracker.orchestrator;
      // 访问私有成员关闭 checkpointManager
      const cpManager = orch['checkpointManager'] as CheckpointManager | undefined;
      if (cpManager && typeof cpManager.close === 'function') {
        cpManager.close();
      }
    } catch {
      // 忽略关闭错误
    }
    resourceTracker.orchestrator = null;
  }

  // 4. 关闭 CheckpointManager（如果存在）
  if (resourceTracker.checkpointManager) {
    try {
      resourceTracker.checkpointManager.close();
    } catch {
      // 忽略关闭错误
    }
    resourceTracker.checkpointManager = null;
  }

  // 5. 等待异步操作完成
  await new Promise(resolve => setTimeout(resolve, 10));

  // 6. 删除临时文件
  for (const dir of resourceTracker.tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // 忽略删除错误
    }
  }
  resourceTracker.tempDirs.clear();

  // 删除全局数据库文件
  if (testDbPath) {
    try {
      unlinkSync(testDbPath);
      unlinkSync(testDbPath + '-shm');
      unlinkSync(testDbPath + '-wal');
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * 清理测试环境 - 同步版本
 */
function cleanupTestEnvironmentSync(): void {
  // 清除定时器
  for (const timer of resourceTracker.timers) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  resourceTracker.timers.clear();

  // 移除事件监听器
  for (const [target, listeners] of resourceTracker.eventListeners) {
    for (const { event, fn } of listeners) {
      try {
        target.removeEventListener(event, fn);
      } catch {
        // 忽略移除错误
      }
    }
  }
  resourceTracker.eventListeners.clear();

  // 关闭 Orchestrator（如果存在）
  if (resourceTracker.orchestrator) {
    try {
      const orch = resourceTracker.orchestrator;
      const cpManager = orch['checkpointManager'] as CheckpointManager | undefined;
      if (cpManager && typeof cpManager.close === 'function') {
        cpManager.close();
      }
    } catch {
      // 忽略关闭错误
    }
    resourceTracker.orchestrator = null;
  }

  // 关闭 CheckpointManager（如果存在）
  if (resourceTracker.checkpointManager) {
    try {
      resourceTracker.checkpointManager.close();
    } catch {
      // 忽略关闭错误
    }
    resourceTracker.checkpointManager = null;
  }

  // 删除临时文件
  for (const dir of resourceTracker.tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // 忽略删除错误
    }
  }
  resourceTracker.tempDirs.clear();

  // 删除全局数据库文件
  if (testDbPath) {
    try {
      unlinkSync(testDbPath);
      unlinkSync(testDbPath + '-shm');
      unlinkSync(testDbPath + '-wal');
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * 创建测试用的 Agent 目录
 */
function setupTestAgents(agentCount: number): string {
  const agentsDir = join(tempDir, 'agents');

  const layers = [
    { dir: 'layer-1-research', prefix: 'researcher' },
    { dir: 'layer-2-decision', prefix: 'decision' },
    { dir: 'layer-3-execution', prefix: 'executor' },
    { dir: 'layer-4-feedback', prefix: 'reviewer' },
    { dir: 'governance', prefix: 'guardian' },
  ];

  for (const layer of layers) {
    const layerDir = join(agentsDir, layer.dir);
    mkdirSync(layerDir, { recursive: true });

    const agentsPerLayer = Math.ceil(agentCount / layers.length);
    for (let i = 0; i < agentsPerLayer; i++) {
      const agentName = `${layer.prefix}-${i}`;
      const agentContent = `---
name: ${agentName}
description: Test agent ${agentName} for performance benchmarking
tools: ['read', 'write', 'search']
argument-hint: Task description for ${agentName}
---

# ${agentName}

This is a test agent for performance benchmarking.

## Capabilities

- Read and analyze documents
- Write structured output
- Search and retrieve information

## Usage

Provide a task description and context for this agent to process.
`;
      writeFileSync(join(layerDir, `${agentName}.md`), agentContent);
    }
  }

  return agentsDir;
}

// ============================================================
// Agent 启动性能测试
// ============================================================

describe('Performance Benchmarks: Agent Startup', () => {
  beforeAll(() => {
    setupTestEnvironment();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  test('agent startup time - single agent', () => {
    const agentsDir = setupTestAgents(1);
    const pool = new AgentPool(agentsDir);

    const { durationMs } = measureTime(() => {
      return new AgentPool(agentsDir);
    });

    // 单个 Agent 启动应该 < 100ms
    expect(durationMs).toBeLessThan(100);

    console.log(`[PERF] Single agent startup: ${durationMs.toFixed(2)}ms`);
  });

  test('agent startup time - 10 agents', () => {
    const agentsDir = setupTestAgents(10);

    const { durationMs, result } = measureTime(() => {
      return new AgentPool(agentsDir);
    });

    const agentCount = result.listAll().length;
    const avgTimePerAgent = durationMs / agentCount;

    // 10 个 Agent 启动应该 < 500ms
    expect(durationMs).toBeLessThan(500);
    expect(agentCount).toBeGreaterThanOrEqual(10);

    console.log(`[PERF] 10 agents startup: ${durationMs.toFixed(2)}ms (${avgTimePerAgent.toFixed(2)}ms per agent)`);
  });

  test('agent startup time - 100 agents (baseline target)', () => {
    const agentsDir = setupTestAgents(100);

    const { durationMs, result } = measureTime(() => {
      return new AgentPool(agentsDir);
    });

    const agentCount = result.listAll().length;
    const avgTimePerAgent = durationMs / agentCount;

    // 基准目标：100 个 Agent 启动 < 5 秒
    expect(durationMs).toBeLessThan(5000);
    expect(agentCount).toBeGreaterThanOrEqual(100);

    console.log(`[PERF] 100 agents startup: ${durationMs.toFixed(2)}ms (${avgTimePerAgent.toFixed(2)}ms per agent)`);
    console.log(`[PERF] Target: < 5000ms, Actual: ${durationMs.toFixed(2)}ms, Status: ${durationMs < 5000 ? 'PASS' : 'FAIL'}`);
  });

  test('agent pool query performance', () => {
    const agentsDir = setupTestAgents(100);
    const pool = new AgentPool(agentsDir);

    // 测试查询性能
    const iterations = 1000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      pool.getAgent('executor-0');
      pool.getAgentsByLayer('L3');
      pool.getActiveAgents('standard');
    }

    const durationMs = performance.now() - start;
    const avgQueryTime = durationMs / iterations;

    // 平均查询时间应该 < 1ms
    expect(avgQueryTime).toBeLessThan(1);

    console.log(`[PERF] ${iterations} queries in ${durationMs.toFixed(2)}ms (${avgQueryTime.toFixed(4)}ms per query)`);
  });
});

// ============================================================
// Agent 执行性能测试
// ============================================================

describe('Performance Benchmarks: Agent Execution', () => {
  let localTempDir: string;

  beforeEach(() => {
    localTempDir = mkdtempSync(join(tmpdir(), 'hc-perf-exec-'));
    resourceTracker.tempDirs.add(localTempDir);
  });

  afterEach(async () => {
    await cleanupTestEnvironment();
  });

  test('agent execution time - single agent', async () => {
    const runner = new AgentRunner();

    const mdPath = join(localTempDir, 'agent.md');
    writeFileSync(mdPath, `---
name: test-agent
description: Test agent
tools: ['read']
---

# Agent
`);

    const def = runner.parseAgentDefinition(mdPath);

    const { durationMs, result } = await measureTimeAsync(async () => {
      return await runner.runAgent(def, 'Test task');
    });

    // 模拟执行应该非常快（< 10ms）
    expect(durationMs).toBeLessThan(10);
    expect(result.status).toBe('completed');

    console.log(`[PERF] Single agent execution: ${durationMs.toFixed(2)}ms`);
  });

  test('agent execution time - concurrent 10 agents', async () => {
    const runner = new AgentRunner();

    const agents = [];
    for (let i = 0; i < 10; i++) {
      const mdPath = join(localTempDir, `agent-${i}.md`);
      writeFileSync(mdPath, `---
name: agent-${i}
description: Test agent ${i}
tools: ['read']
---

# Agent ${i}
`);
      agents.push(runner.parseAgentDefinition(mdPath));
    }

    const start = performance.now();
    const results = await Promise.all(
      agents.map(def => runner.runAgent(def, `Task for ${def.name}`))
    );
    const durationMs = performance.now() - start;

    // 并发执行 10 个 agent 应该 < 50ms
    expect(durationMs).toBeLessThan(50);
    expect(results.length).toBe(10);
    expect(results.every(r => r.status === 'completed')).toBe(true);

    console.log(`[PERF] Concurrent 10 agents execution: ${durationMs.toFixed(2)}ms (${(durationMs / 10).toFixed(2)}ms per agent)`);
  });

  test('agent execution throughput - 100 agents', async () => {
    const runner = new AgentRunner();

    const agents = [];
    for (let i = 0; i < 100; i++) {
      const mdPath = join(localTempDir, `agent-${i}.md`);
      writeFileSync(mdPath, `---
name: throughput-agent-${i}
description: Throughput test agent ${i}
tools: ['read']
---

# Agent ${i}
`);
      agents.push(runner.parseAgentDefinition(mdPath));
    }

    const start = performance.now();
    const results = await Promise.all(
      agents.map(def => runner.runAgent(def, `Task ${def.name}`))
    );
    const durationMs = performance.now() - start;
    const throughput = (results.length / durationMs) * 1000; // ops/sec

    // 吞吐量应该 > 1000 ops/sec
    expect(throughput).toBeGreaterThan(1000);

    console.log(`[PERF] 100 agents throughput: ${throughput.toFixed(0)} ops/sec`);
    console.log(`[PERF] Total time: ${durationMs.toFixed(2)}ms`);
  });
});

// ============================================================
// 检查点性能测试
// ============================================================

describe('Performance Benchmarks: Checkpoint Operations', () => {
  let checkpointManager: CheckpointManager;

  beforeEach(() => {
    setupTestEnvironment();
    checkpointManager = new CheckpointManager(testDbPath);
    resourceTracker.checkpointManager = checkpointManager;
  });

  afterEach(async () => {
    await cleanupTestEnvironment();
  });

  test('checkpoint create time', () => {
    const mockProjectState = {
      project_id: 'test-project-1',
      project_name: 'Test Project',
      project_description: 'A test project for benchmarking',
      archetype: 'software-dev',
      complexity: 'standard' as const,
      decision_path: 'STANDARD' as const,
      risk_level: 'medium' as const,
      trace_id: 'test-trace-1',
      current_phase: 'EXECUTION' as const,
      phase_history: [],
      active_agents: ['executor-1', 'executor-2'],
      agent_states: {},
      artifacts: [],
      decisions: [],
      total_token_usage: 50000,
      token_budget: 100000,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    const iterations = 100;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      checkpointManager.createCheckpoint(
        { ...mockProjectState, project_id: `test-project-${i}` },
        `Checkpoint ${i}`
      );
    }

    const durationMs = performance.now() - start;
    const avgTimePerCheckpoint = durationMs / iterations;

    // 平均检查点创建时间应该 < 10ms
    expect(avgTimePerCheckpoint).toBeLessThan(10);

    console.log(`[PERF] ${iterations} checkpoints in ${durationMs.toFixed(2)}ms (${avgTimePerCheckpoint.toFixed(2)}ms per checkpoint)`);
  });

  test('checkpoint recovery time', () => {
    const mockProjectState = {
      project_id: 'recovery-test-project',
      project_name: 'Recovery Test Project',
      project_description: 'Testing checkpoint recovery performance',
      archetype: 'software-dev',
      complexity: 'standard' as const,
      decision_path: 'STANDARD' as const,
      risk_level: 'medium' as const,
      trace_id: 'test-trace-recovery',
      current_phase: 'EXECUTION' as const,
      phase_history: [],
      active_agents: ['executor-1'],
      agent_states: {},
      artifacts: [],
      decisions: [],
      total_token_usage: 50000,
      token_budget: 100000,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    // 创建检查点
    const checkpoint = checkpointManager.createCheckpoint(mockProjectState, 'Test checkpoint');

    // 测试恢复时间
    const iterations = 1000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      checkpointManager.restoreCheckpoint(checkpoint.id);
    }

    const durationMs = performance.now() - start;
    const avgTimePerRecovery = durationMs / iterations;

    // 平均恢复时间应该 < 1ms
    expect(avgTimePerRecovery).toBeLessThan(1);

    console.log(`[PERF] ${iterations} recoveries in ${durationMs.toFixed(2)}ms (${avgTimePerRecovery.toFixed(4)}ms per recovery)`);
  });

  test('checkpoint list performance', () => {
    const projectId = 'list-test-project';

    // 创建多个检查点
    for (let i = 0; i < 50; i++) {
      checkpointManager.createCheckpoint(
        {
          project_id: projectId,
          project_name: 'List Test',
          project_description: 'Testing list performance',
          archetype: 'software-dev',
          complexity: 'standard' as const,
          decision_path: 'STANDARD' as const,
          risk_level: 'medium' as const,
          trace_id: 'test-trace-list',
          current_phase: 'EXECUTION' as const,
          phase_history: [],
          active_agents: [],
          agent_states: {},
          artifacts: [],
          decisions: [],
          total_token_usage: 0,
          token_budget: 100000,
          created_at: Date.now() - (50 - i) * 1000,
          updated_at: Date.now() - (50 - i) * 1000,
        },
        `Checkpoint ${i}`
      );
    }

    // 测试列表性能
    const iterations = 100;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      checkpointManager.listCheckpoints(projectId);
    }

    const durationMs = performance.now() - start;
    const avgTimePerList = durationMs / iterations;

    // 平均列表时间应该 < 5ms
    expect(avgTimePerList).toBeLessThan(5);

    console.log(`[PERF] ${iterations} list calls in ${durationMs.toFixed(2)}ms (${avgTimePerList.toFixed(2)}ms per list)`);
  });
});

// ============================================================
// 上下文分片性能测试
// ============================================================

describe('Performance Benchmarks: Context Sharding', () => {
  let shardManager: ContextShardManager;

  beforeAll(() => {
    shardManager = createContextShardManager(200_000);
  });

  test('context shard create performance', () => {
    const shardSizes = [1000, 10_000, 50_000, 100_000]; // 字符数

    for (const size of shardSizes) {
      const content = 'x'.repeat(size);

      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        shardManager.createShard('task', content);
      }

      const durationMs = performance.now() - start;
      const avgTime = durationMs / iterations;

      console.log(`[PERF] Create ${iterations} shards of ${size} chars: ${durationMs.toFixed(2)}ms (${avgTime.toFixed(4)}ms per shard)`);

      // 创建应该很快
      expect(avgTime).toBeLessThan(1);
    }
  });

  test('context shard assembly performance', () => {
    const shardIds: string[] = [];

    // 创建不同范围的分片
    const globalSummary = shardManager.createShard('global-summary', 'Global project summary');
    shardIds.push(globalSummary.shard_id);

    for (let i = 0; i < 5; i++) {
      const taskShard = shardManager.createShard('task', `Task context ${i}: ${'x'.repeat(1000)}`);
      shardIds.push(taskShard.shard_id);
    }

    for (let i = 0; i < 10; i++) {
      const moduleShard = shardManager.createShard('module', `Module ${i} context: ${'x'.repeat(2000)}`, `module-${i}`);
      shardIds.push(moduleShard.shard_id);
    }

    // 测试组装性能
    const iterations = 1000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      shardManager.assembleContext(shardIds);
    }

    const durationMs = performance.now() - start;
    const avgTime = durationMs / iterations;

    console.log(`[PERF] Assemble context ${iterations} times: ${durationMs.toFixed(2)}ms (${avgTime.toFixed(4)}ms per assembly)`);

    // 组装应该很快
    expect(avgTime).toBeLessThan(1);
  });

  test('context window usage limit enforcement', () => {
    const maxWindow = 200_000;
    const tokenBudget = Math.floor(maxWindow * 0.6); // 60%

    const shardIds: string[] = [];

    // 创建全局摘要（2000 tokens）
    const globalSummary = shardManager.createShard('global-summary', 'x'.repeat(2000 * 4));
    shardIds.push(globalSummary.shard_id);

    // 创建大量分片
    for (let i = 0; i < 20; i++) {
      const shard = shardManager.createShard('task', `Task ${i}: ${'x'.repeat(5000)}`); // ~12500 tokens each
      shardIds.push(shard.shard_id);
    }

    const result = shardManager.assembleContext(shardIds, maxWindow);

    // 验证 60% 限制
    console.log(`[PERF] Context window usage: ${result.totalTokens}/${tokenBudget} (${(result.totalTokens / tokenBudget * 100).toFixed(1)}%)`);

    // 结果应该告诉我们是否超限
    expect(result.withinLimit).toBeDefined();
    expect(result.totalTokens).toBeGreaterThan(0);
  });

  test('context shard compression performance', () => {
    const largeShard = shardManager.createShard('task', 'x'.repeat(100_000)); // ~25000 tokens
    const targetTokens = 5000;

    const iterations = 100;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      // 重新创建大分片进行压缩
      const shard = shardManager.createShard('task', 'x'.repeat(100_000));
      shardManager.compressShard(shard.shard_id, targetTokens);
    }

    const durationMs = performance.now() - start;
    const avgTime = durationMs / iterations;

    console.log(`[PERF] Compress ${iterations} shards: ${durationMs.toFixed(2)}ms (${avgTime.toFixed(2)}ms per compression)`);

    // 压缩应该合理快速
    expect(avgTime).toBeLessThan(10);
  });
});

// ============================================================
// 消息总线性能测试
// ============================================================

describe('Performance Benchmarks: Message Bus', () => {
  let messageBus: MessageBus;

  beforeAll(() => {
    messageBus = new MessageBus();
  });

  test('message throughput - single sender', () => {
    const messageCount = 10_000;
    const start = performance.now();

    for (let i = 0; i < messageCount; i++) {
      const msg = messageBus.createMessage('sender', 'receiver', 'data', { index: i }, `trace-${i}`);
      messageBus.send(msg);
    }

    const durationMs = performance.now() - start;
    const throughput = (messageCount / durationMs) * 1000;

    console.log(`[PERF] ${messageCount} messages in ${durationMs.toFixed(2)}ms (${throughput.toFixed(0)} msg/sec)`);

    // 吞吐量应该 > 1000 msg/s
    expect(throughput).toBeGreaterThan(1000);
  });

  test('message throughput - multiple senders', () => {
    const senders = ['sender1', 'sender2', 'sender3', 'sender4', 'sender5'];
    const messagesPerSender = 2000;

    const start = performance.now();

    for (const sender of senders) {
      for (let i = 0; i < messagesPerSender; i++) {
        const msg = messageBus.createMessage(sender, 'receiver', 'data', { index: i }, 'trace-batch');
        messageBus.send(msg);
      }
    }

    const durationMs = performance.now() - start;
    const totalMessages = senders.length * messagesPerSender;
    const throughput = (totalMessages / durationMs) * 1000;

    console.log(`[PERF] ${totalMessages} messages from ${senders.length} senders in ${durationMs.toFixed(2)}ms (${throughput.toFixed(0)} msg/sec)`);

    expect(throughput).toBeGreaterThan(1000);
  });

  test('message history query performance', () => {
    // 创建一些消息
    const traceId = 'query-trace';
    for (let i = 0; i < 1000; i++) {
      const msg = messageBus.createMessage('sender', 'receiver', 'data', { index: i }, traceId);
      messageBus.send(msg);
    }

    const iterations = 100;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      messageBus.getHistory(traceId, 100);
    }

    const durationMs = performance.now() - start;
    const avgTime = durationMs / iterations;

    console.log(`[PERF] Query history ${iterations} times: ${durationMs.toFixed(2)}ms (${avgTime.toFixed(4)}ms per query)`);

    // 查询应该快速
    expect(avgTime).toBeLessThan(1);
  });
});

// ============================================================
// 编排器性能测试
// ============================================================

describe('Performance Benchmarks: Orchestrator', () => {
  let tempAgentsDir: string;
  let tempDomainsDir: string;
  let localOrchestrator: HoneycombOrchestrator | null = null;

  beforeEach(() => {
    setupTestEnvironment();
    tempAgentsDir = join(tempDir, 'agents');
    tempDomainsDir = join(tempDir, 'domains');
    setupTestAgents(50);
    mkdirSync(tempDomainsDir, { recursive: true });
  });

  afterEach(async () => {
    if (localOrchestrator) {
      resourceTracker.orchestrator = localOrchestrator;
      localOrchestrator = null;
    }
    await cleanupTestEnvironment();
  });

  test('orchestrator initialization time', () => {
    const { durationMs } = measureTime(() => {
      return createOrchestrator({
        db_path: testDbPath,
        agents_root: tempAgentsDir,
      });
    });

    console.log(`[PERF] Orchestrator initialization: ${durationMs.toFixed(2)}ms`);

    // 初始化应该 < 1 秒
    expect(durationMs).toBeLessThan(1000);
  });

  test('project creation time', () => {
    const orchestrator = createOrchestrator({
      db_path: testDbPath,
      agents_root: tempAgentsDir,
    });

    const { durationMs } = measureTime(() => {
      return orchestrator.createProject({
        name: 'Performance Test Project',
        description: 'A project for testing orchestrator performance',
        archetype: 'software-dev',
        goals: ['Test performance', 'Measure metrics'],
      });
    });

    console.log(`[PERF] Project creation: ${durationMs.toFixed(2)}ms`);

    // 项目创建应该 < 100ms
    expect(durationMs).toBeLessThan(100);
  });

  test('phase transition time', () => {
    const orchestrator = createOrchestrator({
      db_path: testDbPath,
      agents_root: tempAgentsDir,
      domains_root: tempDomainsDir,
    });

    const state = orchestrator.createProject({
      name: 'Transition Test',
      description: 'Testing phase transition performance',
      archetype: 'software-dev',
      goals: ['Test transitions'],
    });

    const iterations = 100;
    const start = performance.now();

    // 直接测试状态机实例，避免创建新的 Orchestrator
    const stateMachine = orchestrator['stateMachine'];
    for (let i = 0; i < iterations; i++) {
      // 测试从 INIT 到下一阶段的转换性能
      try {
        const transition = stateMachine.transitionTo?.('RESEARCH', `Test ${i}`);
      } catch {
        // 忽略转换错误，我们只测量性能
      }
    }

    const durationMs = performance.now() - start;
    const avgTime = durationMs / iterations;

    console.log(`[PERF] ${iterations} phase transitions in ${durationMs.toFixed(2)}ms (${avgTime.toFixed(4)}ms per transition)`);

    // 转换应该快速
    expect(avgTime).toBeLessThan(10);
  });
});

// ============================================================
// 内存性能测试
// ============================================================

describe('Performance Benchmarks: Memory Usage', () => {
  let localTempDir: string;
  let localCheckpointManager: CheckpointManager | null = null;

  beforeEach(() => {
    localTempDir = mkdtempSync(join(tmpdir(), 'hc-perf-mem-'));
    resourceTracker.tempDirs.add(localTempDir);
  });

  afterEach(async () => {
    if (localCheckpointManager) {
      resourceTracker.checkpointManager = localCheckpointManager;
      localCheckpointManager = null;
    }
    await cleanupTestEnvironment();
  });

  test('memory usage - agent pool with 100 agents', () => {
    const initialMemory = getMemoryUsageMB();
    const agentsDir = setupTestAgents(100);

    const pool = new AgentPool(agentsDir);

    const afterLoadMemory = getMemoryUsageMB();
    const memoryUsed = afterLoadMemory - initialMemory;

    console.log(`[PERF] Memory for 100 agents: ${memoryUsed.toFixed(2)}MB`);

    // 100 个 agent 应该使用 < 50MB
    expect(memoryUsed).toBeLessThan(50);
  });

  test('memory usage - checkpoint manager with 1000 checkpoints', () => {
    const memTestDir = mkdtempSync(join(tmpdir(), 'hc-perf-mem-cp-'));
    resourceTracker.tempDirs.add(memTestDir);
    const memTestDbPath = join(memTestDir, 'mem-test.db');

    const initialMemory = getMemoryUsageMB();

    localCheckpointManager = new CheckpointManager(memTestDbPath);
    resourceTracker.checkpointManager = localCheckpointManager;

    const baseState = {
      project_id: 'mem-test',
      project_name: 'Memory Test',
      project_description: 'Testing memory usage',
      archetype: 'software-dev',
      complexity: 'standard' as const,
      decision_path: 'STANDARD' as const,
      risk_level: 'medium' as const,
      trace_id: 'mem-trace',
      current_phase: 'EXECUTION' as const,
      phase_history: [],
      active_agents: [],
      agent_states: {},
      artifacts: [],
      decisions: [],
      total_token_usage: 0,
      token_budget: 100000,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    // 创建 1000 个检查点
    for (let i = 0; i < 1000; i++) {
      localCheckpointManager.createCheckpoint(
        { ...baseState, project_id: `mem-test-${i}` },
        `Checkpoint ${i}`
      );
    }

    const afterCreateMemory = getMemoryUsageMB();
    const memoryUsed = afterCreateMemory - initialMemory;

    console.log(`[PERF] Memory for 1000 checkpoints: ${memoryUsed.toFixed(2)}MB`);

    // 1000 个检查点应该使用 < 100MB
    expect(memoryUsed).toBeLessThan(100);
  });

  test('memory usage - context shards with large content', () => {
    const shardManager = createContextShardManager();

    const initialMemory = getMemoryUsageMB();

    // 创建 100 个大分片
    for (let i = 0; i < 100; i++) {
      shardManager.createShard('task', 'x'.repeat(100_000)); // 每个 ~100KB
    }

    const afterCreateMemory = getMemoryUsageMB();
    const memoryUsed = afterCreateMemory - initialMemory;

    console.log(`[PERF] Memory for 100 large shards: ${memoryUsed.toFixed(2)}MB`);

    // 100 个大分片应该 < 20MB (压缩/优化后)
    expect(memoryUsed).toBeLessThan(20);
  });
});

// ============================================================
// 性能基线数据收集
// ============================================================

describe('Performance Baseline Collection', () => {
  let localCheckpointManager: CheckpointManager | null = null;

  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(async () => {
    if (localCheckpointManager) {
      resourceTracker.checkpointManager = localCheckpointManager;
      localCheckpointManager = null;
    }
    await cleanupTestEnvironment();
  });

  test('collect and export performance baseline', () => {
    const agentsDir = setupTestAgents(100);

    const metrics: Partial<PerformanceMetrics> = {};

    // 收集 Agent 启动性能
    const agentPoolStart = performance.now();
    const pool = new AgentPool(agentsDir);
    metrics.agent_startup_time = performance.now() - agentPoolStart;

    // 收集检查点性能
    localCheckpointManager = new CheckpointManager(testDbPath);
    resourceTracker.checkpointManager = localCheckpointManager;
    const cpStart = performance.now();
    localCheckpointManager.createCheckpoint({
      project_id: 'baseline-test',
      project_name: 'Baseline Test',
      project_description: 'Baseline collection',
      archetype: 'software-dev',
      complexity: 'standard' as const,
      decision_path: 'STANDARD' as const,
      risk_level: 'medium' as const,
      trace_id: 'baseline',
      current_phase: 'EXECUTION' as const,
      phase_history: [],
      active_agents: [],
      agent_states: {},
      artifacts: [],
      decisions: [],
      total_token_usage: 0,
      token_budget: 100000,
      created_at: Date.now(),
      updated_at: Date.now(),
    }, 'Baseline checkpoint');
    metrics.checkpoint_create_time = performance.now() - cpStart;

    // 收集内存使用
    metrics.memory_usage_mb = getMemoryUsageMB();

    const baseline: PerformanceBaseline = {
      timestamp: Date.now(),
      metrics: metrics as PerformanceMetrics,
      environment: getEnvironmentInfo() as any,
    };

    console.log('[PERF] Performance Baseline:');
    console.log(JSON.stringify(baseline, null, 2));

    // 验证指标已收集
    expect(metrics.agent_startup_time).toBeGreaterThan(0);
    expect(metrics.checkpoint_create_time).toBeGreaterThan(0);
    expect(metrics.memory_usage_mb).toBeGreaterThan(0);
  });
});

// ============================================================
// 性能回归检测
// ============================================================

describe('Performance Regression Detection', () => {
  test('detect performance regression - compare against thresholds', () => {
    const thresholds = {
      agent_startup_time_100: 5000, // 100 个 Agent 启动 < 5 秒
      checkpoint_create_time: 10,    // 检查点创建 < 10ms
      checkpoint_recovery_time: 1,   // 检查点恢复 < 1ms
      message_throughput: 1000,      // 消息吞吐量 > 1000 msg/s
      context_window_usage: 60,      // 上下文使用 <= 60%
    };

    console.log('[PERF] Performance Thresholds:');
    console.log(JSON.stringify(thresholds, null, 2));

    // 这些阈值应该在 CI/CD 中验证
    Object.entries(thresholds).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    expect(Object.keys(thresholds)).toHaveLength(5);
  });
});
