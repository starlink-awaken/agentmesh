/**
 * Honeycomb v2 - Agent Capability Schema
 *
 * Agent 能力模式化系统的核心类型和接口定义。
 * 支持：
 * - 能力声明式定义
 * - 能力验证和匹配
 * - 能力发现和查询
 * - 与 AgentRunner 的集成
 */

// ============================================================
// 核心类型定义
// ============================================================

/**
 * 能力类型 - Agent 能够提供的功能类别
 */
export type CapabilityType =
  | 'analysis'        // 分析能力：数据分析、代码分析、需求分析等
  | 'generation'      // 生成能力：代码生成、文档生成、创意生成等
  | 'validation'      // 验证能力：代码审查、测试验证、质量检查等
  | 'transformation'  // 转换能力：格式转换、数据转换、语言翻译等
  | 'execution'       // 执行能力：命令执行、API调用、操作执行等
  | 'coordination'    // 协调能力：任务编排、资源调度、流程控制等
  | 'monitoring'      // 监控能力：状态监控、性能分析、异常检测等
  | 'custom';         // 自定义能力类型

/**
 * 能力等级 - 表示能力的熟练程度或资源消耗
 */
export type CapabilityLevel = 'basic' | 'intermediate' | 'advanced' | 'expert';

/**
 * 能力等级数值映射（用于比较和排序）
 */
export const CAPABILITY_LEVEL_VALUES: Record<CapabilityLevel, number> = {
  basic: 0,
  intermediate: 1,
  advanced: 2,
  expert: 3,
} as const;

/**
 * 输入输出 Schema - 使用简化的 JSON Schema 格式
 */
export interface IOSchema {
  /** 数据类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  /** 描述 */
  description?: string;
  /** 对象属性定义 */
  properties?: Record<string, IOSchema>;
  /** 数组元素类型 */
  items?: IOSchema;
  /** 必需属性列表 */
  required?: string[];
  /** 枚举值 */
  enum?: (string | number | boolean)[];
  /** 格式约束 */
  format?: string;
  /** 正则表达式模式 */
  pattern?: string;
  /** 数值最小值 */
  minimum?: number;
  /** 数值最大值 */
  maximum?: number;
  /** 字符串最小长度 */
  minLength?: number;
  /** 字符串最大长度 */
  maxLength?: number;
}

/**
 * 能力依赖 - 声明执行此能力需要的前置条件
 */
export interface CapabilityDependency {
  /** 依赖的能力名称 */
  capability: string;
  /** 最低要求等级 */
  minLevel?: CapabilityLevel;
  /** 是否为硬依赖（必须满足） */
  required: boolean;
}

/**
 * 能力定义 - 描述 Agent 提供的单种能力
 */
export interface CapabilityDefinition {
  /** 能力唯一标识符 */
  id: string;
  /** 能力类型 */
  type: CapabilityType;
  /** 能力名称 */
  name: string;
  /** 能力描述 */
  description: string;
  /** 能力等级 */
  level: CapabilityLevel;
  /** 输入 Schema */
  input?: IOSchema;
  /** 输出 Schema */
  output?: IOSchema;
  /** 前置依赖 */
  dependencies?: CapabilityDependency[];
  /** 能力标签（用于模糊匹配） */
  tags?: string[];
  /** 能力版本 */
  version?: string;
  /** 性能指标（可选） */
  performance?: {
    /** 平均执行时间（毫秒） */
    avgDurationMs?: number;
    /** 平均 Token 消耗 */
    avgTokens?: number;
    /** 成功率 */
    successRate?: number;
  };
}

/**
 * Agent 能力声明 - Agent 声明其所有能力的集合
 */
export interface AgentCapabilities {
  /** Agent 名称 */
  agentName: string;
  /** Agent 版本 */
  agentVersion?: string;
  /** 能力列表 */
  capabilities: CapabilityDefinition[];
  /** 默认能力等级（用于未指定等级的能力） */
  defaultLevel?: CapabilityLevel;
}

/**
 * 能力匹配请求 - 查找能够执行特定任务的 Agent
 */
export interface CapabilityMatchRequest {
  /** 需要的能力类型 */
  type?: CapabilityType;
  /** 需要的能力标签 */
  tags?: string[];
  /** 输入数据（用于 Schema 匹配） */
  input?: unknown;
  /** 期望的输出 Schema */
  outputSchema?: IOSchema;
  /** 最低能力等级要求 */
  minLevel?: CapabilityLevel;
  /** 最大可接受的执行时间 */
  maxDurationMs?: number;
  /** 最大可接受的 Token 消耗 */
  maxTokens?: number;
  /** 匹配模式 */
  mode: 'exact' | 'fuzzy' | 'any';
}

/**
 * 能力匹配结果 - 匹配到的 Agent 和能力
 */
export interface CapabilityMatchResult {
  /** Agent 名称 */
  agentName: string;
  /** 匹配到的能力 */
  capability: CapabilityDefinition;
  /** 匹配分数（0-1） */
  score: number;
  /** 匹配原因 */
  reasons: string[];
}

/**
 * 能力验证结果
 */
export interface CapabilityValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误信息列表 */
  errors: string[];
  /** 警告信息列表 */
  warnings: string[];
}

// ============================================================
// 能力等级比较工具函数
// ============================================================

/**
 * 比较两个能力等级
 * @returns 负数表示 level1 < level2，0 表示相等，正数表示 level1 > level2
 */
export function compareCapabilityLevels(
  level1: CapabilityLevel,
  level2: CapabilityLevel,
): number {
  return CAPABILITY_LEVEL_VALUES[level1] - CAPABILITY_LEVEL_VALUES[level2];
}

/**
 * 检查能力等级是否满足最低要求
 */
export function meetsCapabilityLevel(
  actualLevel: CapabilityLevel,
  requiredLevel: CapabilityLevel,
): boolean {
  return compareCapabilityLevels(actualLevel, requiredLevel) >= 0;
}

/**
 * 获取所有能力等级（按升序排列）
 */
export function getCapabilityLevels(): CapabilityLevel[] {
  return (Object.keys(CAPABILITY_LEVEL_VALUES) as CapabilityLevel[]).sort(
    (a, b) => CAPABILITY_LEVEL_VALUES[a] - CAPABILITY_LEVEL_VALUES[b],
  );
}

// ============================================================
// 能力类型工具函数
// ============================================================

/**
 * 所有能力类型列表
 */
export const CAPABILITY_TYPES: CapabilityType[] = [
  'analysis',
  'generation',
  'validation',
  'transformation',
  'execution',
  'coordination',
  'monitoring',
  'custom',
] as const;

/**
 * 检查是否为有效的能力类型
 */
export function isValidCapabilityType(type: string): type is CapabilityType {
  return CAPABILITY_TYPES.includes(type as CapabilityType);
}

/**
 * 检查是否为有效的能力等级
 */
export function isValidCapabilityLevel(level: string): level is CapabilityLevel {
  return level in CAPABILITY_LEVEL_VALUES;
}

// ============================================================
// 导出所有类型（已在顶部定义，此处不需要重复导出）
// ============================================================
