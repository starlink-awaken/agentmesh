/**
 * P2.1 Workflow Skills 系统类型定义
 *
 * 核心类型：
 * - SkillType: Skill 类型分类
 * - SkillConfig: Skill 配置定义
 * - SkillExecutionRequest/Result: Skill 执行相关
 * - SkillComposition: Skill 组合定义
 */

// ============================================================
// Workflow Skills 核心类型
// ============================================================

/** Skill 类型 */
export type SkillType =
  | 'analysis'       // 分析类技能（如代码分析、数据分析）
  | 'generation'     // 生成类技能（如代码生成、文档生成）
  | 'transformation' // 转换类技能（如格式转换、数据转换）
  | 'validation'     // 验证类技能（如代码检查、质量检查）
  | 'integration'    // 集成类技能（如 API 调用、工具集成）
  | 'orchestration'  // 编排类技能（如并行执行、条件分支）
  | 'custom';        // 自定义技能

/** Skill 执行模式 */
export type SkillExecutionMode =
  | 'sync'           // 同步执行，等待结果
  | 'async'          // 异步执行，返回 Future
  | 'stream'         // 流式执行，返回 Stream
  | 'batch';         // 批处理执行

/** Skill 版本信息 */
export interface SkillVersion {
  major: number;
  minor: number;
  patch: number;
  pre?: string; // 预发布版本标识 (alpha, beta, rc)
  build?: string;
}

/** Skill 元数据 */
export interface SkillMetadata {
  /** Skill 唯一标识 (格式: publisher.skill-name) */
  skill_id: string;
  /** Skill 名称 */
  name: string;
  /** Skill 类型 */
  type: SkillType;
  /** 版本 */
  version: SkillVersion;
  /** 描述 */
  description: string;
  /** 作者/发布者 */
  publisher: string;
  /** 标签（用于搜索和分类） */
  tags: string[];
  /** 首页 URL */
  homepage?: string;
  /** 仓库 URL */
  repository?: string;
  /** 许可证 */
  license: string;
  /** 依赖的其他 Skills */
  dependencies: SkillDependency[];
  /** 关键词（搜索优化） */
  keywords: string[];
  /** 创建时间 */
  created_at: number;
  /** 更新时间 */
  updated_at: number;
}

/** Skill 依赖 */
export interface SkillDependency {
  /** 依赖的 Skill ID */
  skill_id: string;
  /** 版本约束（semver 格式） */
  version_constraint: string;
  /** 是否必需 */
  required: boolean;
}

/** Skill 输入 Schema */
export interface SkillInputSchema {
  /** 参数名称 */
  name: string;
  /** 参数类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file';
  /** 参数描述 */
  description: string;
  /** 是否必需 */
  required: boolean;
  /** 默认值 */
  default?: unknown;
  /** 验证规则（JSON Schema 或自定义表达式） */
  validation?: string;
  /** 示例值 */
  example?: unknown;
}

/** Skill 输出 Schema */
export interface SkillOutputSchema {
  /** 输出类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file' | 'stream';
  /** 输出描述 */
  description: string;
  /** 输出结构（JSON Schema） */
  structure?: Record<string, unknown>;
}

/** Skill 重试配置 */
export interface SkillRetryConfig {
  max_attempts: number;
  backoff_ms: number;
}

/** Skill 配置 */
export interface SkillConfig {
  /** Skill 元数据 */
  metadata: SkillMetadata;
  /** 执行模式 */
  execution_mode: SkillExecutionMode;
  /** 输入参数定义 */
  inputs: SkillInputSchema[];
  /** 输出定义 */
  outputs: SkillOutputSchema[];
  /** Agent 模板（用于生成执行 Agent） */
  agent_template: string;
  /** 使用的工具列表 */
  tools: string[];
  /** 上下文分片配置 */
  context_shards?: string[];
  /** Token 预算 */
  token_budget?: number;
  /** 超时时间（毫秒） */
  timeout_ms?: number;
  /** 重试配置 */
  retry?: SkillRetryConfig;
}

/** Skill 执行请求 */
export interface SkillExecutionRequest {
  /** Skill ID */
  skill_id: string;
  /** 版本约束（可选，默认使用最新兼容版本） */
  version?: string;
  /** 输入参数 */
  inputs: Record<string, unknown>;
  /** 执行选项 */
  options?: {
    /** 覆盖执行模式 */
    execution_mode?: SkillExecutionMode;
    /** 覆盖超时 */
    timeout_ms?: number;
    /** 覆盖 token 预算 */
    token_budget?: number;
    /** 传递额外的上下文 */
    context?: Record<string, unknown>;
  };
}

/** Skill 日志条目 */
export interface SkillLogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, unknown>;
}

/** Skill 执行结果 */
export interface SkillExecutionResult {
  /** 执行 ID */
  execution_id: string;
  /** 追踪 ID（分布式追踪） */
  trace_id?: string;
  /** Skill ID */
  skill_id: string;
  /** 使用的版本 */
  version: SkillVersion;
  /** 执行状态 */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** 开始时间 */
  started_at: number;
  /** 完成时间 */
  completed_at?: number;
  /** 执行时长（毫秒） */
  duration_ms?: number;
  /** Token 使用量 */
  token_usage: number;
  /** 输出数据 */
  output?: unknown;
  /** 错误信息 */
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  /** 执行日志 */
  logs: SkillLogEntry[];
}

// ============================================================
// Skill 组合类型
// ============================================================

/** Skill 节点类型 */
export type SkillNodeType =
  | 'skill'
  | 'condition'
  | 'loop'
  | 'parallel';

/** Skill 节点 */
export interface SkillNode {
  /** 节点 ID */
  node_id: string;
  /** Skill ID */
  skill_id: string;
  /** 节点名称 */
  name: string;
  /** 节点类型 */
  type: SkillNodeType;
  /** 输入参数映射 */
  input_mapping: Record<string, string>;
  /** 条件表达式（条件节点） */
  condition?: string;
  /** 循环配置（循环节点） */
  loop?: {
    iterator: string;
    collection: string;
  };
}

/** Skill 边（连接） */
export interface SkillEdge {
  /** 源节点 ID */
  from: string;
  /** 目标节点 ID */
  to: string;
  /** 输出到输入的映射 */
  mapping: Record<string, string>;
  /** 条件（可选的条件边） */
  condition?: string;
}

/** Skill 组合定义 */
export interface SkillComposition {
  /** 组合 ID */
  composition_id: string;
  /** 组合名称 */
  name: string;
  /** 组合描述 */
  description: string;
  /** Skill 节点 */
  nodes: SkillNode[];
  /** 节点连接 */
  edges: SkillEdge[];
  /** 输入映射 */
  input_mapping: Record<string, string>;
  /** 输出映射 */
  output_mapping: Record<string, string>;
}

/** Skill 组合验证结果 */
export interface SkillCompositionValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================
// Skill 市场类型
// ============================================================

/** Skill 市场条目 */
export interface SkillMarketEntry {
  /** Skill 元数据 */
  metadata: SkillMetadata;
  /** 下载量 */
  downloads: number;
  /** 平均评分 */
  rating: number;
  /** 评分数量 */
  rating_count: number;
  /** 安装状态（本地是否已安装） */
  installed: boolean;
  /** 已安装版本 */
  installed_version?: SkillVersion;
}

// ============================================================
// Skill 注册表配置
// ============================================================

/** Skill 注册表配置 */
export interface SkillRegistryConfig {
  /** 存储路径 */
  storage_path?: string;
  /** 自动加载 */
  auto_load?: boolean;
  /** 市场端点 */
  market_endpoint?: string;
  /** 缓存 TTL（毫秒） */
  cache_ttl_ms?: number;
}

// ============================================================
// Skill 执行上下文
// ============================================================

/** Skill 执行上下文 */
export interface SkillExecutionContext {
  /** 执行 ID */
  execution_id: string;
  /** Skill 配置 */
  skill_config: SkillConfig;
  /** 输入参数 */
  inputs: Record<string, unknown>;
  /** Trace ID */
  trace_id: string;
  /** 临时文件目录 */
  temp_dir: string;
  /** 开始时间 */
  started_at: number;
  /** 取消信号 */
  abort_signal: AbortSignal;
}

// ============================================================
// 工具函数类型
// ============================================================

/** Skill 列表过滤器 */
export interface SkillListFilter {
  type?: SkillType;
  publisher?: string;
  tags?: string[];
}

/** Skill 版本比较结果 */
export type VersionComparison = -1 | 0 | 1;

/** Skill 验证结果 */
export interface SkillValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
