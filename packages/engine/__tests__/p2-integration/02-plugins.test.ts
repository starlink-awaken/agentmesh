/**
 * P2 集成测试 - 场景2：Plugin扩展流程
 *
 * 测试完整的Plugin生命周期：
 * - 注册Plugin → 激活Plugin → 调用方法 → 验证结果
 * - Plugin沙箱隔离
 * - Plugin生命周期管理
 * - Agent预处理和后处理集成
 *
 * @since P2.3
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { AgentRunner } from '../../src/agent-runner.js';
import type { PluginManager } from '../../src/plugin-manager.js';
import {
  setupTempDir,
  cleanupTempDir,
  TestIntegrationPlugin,
  PerformanceMonitor,
} from './fixtures.js';

describe('P2 Integration - 场景2: Plugin扩展流程', () => {
  let tempDir: string;
  let agentRunner: AgentRunner;
  let pluginManager: PluginManager;
  let perfMonitor: PerformanceMonitor;

  beforeEach(() => {
    tempDir = setupTempDir();
    agentRunner = new AgentRunner();
    pluginManager = agentRunner.getPluginManager();
    perfMonitor = new PerformanceMonitor();
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

  test('完整流程: 加载Plugin → 激活Plugin → 调用方法 → 验证结果', async () => {
    const plugin = new TestIntegrationPlugin();

    // 1. 注册 Plugin
    const { metrics: registerMetrics } = await perfMonitor.measure(
      'plugin:register',
      () => {
        pluginManager.registerPlugin(plugin);
      },
    );

    expect(registerMetrics.success).toBe(true);
    expect(pluginManager.hasPlugin('test-integration-plugin')).toBe(true);

    // 2. 激活 Plugin
    const { metrics: activateMetrics } = await perfMonitor.measure(
      'plugin:activate',
      async () => {
        await agentRunner.activatePlugin('test-integration-plugin');
      },
    );

    expect(activateMetrics.success).toBe(true);
    expect(plugin.initialized).toBe(true);
    expect(plugin.started).toBe(true);
    expect(pluginManager.getStatus('test-integration-plugin')).toBe('active');

    // 3. 调用 Plugin 方法
    const { result: transformResult, metrics: callMetrics1 } =
      await perfMonitor.measure('plugin:call:transform', async () => {
        return await agentRunner.callPlugin(
          'test-integration-plugin',
          'transform',
          'hello world',
        );
      });

    expect(callMetrics1.success).toBe(true);
    expect(transformResult).toEqual({
      transformed: 'HELLO WORLD',
      original: 'hello world',
    });

    // 4. 测试数值计算方法
    const { result: calcResult, metrics: callMetrics2 } =
      await perfMonitor.measure('plugin:call:calculate', async () => {
        return await agentRunner.callPlugin(
          'test-integration-plugin',
          'calculate',
          21,
        );
      });

    expect(callMetrics2.success).toBe(true);
    expect(calcResult).toEqual({ result: 42, original: 21 });

    // 5. 验证性能
    perfMonitor.assertPerformance('plugin:register', 50, 0.5);
    perfMonitor.assertPerformance('plugin:activate', 100, 1);
    perfMonitor.assertPerformance('plugin:call:transform', 50, 0.5);
  });

  test('Plugin 沙箱隔离验证', async () => {
    const plugin = new TestIntegrationPlugin();
    pluginManager.registerPlugin(plugin);
    await agentRunner.activatePlugin('test-integration-plugin');

    // 验证权限检查
    expect(pluginManager.hasPermission('test-integration-plugin', 'read:agents')).toBe(
      true,
    );
    expect(pluginManager.hasPermission('test-integration-plugin', 'delete:projects')).toBe(
      false,
    );

    // 尝试未授权操作应该抛出错误
    expect(() => {
      pluginManager.checkPermission('test-integration-plugin', 'delete:projects');
    }).toThrow('Permission denied');
  });

  test('Plugin 生命周期管理', async () => {
    const plugin = new TestIntegrationPlugin();
    pluginManager.registerPlugin(plugin);

    // 初始状态
    expect(pluginManager.getStatus('test-integration-plugin')).toBe('registered');
    expect(plugin.callLog).toEqual([]);

    // 初始化
    await pluginManager.initializePlugin('test-integration-plugin');
    expect(pluginManager.getStatus('test-integration-plugin')).toBe('loaded');
    expect(plugin.callLog).toContain('initialize');

    // 启动
    await pluginManager.startPlugin('test-integration-plugin');
    expect(pluginManager.getStatus('test-integration-plugin')).toBe('active');
    expect(plugin.callLog).toContain('start');

    // 停止
    await pluginManager.stopPlugin('test-integration-plugin');
    expect(pluginManager.getStatus('test-integration-plugin')).toBe('loaded');
    expect(plugin.callLog).toContain('stop');

    // 卸载
    await pluginManager.unloadPlugin('test-integration-plugin');
    expect(pluginManager.hasPlugin('test-integration-plugin')).toBe(false);
    expect(plugin.callLog).toContain('cleanup');
  });

  test('Agent 预处理和后处理集成', async () => {
    const plugin = new TestIntegrationPlugin();
    pluginManager.registerPlugin(plugin);
    await agentRunner.activatePlugin('test-integration-plugin');

    // 模拟 Agent 预处理
    const preProcessResult = await agentRunner.callPlugin(
      'test-integration-plugin',
      'transform',
      'input data',
    );

    expect(preProcessResult).toEqual({
      transformed: 'INPUT DATA',
      original: 'input data',
    });

    // 模拟 Agent 后处理
    const postProcessResult = await agentRunner.callPlugin(
      'test-integration-plugin',
      'transform',
      'output data',
    );

    expect(postProcessResult).toEqual({
      transformed: 'OUTPUT DATA',
      original: 'output data',
    });
  });
});
