/**
 * Plugin Module - 插件系统统一入口
 *
 * 提供 Plugin 接口定义和 AgentToolkit 官方插件实现
 * 支持延迟加载和按需导入，与 Skill 系统互补
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  Plugin,
  AgentToolkitPlugin,
  PluginRegistration,
  PluginInitConfig,
  PluginInitResult,
  LazyModule,
  ModuleLoader,
} from './types.js';

import {
  AgentToolkitPluginImpl,
  getDefaultPlugin,
  resetDefaultPlugin,
} from './AgentToolkitPlugin.js';

// 类型导出
export type {
  Plugin,
  AgentToolkitPlugin,
  PluginRegistration,
  PluginInitConfig,
  PluginInitResult,
  LazyModule,
  ModuleLoader,
};

// 实现导出
export {
  AgentToolkitPluginImpl,
  getDefaultPlugin,
  resetDefaultPlugin,
};

/**
 * 创建 AgentToolkit 插件
 *
 * @example
 * ```typescript
 * import { createPlugin } from '@starlink-awaken/agent-toolkit/plugin';
 *
 * // 创建插件实例
 * const plugin = createPlugin({
 *   modules: ['llm', 'team', 'skills'],
 *   debug: true,
 * });
 *
 * // 初始化插件
 * const { registration } = await plugin.init();
 *
 * // 使用模块
 * const llm = await registration.llm;
 * ```
 */
export function createPlugin(config?: PluginInitConfig): AgentToolkitPluginImpl {
  return new AgentToolkitPluginImpl(config);
}

/**
 * 创建默认插件（单例）
 *
 * @example
 * ```typescript
 * import { createDefaultPlugin } from '@starlink-awaken/agent-toolkit/plugin';
 *
 * const { plugin, registration } = await createDefaultPlugin();
 * ```
 */
export async function createDefaultPlugin(
  config?: PluginInitConfig
): Promise<PluginInitResult> {
  const plugin = getDefaultPlugin(config);
  return plugin.init(config);
}

/**
 * AgentToolkit 插件常量
 */
export const AGENT_TOOLKIT_PLUGIN = {
  name: 'agent-toolkit',
  version: '1.0.0',
  description: 'Multi-agent collaboration and LLM framework',
} as const;

/**
 * 预定义的模块列表
 */
export const PLUGIN_MODULES = [
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
] as const;

export type PluginModuleName = (typeof PLUGIN_MODULES)[number];
