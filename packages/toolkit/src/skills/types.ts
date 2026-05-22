/**
 * SkillDefinition - 技能定义
 */
export interface SkillDefinition {
  /** 技能唯一标识 */
  id: string;
  /** 技能名称 */
  name: string;
  /** 技能描述 (简短) */
  description: string;
  /** 详细描述 */
  longDescription?: string;
  /** 触发关键词 */
  triggers: string[];
  /** 角色类型 */
  role: 'specialist' | 'generalist' | 'architect' | 'reviewer';
  /** 作用域 */
  scope: 'implementation' | 'analysis' | 'design' | 'review' | 'planning';
  /** 输出格式 */
  outputFormat: 'code' | 'text' | 'mixed';
  /** 分类 */
  category: string;
  /** 技能依赖 */
  dependencies?: string[];
  /** 参考文档路由表 */
  references: ReferenceRoute[];
  /** 约束规则 */
  constraints?: Constraint[];
  /** 核心工作流 */
  workflow?: WorkflowStep[];
}

/**
 * ReferenceRoute - 参考文档路由
 */
export interface ReferenceRoute {
  topic: string;
  file: string;
  loadWhen: string;
}

/**
 * Constraint - 约束规则
 */
export interface Constraint {
  type: 'must-do' | 'must-not-do' | 'should-do' | 'should-not-do';
  rule: string;
  reason?: string;
}

/**
 * WorkflowStep - 工作流步骤
 */
export interface WorkflowStep {
  order: number;
  name: string;
  description: string;
}

/**
 * SkillLoadOptions - 技能加载选项
 */
export interface SkillLoadOptions {
  /** 是否加载参考文档 */
  loadReferences?: boolean;
  /** 指定加载的参考文档主题 */
  loadSpecificReferences?: string[];
  /** 上下文信息 */
  context?: Record<string, unknown>;
}

/**
 * SkillInstance - 技能实例
 */
export interface SkillInstance {
  definition: SkillDefinition;
  loadedReferences: Map<string, string>;
  metadata?: Record<string, unknown>;
}

/**
 * SkillMatchResult - 技能匹配结果
 */
export interface SkillMatchResult {
  skill: SkillDefinition;
  matchedTriggers: string[];
  confidence: number;
  suggestedReferences: string[];
}

/**
 * SkillExecutionContext - 技能执行上下文
 * 用于 SkillController 和 SkillExecutor 的上下文信息
 */
export interface SkillExecutionContext {
  task: string;
  input?: string;
  retrievedMemories: string[];
  selectedSkills: string[];
  sessionId: string;
  metadata?: Record<string, unknown>;
}

/**
 * SkillAction - 技能操作类型
 */
export type SkillAction = 'INSERT' | 'UPDATE' | 'DELETE' | 'NOOP';

/**
 * SkillExecutionResult - 技能执行结果
 */
export interface SkillExecutionResult {
  action: SkillAction;
  success: boolean;
  memoryIndex?: number;
  memoryContent?: string;
  reasoning?: string;
}

/**
 * SkillManifest - 技能清单 (用于动态发现)
 */
export interface SkillManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  longDescription?: string;
  triggers: string[];
  role: 'specialist' | 'generalist' | 'architect' | 'reviewer';
  scope: 'implementation' | 'analysis' | 'design' | 'review' | 'planning';
  outputFormat: 'code' | 'text' | 'mixed';
  category: string;
  dependencies?: string[];
  references: ReferenceRoute[];
  author?: string;
}

/**
 * DiscoveryOptions - 发现选项
 */
export interface DiscoveryOptions {
  /** 基础路径 */
  basePath: string;
  /** 是否递归扫描 */
  recursive?: boolean;
  /** 文件匹配模式 */
  patterns?: string[];
  /** 是否监听文件变化 */
  watch?: boolean;
}

/**
 * DiscoveryEvent - 发现事件
 */
export interface DiscoveryEvent {
  type: 'added' | 'changed' | 'removed';
  skillId: string;
  path: string;
  timestamp: number;
}

/**
 * SkillOrigin - 技能来源
 */
export type SkillOrigin = 'built-in' | 'discovered' | 'evolved' | 'user-defined';

/**
 * SkillExecutor - 技能执行器函数类型
 */
export type SkillExecutor = (
  context: SkillExecutionContext,
  memories: string[]
) => Promise<SkillExecutionResult>;

/**
 * DynamicSkillDefinition - 动态技能定义 (带统计)
 */
export interface DynamicSkillDefinition extends SkillDefinition {
  origin: SkillOrigin;
  version: number;
  usageStats: {
    successCount: number;
    failCount: number;
    lastUsed?: Date;
  };
  /** 自定义执行器 */
  executor?: SkillExecutor;
  /** 向量嵌入 */
  embedding?: number[];
}

/**
 * DifficultCase - 困难案例
 */
export interface DifficultCase {
  id: string;
  question: string;
  retrievedMemories?: string[];
  predictedAnswer?: string;
  groundTruth?: string;
  reward?: number;
  failCount: number;
  timestamp: Date;
}

/**
 * EvolutionConfig - 演化配置
 */
export interface EvolutionConfig {
  difficultCaseThreshold: number;
  clusterMinSamples: number;
  evolutionTriggerFailCount: number;
  maxVersion: number;
  twoStageEvolution: boolean;
}

/**
 * SkillChange - 技能变更
 */
export interface SkillChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
}

/**
 * EvolutionSuggestion - 演化建议
 */
export interface EvolutionSuggestion {
  action: 'add_new' | 'refine_existing';
  skillId?: string;
  changes?: SkillChange[];
  newSkill?: Partial<DynamicSkillDefinition>;
  analysis: string;
}

/**
 * MemSkillExecutionContext - 记忆技能执行上下文
 */
export interface MemSkillExecutionContext {
  task: string;
  input?: string;
  constraints?: string[];
  context?: Record<string, unknown>;
  selectedSkills?: string[];
  retrievedMemories?: string[];
}

/**
 * MemSkillExecutionResult - 记忆技能执行结果
 */
export interface MemSkillExecutionResult {
  success: boolean;
  output?: string;
  memoryContent?: string;
  error?: string;
  selectedSkills?: string[];
  executionTime?: number;
}

/**
 * SystemMode - 系统模式
 */
export type SystemMode = 'inference' | 'training';

/**
 * TopKConfig - TopK 配置
 */
export interface TopKConfig {
  k: number;
  scoreThreshold?: number;
}
