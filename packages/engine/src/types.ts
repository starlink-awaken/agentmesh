/**
 * Honeycomb v2 - 核心类型定义
 *
 * 所有引擎模块共享这些类型定义作为其契约。
 *
 * @since v2.0.0
 */

// ============================================================
// Project Archetypes & Complexity
// ============================================================

/** Supported project archetypes with domain-specific workflows */
export type ProjectArchetype =
  | 'software-dev'
  | 'creative-writing'
  | 'visual-production'
  | 'document-processing'
  | 'data-science'
  | 'custom';

/** Complexity levels determine how many agents and phases are active */
export type ComplexityLevel =
  | 'simple'      // 3-5 agents, skip L1+L2
  | 'standard'    // 8-12 agents, full four-layer with lean governance
  | 'advanced'    // 17+ agents, full four-layer + full governance
  | 'enterprise'; // multi-honeycomb parallel, swarm protocol

// ============================================================
// Phase & Decision Path
// ============================================================

/** Project lifecycle phases */
export enum Phase {
  INIT = 'init',                // Phase 0: Project initialization
  RESEARCH = 'research',        // Phase 1: Research & analysis (L1)
  DECISION = 'decision',        // Phase 2: Supervision & decision (L2)
  EXECUTION = 'execution',      // Phase 3: Planning & execution (L3)
  FEEDBACK = 'feedback',        // Phase 4: Virtual user feedback (L4)
  DELIVERY = 'delivery',        // Phase 5: Delivery & archival
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
}

/** DF-CEA dynamic decision paths based on risk level */
export enum DecisionPath {
  EXPRESS = 'express',     // User → L3 direct (very low risk)
  QUICK = 'quick',         // User → L2(fast) → L3 → L4
  STANDARD = 'standard',   // User → L2 → L3 → L4
  DEEP = 'deep',           // User → L2 → L3 → L4 → L3(retry)
  FULL = 'full',           // User → L2 → L1 → L3 → L4 → L2(review)
}

/** Risk levels for triggering governance mechanisms */
export enum RiskLevel {
  VERY_LOW = 'very_low',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/** Phase transition record */
export interface PhaseRecord {
  from: Phase;
  to: Phase;
  timestamp: number;
  reason: string;
  decision_path?: DecisionPath;
  metadata?: Record<string, unknown>;
}

// ============================================================
// Agent Definitions
// ============================================================

/** Agent architectural layers */
export type AgentLayer = 'L1' | 'L2' | 'L3' | 'L4' | 'governance';

/** Agent lifecycle type */
export type AgentType = 'structural' | 'worker';

/** Status of an agent instance */
export enum AgentStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying',
}

/** Agent definition parsed from Markdown files */
export interface AgentDefinition {
  name: string;
  type: AgentType;
  layer: AgentLayer;
  domain?: string;
  description: string;
  prompt_path: string;
  tools: string[];
  capabilities: string[];
  argument_hint?: string;
  embedded_governance: GovernanceConfig;
  /** Context shard IDs to use for this agent (Phase 3: 上下文分片) */
  context_shards?: string[];
}

/** Agent runtime state */
export interface AgentState {
  agent_name: string;
  status: AgentStatus;
  current_task?: string;
  started_at?: number;
  completed_at?: number;
  retry_count: number;
  last_error?: string;
  token_usage: number;
  output?: string;
}

/** Governance configuration embedded in each agent */
export interface GovernanceConfig {
  first_principles_check: boolean;
  red_team_threshold: RiskLevel;
  quality_gate_enabled: boolean;
  max_retries: number;
  token_budget: number;
}

// ============================================================
// Messaging
// ============================================================

/** Message types for inter-agent communication */
export type MessageType = 'request' | 'response' | 'event' | 'feedback';

/** Priority levels for messages */
export enum MessagePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3,
}

/** Structured message for agent-to-agent communication */
export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: MessageType;
  priority: MessagePriority;
  payload: unknown;
  context_shards: string[];
  timestamp: number;
  trace_id: string;
  reply_to?: string;
}

// ============================================================
// Context Management
// ============================================================

/** Context shard for sharded context loading */
export interface ContextShard {
  shard_id: string;
  scope: 'global-summary' | 'module' | 'task';
  module_name?: string;
  content: string;
  token_count: number;
  last_updated: number;
}

// ============================================================
// Artifacts & Decisions
// ============================================================

/** Project artifact produced by agents */
export interface Artifact {
  id: string;
  name: string;
  type: 'document' | 'code' | 'design' | 'test' | 'config' | 'report';
  path: string;
  phase: Phase;
  agent: string;
  created_at: number;
  description: string;
}

/** Decision record from L2 decision layer */
export interface Decision {
  id: string;
  phase: Phase;
  type: 'go' | 'no-go' | 'conditional-go' | 'escalate';
  reasoning: string;
  conditions?: string[];
  risk_level: RiskLevel;
  confidence: number;
  made_by: string;
  timestamp: number;
}

// ============================================================
// Checkpoints
// ============================================================

/** Checkpoint for state persistence and rollback */
export interface Checkpoint {
  id: string;
  project_id: string;
  phase: Phase;
  timestamp: number;
  created_at: number; // Alias for timestamp for API consistency
  description: string;
  recoverable: boolean;
  state_json: string; // Serialized ProjectState
}

// ============================================================
// Project State (the big one)
// ============================================================

/** Complete project state - the heart of the engine */
export interface ProjectState {
  project_id: string;
  project_name: string;
  project_description: string;
  archetype: ProjectArchetype;
  complexity: ComplexityLevel;
  decision_path: DecisionPath;
  risk_level: RiskLevel;

  // Trace ID for distributed tracing
  trace_id?: string;

  // Phase management
  current_phase: Phase;
  phase_history: PhaseRecord[];

  // Agent management
  active_agents: string[];
  agent_states: Record<string, AgentState>;

  // Artifacts and decisions
  artifacts: Artifact[];
  decisions: Decision[];

  // Resource tracking
  total_token_usage: number;
  token_budget: number;

  // Timestamps
  created_at: number;
  updated_at: number;
  started_at?: number;
  completed_at?: number;
}

// ============================================================
// Configuration
// ============================================================

/** Engine-level configuration */
export interface EngineConfig {
  /** Database file path for checkpoints */
  db_path: string;
  /** Root path for agent markdown definitions */
  agents_root: string;
  /** Root path for domain configurations */
  domains_root: string;
  /** Project output directory */
  output_dir: string;
  /** Log level */
  log_level: 'debug' | 'info' | 'warn' | 'error';
  /** Log file path (optional) */
  log_file?: string;
  /** Default token budget per project */
  default_token_budget: number;
  /** Max concurrent agents */
  max_concurrent_agents: number;
  /** Auto-checkpoint on phase completion */
  auto_checkpoint: boolean;
  /** Risk thresholds for decision path selection */
  risk_thresholds: RiskThresholds;
  /** LLM 集成配置（可选，默认使用模拟模式） */
  llm?: EnginLLMConfig;
  /** Plugins configuration (Phase 2) */
  plugins?: PluginConfig;
}

/** Plugins configuration */
export interface PluginConfig {
  /** 插件目录 */
  plugin_dir?: string;
  /** 是否自动加载插件 */
  auto_load?: boolean;
  /** 插件特定配置 */
  [pluginId: string]: unknown;
  /** 沙箱策略 */
  sandbox_policy?: import('./plugin-types.js').SandboxPolicy;
}

/** LLM 集成配置（Engine 层） */
export interface EnginLLMConfig {
  /** 是否启用真实 LLM API（默认 false，使用模拟） */
  enabled?: boolean;

  /** LLM 提供者选择 */
  provider?: 'claude' | 'openai' | 'simulation';

  /** Claude API 配置 */
  claude?: {
    /** API Key */
    apiKey: string;
    /** 基础 URL（可选） */
    baseUrl?: string;
    /** 模型名称（可选） */
    model?: string;
  };

  /** OpenAI API 配置 */
  openai?: {
    /** API Key */
    apiKey: string;
    /** 基础 URL（可选） */
    baseUrl?: string;
    /** 模型名称（可选） */
    model?: string;
  };

  /** 批处理配置 */
  batch?: {
    /** 是否启用批处理 */
    enabled?: boolean;
    /** 最大批次大小 */
    maxBatchSize?: number;
    /** 最大等待时间（毫秒） */
    maxWaitTime?: number;
  };

  /** 缓存配置 */
  cache?: {
    /** 是否启用缓存 */
    enabled?: boolean;
    /** 最大缓存条目数 */
    maxSize?: number;
    /** 过期时间（毫秒） */
    ttl?: number;
  };
}

/** Risk thresholds configuration */
export interface RiskThresholds {
  /** Files count thresholds */
  file_count: { low: number; medium: number; high: number };
  /** Whether security keywords trigger higher risk */
  security_keywords_enabled: boolean;
  /** Custom risk rules */
  custom_rules: RiskRule[];
}

/** Custom risk assessment rule */
export interface RiskRule {
  name: string;
  condition: string;
  risk_increase: RiskLevel;
}

// ============================================================
// Project Configuration (per-project)
// ============================================================

/** Per-project configuration */
export interface ProjectConfig {
  name: string;
  description: string;
  archetype: ProjectArchetype;
  complexity?: ComplexityLevel;
  domain?: string;
  goals: string[];
  constraints?: string[];
  token_budget?: number;
  custom_agents?: string[];
  quality_gates?: QualityGate[];
}

/**
 * 质量门禁标准（混合格式）
 * 支持旧格式（pass_condition）和新格式（ISC expression）
 */
export interface QualityGateCriterion {
  /** 唯一标识符 */
  id: string;
  /** 标准名称 */
  name: string;
  /** 标准描述 */
  description?: string;

  // === 旧格式（向后兼容） ===
  /** 通过条件（自然语言字符串） */
  pass_condition?: string;

  // === 新格式（ISC 表达式） ===
  /** ISC 布尔表达式（推荐） */
  expression?: string;

  /** 预期的变量列表（用于验证） */
  expected_variables?: string[];

  // === 其他字段 ===
  /** 阈值（旧格式） */
  threshold?: number;
  /** 单位（旧格式） */
  unit?: string;
  /** 是否必须通过 */
  mandatory?: boolean;
  /** 失败时的操作 */
  failure_action?: 'block' | 'warn';
  /** 帮助文档链接 */
  help_url?: string;
}

/** 质量门禁定义（扩展版） */
export interface QualityGate {
  name: string;
  phase: Phase;
  /** 质量标准列表（支持混合格式） */
  criteria: QualityGateCriterion[];
  mandatory: boolean;
  /** 门禁描述 */
  description?: string;
  /** 配置文件路径 */
  config_file?: string;
  /** 失败时的全局操作 */
  failure_action?: 'block' | 'warn';
}

// ============================================================
// Events
// ============================================================

/** Engine event types for hooks and observability */
export enum EngineEvent {
  PROJECT_CREATED = 'project:created',
  PROJECT_STARTED = 'project:started',
  PROJECT_COMPLETED = 'project:completed',
  PROJECT_FAILED = 'project:failed',
  PROJECT_PAUSED = 'project:paused',
  PROJECT_RESUMED = 'project:resumed',
  PHASE_ENTERED = 'phase:entered',
  PHASE_COMPLETED = 'phase:completed',
  PHASE_FAILED = 'phase:failed',
  AGENT_STARTED = 'agent:started',
  AGENT_COMPLETED = 'agent:completed',
  AGENT_FAILED = 'agent:failed',
  AGENT_RETRYING = 'agent:retrying',
  CHECKPOINT_CREATED = 'checkpoint:created',
  CHECKPOINT_RESTORED = 'checkpoint:restored',
  DECISION_MADE = 'decision:made',
  MESSAGE_SENT = 'message:sent',
  RISK_ASSESSED = 'risk:assessed',
}

/** Event payload */
export interface EngineEventPayload {
  event: EngineEvent;
  timestamp: number;
  project_id: string;
  data: Record<string, unknown>;
}

/** Event handler function */
export type EventHandler = (payload: EngineEventPayload) => void | Promise<void>;

// ============================================================
// Logger
// ============================================================

/** Structured log entry */
export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  agent?: string;
  phase?: string;
  event: string;
  message: string;
  data?: Record<string, unknown>;
  trace_id?: string;
  duration_ms?: number;
  token_cost?: number;
}

// ============================================================
// Domain Configuration
// ============================================================

/** Domain-specific configuration loaded from JSON files */
export interface DomainConfig {
  name: string;
  description: string;
  archetype: ProjectArchetype;
  version: string;

  /** Phase-specific prompt templates */
  phase_prompts: Partial<Record<Phase, string>>;

  /** Agent overrides for this domain */
  agent_overrides: Record<string, AgentOverride>;

  /** Default project settings for this domain */
  defaults: DomainDefaults;

  /** Named prompt templates */
  templates: Record<string, string>;

  /** Domain-specific quality gates */
  quality_gates: QualityGate[];
}

/** Override configuration for a specific agent within a domain */
export interface AgentOverride {
  enabled: boolean;
  priority?: number;
  custom_prompt?: string;
  tools_override?: string[];
  token_budget_override?: number;
}

/** Default settings for a domain */
export interface DomainDefaults {
  complexity?: ComplexityLevel;
  token_budget?: number;
  max_concurrent_agents?: number;
  risk_thresholds_override?: Partial<RiskThresholds>;
}

// ============================================================
// Performance Metrics (Phase 2: Quality & Performance)
// ============================================================

/** Performance metrics for benchmarking and regression detection */
export interface PerformanceMetrics {
  // Agent 相关
  agent_startup_time: number;      // Agent 启动时间（ms）
  agent_execution_time: number;    // Agent 执行时间（ms）
  agent_concurrent_execution: number; // 并发执行效率（ops/s）

  // 检查点相关
  checkpoint_create_time: number;   // 检查点创建时间（ms）
  checkpoint_recovery_time: number; // 检查点恢复时间（ms）
  checkpoint_size_bytes: number;    // 检查点大小（字节）

  // 消息总线相关
  message_throughput: number;        // 消息吞吐量（msg/s）
  message_latency_ms: number;        // 消息延迟（ms）

  // 上下文分片相关
  context_shard_load_time: number;   // 上下文分片加载时间（ms）
  context_shard_compress_time: number; // 上下文压缩时间（ms）
  context_window_usage: number;      // 上下文窗口使用率（%）

  // 编排器相关
  orchestrator_init_time: number;    // 编排器初始化时间（ms）
  project_create_time: number;       // 项目创建时间（ms）
  phase_transition_time: number;     // 阶段转换时间（ms）

  // 内存相关
  memory_usage_mb: number;           // 内存使用（MB）
  memory_peak_mb: number;            // 峰值内存（MB）
}

/** Performance baseline data for regression detection */
export interface PerformanceBaseline {
  timestamp: number;
  metrics: PerformanceMetrics;
  environment: {
    node_version: string;
    platform: string;
    cpu_cores: number;
    total_memory_mb: number;
  };
}

/** Performance thresholds for CI/CD validation */
export interface PerformanceThresholds {
  agent_startup_time_100: number;  // 100 个 Agent 启动时间阈值（ms）
  checkpoint_create_time: number;   // 检查点创建时间阈值（ms）
  checkpoint_recovery_time: number; // 检查点恢复时间阈值（ms）
  message_throughput: number;       // 消息吞吐量阈值（msg/s）
  context_window_usage: number;     // 上下文窗口使用率阈值（%）
}

// ============================================================
// Guardian Intervention Types (Phase 2: P0 任务)
// ============================================================

/** 干预动作类型 - 自动干预的可能动作 */
export enum InterventionAction {
  PAUSE = 'pause',           // 暂停项目
  ROLLBACK = 'rollback',     // 回滚到检查点
  SCALE = 'scale',           // 缩减资源（降低 Agent 数量）
  ALERT = 'alert',           // 仅告警
  IGNORE = 'ignore',         // 忽略
}

/** 异常模式类型 */
export type AnomalyType = 'performance' | 'budget' | 'failure' | 'governance';

/** 异常严重程度 */
export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

/** 异常模式 - 触发干预的异常检测 */
export interface AnomalyPattern {
  type: AnomalyType;
  severity: AnomalySeverity;
  projectId: string;
  message: string;
  details: Record<string, unknown>;
}

/** 干预结果 - 干预执行的结果 */
export interface InterventionResult {
  action: InterventionAction;
  executed: boolean;
  requiresConfirmation: boolean;
  confirmed: boolean;
  message: string;
  details: Record<string, unknown>;
  timestamp: number;
}

/** 人工确认回调函数类型 */
export type ConfirmationCallback = (
  action: InterventionAction,
  anomaly: AnomalyPattern,
) => Promise<boolean>;

/** 干预配置 */
export interface InterventionConfig {
  /** 是否启用自动干预 */
  auto_intervention_enabled: boolean;
  /** 是否启用人工确认（高风险干预） */
  confirmation_required: boolean;
  /** 默认人工确认回调 */
  confirmation_callback?: ConfirmationCallback;
  /** 自动暂停的严重程度阈值 */
  auto_pause_threshold: AnomalySeverity;
  /** 自动回滚的严重程度阈值 */
  auto_rollback_threshold: AnomalySeverity;
  /** 缩减资源的阈值 */
  scale_down_threshold: AnomalySeverity;
  /** 最大确认等待时间（毫秒） */
  confirmation_timeout_ms: number;
}

/** 干预历史记录 */
export interface InterventionRecord {
  id: string;
  projectId: string;
  anomaly: AnomalyPattern;
  result: InterventionResult;
  timestamp: number;
}

// ============================================================
// Enhanced Rollback Types (Phase 2: Rollback Enhancement)
// ============================================================

/** 回滚预览 - 展示回滚前后的差异和风险评估 */
export interface RollbackPreview {
  /** 目标检查点 */
  targetCheckpoint: Checkpoint;
  /** 当前项目状态 */
  currentState: ProjectState;
  /** 变更详情 */
  changes: {
    /** 将被移除的 artifacts（当前有但检查点没有） */
    willBeRemoved: Artifact[];
    /** 将被添加的 artifacts（检查点有但当前没有） */
    willBeAdded: Artifact[];
    /** 阶段变化 */
    phaseWillChange: { from: Phase; to: Phase };
    /** 将丢失的决策数量 */
    decisionsWillBeLost: number;
    /** Token 使用量差异（正数=增加，负数=减少） */
    tokenUsageDifference: number;
  };
  /** 风险评估列表 */
  risks: string[];
}

/** 回滚选项 - 控制回滚行为 */
export interface RollbackOptions {
  /** 回滚范围 */
  scope?: 'full' | 'state' | 'artifacts' | 'decisions';

  /** 保留部分当前状态 */
  preserve?: {
    /** 保留指定 artifact IDs */
    artifacts?: string[];
    /** 保留指定决策索引 */
    decisions?: number[];
    /** 保留累计 token 使用 */
    tokenUsage?: boolean;
  };

  /** 安全选项 */
  /** 回滚前先创建备份 */
  createBackup?: boolean;
  /** 跳过确认和风险检查 */
  force?: boolean;
}

/** 回滚记录 - 历史回滚操作记录 */
export interface RollbackRecord {
  rollbackId: string;
  timestamp: number;
  fromCheckpoint: string;
  toCheckpoint?: string;
  projectId: string;
  options: RollbackOptions;
  preview: RollbackPreview;
  success: boolean;
  error?: string;
}

// ============================================================
// Decomposer Types (Phase 4)
// ============================================================

/** 分解策略类型 */
export type DecompositionStrategy =
  | 'functional'     // 按功能模块分解
  | 'layered'        // 按架构层次分解
  | 'dependency'     // 按依赖关系分解
  | 'domain'         // 按业务域分解
  | 'hybrid';        // 混合策略

/** 分解粒度 */
export type DecompositionGranularity = 'fine' | 'medium' | 'coarse';

/** 任务优先级 */
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

/** 任务状态 */
export type TaskStatus = 'pending' | 'ready' | 'in_progress' | 'completed' | 'blocked' | 'failed';

/** 子项目/任务定义 */
export interface SubProjectDefinition {
  sub_project_id: string;
  parent_project_id: string;
  name: string;
  description: string;
  archetype: ProjectArchetype;
  complexity: ComplexityLevel;
  goals: string[];
  dependencies: string[]; // 依赖的 sub_project_id 列表
  priority: TaskPriority;
  estimated_tokens?: number;
  status: TaskStatus;
  metadata: Record<string, unknown>;
}

/** 分解树节点 */
export interface DecompositionNode {
  node_id: string;
  sub_project: SubProjectDefinition;
  children: DecompositionNode[];
  level: number; // 在树中的层级（0 = 根项目）
  path: string[]; // 从根到当前节点的路径
}

/** 依赖关系 */
export interface DependencyEdge {
  from: string; // sub_project_id
  to: string;   // sub_project_id
  type: 'hard' | 'soft'; // 硬依赖 vs 软依赖
  reason?: string;
}

/** 分解配置 */
export interface DecompositionConfig {
  strategy: DecompositionStrategy;
  granularity: DecompositionGranularity;
  max_depth: number; // 最大分解深度
  min_task_size: number; // 最小任务大小（token 数）
  parallel_threshold: number; // 可并行执行的阈值
  auto_prioritize: boolean; // 自动优先级排序
  include_tests: boolean; // 是否包含测试任务
}

/** 分解结果 */
export interface DecompositionResult {
  decomposition_id: string;
  root_project_id: string;
  root_project_name: string;
  archetype: ProjectArchetype;
  sub_projects: SubProjectDefinition[];
  decomposition_tree: DecompositionNode;
  dependency_graph: DependencyEdge[];
  execution_order: string[][]; // 每层可并行执行的任务组
  estimated_total_tokens: number;
  estimated_parallelism: number;
  decomposition_strategy: DecompositionStrategy;
  granularity: DecompositionGranularity;
  created_at: number;
  updated_at: number;
}

/** 分解调整选项 */
export interface DecompositionAdjustmentOptions {
  /** 重新分解时使用的策略 */
  strategy?: DecompositionStrategy;
  /** 新的分解粒度 */
  granularity?: DecompositionGranularity;
  /** 最大深度调整 */
  max_depth?: number;
  /** 合并指定的子项目 */
  merge_subprojects?: string[];
  /** 拆分指定的子项目 */
  split_subprojects?: string[];
  /** 添加新的依赖关系 */
  add_dependencies?: Array<{ from: string; to: string; type?: 'hard' | 'soft' }>;
  /** 移除依赖关系 */
  remove_dependencies?: Array<{ from: string; to: string }>;
  /** 更新任务优先级 */
  update_priorities?: Array<{ sub_project_id: string; priority: TaskPriority }>;
}
