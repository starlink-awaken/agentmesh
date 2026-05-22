/**
 * AgentRunner-Plugins 集成测试
 *
 * 测试 AgentRunner 与 PluginManager 的集成功能：
 * - PluginManager 在 AgentRunner 初始化时创建
 * - loadPlugin/activatePlugin/callPlugin 方法
 * - Agent 调用插件方法
 * - 沙箱隔离验证
 * - 插件生命周期管理
 * - MessageBus 记录插件事件
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { AgentRunner } from '../src/agent-runner.js';
import { PluginManager } from '../src/plugin-manager.js';
import { createLogger, type Logger } from '../src/logger.js';
import { MessageBus } from '../src/message-bus.js';
import type {
  PluginMetadata,
  HoneycombPlugin,
  PluginContext,
  PluginManifest,
  AgentDefinition,
} from '../src/plugin-types.js';

// ============================================================
// Mock Plugin 实现
// ============================================================

class TestAgentPlugin implements HoneycombPlugin {
  metadata: PluginMetadata = {
    plugin_id: 'test-agent-plugin',
    name: 'Test Agent Plugin',
    type: 'agent',
    version: '1.0.0',
    honeycomb_version: '>=2.0.0',
    description: 'A test plugin for AgentRunner integration',
    permissions: ['read:agents', 'write:agents'],
  };

  callLog: string[] = [];
  initialized = false;
  started = false;

  async initialize(context: PluginContext): Promise<void> {
    this.initialized = true;
    this.callLog.push('initialize');
  }

  async start(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Plugin not initialized');
    }
    this.started = true;
    this.callLog.push('start');
  }

  async stop(): Promise<void> {
    this.started = false;
    this.callLog.push('stop');
  }

  async handle(method: string, params: unknown): Promise<unknown> {
    this.callLog.push(`handle:${method}`);

    switch (method) {
      case 'echo':
        return params;
      case 'double':
        if (typeof params === 'number') {
          return params * 2;
        }
        throw new Error('double expects a number');
      case 'uppercase':
        if (typeof params === 'string') {
          return params.toUpperCase();
        }
        throw new Error('uppercase expects a string');
      case 'agent:pre-process':
        // 模拟 Agent 预处理
        return { processed: true, original: params };
      case 'agent:post-process':
        // 模拟 Agent 后处理
        return { processed: true, result: params };
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  async cleanup(): Promise<void> {
    this.callLog.push('cleanup');
  }
}

class TestSandboxPlugin implements HoneycombPlugin {
  metadata: PluginMetadata = {
    plugin_id: 'test-sandbox-plugin',
    name: 'Test Sandbox Plugin',
    type: 'custom',
    version: '1.0.0',
    honeycomb_version: '>=2.0.0',
    description: 'A test plugin for sandbox validation',
    permissions: ['fs:read'],
    sandbox_policy: {
      enabled: true,
      filesystem: {
        allow_read: ['/tmp', './output'],
        deny_paths: ['/etc', '/root'],
      },
      network: {
        allow_network: false,
      },
    },
  };

  async initialize(): Promise<void> {
    // Empty
  }

  async start(): Promise<void> {
    // Empty
  }

  async stop(): Promise<void> {
    // Empty
  }

  async handle(method: string, params: unknown): Promise<unknown> {
    if (method === 'get-policy') {
      return this.metadata.sandbox_policy;
    }
    throw new Error(`Unknown method: ${method}`);
  }
}

// ============================================================
// 测试环境设置
// ============================================================

describe('AgentRunner-Plugins 集成', () => {
  let agentRunner: AgentRunner;
  let mockLogger: Logger;
  let pluginManager: PluginManager;
  let pluginEvents: Array<{ event: string; pluginId: string }> = [];

  beforeEach(() => {
    mockLogger = createLogger({ level: 'info' });
    agentRunner = new AgentRunner();
    pluginManager = agentRunner.getPluginManager();
    pluginEvents = [];

    // 订阅插件事件
    pluginManager.on('plugin:registered', (data) => {
      pluginEvents.push({ event: 'plugin:registered', pluginId: data.pluginId });
    });
    pluginManager.on('plugin:loaded', (data) => {
      pluginEvents.push({ event: 'plugin:loaded', pluginId: data.pluginId });
    });
    pluginManager.on('plugin:started', (data) => {
      pluginEvents.push({ event: 'plugin:started', pluginId: data.pluginId });
    });
    pluginManager.on('plugin:stopped', (data) => {
      pluginEvents.push({ event: 'plugin:stopped', pluginId: data.pluginId });
    });
    pluginManager.on('plugin:unloaded', (data) => {
      pluginEvents.push({ event: 'plugin:unloaded', pluginId: data.pluginId });
    });
    pluginManager.on('plugin:error', (data) => {
      pluginEvents.push({ event: 'plugin:error', pluginId: data.pluginId });
    });
  });

  afterEach(async () => {
    // ✅ 先释放 AgentRunner（会自动清理 PluginManager）
    try {
      await agentRunner?.dispose();
    } catch {
      // 忽略清理错误
    }
  });

  // ============================================================
  // PluginManager 初始化测试
  // ============================================================

  describe('PluginManager 初始化', () => {
    it('应该在 AgentRunner 初始化时创建 PluginManager', () => {
      const pluginManager = agentRunner.getPluginManager();

      expect(pluginManager).toBeDefined();
      expect(pluginManager).toBeInstanceOf(PluginManager);
    });

    it('应该提供对 PluginManager 的只读访问', () => {
      const pluginManager1 = agentRunner.getPluginManager();
      const pluginManager2 = agentRunner.getPluginManager();

      // 应该返回同一个实例
      expect(pluginManager1).toBe(pluginManager2);
    });
  });

  // ============================================================
  // 插件加载测试
  // ============================================================

  describe('loadPlugin', () => {
    it('应该通过 manifest 加载插件', async () => {
      const manifest: PluginManifest = {
        metadata: {
          plugin_id: 'test-plugin',
          name: 'Test Plugin',
          type: 'custom',
          version: '1.0.0',
          honeycomb_version: '>=2.0.0',
          description: 'Test plugin',
        },
        main: 'index.js',
      };

      // 创建模拟插件实例
      const mockPlugin = new TestAgentPlugin();

      // 直接注册插件（模拟加载）
      const pluginManager = agentRunner.getPluginManager();
      pluginManager.registerPlugin(mockPlugin);

      expect(pluginManager.hasPlugin('test-agent-plugin')).toBe(true);
    });

    it('应该拒绝加载重复的插件', async () => {
      const pluginManager = agentRunner.getPluginManager();
      const mockPlugin = new TestAgentPlugin();

      pluginManager.registerPlugin(mockPlugin);

      expect(() => {
        pluginManager.registerPlugin(mockPlugin);
      }).toThrow();
    });

    it('应该验证插件 manifest', async () => {
      const pluginManager = agentRunner.getPluginManager();

      // 测试有效的 manifest
      const validManifest: PluginManifest = {
        metadata: {
          plugin_id: 'valid-plugin',
          name: 'Valid Plugin',
          type: 'custom',
          version: '1.0.0',
          honeycomb_version: '>=2.0.0',
          description: 'Valid plugin',
        },
        main: 'index.js',
      };

      const validPlugin = new TestAgentPlugin();
      validPlugin.metadata = validManifest.metadata;

      expect(() => {
        pluginManager.registerPlugin(validPlugin);
      }).not.toThrow();
    });
  });

  // ============================================================
  // 插件激活测试
  // ============================================================

  describe('activatePlugin', () => {
    it('应该激活已加载的插件', async () => {
      const pluginManager = agentRunner.getPluginManager();
      const mockPlugin = new TestAgentPlugin();

      pluginManager.registerPlugin(mockPlugin);
      await agentRunner.activatePlugin('test-agent-plugin');

      expect(mockPlugin.initialized).toBe(true);
      expect(mockPlugin.started).toBe(true);
      expect(pluginManager.getStatus('test-agent-plugin')).toBe('active');
    });

    it('应该拒绝激活不存在的插件', async () => {
      await expect(
        agentRunner.activatePlugin('non-existent-plugin'),
      ).rejects.toThrow();
    });

    it('应该按依赖顺序激活插件', async () => {
      const pluginManager = agentRunner.getPluginManager();

      // 创建依赖插件
      const depPlugin = new TestAgentPlugin();
      depPlugin.metadata = {
        ...depPlugin.metadata,
        plugin_id: 'dep-plugin',
        name: 'Dependency Plugin',
      };

      // 创建主插件
      const mainPlugin = new TestAgentPlugin();
      mainPlugin.metadata = {
        ...mainPlugin.metadata,
        plugin_id: 'main-plugin',
        name: 'Main Plugin',
        dependencies: ['dep-plugin'],
      };

      pluginManager.registerPlugin(depPlugin);
      pluginManager.registerPlugin(mainPlugin);

      // 激活主插件应该自动激活依赖
      await agentRunner.activatePlugin('dep-plugin');
      await agentRunner.activatePlugin('main-plugin');

      expect(pluginManager.getStatus('dep-plugin')).toBe('active');
      expect(pluginManager.getStatus('main-plugin')).toBe('active');
    });
  });

  // ============================================================
  // 插件方法调用测试
  // ============================================================

  describe('callPlugin', () => {
    it('应该调用插件方法并返回结果', async () => {
      const pluginManager = agentRunner.getPluginManager();
      const mockPlugin = new TestAgentPlugin();

      pluginManager.registerPlugin(mockPlugin);
      await agentRunner.activatePlugin('test-agent-plugin');

      const result = await agentRunner.callPlugin(
        'test-agent-plugin',
        'echo',
        'hello world',
      );

      expect(result).toBe('hello world');
      expect(mockPlugin.callLog).toContain('handle:echo');
    });

    it('应该支持数值处理', async () => {
      const pluginManager = agentRunner.getPluginManager();
      const mockPlugin = new TestAgentPlugin();

      pluginManager.registerPlugin(mockPlugin);
      await agentRunner.activatePlugin('test-agent-plugin');

      const result = await agentRunner.callPlugin(
        'test-agent-plugin',
        'double',
        21,
      );

      expect(result).toBe(42);
    });

    it('应该支持字符串处理', async () => {
      const pluginManager = agentRunner.getPluginManager();
      const mockPlugin = new TestAgentPlugin();

      pluginManager.registerPlugin(mockPlugin);
      await agentRunner.activatePlugin('test-agent-plugin');

      const result = await agentRunner.callPlugin(
        'test-agent-plugin',
        'uppercase',
        'hello',
      );

      expect(result).toBe('HELLO');
    });

    it('应该拒绝调用未激活的插件', async () => {
      const pluginManager = agentRunner.getPluginManager();
      const mockPlugin = new TestAgentPlugin();

      pluginManager.registerPlugin(mockPlugin);
      // 不激活插件

      await expect(
        agentRunner.callPlugin('test-agent-plugin', 'echo', 'test'),
      ).rejects.toThrow();
    });

    it('应该传递插件方法错误', async () => {
      const pluginManager = agentRunner.getPluginManager();
      const mockPlugin = new TestAgentPlugin();

      pluginManager.registerPlugin(mockPlugin);
      await agentRunner.activatePlugin('test-agent-plugin');

      await expect(
        agentRunner.callPlugin('test-agent-plugin', 'unknown', {}),
      ).rejects.toThrow('Unknown method');
    });
  });

  // ============================================================
  // Agent 集成测试
  // ============================================================

  describe('Agent 插件集成', () => {
    it('应该支持 Agent 预处理', async () => {
      const pluginManager = agentRunner.getPluginManager();
      const mockPlugin = new TestAgentPlugin();

      pluginManager.registerPlugin(mockPlugin);
      await agentRunner.activatePlugin('test-agent-plugin');

      const taskData = { action: 'test', params: { value: 42 } };
      const result = await agentRunner.callPlugin(
        'test-agent-plugin',
        'agent:pre-process',
        taskData,
      );

      expect(result).toEqual({
        processed: true,
        original: taskData,
      });
    });

    it('应该支持 Agent 后处理', async () => {
      const pluginManager = agentRunner.getPluginManager();
      const mockPlugin = new TestAgentPlugin();

      pluginManager.registerPlugin(mockPlugin);
      await agentRunner.activatePlugin('test-agent-plugin');

      const agentResult = { output: 'test output', tokens: 100 };
      const result = await agentRunner.callPlugin(
        'test-agent-plugin',
        'agent:post-process',
        agentResult,
      );

      expect(result).toEqual({
        processed: true,
        result: agentResult,
      });
    });

    it('应该支持多个插件同时处理', async () => {
      const pluginManager = agentRunner.getPluginManager();

      // 创建第一个插件
      const plugin1 = new TestAgentPlugin();
      plugin1.metadata = {
        ...plugin1.metadata,
        plugin_id: 'plugin-1',
        name: 'Plugin 1',
      };

      // 创建第二个插件
      const plugin2 = new TestAgentPlugin();
      plugin2.metadata = {
        ...plugin2.metadata,
        plugin_id: 'plugin-2',
        name: 'Plugin 2',
      };

      pluginManager.registerPlugin(plugin1);
      pluginManager.registerPlugin(plugin2);

      await agentRunner.activatePlugin('plugin-1');
      await agentRunner.activatePlugin('plugin-2');

      const result1 = await agentRunner.callPlugin('plugin-1', 'echo', 'test1');
      const result2 = await agentRunner.callPlugin('plugin-2', 'echo', 'test2');

      expect(result1).toBe('test1');
      expect(result2).toBe('test2');
    });
  });

  // ============================================================
  // 沙箱隔离测试
  // ============================================================

  describe('沙箱隔离', () => {
    it('应该应用沙箱策略到插件', async () => {
      const pluginManager = agentRunner.getPluginManager();
      const sandboxPlugin = new TestSandboxPlugin();

      pluginManager.registerPlugin(sandboxPlugin);
      await agentRunner.activatePlugin('test-sandbox-plugin');

      const policy = await agentRunner.callPlugin(
        'test-sandbox-plugin',
        'get-policy',
        null,
      );

      expect(policy).toEqual({
        enabled: true,
        filesystem: {
          allow_read: ['/tmp', './output'],
          deny_paths: ['/etc', '/root'],
        },
        network: {
          allow_network: false,
        },
      });
    });

    it('应该验证沙箱权限', async () => {
      const pluginManager = agentRunner.getPluginManager();
      const sandboxPlugin = new TestSandboxPlugin();

      pluginManager.registerPlugin(sandboxPlugin);

      // 验证权限
      expect(pluginManager.hasPermission('test-sandbox-plugin', 'fs:read')).toBe(true);
      expect(pluginManager.hasPermission('test-sandbox-plugin', 'fs:write')).toBe(false);
      expect(pluginManager.hasPermission('test-sandbox-plugin', 'network:read')).toBe(false);
    });
  });

  // ============================================================
  // 插件生命周期测试
  // ============================================================

  describe('插件生命周期', () => {
    it('应该正确管理插件状态', async () => {
      const pluginManager = agentRunner.getPluginManager();
      const mockPlugin = new TestAgentPlugin();

      pluginManager.registerPlugin(mockPlugin);

      // 初始状态：registered
      expect(pluginManager.getStatus('test-agent-plugin')).toBe('registered');

      // 初始化后：loaded
      await pluginManager.initializePlugin('test-agent-plugin');
      expect(pluginManager.getStatus('test-agent-plugin')).toBe('loaded');
      expect(mockPlugin.initialized).toBe(true);

      // 启动后：active
      await pluginManager.startPlugin('test-agent-plugin');
      expect(pluginManager.getStatus('test-agent-plugin')).toBe('active');
      expect(mockPlugin.started).toBe(true);

      // 停止后：loaded
      await pluginManager.stopPlugin('test-agent-plugin');
      expect(pluginManager.getStatus('test-agent-plugin')).toBe('loaded');
      expect(mockPlugin.started).toBe(false);

      // 卸载
      await pluginManager.unloadPlugin('test-agent-plugin');
      expect(pluginManager.hasPlugin('test-agent-plugin')).toBe(false);
    });

    it('应该在错误时清理资源', async () => {
      const pluginManager = agentRunner.getPluginManager();
      const mockPlugin = new TestAgentPlugin();

      pluginManager.registerPlugin(mockPlugin);
      await agentRunner.activatePlugin('test-agent-plugin');

      // 停止并卸载
      await pluginManager.stopPlugin('test-agent-plugin');
      await pluginManager.unloadPlugin('test-agent-plugin');

      expect(mockPlugin.callLog).toContain('stop');
      expect(mockPlugin.callLog).toContain('cleanup');
    });
  });

  // ============================================================
  // MessageBus 事件测试
  // ============================================================

  describe('MessageBus 事件', () => {
    it('应该记录插件注册事件', () => {
      const mockPlugin = new TestAgentPlugin();

      pluginManager.registerPlugin(mockPlugin);

      // 检查是否触发注册事件
      const registeredEvents = pluginEvents.filter(e => e.event === 'plugin:registered');
      expect(registeredEvents.length).toBeGreaterThan(0);
      expect(registeredEvents[0].pluginId).toBe('test-agent-plugin');
    });

    it('应该记录插件启动事件', async () => {
      const mockPlugin = new TestAgentPlugin();

      pluginManager.registerPlugin(mockPlugin);
      await agentRunner.activatePlugin('test-agent-plugin');

      // 检查是否触发启动事件
      const startedEvents = pluginEvents.filter(e => e.event === 'plugin:started');
      expect(startedEvents.length).toBeGreaterThan(0);
      expect(startedEvents[0].pluginId).toBe('test-agent-plugin');
    });

    it('应该记录插件错误事件', async () => {
      class FailingPlugin implements HoneycombPlugin {
        metadata: PluginMetadata = {
          plugin_id: 'failing-plugin',
          name: 'Failing Plugin',
          type: 'custom',
          version: '1.0.0',
          honeycomb_version: '>=2.0.0',
          description: 'Fails on initialize',
        };

        async initialize(): Promise<void> {
          throw new Error('Initialize error');
        }

        async start(): Promise<void> {
          // Empty
        }

        async stop(): Promise<void> {
          // Empty
        }
      }

      pluginManager.registerPlugin(new FailingPlugin());

      try {
        await pluginManager.initializePlugin('failing-plugin');
      } catch {
        // Expected
      }

      // 检查是否触发错误事件
      const errorEvents = pluginEvents.filter(e => e.event === 'plugin:error');
      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents[0].pluginId).toBe('failing-plugin');
    });
  });

  // ============================================================
  // 批量操作测试
  // ============================================================

  describe('批量操作', () => {
    it('应该支持批量激活插件', async () => {
      const pluginManager = agentRunner.getPluginManager();

      const plugins: TestAgentPlugin[] = [];
      for (let i = 1; i <= 3; i++) {
        const plugin = new TestAgentPlugin();
        plugin.metadata = {
          ...plugin.metadata,
          plugin_id: `batch-plugin-${i}`,
          name: `Batch Plugin ${i}`,
        };
        plugins.push(plugin);
        pluginManager.registerPlugin(plugin);
      }

      // 批量激活
      for (const plugin of plugins) {
        await agentRunner.activatePlugin(plugin.metadata.plugin_id);
      }

      // 验证所有插件都处于活跃状态
      for (const plugin of plugins) {
        expect(pluginManager.getStatus(plugin.metadata.plugin_id)).toBe('active');
      }
    });
  });

  // ============================================================
  // 错误处理测试
  // ============================================================

  describe('错误处理', () => {
    it('应该优雅处理插件加载失败', async () => {
      const pluginManager = agentRunner.getPluginManager();

      class BrokenPlugin implements HoneycombPlugin {
        metadata: PluginMetadata = {
          plugin_id: 'broken-plugin',
          name: 'Broken Plugin',
          type: 'custom',
          version: '1.0.0',
          honeycomb_version: '>=2.0.0',
          description: 'Broken plugin',
        };

        async initialize(): Promise<void> {
          throw new Error('Broken');
        }

        async start(): Promise<void> {
          // Empty
        }

        async stop(): Promise<void> {
          // Empty
        }
      }

      pluginManager.registerPlugin(new BrokenPlugin());

      // 初始化应该失败
      await expect(
        pluginManager.initializePlugin('broken-plugin'),
      ).rejects.toThrow('Broken');

      // 状态应该是 error
      expect(pluginManager.getStatus('broken-plugin')).toBe('error');
    });

    it('应该隔离插件错误', async () => {
      const pluginManager = agentRunner.getPluginManager();

      const goodPlugin = new TestAgentPlugin();
      goodPlugin.metadata = {
        ...goodPlugin.metadata,
        plugin_id: 'good-plugin',
        name: 'Good Plugin',
      };

      const badPlugin = new TestAgentPlugin();
      badPlugin.metadata = {
        ...badPlugin.metadata,
        plugin_id: 'bad-plugin',
        name: 'Bad Plugin',
      };

      // 重写 badPlugin 的 handle 方法以抛出错误
      badPlugin.handle = async () => {
        throw new Error('Bad plugin error');
      };

      pluginManager.registerPlugin(goodPlugin);
      pluginManager.registerPlugin(badPlugin);

      await agentRunner.activatePlugin('good-plugin');
      await agentRunner.activatePlugin('bad-plugin');

      // good-plugin 应该正常工作
      const result1 = await agentRunner.callPlugin('good-plugin', 'echo', 'test');
      expect(result1).toBe('test');

      // bad-plugin 应该抛出错误
      await expect(
        agentRunner.callPlugin('bad-plugin', 'echo', 'test'),
      ).rejects.toThrow('Bad plugin error');

      // good-plugin 应该仍然可用
      const result2 = await agentRunner.callPlugin('good-plugin', 'echo', 'test2');
      expect(result2).toBe('test2');
    });
  });

  // ============================================================
  // 权限控制测试
  // ============================================================

  describe('权限控制', () => {
    it('应该验证插件权限', async () => {
      const pluginManager = agentRunner.getPluginManager();
      const mockPlugin = new TestAgentPlugin();

      pluginManager.registerPlugin(mockPlugin);

      // 验证权限
      expect(pluginManager.hasPermission('test-agent-plugin', 'read:agents')).toBe(true);
      expect(pluginManager.hasPermission('test-agent-plugin', 'write:agents')).toBe(true);
      expect(pluginManager.hasPermission('test-agent-plugin', 'delete:projects')).toBe(false);
    });

    it('应该在权限不足时抛出错误', () => {
      const pluginManager = agentRunner.getPluginManager();
      const mockPlugin = new TestAgentPlugin();

      pluginManager.registerPlugin(mockPlugin);

      expect(() => {
        pluginManager.checkPermission('test-agent-plugin', 'delete:projects');
      }).toThrow('Permission denied');
    });
  });
});
