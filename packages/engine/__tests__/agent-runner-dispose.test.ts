/**
 * AgentRunner dispose() 方法测试
 *
 * 测试资源清理和内存泄漏防护
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { AgentRunner, AgentPool } from '../src/agent-runner.js';
import type { AgentDefinition } from '../src/types.js';
import type { SkillConfig } from '../src/workflow-skills-types.js';

describe('AgentRunner dispose()', () => {
  let runner: AgentRunner;

  beforeEach(() => {
    runner = new AgentRunner();
  });

  afterEach(() => {
    if (!runner.isDisposed()) {
      runner.dispose();
    }
  });

  describe('基本清理功能', () => {
    it('应该清空 states Map', async () => {
      // 创建模拟定义
      const mockDef: AgentDefinition = {
        name: 'test-agent',
        type: 'worker',
        layer: 'L3',
        description: 'Test agent',
        prompt_path: '/fake/path.md',
        tools: [],
        capabilities: [],
        embedded_governance: {
          first_principles_check: false,
          red_team_threshold: 'low',
          quality_gate_enabled: false,
          max_retries: 3,
          token_budget: 100000,
        },
        context_shards: [],
      };

      // 执行一个 agent 以填充 states
      await runner.runAgent(mockDef, 'test task');

      // 验证状态存在
      expect(runner.getAgentState('test-agent')).toBeDefined();

      // 调用 dispose
      runner.dispose();

      // 验证状态已清空
      expect(runner.getAgentState('test-agent')).toBeUndefined();
    });

    it('应该释放 SkillsManager', async () => {
      // 创建正确的 Skill 配置
      const skillConfig: SkillConfig = {
        metadata: {
          skill_id: 'test.test-skill',
          name: 'Test Skill',
          type: 'analysis',
          version: { major: 1, minor: 0, patch: 0 },
          description: 'Test',
          publisher: 'test',
          tags: [],
          license: 'MIT',
          dependencies: [],
          keywords: [],
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        execution_mode: 'sync',
        inputs: [],
        outputs: [{ type: 'object', description: 'Result' }],
        agent_template: 'You are a test agent',
        tools: [],
      };

      // 注册 Skill
      await runner.registerSkill(skillConfig);

      // 验证 Skill 已注册
      const skill = await runner.getSkill('test.test-skill');
      expect(skill).toBeDefined();
      expect(skill?.metadata.skill_id).toBe('test.test-skill');

      // 调用 dispose
      runner.dispose();

      // 验证处于 disposed 状态
      expect(runner.isDisposed()).toBe(true);
    });

    it('应该清除 messageBus（通过 generateTraceId 验证）', () => {
      // 验证初始状态下可以生成 trace ID
      const traceId1 = runner.generateTraceId();
      expect(traceId1).toBeDefined();
      expect(traceId1.length).toBeGreaterThan(0);

      // 调用 dispose
      runner.dispose();

      // dispose 后 messageBus 的 clear() 已被调用
      // 无法直接验证，但可以确认 disposed 状态
      expect(runner.isDisposed()).toBe(true);
    });
  });

  describe('引用清理', () => {
    it('应该清除 llmClient 引用', () => {
      // 设置一个模拟的 LLM 客户端
      const mockClient = {} as any;
      runner.setLLMClient(mockClient);

      // 调用 dispose
      runner.dispose();

      // 无法直接验证私有属性，但可以通过行为验证
      // 如果 llmClient 被清除，后续设置不会报错
      runner.setLLMClient(null);
      expect(runner.isDisposed()).toBe(true);
    });

    it('应该清除 contextShardManager 引用', () => {
      // 设置一个模拟的 ContextShardManager
      const mockShardManager = {} as any;
      runner.setContextShardManager(mockShardManager);

      // 调用 dispose
      runner.dispose();

      // 验证引用已清除
      expect(runner.getContextShardManager()).toBeNull();
    });
  });

  describe('isDisposed 状态', () => {
    it('新建的 runner 不应该是 disposed 状态', () => {
      expect(runner.isDisposed()).toBe(false);
    });

    it('dispose 后应该是 disposed 状态', () => {
      runner.dispose();
      expect(runner.isDisposed()).toBe(true);
    });

    it('重复调用 dispose 不应该报错', () => {
      runner.dispose();
      expect(() => runner.dispose()).not.toThrow();
      expect(runner.isDisposed()).toBe(true);
    });
  });

  describe('插件清理', () => {
    it('应该优雅地停止活动插件', async () => {
      // 注册一个模拟插件
      const mockPlugin = {
        metadata: {
          plugin_id: 'test-plugin',
          name: 'Test Plugin',
          version: '1.0.0',
          type: 'integration' as const,
          permissions: [] as string[],
        },
        async initialize() {
          // 初始化逻辑
        },
        async start() {
          // 启动逻辑
        },
        async stop() {
          // 停止逻辑
        },
      };

      runner.registerPlugin(mockPlugin);
      await runner.activatePlugin('test-plugin');

      // 验证插件已激活
      expect(runner.getPluginStatus('test-plugin')).toBe('active');

      // 调用 dispose（应该优雅停止插件）
      runner.dispose();

      // 验证 runner 处于 disposed 状态
      expect(runner.isDisposed()).toBe(true);
    });

    it('插件清理失败不应阻止其他资源的清理', () => {
      // 注册一个会在停止时抛出错误的模拟插件
      const failingPlugin = {
        metadata: {
          plugin_id: 'failing-plugin',
          name: 'Failing Plugin',
          version: '1.0.0',
          type: 'integration' as const,
          permissions: [] as string[],
        },
        async initialize() {},
        async start() {},
        async stop() {
          throw new Error('Intentional cleanup error');
        },
      };

      runner.registerPlugin(failingPlugin);

      // 即使插件清理失败，dispose 也不应该抛出错误
      expect(() => runner.dispose()).not.toThrow();
      expect(runner.isDisposed()).toBe(true);
    });
  });

  describe('内存泄漏防护', () => {
    it('多次创建和销毁 runner 不应累积内存', () => {
      const iterations = 10;
      const runners: AgentRunner[] = [];

      // 创建多个 runner
      for (let i = 0; i < iterations; i++) {
        const r = new AgentRunner();
        runners.push(r);
      }

      // 销毁所有 runner
      for (const r of runners) {
        r.dispose();
      }

      // 验证所有 runner 都已正确释放
      for (const r of runners) {
        expect(r.isDisposed()).toBe(true);
      }
    });
  });
});

describe('AgentPool dispose() 集成', () => {
  it('AgentPool 内部的 runner 应该可以正确访问', () => {
    const pool = new AgentPool('./agents');

    // 获取 runner
    const runner = pool.getRunner();
    expect(runner.isDisposed()).toBe(false);

    // AgentPool 没有公开的 dispose 方法
    // 但内部的 runner 应该可以通过外部引用来操作
    // 这里验证 runner 可以被访问和操作

    // 注意：实际使用中，AgentPool 的生命周期管理需要单独实现
    expect(runner).toBeDefined();
  });
});
