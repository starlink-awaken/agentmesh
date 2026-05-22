/**
 * Tools Types - 工具系统类型定义
 */

/**
 * AgentTool - 代理工具
 */
export interface AgentTool {
  id: string;
  name: string;
  description: string;
  parameters: ParameterDefinition;
  handler: ToolHandler;
  category: string;
  version: string;
  tags?: string[];
}

/**
 * ParameterDefinition - 参数定义
 */
export interface ParameterDefinition {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties: Record<string, ParameterProperty>;
  required?: string[];
  description?: string;
}

/**
 * ParameterProperty - 参数属性
 */
export interface ParameterProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  default?: unknown;
  enum?: unknown[];
}

/**
 * ToolHandler - 工具处理器
 */
export type ToolHandler = (params: unknown, context?: ToolContext) => Promise<ToolResult>;

/**
 * ToolContext - 工具执行上下文
 */
export interface ToolContext {
  sessionId?: string;
  userId?: string;
  variables?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * ToolResult - 工具执行结果
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * ToolComposition - 工具组合
 */
export interface ToolComposition {
  id: string;
  name: string;
  description?: string;
  tools: AgentTool[];
  executionOrder: 'sequential' | 'parallel' | 'conditional';
  conditions?: ExecutionCondition[];
  onError?: ErrorHandler;
}

/**
 * ExecutionCondition - 执行条件
 */
export interface ExecutionCondition {
  toolId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: unknown;
  nextToolId?: string;
}

/**
 * ErrorHandler - 错误处理器
 */
export interface ErrorHandler {
  strategy: 'stop' | 'retry' | 'fallback' | 'continue';
  maxRetries?: number;
  fallbackToolId?: string;
}

/**
 * ToolRequirement - 工具需求
 */
export interface ToolRequirement {
  name: string;
  category?: string;
  description?: string;
  mustHave?: string[];
}

/**
 * ExecutionResult - 执行结果
 */
export interface ExecutionResult {
  compositionId: string;
  results: ToolResult[];
  totalTime: number;
  success: boolean;
  error?: string;
}

/**
 * ToolRegistryStats - 工具注册统计
 */
export interface ToolRegistryStats {
  totalTools: number;
  categories: Record<string, number>;
  mostUsed: Array<{ toolId: string; count: number }>;
}
