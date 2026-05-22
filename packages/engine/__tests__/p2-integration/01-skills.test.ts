/**
 * P2 集成测试 - 场景1：Skill调用流程
 *
 * 测试完整的Skill生命周期：
 * - 注册Skill → 查询Skill → 执行Skill → 验证结果
 * - Skill缓存机制
 * - Agent执行过程中调用Skill
 *
 * @since P2.3
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { AgentRunner } from '../../src/agent-runner.js';
import type {
  SkillExecutionRequest,
} from '../../src/workflow-skills-types.js';
import {
  setupTempDir,
  cleanupTempDir,
  createTestSkill,
  createTestAgentFile,
  PerformanceMonitor,
} from './fixtures.js';

describe('P2 Integration - 场景1: Skill调用流程', () => {
  let tempDir: string;
  let agentRunner: AgentRunner;
  let perfMonitor: PerformanceMonitor;

  beforeEach(() => {
    tempDir = setupTempDir();
    agentRunner = new AgentRunner();
    perfMonitor = new PerformanceMonitor();
  });

  afterEach(async () => {
    // ✅ 先释放 AgentRunner（会自动清理 PluginManager）
    try {
      await agentRunner?.dispose();
    } catch {
      // 忽略清理错误
    }
    cleanupTempDir(tempDir);
  });

  test('完整流程: 注册Skill → 查询Skill → 执行Skill → 验证结果', async () => {
    // 1. 注册 Skill
    const { result: skillId, metrics: registerMetrics } =
      await perfMonitor.measure('skill:register', async () => {
        const skill = createTestSkill('integration.test.skill');
        return await agentRunner.registerSkill(skill);
      });

    expect(skillId).toBe('integration.test.skill');
    expect(registerMetrics.success).toBe(true);

    // 2. 查询 Skill
    const { result: skills, metrics: queryMetrics } =
      await perfMonitor.measure('skill:query', async () => {
        return await agentRunner.querySkills({
          publisher: 'test',
        });
      });

    expect(queryMetrics.success).toBe(true);
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.some((s) => s.metadata.skill_id === 'integration.test.skill')).toBe(
      true,
    );

    // 3. 执行 Skill
    const { result: execResult, metrics: execMetrics } =
      await perfMonitor.measure('skill:execute', async () => {
        const request: SkillExecutionRequest = {
          skill_id: 'integration.test.skill',
          inputs: {
            data: 'test data for skill execution',
          },
        };
        return await agentRunner.executeSkill(request);
      });

    expect(execMetrics.success).toBe(true);
    expect(execResult.status).toBe('completed');
    expect(execResult.skill_id).toBe('integration.test.skill');
    expect(execResult.execution_id).toBeDefined();
    expect(execResult.output).toBeDefined();

    // 4. 验证 Trace ID 关联
    expect(execResult.execution_id).toMatch(/^exec-/);
    expect(execResult.trace_id).toBeDefined();

    // 5. 验证性能
    perfMonitor.assertPerformance('skill:register', 100, 1);
    perfMonitor.assertPerformance('skill:query', 50, 0.5);
    perfMonitor.assertPerformance('skill:execute', 100, 1);
  });

  test('Skill 缓存机制验证', async () => {
    const skill = createTestSkill('cache.test.skill');
    await agentRunner.registerSkill(skill);

    const request: SkillExecutionRequest = {
      skill_id: 'cache.test.skill',
      inputs: { data: 'same input for cache test' },
    };

    // 第一次执行
    const { result: result1, metrics: metrics1 } = await perfMonitor.measure(
      'skill:execute:first',
      () => agentRunner.executeSkill(request),
    );

    expect(result1.status).toBe('completed');

    // 第二次执行相同输入（应该使用缓存）
    const { result: result2, metrics: metrics2 } = await perfMonitor.measure(
      'skill:execute:cached',
      () => agentRunner.executeSkill(request),
    );

    expect(result2.status).toBe('completed');

    // 缓存的执行应该更快或至少不慢于第一次
    expect(metrics2.duration_ms).toBeLessThanOrEqual(metrics1.duration_ms + 10);

    // 不同输入不应该使用缓存
    const differentRequest: SkillExecutionRequest = {
      skill_id: 'cache.test.skill',
      inputs: { data: 'different input' },
    };

    const { result: result3, metrics: metrics3 } = await perfMonitor.measure(
      'skill:execute:different',
      () => agentRunner.executeSkill(differentRequest),
    );

    expect(result3.status).toBe('completed');
    expect(result3.execution_id).not.toBe(result1.execution_id);
  });

  test('Agent 执行过程中调用 Skill', async () => {
    // 注册 Skill
    const skill = createTestSkill('agent.call.skill');
    await agentRunner.registerSkill(skill);

    // 创建使用 Skill 的 Agent
    const agentMarkdown = `---
name: skill-user-agent
description: Agent that uses skills
tools: ['read', 'skill:agent.call.skill']
---

# Skill User Agent

You are an agent that can invoke skills.
`;

    const agentPath = createTestAgentFile(tempDir, 'skill-user', agentMarkdown);
    const definition = agentRunner.parseAgentDefinition(agentPath);

    expect(definition.name).toBe('skill-user-agent');
    expect(definition.tools).toContain('skill:agent.call.skill');
  });
});
