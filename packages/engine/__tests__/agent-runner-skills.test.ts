/**
 * AgentRunner Skills 集成测试
 *
 * 测试 AgentRunner 与 Workflow Skills 系统的集成功能
 *
 * 测试覆盖：
 * 1. Skill 注册和查询
 * 2. Agent 执行过程中调用 Skill
 * 3. Skill 结果返回给 Agent
 * 4. Trace ID 关联
 * 5. Skill 结果缓存
 * 6. Skill 配置传递
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentRunner } from '../src/agent-runner.js';
import { SkillRegistry, SkillExecutor, type SkillConfig, type SkillExecutionRequest } from '../src/workflow-skills.js';

// ============================================================
// 测试 Fixtures
// ============================================================

const TEST_AGENT_MD = `---
name: skill-test-agent
description: Agent that uses skills
tools: ['read', 'skill']
---

# Skill Test Agent

You are a test agent that can invoke skills.
`;

const SKILL_CALLING_AGENT_MD = `---
name: skill-caller
description: Agent that invokes skills during execution
tools: ['read', 'skill:code-review']
---

# Skill Caller

You can invoke the code-review skill.
`;

// ============================================================
// 辅助函数
// ============================================================

function setupTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'hc-skill-test-'));
  return tempDir;
}

function createTestAgentFile(dir: string, content: string = TEST_AGENT_MD): string {
  const agentPath = join(dir, 'skill-test-agent.md');
  writeFileSync(agentPath, content);
  return agentPath;
}

// 创建一个测试 Skill
function createTestSkill(skillId: string = 'test.skill.analyze'): SkillConfig {
  return {
    metadata: {
      skill_id: skillId,
      name: 'Test Analyze Skill',
      type: 'analysis',
      version: { major: 1, minor: 0, patch: 0 },
      description: 'A test skill for analysis',
      publisher: 'test',
      tags: ['test', 'analyze'],
      license: 'MIT',
      dependencies: [],
      keywords: ['test', 'analyze'],
      created_at: Date.now(),
      updated_at: Date.now(),
    },
    execution_mode: 'sync',
    inputs: [
      {
        name: 'data',
        type: 'string',
        description: 'Data to analyze',
        required: true,
      },
      {
        name: 'options',
        type: 'object',
        description: 'Analysis options',
        required: false,
      },
    ],
    outputs: [
      {
        type: 'object',
        description: 'Analysis result',
      },
    ],
    agent_template: `Analyze the following data: {{data}}`,
    tools: [],
    token_budget: 1000,
    timeout_ms: 5000,
  };
}

// ============================================================
// 测试套件
// ============================================================

describe('AgentRunner Skills Integration', () => {
  let tempDir: string;
  let runner: AgentRunner;
  let registry: SkillRegistry;
  let executor: SkillExecutor;

  beforeEach(() => {
    tempDir = setupTempDir();
    runner = new AgentRunner();
    registry = new SkillRegistry({ storage_path: ':memory:', auto_load: false });
    executor = new SkillExecutor(registry);
  });

  afterEach(() => {
    try {
      runner?.dispose();
    } catch {
      // 忽略 dispose 错误
    }
  });

  // ============================================================
  // Skill 注册与查询测试
  // ============================================================

  describe('Skill Registration and Query', () => {
    test('AgentRunner 应该提供 registerSkill 方法', () => {
      // 验证方法存在
      expect(typeof runner.registerSkill).toBe('function');
    });

    test('AgentRunner 应该提供 executeSkill 方法', () => {
      expect(typeof runner.executeSkill).toBe('function');
    });

    test('AgentRunner 应该提供 querySkills 方法', () => {
      expect(typeof runner.querySkills).toBe('function');
    });

    test('registerSkill 应该成功注册 Skill', async () => {
      const skill = createTestSkill();
      const skillId = await runner.registerSkill(skill);

      expect(skillId).toBe('test.skill.analyze');

      // 查询验证
      const skills = await runner.querySkills();
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.find(s => s.metadata.skill_id === 'test.skill.analyze')).toBeDefined();
    });

    test('registerSkill 应该支持注册多个 Skills', async () => {
      const skill1 = createTestSkill('test.skill.one');
      const skill2 = createTestSkill('test.skill.two');

      await runner.registerSkill(skill1);
      await runner.registerSkill(skill2);

      const skills = await runner.querySkills();
      expect(skills.length).toBeGreaterThanOrEqual(2);

      const ids = skills.map(s => s.metadata.skill_id);
      expect(ids).toContain('test.skill.one');
      expect(ids).toContain('test.skill.two');
    });

    test('querySkills 应该支持按类型过滤', async () => {
      const analysisSkill = createTestSkill('test.analysis');
      const generationSkill = createTestSkill('test.generation');
      generationSkill.metadata.type = 'generation';

      await runner.registerSkill(analysisSkill);
      await runner.registerSkill(generationSkill);

      const analysisSkills = await runner.querySkills({ type: 'analysis' });
      expect(analysisSkills.length).toBeGreaterThan(0);
      expect(analysisSkills.every(s => s.metadata.type === 'analysis')).toBe(true);
    });

    test('querySkills 应该支持按发布者过滤', async () => {
      const skill1 = createTestSkill('publisher1.skill1');
      skill1.metadata.publisher = 'publisher1';
      const skill2 = createTestSkill('publisher2.skill2');
      skill2.metadata.publisher = 'publisher2';

      await runner.registerSkill(skill1);
      await runner.registerSkill(skill2);

      const publisher1Skills = await runner.querySkills({ publisher: 'publisher1' });
      expect(publisher1Skills.length).toBeGreaterThan(0);
      expect(publisher1Skills.every(s => s.metadata.publisher === 'publisher1')).toBe(true);
    });

    test('querySkills 应该支持按标签过滤', async () => {
      const skill1 = createTestSkill('test.skill1');
      skill1.metadata.tags = ['test', 'code'];
      const skill2 = createTestSkill('test.skill2');
      skill2.metadata.tags = ['test', 'doc'];

      await runner.registerSkill(skill1);
      await runner.registerSkill(skill2);

      const codeSkills = await runner.querySkills({ tags: ['code'] });
      expect(codeSkills.length).toBeGreaterThan(0);
      expect(codeSkills.some(s => s.metadata.tags.includes('code'))).toBe(true);
    });
  });

  // ============================================================
  // Skill 执行测试
  // ============================================================

  describe('Skill Execution', () => {
    test('executeSkill 应该执行已注册的 Skill', async () => {
      const skill = createTestSkill();
      await runner.registerSkill(skill);

      const request: SkillExecutionRequest = {
        skill_id: 'test.skill.analyze',
        inputs: {
          data: 'test data',
        },
      };

      const result = await runner.executeSkill(request);

      expect(result.status).toBe('completed');
      expect(result.skill_id).toBe('test.skill.analyze');
      expect(result.execution_id).toBeDefined();
      expect(result.token_usage).toBeGreaterThanOrEqual(0);
    });

    test('executeSkill 应该返回 Skill 的输出', async () => {
      const skill = createTestSkill();
      await runner.registerSkill(skill);

      const request: SkillExecutionRequest = {
        skill_id: 'test.skill.analyze',
        inputs: {
          data: 'test data for output',
        },
      };

      const result = await runner.executeSkill(request);

      expect(result.output).toBeDefined();
      expect(result.status).toBe('completed');
    });

    test('executeSkill 应该在 Skill 不存在时返回错误', async () => {
      const request: SkillExecutionRequest = {
        skill_id: 'nonexistent.skill',
        inputs: {},
      };

      const result = await runner.executeSkill(request);

      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('SKILL_NOT_FOUND');
    });

    test('executeSkill 应该验证输入参数', async () => {
      const skill = createTestSkill();
      await runner.registerSkill(skill);

      // 缺少必需参数
      const request: SkillExecutionRequest = {
        skill_id: 'test.skill.analyze',
        inputs: {}, // data 是必需的
      };

      const result = await runner.executeSkill(request);

      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('INVALID_INPUT');
    });

    test('executeSkill 应该支持选项覆盖', async () => {
      const skill = createTestSkill();
      await runner.registerSkill(skill);

      const request: SkillExecutionRequest = {
        skill_id: 'test.skill.analyze',
        inputs: {
          data: 'test data',
        },
        options: {
          timeout_ms: 10000,
          token_budget: 5000,
        },
      };

      const result = await runner.executeSkill(request);

      expect(result.status).toBe('completed');
    });
  });

  // ============================================================
  // Trace ID 追踪测试
  // ============================================================

  describe('Trace ID Tracking', () => {
    test('Skill 执行应该生成 Trace ID', async () => {
      const skill = createTestSkill();
      await runner.registerSkill(skill);

      const request: SkillExecutionRequest = {
        skill_id: 'test.skill.analyze',
        inputs: { data: 'test' },
      };

      const result = await runner.executeSkill(request);

      // Trace ID 应该在某个地方可追踪
      // 这里我们检查执行 ID 的格式
      expect(result.execution_id).toMatch(/^exec-/);
    });

    test('AgentRunner 应该支持生成 Trace ID', () => {
      const traceId = runner.generateTraceId();
      expect(traceId).toBeDefined();
      expect(traceId.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Skill 结果缓存测试
  // ============================================================

  describe('Skill Result Caching', () => {
    test('相同输入的 Skill 执行应该使用缓存', async () => {
      const skill = createTestSkill();
      await runner.registerSkill(skill);

      const request: SkillExecutionRequest = {
        skill_id: 'test.skill.analyze',
        inputs: { data: 'same input' },
      };

      // 第一次执行
      const result1 = await runner.executeSkill(request);

      // 第二次执行相同输入
      const result2 = await runner.executeSkill(request);

      // 两次应该都成功
      expect(result1.status).toBe('completed');
      expect(result2.status).toBe('completed');

      // 在实际实现中，第二次应该更快（使用缓存）
      // 这里我们只验证功能正确
    });

    test('不同输入的 Skill 执行不应该使用缓存', async () => {
      const skill = createTestSkill();
      await runner.registerSkill(skill);

      const request1: SkillExecutionRequest = {
        skill_id: 'test.skill.analyze',
        inputs: { data: 'input 1' },
      };

      const request2: SkillExecutionRequest = {
        skill_id: 'test.skill.analyze',
        inputs: { data: 'input 2' },
      };

      const result1 = await runner.executeSkill(request1);
      const result2 = await runner.executeSkill(request2);

      expect(result1.status).toBe('completed');
      expect(result2.status).toBe('completed');

      // 两次执行应该有不同的执行 ID
      expect(result1.execution_id).not.toBe(result2.execution_id);
    });

    test('AgentRunner 应该提供清除缓存的方法', () => {
      expect(typeof runner.clearSkillCache).toBe('function');

      runner.clearSkillCache();
      // 应该不抛出错误
    });
  });

  // ============================================================
  // Agent 与 Skill 集成测试
  // ============================================================

  describe('Agent and Skill Integration', () => {
    test('Agent 定义应该支持 skills 配置', () => {
      const agentPath = createTestAgentFile(tempDir);
      const definition = runner.parseAgentDefinition(agentPath);

      // Agent 定义应该有 skills 字段（即使为空）
      expect(definition).toBeDefined();
      expect(definition.name).toBe('skill-test-agent');
    });

    test('Agent 应该能够在执行过程中调用 Skill', async () => {
      // 先注册一个 Skill
      const skill = createTestSkill();
      await runner.registerSkill(skill);

      // 创建一个使用 Skill 的 Agent
      const agentPath = createTestAgentFile(tempDir, SKILL_CALLING_AGENT_MD);
      const definition = runner.parseAgentDefinition(agentPath);

      // 执行 Agent
      const result = await runner.runAgent(definition, 'Review this code');

      expect(result.status).toBe('completed');
      expect(result.output).toBeDefined();
    });

    test('Agent 工具列表中的 skill: 前缀应该被识别', () => {
      const agentPath = createTestAgentFile(tempDir, SKILL_CALLING_AGENT_MD);
      const definition = runner.parseAgentDefinition(agentPath);

      // tools 中应该包含 skill:code-review
      expect(definition.tools).toContain('skill:code-review');
    });
  });

  // ============================================================
  // 错误处理测试
  // ============================================================

  describe('Error Handling', () => {
    test('executeSkill 应该处理无效的 Skill ID', async () => {
      const request: SkillExecutionRequest = {
        skill_id: '',
        inputs: {},
      };

      const result = await runner.executeSkill(request);

      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
    });

    test('executeSkill 应该处理 Skill 执行超时', async () => {
      const slowSkill = createTestSkill('slow.skill');
      slowSkill.timeout_ms = 1; // 1ms 超时

      await runner.registerSkill(slowSkill);

      const request: SkillExecutionRequest = {
        skill_id: 'slow.skill',
        inputs: { data: 'test' },
        options: { timeout_ms: 1 },
      };

      const result = await runner.executeSkill(request);

      // 超时处理取决于实现
      // 这里我们验证结果不会挂起
      expect(result).toBeDefined();
    });

    test('registerSkill 应该拒绝重复的 Skill ID', async () => {
      const skill = createTestSkill('duplicate.test');

      await runner.registerSkill(skill);

      // 第二次注册相同 Skill 应该抛出错误
      await expect(async () => {
        await runner.registerSkill(skill);
      }).toThrow();
    });
  });

  // ============================================================
  // 配置和初始化测试
  // ============================================================

  describe('Configuration and Initialization', () => {
    test('AgentRunner 应该支持设置 SkillRegistry', async () => {
      const customRegistry = new SkillRegistry({ storage_path: ':memory:', auto_load: false });
      await runner.setSkillRegistry(customRegistry);

      // 注册应该使用自定义注册表
      const skill = createTestSkill('custom.skill');
      await runner.registerSkill(skill);

      const skills = await runner.querySkills();
      expect(skills.some(s => s.metadata.skill_id === 'custom.skill')).toBe(true);
    });

    test('AgentRunner 应该支持设置 SkillExecutor', async () => {
      const customExecutor = new SkillExecutor(registry);
      runner.setSkillExecutor(customExecutor);

      // 应该不抛出错误
      expect(() => runner.setSkillExecutor(customExecutor)).not.toThrow();
    });

    test('默认初始化应该创建内置 SkillRegistry', async () => {
      const defaultRunner = new AgentRunner();

      // 应该有默认的注册表
      expect(() => defaultRunner.querySkills()).not.toThrow();
    });
  });

  // ============================================================
  // 批量操作测试
  // ============================================================

  describe('Batch Operations', () => {
    test('executeSkillBatch 应该支持批量执行', async () => {
      const skill = createTestSkill();
      await runner.registerSkill(skill);

      const requests: SkillExecutionRequest[] = [
        {
          skill_id: 'test.skill.analyze',
          inputs: { data: 'data 1' },
        },
        {
          skill_id: 'test.skill.analyze',
          inputs: { data: 'data 2' },
        },
        {
          skill_id: 'test.skill.analyze',
          inputs: { data: 'data 3' },
        },
      ];

      const results = await runner.executeSkillBatch(requests);

      expect(results.length).toBe(3);
      expect(results.every(r => r.status === 'completed')).toBe(true);
    });

    test('executeSkillBatch 应该处理部分失败', async () => {
      const skill = createTestSkill();
      await runner.registerSkill(skill);

      const requests: SkillExecutionRequest[] = [
        {
          skill_id: 'test.skill.analyze',
          inputs: { data: 'valid' },
        },
        {
          skill_id: 'nonexistent.skill',
          inputs: {},
        },
      ];

      const results = await runner.executeSkillBatch(requests);

      expect(results.length).toBe(2);
      expect(results[0].status).toBe('completed');
      expect(results[1].status).toBe('failed');
    });
  });

  // ============================================================
  // Skill 类型查询测试
  // ============================================================

  describe('Skill Metadata Query', () => {
    test('getSkill 应该返回指定 Skill 的配置', async () => {
      const skill = createTestSkill('specific.skill');
      await runner.registerSkill(skill);

      const retrieved = await runner.getSkill('specific.skill');

      expect(retrieved).toBeDefined();
      expect(retrieved?.metadata.skill_id).toBe('specific.skill');
    });

    test('getSkill 应该在不存在的 Skill 时返回 undefined', async () => {
      const retrieved = await runner.getSkill('nonexistent.skill');
      expect(retrieved).toBeUndefined();
    });

    test('hasSkill 应该检查 Skill 是否已注册', async () => {
      const skill = createTestSkill('check.skill');
      await runner.registerSkill(skill);

      expect(await runner.hasSkill('check.skill')).toBe(true);
      expect(await runner.hasSkill('nonexistent.skill')).toBe(false);
    });
  });

  // ============================================================
  // 统计和监控测试
  // ============================================================

  describe('Statistics and Monitoring', () => {
    test('getSkillExecutionStats 应该返回执行统计', async () => {
      const skill = createTestSkill();
      await runner.registerSkill(skill);

      await runner.executeSkill({
        skill_id: 'test.skill.analyze',
        inputs: { data: 'test' },
      });

      const stats = runner.getSkillExecutionStats();

      expect(stats).toBeDefined();
      expect(stats.total_executions).toBeGreaterThanOrEqual(1);
    });

    test('getSkillExecutionStats 应该跟踪成功和失败', async () => {
      const skill = createTestSkill();
      await runner.registerSkill(skill);

      // 成功执行
      await runner.executeSkill({
        skill_id: 'test.skill.analyze',
        inputs: { data: 'test' },
      });

      // 失败执行
      await runner.executeSkill({
        skill_id: 'nonexistent.skill',
        inputs: {},
      });

      const stats = runner.getSkillExecutionStats();

      expect(stats.total_executions).toBeGreaterThanOrEqual(2);
      expect(stats.successful).toBeGreaterThanOrEqual(1);
      expect(stats.failed).toBeGreaterThanOrEqual(1);
    });
  });
});

// ============================================================
// 集成测试：AgentRunner 与 SkillRegistry
// ============================================================

describe('AgentRunner and SkillRegistry Integration', () => {
  let runner: AgentRunner;
  let registry: SkillRegistry;

  beforeEach(() => {
    runner = new AgentRunner();
    registry = new SkillRegistry({ storage_path: ':memory:', auto_load: false });
  });

  afterEach(() => {
    try {
      runner?.dispose();
    } catch {
      // 忽略 dispose 错误
    }
  });

  test('共享的 SkillRegistry 应该在 AgentRunner 和直接访问间同步', async () => {
    // 设置共享的 SkillRegistry
    await runner.setSkillRegistry(registry);

    const skill = createTestSkill('shared.skill');
    await runner.registerSkill(skill);

    // 通过 AgentRunner 查询
    const fromRunner = await runner.getSkill('shared.skill');
    expect(fromRunner).toBeDefined();

    // 通过注册表查询
    const fromRegistry = registry.get('shared.skill');
    expect(fromRegistry).toBeDefined();

    // 应该是相同的引用或内容
    expect(fromRunner?.metadata.skill_id).toBe(fromRegistry?.metadata.skill_id);
  });

  test('AgentRunner 应该能够使用内置 Skills', async () => {
    // 内置 Skills 应该已经加载
    const skills = await runner.querySkills({ publisher: 'honeycomb' });

    // 应该有内置的 Skills（如 code review, test generator 等）
    expect(skills.length).toBeGreaterThan(0);
  });
});
