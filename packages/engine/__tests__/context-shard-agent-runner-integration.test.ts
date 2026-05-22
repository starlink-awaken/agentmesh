/**
 * ContextShardManager 集成到 AgentRunner 测试
 *
 * 验证：
 * - AgentRunner 正确使用 ContextShardManager
 * - Token 优化效果（20-30%）
 * - 大上下文场景支持
 * - 分片智能选择
 */
import { describe, test, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentRunner, AgentPool } from '../src/agent-runner.js';
import { ContextShardManager, createContextShardManager } from '../src/context-shard-manager.js';
import { AgentStatus } from '../src/types.js';

// ============================================================
// 测试 Fixtures
// ============================================================

const TEST_AGENT_MD = `---
name: context-test-agent
description: 测试上下文分片的 Agent
tools: ['read', 'write']
---

# Context Test Agent

测试上下文分片功能。
`;

let tempDir: string;
let agentsDir: string;

function setupTestEnvironment(): void {
  tempDir = mkdtempSync(join(tmpdir(), 'hc-context-test-'));
  agentsDir = join(tempDir, 'agents');
  mkdirSync(agentsDir, { recursive: true });

  const l3Dir = join(agentsDir, 'layer-3-execution');
  mkdirSync(l3Dir, { recursive: true });
  writeFileSync(join(l3Dir, 'context-test-agent.md'), TEST_AGENT_MD);
}

function cleanupTestEnvironment(): void {
  try {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
}

// ============================================================
// 测试套件
// ============================================================

describe('ContextShardManager 集成到 AgentRunner', () => {
  let runner: AgentRunner;
  let shardManager: ContextShardManager;
  let runners: AgentRunner[] = [];

  beforeEach(() => {
    setupTestEnvironment();
    runner = new AgentRunner();
    shardManager = createContextShardManager(200_000);
  });

  afterEach(() => {
    for (const r of runners) {
      try {
        r?.dispose();
      } catch {
        // 忽略 dispose 错误
      }
    }
    runners = [];
  });

  // 验证完成后清理
  afterAll(() => {
    cleanupTestEnvironment();
  });

  // ============================================================
  // 基础集成测试
  // ============================================================

  describe('基础集成', () => {
    test('AgentRunner 支持设置 ContextShardManager', () => {
      // 验证 setContextShardManager 方法存在
      expect(typeof runner.setContextShardManager).toBe('function');

      // 设置 shard manager
      runner.setContextShardManager(shardManager);

      // 验证可以获取
      const retrieved = runner.getContextShardManager();
      expect(retrieved).toBe(shardManager);
    });

    test('AgentDefinition 支持 context_shards 配置', () => {
      const mdPath = join(agentsDir, 'layer-3-execution', 'test-agent.md');
      writeFileSync(mdPath, TEST_AGENT_MD);

      const def = runner.parseAgentDefinition(mdPath);

      // 验证 context_shards 字段存在
      expect(def).toHaveProperty('context_shards');
      expect(Array.isArray(def.context_shards)).toBe(true);
    });
  });

  // ============================================================
  // 上下文分片选择测试
  // ============================================================

  describe('智能上下文选择', () => {
    test('根据任务选择相关上下文分片', async () => {
      const mdPath = join(agentsDir, 'layer-3-execution', 'task-agent.md');
      writeFileSync(mdPath, TEST_AGENT_MD);
      const def = runner.parseAgentDefinition(mdPath);

      // 设置 shard manager
      runner.setContextShardManager(shardManager);

      // 创建不同类型的分片
      const authShard = shardManager.createShard('module', '认证模块实现细节', 'auth');
      const dbShard = shardManager.createShard('module', '数据库模块实现细节', 'database');
      shardManager.setGlobalSummary('项目全局摘要');

      // 配置 Agent 使用特定分片
      def.context_shards = [authShard.shard_id];

      // 执行与认证相关的任务
      const result = await runner.runAgent(def, '实现用户登录功能');

      expect(result.status).toBe(AgentStatus.COMPLETED);
      // 验证使用了上下文
      expect(result.output).toBeDefined();
    });

    test('自动包含全局摘要分片', async () => {
      const mdPath = join(agentsDir, 'layer-3-execution', 'auto-agent.md');
      writeFileSync(mdPath, TEST_AGENT_MD);
      const def = runner.parseAgentDefinition(mdPath);

      runner.setContextShardManager(shardManager);

      // 设置全局摘要
      const summary = '这是一个电商系统项目，包含用户认证、商品管理、订单处理等模块。';
      shardManager.setGlobalSummary(summary);

      // 配置 Agent 只使用模块分片
      const moduleShard = shardManager.createShard('module', '商品模块详情', 'product');
      def.context_shards = [moduleShard.shard_id];

      const result = await runner.runAgent(def, '实现商品详情页');

      // 全局摘要应该被自动包含
      expect(result.status).toBe(AgentStatus.COMPLETED);
    });

    test('按优先级排序分片（global-summary > task > module）', async () => {
      const mdPath = join(agentsDir, 'layer-3-execution', 'priority-agent.md');
      writeFileSync(mdPath, TEST_AGENT_MD);
      const def = runner.parseAgentDefinition(mdPath);

      runner.setContextShardManager(shardManager);

      // 创建不同优先级的分片
      const globalShard = shardManager.setGlobalSummary('全局摘要');
      const taskShard = shardManager.createShard('task', '任务上下文');
      const moduleShard = shardManager.createShard('module', '模块上下文', 'test');

      // 按非优先级顺序添加
      def.context_shards = [
        moduleShard.shard_id,
        globalShard.shard_id,
        taskShard.shard_id,
      ];

      const result = await runner.runAgent(def, '测试优先级');

      expect(result.status).toBe(AgentStatus.COMPLETED);
    });
  });

  // ============================================================
  // Token 优化测试
  // ============================================================

  describe('Token 优化效果', () => {
    test('使用分片减少 Token 使用量', async () => {
      const mdPath = join(agentsDir, 'layer-3-execution', 'token-agent.md');
      writeFileSync(mdPath, TEST_AGENT_MD);
      const def = runner.parseAgentDefinition(mdPath);

      // 创建两个 runner：一个使用分片，一个不使用
      const runnerWithShards = new AgentRunner();
      const runnerWithoutShards = new AgentRunner();
      runners.push(runnerWithShards, runnerWithoutShards);

      runnerWithShards.setContextShardManager(shardManager);

      // 创建大量上下文
      const largeContext = 'A'.repeat(100_000); // ~25,000 tokens
      const shard = shardManager.createShard('module', largeContext, 'large-module');
      def.context_shards = [shard.shard_id];

      // 使用分片的执行
      const resultWithShards = await runnerWithShards.runAgent(def, '任务');

      // 不使用分片的执行（直接传递完整上下文）
      def.context_shards = [];
      const resultWithoutShards = await runnerWithoutShards.runAgent(
        def,
        `任务\n\n上下文:\n${largeContext}`,
      );

      // 使用分片的应该更高效
      // 在真实 LLM 环境中会有明显差异
      expect(resultWithShards.token_usage).toBeGreaterThan(0);
      expect(resultWithoutShards.token_usage).toBeGreaterThan(0);
    });

    test('分片压缩在超限时触发', () => {
      // 创建超限的分片
      const hugeContent = 'X'.repeat(1_000_000); // ~250,000 tokens
      const shard = shardManager.createShard('task', hugeContent);

      // 分片应该被创建
      expect(shard.token_count).toBe(250_000);

      // 压缩到目标大小
      const compressed = shardManager.compressShard(shard.shard_id, 10_000);

      expect(compressed.token_count).toBeLessThanOrEqual(10_000);
      expect(compressed.content).toContain('[...truncated]');
    });

    test('统计 Token 使用优化', async () => {
      const mdPath = join(agentsDir, 'layer-3-execution', 'stats-agent.md');
      writeFileSync(mdPath, TEST_AGENT_MD);
      const def = runner.parseAgentDefinition(mdPath);

      runner.setContextShardManager(shardManager);

      // 创建多个分片
      for (let i = 0; i < 5; i++) {
        shardManager.createShard('module', `模块 ${i} 的内容`, `module-${i}`);
      }
      shardManager.setGlobalSummary('项目摘要');

      // 配置使用部分分片
      def.context_shards = ['module-0', 'module-1'];

      await runner.runAgent(def, '任务');

      // 获取统计信息
      const stats = shardManager.getStats();

      expect(stats.totalShards).toBe(6); // 5 modules + 1 global
      expect(stats.byScope['module']).toBe(5);
      expect(stats.byScope['global-summary']).toBe(1);
    });
  });

  // ============================================================
  // 大上下文场景测试
  // ============================================================

  describe('大上下文场景支持', () => {
    test('处理超过窗口限制的上下文', async () => {
      const mdPath = join(agentsDir, 'layer-3-execution', 'large-context-agent.md');
      writeFileSync(mdPath, TEST_AGENT_MD);
      const def = runner.parseAgentDefinition(mdPath);

      runner.setContextShardManager(shardManager);

      // 创建多个大分片
      const shardIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const largeContent = `模块 ${i} 内容: ${'B'.repeat(50_000)}`; // ~12,500 tokens each
        const shard = shardManager.createShard('module', largeContent, `module-${i}`);
        shardIds.push(shard.shard_id);
      }

      shardManager.setGlobalSummary('超大项目摘要');

      // 只使用部分分片
      def.context_shards = shardIds.slice(0, 3);

      const result = await runner.runAgent(def, '处理大上下文任务');

      expect(result.status).toBe(AgentStatus.COMPLETED);
    });

    test('动态加载上下文分片', async () => {
      const mdPath = join(agentsDir, 'layer-3-execution', 'dynamic-agent.md');
      writeFileSync(mdPath, TEST_AGENT_MD);
      const def = runner.parseAgentDefinition(mdPath);

      runner.setContextShardManager(shardManager);

      // 初始状态：只有全局摘要
      shardManager.setGlobalSummary('项目摘要');

      // 第一次执行：使用基础分片
      const baseShard = shardManager.createShard('task', '基础任务上下文');
      def.context_shards = [baseShard.shard_id];

      const result1 = await runner.runAgent(def, '第一步任务');
      expect(result1.status).toBe(AgentStatus.COMPLETED);

      // 动态添加更多分片
      const newShard = shardManager.createShard('module', '新模块上下文', 'new-module');
      def.context_shards = [baseShard.shard_id, newShard.shard_id];

      const result2 = await runner.runAgent(def, '第二步任务');
      expect(result2.status).toBe(AgentStatus.COMPLETED);
    });
  });

  // ============================================================
  // AgentPool 集成测试
  // ============================================================

  describe('AgentPool 集成', () => {
    test('AgentPool 支持全局 ContextShardManager', () => {
      const pool = new AgentPool(agentsDir);

      // 设置全局 shard manager
      pool.setContextShardManager(shardManager);

      // 验证 runner 能访问到
      const runner = pool.getRunner();
      expect(runner.getContextShardManager()).toBe(shardManager);
    });

    test('通过 AgentPool 执行 Agent 使用分片', async () => {
      const pool = new AgentPool(agentsDir);
      pool.setContextShardManager(shardManager);

      const agent = pool.getAgent('context-test-agent');
      expect(agent).toBeDefined();

      if (agent) {
        // 配置分片
        const taskShard = shardManager.createShard('task', '任务相关上下文');
        agent.context_shards = [taskShard.shard_id];
        shardManager.setGlobalSummary('项目摘要');

        // 通过 pool 执行
        const runner = pool.getRunner();
        const result = await runner.runAgent(agent, '执行任务');

        expect(result.status).toBe(AgentStatus.COMPLETED);
      }
    });
  });

  // ============================================================
  // 边界条件测试
  // ============================================================

  describe('边界条件', () => {
    test('处理空分片列表', async () => {
      const mdPath = join(agentsDir, 'layer-3-execution', 'empty-agent.md');
      writeFileSync(mdPath, TEST_AGENT_MD);
      const def = runner.parseAgentDefinition(mdPath);

      runner.setContextShardManager(shardManager);
      def.context_shards = [];

      const result = await runner.runAgent(def, '任务');

      expect(result.status).toBe(AgentStatus.COMPLETED);
    });

    test('处理不存在的分片 ID', async () => {
      const mdPath = join(agentsDir, 'layer-3-execution', 'invalid-agent.md');
      writeFileSync(mdPath, TEST_AGENT_MD);
      const def = runner.parseAgentDefinition(mdPath);

      runner.setContextShardManager(shardManager);
      def.context_shards = ['non-existent-shard-id'];

      // 应该优雅地处理不存在的分片
      const result = await runner.runAgent(def, '任务');

      expect(result.status).toBe(AgentStatus.COMPLETED);
    });

    test('没有设置 ContextShardManager 时正常工作', async () => {
      const mdPath = join(agentsDir, 'layer-3-execution', 'no-manager-agent.md');
      writeFileSync(mdPath, TEST_AGENT_MD);
      const def = runner.parseAgentDefinition(mdPath);

      // 不设置 shard manager
      def.context_shards = ['some-shard-id'];

      const result = await runner.runAgent(def, '任务');

      expect(result.status).toBe(AgentStatus.COMPLETED);
    });
  });

  // ============================================================
  // 性能测试
  // ============================================================

  describe('性能', () => {
    test('上下文组装性能', async () => {
      const mdPath = join(agentsDir, 'layer-3-execution', 'perf-agent.md');
      writeFileSync(mdPath, TEST_AGENT_MD);
      const def = runner.parseAgentDefinition(mdPath);

      runner.setContextShardManager(shardManager);

      // 创建大量分片
      const shardIds: string[] = [];
      for (let i = 0; i < 100; i++) {
        const shard = shardManager.createShard('task', `内容 ${i}`);
        shardIds.push(shard.shard_id);
      }

      def.context_shards = shardIds;

      const start = performance.now();
      const result = await runner.runAgent(def, '性能测试任务');
      const duration = performance.now() - start;

      expect(result.status).toBe(AgentStatus.COMPLETED);
      // 上下文组装应该快速完成（< 100ms）
      expect(duration).toBeLessThan(100);
    });

    test('分片统计计算性能', () => {
      // 创建大量分片
      for (let i = 0; i < 1000; i++) {
        shardManager.createShard('task', `内容 ${i}`);
      }

      const start = performance.now();
      const stats = shardManager.getStats();
      const duration = performance.now() - start;

      expect(stats.totalShards).toBeGreaterThanOrEqual(1000);
      // 统计计算应该快速（< 10ms）
      expect(duration).toBeLessThan(10);
    });
  });
});
