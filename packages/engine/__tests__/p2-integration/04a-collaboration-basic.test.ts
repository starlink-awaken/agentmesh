/**
 * P2 集成测试 - 场景4A：三系统协同（基础）
 *
 * 测试Skills + Plugins + DSL三系统协同工作：
 * - DSL定义Agent → Agent调用Skill → Agent使用Plugin
 * - DSL定义的Agent可以引用Skill
 * - 工作流组合：Skill + Plugin协同处理
 * - 错误传播：Plugin错误应该被正确处理
 *
 * @since P2.3
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { AgentRunner } from '../../src/agent-runner.js';
import { DSLCompiler } from '../../src/dsl/compiler.js';
import { DSLParser } from '../../src/dsl/parser.js';
import type { PluginManager } from '../../src/plugin-manager.js';
import type { SkillExecutionRequest } from '../../src/workflow-skills-types.js';
import {
  setupTempDir,
  cleanupTempDir,
  createTestSkill,
  TestIntegrationPlugin,
  SIMPLE_DSL_SOURCE,
} from './fixtures.js';

describe('P2 Integration - 场景4A: 三系统协同（基础）', () => {
  let tempDir: string;
  let agentRunner: AgentRunner;
  let pluginManager: PluginManager;
  let perfMonitor: PerformanceMonitor;

  beforeEach(() => {
    tempDir = setupTempDir();
    agentRunner = new AgentRunner();
    pluginManager = agentRunner.getPluginManager();
  });

  afterEach(async () => {
    // 先释放 AgentRunner（会自动清理 PluginManager）
    try {
      await agentRunner?.dispose();
    } catch {
      // 忽略清理错误
    }
    cleanupTempDir(tempDir);
  });

  test('完整协同: DSL定义Agent → Agent调用Skill → Agent使用Plugin', async () => {
    // 1. 注册 Skill
    const skill = createTestSkill('collaborative.skill');
    await agentRunner.registerSkill(skill);

    // 2. 加载 Plugin
    const plugin = new TestIntegrationPlugin();
    pluginManager.registerPlugin(plugin);
    await agentRunner.activatePlugin('test-integration-plugin');

    // 3. 从 DSL 编译 Agent
    const parser = new DSLParser();
    const parseResult = parser.parse(SIMPLE_DSL_SOURCE, 'collaborative.dsl');

    expect(parseResult.success).toBe(true);

    const compiler = new DSLCompiler();
    const agentDef = compiler.compileToAgentDefinition(parseResult.ast!);

    expect(agentDef.name).toBe('SimpleAgent');

    // 4. 验证三个系统都已就绪
    const skills = await agentRunner.querySkills();
    expect(skills.some((s) => s.metadata.skill_id === 'collaborative.skill')).toBe(
      true,
    );

    expect(pluginManager.getStatus('test-integration-plugin')).toBe('active');

    expect(agentDef).toBeDefined();
    expect(agentDef.name).toBe('SimpleAgent');

    // 5. 执行 Skill
    const skillResult = await agentRunner.executeSkill({
      skill_id: 'collaborative.skill',
      inputs: { data: 'collaborative test data' },
    });

    expect(skillResult.status).toBe('completed');

    // 6. 调用 Plugin
    const pluginResult = await agentRunner.callPlugin(
      'test-integration-plugin',
      'transform',
      'collaborative test',
    );

    expect(pluginResult).toEqual({
      transformed: 'COLLABORATIVE TEST',
      original: 'collaborative test',
    });

    // 7. 验证 Trace ID 关联
    expect(skillResult.trace_id).toBeDefined();
    expect(skillResult.execution_id).toMatch(/^exec-/);
  });

  test('DSL 定义的 Agent 可以引用 Skill', async () => {
    // 注册一个 Skill
    const skill = createTestSkill('agent.dsl.skill');
    await agentRunner.registerSkill(skill);

    // 创建引用 Skill 的 DSL
    const dslWithSkill = `
agent SkillUsingAgent {
  description: "Agent that uses skills"
  type: worker
  layer: L3

  input code: string {
    required: true
  }

  output review: object

  tools: [read, skill:agent.dsl.skill]

  body {
    step process {
      call agent: "self"
      inputs: { code: input.code }
    }
  }

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: true
    max_retries: 2
    token_budget: 5000
  }
}
`;

    const parser = new DSLParser();
    const parseResult = parser.parse(dslWithSkill, 'skill-user.dsl');

    expect(parseResult.success).toBe(true);

    const compiler = new DSLCompiler();
    const agentDef = compiler.compileToAgentDefinition(parseResult.ast!);

    expect(agentDef.tools).toContain('skill:agent.dsl.skill');
    expect(agentDef.embedded_governance.quality_gate_enabled).toBe(true);
  });

  test('工作流组合: Skill + Plugin 协同处理', async () => {
    // 设置 Skill
    const skill = createTestSkill('workflow.skill');
    await agentRunner.registerSkill(skill);

    // 设置 Plugin
    const plugin = new TestIntegrationPlugin();
    pluginManager.registerPlugin(plugin);
    await agentRunner.activatePlugin('test-integration-plugin');

    // 模拟工作流：
    // 1. Plugin 预处理输入
    const preProcess = await agentRunner.callPlugin(
      'test-integration-plugin',
      'transform',
      'raw input',
    );

    // 2. Skill 处理转换后的数据
    const skillResult = await agentRunner.executeSkill({
      skill_id: 'workflow.skill',
      inputs: { data: preProcess.transformed as string },
    });

    // 3. Plugin 后处理结果
    const postProcess = await agentRunner.callPlugin(
      'test-integration-plugin',
      'transform',
      'skill output',
    );

    // 验证工作流完成
    expect(preProcess.transformed).toBe('RAW INPUT');
    expect(skillResult.status).toBe('completed');
    expect(postProcess.transformed).toBe('SKILL OUTPUT');
  });

  test('错误传播: Plugin错误应该被正确处理', async () => {
    const plugin = new TestIntegrationPlugin();
    pluginManager.registerPlugin(plugin);
    await agentRunner.activatePlugin('test-integration-plugin');

    // 调用不存在的方法
    await expect(
      agentRunner.callPlugin('test-integration-plugin', 'nonexistent', {}),
    ).rejects.toThrow('Unknown method');

    // Plugin 应该仍然可用
    const result = await agentRunner.callPlugin(
      'test-integration-plugin',
      'transform',
      'test',
    );

    expect(result).toEqual({
      transformed: 'TEST',
      original: 'test',
    });
  });
});
