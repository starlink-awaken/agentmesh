/**
 * Tools Module - 工具系统
 *
 * 提供工具注册、动态组合、执行能力
 * 源自"模块化单体"设计模式
 */
export { ToolRegistry, ToolBuilder } from './ToolRegistry.js';
export { DynamicComposer } from './DynamicComposer.js';
export { ScenarioEngine, createScenarioEngine } from './ScenarioEngine.js';

export type {
  AgentTool,
  ToolHandler,
  ToolContext,
  ToolResult,
  ParameterDefinition,
  ParameterProperty,
  ToolComposition,
  ToolRequirement,
  ExecutionResult,
  ExecutionCondition,
  ErrorHandler,
  ToolRegistryStats,
} from './types.js';

export type {
  ScenarioInput,
  ScenarioResult,
} from './ScenarioEngine.js';
