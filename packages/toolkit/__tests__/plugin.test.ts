/**
 * Plugin System Test - 插件系统测试
 *
 * @author PAI
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createPlugin,
  createDefaultPlugin,
  getDefaultPlugin,
  resetDefaultPlugin,
  AGENT_TOOLKIT_PLUGIN,
  PLUGIN_MODULES,
} from '../src/plugin/index.js';

import type { PluginInitConfig } from '../src/plugin/types.js';

describe('Plugin System', () => {
  beforeEach(() => {
    // 每个测试前重置默认插件
    resetDefaultPlugin();
  });

  describe('createPlugin', () => {
    it('should create a plugin instance', () => {
      const plugin = createPlugin();
      expect(plugin).toBeDefined();
      expect(plugin.name).toBe('agent-toolkit');
      expect(plugin.version).toBe('1.0.0');
    });

    it('should create plugin with custom config', () => {
      const config: PluginInitConfig = {
        modules: ['llm', 'team'],
        debug: true,
      };
      const plugin = createPlugin(config);
      expect(plugin).toBeDefined();
    });
  });

  describe('AGENT_TOOLKIT_PLUGIN', () => {
    it('should have correct name', () => {
      expect(AGENT_TOOLKIT_PLUGIN.name).toBe('agent-toolkit');
    });

    it('should have correct version', () => {
      expect(AGENT_TOOLKIT_PLUGIN.version).toBe('1.0.0');
    });

    it('should have description', () => {
      expect(AGENT_TOOLKIT_PLUGIN.description).toBeDefined();
    });
  });

  describe('PLUGIN_MODULES', () => {
    it('should contain all required modules', () => {
      const requiredModules = [
        'llm',
        'team',
        'skills',
        'memory',
        'tools',
        'middleware',
        'observability',
        'session',
        'retry',
        'errors',
        'context',
        'qa',
        'edge',
        'autogen',
        'langchain',
      ];

      for (const module of requiredModules) {
        expect(PLUGIN_MODULES).toContain(module);
      }
    });

    it('should have correct number of modules', () => {
      expect(PLUGIN_MODULES.length).toBe(15);
    });
  });

  describe('Plugin Registration', () => {
    it('should register plugin with lazy loading', async () => {
      const plugin = createPlugin({
        modules: ['llm', 'team', 'skills'],
      });

      const registration = plugin.register();

      // 验证 registration 对象有正确的属性
      expect(registration).toBeDefined();
      expect('llm' in registration).toBe(true);
      expect('team' in registration).toBe(true);
      expect('skills' in registration).toBe(true);
    });

    it('should load modules on demand', async () => {
      const plugin = createPlugin({
        modules: ['llm'],
      });

      const result = await plugin.init({
        modules: ['llm'],
      });

      expect(result.plugin).toBeDefined();
      expect(result.loadedModules).toContain('llm');
      expect(plugin.isModuleLoaded('llm')).toBe(true);
    });
  });

  describe('createDefaultPlugin', () => {
    it('should create default plugin', async () => {
      const result = await createDefaultPlugin({
        modules: ['errors'],
      });

      expect(result.plugin).toBeDefined();
      expect(result.registration).toBeDefined();
      expect(result.loadedModules).toContain('errors');
    });

    it('should return same instance for default plugin', async () => {
      const plugin1 = getDefaultPlugin();
      const plugin2 = getDefaultPlugin();

      // 验证是同一个实例
      expect(plugin1).toBe(plugin2);
    });
  });

  describe('getDefaultPlugin', () => {
    it('should return singleton instance', () => {
      const plugin1 = getDefaultPlugin();
      const plugin2 = getDefaultPlugin();

      expect(plugin1).toBe(plugin2);
    });

    it('should reset and create new instance after resetDefaultPlugin', () => {
      const plugin1 = getDefaultPlugin();
      resetDefaultPlugin();
      const plugin2 = getDefaultPlugin();

      expect(plugin1).not.toBe(plugin2);
    });
  });
});
