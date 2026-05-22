/**
 * P2 集成测试 - 场景4B：边界条件和错误处理
 *
 * 测试Skills、Plugins和DSL的错误处理：
 * - 处理不存在的Skill
 * - 处理无效的Skill输入
 * - 处理未激活的Plugin
 * - 处理Plugin执行错误
 * - 处理无效的DSL源码
 * - 处理空的DSL
 *
 * @since P2.3
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { AgentRunner } from '../../src/agent-runner.js';
import { DSLParser } from '../../src/dsl/parser.js';
import type { PluginManager } from '../../src/plugin-manager.js';
import {
  setupTempDir,
  cleanupTempDir,
  createTestSkill,
  TestIntegrationPlugin,
} from './fixtures.js';

describe('P2 Integration - 场景4B: 边界条件和错误处理', () => {
  let tempDir: string;
  let agentRunner: AgentRunner;
  let pluginManager: PluginManager;

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

  test('处理不存在的 Skill', async () => {
    const result = await agentRunner.executeSkill({
      skill_id: 'nonexistent.skill',
      inputs: {},
    });

    expect(result.status).toBe('failed');
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe('SKILL_NOT_FOUND');
  });

  test('处理无效的 Skill 输入', async () => {
    const skill = createTestSkill('validation.test.skill');
    await agentRunner.registerSkill(skill);

    const result = await agentRunner.executeSkill({
      skill_id: 'validation.test.skill',
      inputs: {}, // 缺少必需的 'data' 参数
    });

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  test('处理未激活的 Plugin', async () => {
    const plugin = new TestIntegrationPlugin();
    pluginManager.registerPlugin(plugin);
    // 不激活插件

    await expect(
      agentRunner.callPlugin('test-integration-plugin', 'transform', 'test'),
    ).rejects.toThrow();
  });

  test('处理 Plugin 执行错误', async () => {
    const plugin = new TestIntegrationPlugin();
    pluginManager.registerPlugin(plugin);
    await agentRunner.activatePlugin('test-integration-plugin');

    // 调用会抛出错误的方法
    await expect(
      agentRunner.callPlugin('test-integration-plugin', 'transform', 123), // 错误的类型
    ).rejects.toThrow();
  });

  test('处理无效的 DSL 源码', () => {
    const parser = new DSLParser();
    const result = parser.parse('invalid dsl syntax here', 'invalid.dsl');

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  test('处理空的 DSL', () => {
    const parser = new DSLParser();
    const result = parser.parse('', 'empty.dsl');

    expect(result.success).toBe(false);
  });
});
