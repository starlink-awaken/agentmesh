/**
 * Honeycomb v2 - 异常检测系统类型定义
 *
 * 定义异常自动化检测功能的核心类型：
 * - 检测规则 Schema
 * - 规则条件与操作符
 * - 规则引擎配置
 * - 异常检测结果
 */

import type { ProjectState, Phase, RiskLevel } from './types.js';

// ============================================================
// 规则操作符类型
// ============================================================

/** 规则比较操作符 */
export type RuleOperator =
  | 'eq'          // 等于
  | 'ne'          // 不等于
  | 'gt'          // 大于
  | 'gte'         // 大于等于
  | 'lt'          // 小于
  | 'lte'         // 小于等于
  | 'contains'    // 包含字符串
  | 'not_contains' // 不包含字符串
  | 'matches'     // 正则匹配
  | 'in'          // 在列表中
  | 'not_in';     // 不在列表中

/** 逻辑操作符 */
export type LogicalOperator = 'and' | 'or' | 'not';

// ============================================================
// 规则条件定义
// ============================================================

/** 单个规则条件 */
export interface RuleCondition {
  /** 要检查的指标路径（支持点号分隔的嵌套路径） */
  metric: string;
  /** 比较操作符 */
  operator: RuleOperator;
  /** 比较值（可以是数字、字符串或数组） */
  value: unknown;
  /** 权重（用于多条件评分）0-1 */
  weight?: number;
}

/** 复合规则条件（支持逻辑组合） */
export interface CompositeRuleCondition {
  /** 逻辑操作符 */
  operator: LogicalOperator;
  /** 子条件列表 */
  conditions: Array<RuleCondition | CompositeRuleCondition>;
  /** 权重 0-1 */
  weight?: number;
}

/** 规则条件类型 */
export type Condition = RuleCondition | CompositeRuleCondition;

// ============================================================
// 异常检测规则定义
// ============================================================

/** 规则触发频率 */
export type RuleFrequency =
  | 'once'           // 仅触发一次
  | 'always'         // 每次检查都触发
  | 'sliding'        // 滑动窗口（需要 window_size）
  | 'burst';         // 爆发检测（需要 burst_threshold）

/** 规则状态 */
export type RuleStatus = 'active' | 'disabled' | 'deprecated';

/** 异常检测规则定义 */
export interface AnomalyDetectionRule {
  /** 规则唯一标识符 */
  id: string;
  /** 规则名称 */
  name: string;
  /** 规则描述 */
  description: string;
  /** 规则状态 */
  status: RuleStatus;
  /** 规则类别（性能/预算/失败/治理/自定义） */
  category: 'performance' | 'budget' | 'failure' | 'governance' | 'custom';
  /** 检测条件 */
  condition: Condition;
  /** 触发频率 */
  frequency: RuleFrequency;
  /** 滑动窗口大小（当 frequency=sliding 时使用） */
  window_size?: number;
  /** 爆发阈值（当 frequency=burst 时使用） */
  burst_threshold?: number;
  /** 触发后的严重程度 */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** 触发后的干预动作 */
  intervention_action: 'pause' | 'rollback' | 'scale' | 'alert' | 'ignore';
  /** 干预动作是否需要确认 */
  requires_confirmation: boolean;
  /** 冷却时间（毫秒）- 同一规则两次触发的最小间隔 */
  cooldown_ms: number;
  /** 规则适用的项目类型（空表示全部） */
  applicable_archetypes?: string[];
  /** 规则适用的阶段（空表示全部） */
  applicable_phases?: Phase[];
  /** 自定义元数据 */
  metadata?: Record<string, unknown>;
  /** 创建时间 */
  created_at: number;
  /** 更新时间 */
  updated_at: number;
}

// ============================================================
// 监控指标定义
// ============================================================

/** 监控指标快照 */
export interface MonitoringMetrics {
  /** 项目 ID */
  project_id: string;
  /** 当前阶段 */
  current_phase: Phase;
  /** 阶段持续时间（毫秒） */
  phase_duration_ms: number;
  /** Token 使用总量 */
  total_token_usage: number;
  /** Token 预算 */
  token_budget: number;
  /** Token 使用率 */
  token_usage_ratio: number;
  /** Agent 失败总数 */
  agent_failure_count: number;
  /** 连续失败次数 */
  consecutive_failures: number;
  /** 阶段重试次数 */
  phase_retry_count: number;
  /** 活跃 Agent 数量 */
  active_agents: number;
  /** 平均 Agent 执行时间（毫秒） */
  avg_agent_execution_time_ms: number;
  /** 消息总数 */
  total_messages: number;
  /** 消息吞吐量（msg/s） */
  message_throughput: number;
  /** 检查点数量 */
  checkpoint_count: number;
  /** 上次检查点时间（毫秒） */
  last_checkpoint_age_ms: number;
  /** 内存使用（MB） */
  memory_usage_mb: number;
  /** 时间戳 */
  timestamp: number;
}

// ============================================================
// 异常检测结果
// ============================================================

/** 单个规则评估结果 */
export interface RuleEvaluationResult {
  /** 规则 ID */
  rule_id: string;
  /** 规则名称 */
  rule_name: string;
  /** 是否触发 */
  triggered: boolean;
  /** 匹配分数（0-1） */
  score: number;
  /** 触发消息 */
  message: string;
  /** 评估详情 */
  details: Record<string, unknown>;
  /** 评估时间戳 */
  timestamp: number;
}

/** 异常检测结果 */
export interface AnomalyDetectionResult {
  /** 检测 ID */
  detection_id: string;
  /** 项目 ID */
  project_id: string;
  /** 是否检测到异常 */
  has_anomaly: boolean;
  /** 触发的规则列表 */
  triggered_rules: RuleEvaluationResult[];
  /** 最高严重程度 */
  max_severity: 'low' | 'medium' | 'high' | 'critical' | 'none';
  /** 建议的干预动作 */
  recommended_action: 'pause' | 'rollback' | 'scale' | 'alert' | 'ignore';
  /** 异常消息摘要 */
  summary: string;
  /** 检测时间戳 */
  timestamp: number;
  /** 监控指标快照 */
  metrics: MonitoringMetrics;
}

// ============================================================
// 规则引擎配置
// ============================================================

/** 规则引擎配置 */
export interface RuleEngineConfig {
  /** 是否启用规则引擎 */
  enabled: boolean;
  /** 检查间隔（毫秒） */
  check_interval_ms: number;
  /** 最大并发规则评估数 */
  max_concurrent_evaluations: number;
  /** 规则评估超时（毫秒） */
  evaluation_timeout_ms: number;
  /** 是否缓存评估结果 */
  cache_results: boolean;
  /** 缓存 TTL（毫秒） */
  cache_ttl_ms: number;
  /** 默认冷却时间（毫秒） */
  default_cooldown_ms: number;
  /** 最大历史记录数 */
  max_history_size: number;
  /** 是否启用自动干预 */
  auto_intervention_enabled: boolean;
}

/** 默认规则引擎配置 */
export const DEFAULT_RULE_ENGINE_CONFIG: RuleEngineConfig = {
  enabled: true,
  check_interval_ms: 5000,
  max_concurrent_evaluations: 10,
  evaluation_timeout_ms: 1000,
  cache_results: true,
  cache_ttl_ms: 10000,
  default_cooldown_ms: 60000,
  max_history_size: 1000,
  auto_intervention_enabled: false,
};

// ============================================================
// 规则触发历史
// ============================================================

/** 规则触发记录 */
export interface RuleTriggerRecord {
  /** 触发 ID */
  id: string;
  /** 规则 ID */
  rule_id: string;
  /** 规则名称 */
  rule_name: string;
  /** 项目 ID */
  project_id: string;
  /** 触发时间 */
  timestamp: number;
  /** 严重程度 */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** 触发消息 */
  message: string;
  /** 触发详情 */
  details: Record<string, unknown>;
  /** 是否执行了干预 */
  intervention_executed: boolean;
  /** 干预动作 */
  intervention_action?: 'pause' | 'rollback' | 'scale' | 'alert' | 'ignore';
  /** 干预结果 */
  intervention_result?: 'success' | 'failed' | 'cancelled';
}

// ============================================================
// 预定义规则模板
// ============================================================

/** 预定义规则模板类型 */
export type RuleTemplateType =
  | 'stuck-phase'
  | 'token-budget-exhausted'
  | 'consecutive-failures'
  | 'memory-leak'
  | 'high-failure-rate'
  | 'low-throughput'
  | 'checkpoint-stale'
  | 'phase-timeout';

/** 预定义规则模板 */
export interface RuleTemplate {
  /** 模板类型 */
  type: RuleTemplateType;
  /** 模板名称 */
  name: string;
  /** 模板描述 */
  description: string;
  /** 默认规则配置 */
  default_rule: Partial<AnomalyDetectionRule>;
  /** 可配置参数 */
  configurable_params: Array<{
    name: string;
    type: 'number' | 'string' | 'boolean' | 'array';
    description: string;
    default_value: unknown;
  }>;
}
