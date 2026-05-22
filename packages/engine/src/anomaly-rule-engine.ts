/**
 * Honeycomb v2 - 异常检测规则引擎
 *
 * 核心功能：
 * - 规则注册与管理
 * - 规则条件评估
 * - 规则触发检测
 * - 滑动窗口与爆发检测
 * - 规则冷却机制
 * - 预定义规则模板
 */

import { randomUUID } from 'node:crypto';
import type {
  AnomalyDetectionRule,
  RuleEvaluationResult,
  AnomalyDetectionResult,
  MonitoringMetrics,
  Condition,
  RuleCondition,
  CompositeRuleCondition,
  RuleOperator,
  RuleEngineConfig,
  RuleTriggerRecord,
  RuleTemplate,
  RuleTemplateType,
} from './anomaly-detection-types.js';
import type { Phase } from './types.js';

// 内部默认配置
const INTERNAL_DEFAULT_RULE_ENGINE_CONFIG: RuleEngineConfig = {
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
// 规则评估缓存
// ============================================================

interface CacheEntry {
  result: RuleEvaluationResult;
  expires_at: number;
}

// ============================================================
// 触发历史窗口（用于滑动窗口和爆发检测）
// ============================================================

interface TriggerWindow {
  rule_id: string;
  project_id: string;
  timestamps: number[];
}

// ============================================================
// 规则引擎类
// ============================================================

export class AnomalyRuleEngine {
  private readonly config: RuleEngineConfig;
  private readonly rules: Map<string, AnomalyDetectionRule> = new Map();
  private readonly triggerHistory: RuleTriggerRecord[] = [];
  private readonly evaluationCache: Map<string, CacheEntry> = new Map();
  private readonly triggerWindows: Map<string, TriggerWindow> = new Map();
  private readonly lastTriggerTimes: Map<string, number> = new Map();
  private readonly templates: Map<RuleTemplateType, RuleTemplate> = new Map();

  constructor(config?: Partial<RuleEngineConfig>) {
    this.config = { ...INTERNAL_DEFAULT_RULE_ENGINE_CONFIG, ...config };
    this.registerBuiltinTemplates();
  }

  // ============================================================
  // 规则管理
  // ============================================================

  /**
   * 注册新规则
   */
  registerRule(rule: AnomalyDetectionRule): void {
    // 验证规则
    this.validateRule(rule);

    // 设置默认值
    const normalizedRule: AnomalyDetectionRule = {
      ...rule,
      cooldown_ms: rule.cooldown_ms ?? this.config.default_cooldown_ms,
      updated_at: Date.now(),
    };

    this.rules.set(normalizedRule.id, normalizedRule);
  }

  /**
   * 批量注册规则
   */
  registerRules(rules: AnomalyDetectionRule[]): void {
    for (const rule of rules) {
      this.registerRule(rule);
    }
  }

  /**
   * 取消注册规则
   */
  unregisterRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * 获取规则
   */
  getRule(ruleId: string): AnomalyDetectionRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * 获取所有规则
   */
  getAllRules(): AnomalyDetectionRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 获取活动规则
   */
  getActiveRules(): AnomalyDetectionRule[] {
    return this.getAllRules().filter((r) => r.status === 'active');
  }

  /**
   * 更新规则
   */
  updateRule(ruleId: string, updates: Partial<AnomalyDetectionRule>): boolean {
    const existing = this.rules.get(ruleId);
    if (!existing) return false;

    const updated: AnomalyDetectionRule = {
      ...existing,
      ...updates,
      id: ruleId, // 保持 ID 不变
      updated_at: Date.now(),
    };

    this.validateRule(updated);
    this.rules.set(ruleId, updated);
    return true;
  }

  /**
   * 启用/禁用规则
   */
  setRuleStatus(ruleId: string, status: 'active' | 'disabled'): boolean {
    return this.updateRule(ruleId, { status });
  }

  // ============================================================
  // 规则评估
  // ============================================================

  /**
   * 评估单个规则
   */
  evaluateRule(
    rule: AnomalyDetectionRule,
    metrics: MonitoringMetrics,
  ): RuleEvaluationResult {
    const now = Date.now();

    // 检查冷却时间
    const lastTrigger = this.lastTriggerTimes.get(`${rule.id}_${metrics.project_id}`);
    if (lastTrigger && now - lastTrigger < rule.cooldown_ms) {
      return {
        rule_id: rule.id,
        rule_name: rule.name,
        triggered: false,
        score: 0,
        message: `规则在冷却期内（剩余 ${(rule.cooldown_ms - (now - lastTrigger)) / 1000} 秒）`,
        details: { reason: 'cooldown' },
        timestamp: now,
      };
    }

    // 检查缓存
    if (this.config.cache_results) {
      const cacheKey = this.getCacheKey(rule.id, metrics);
      const cached = this.evaluationCache.get(cacheKey);
      if (cached && cached.expires_at > now) {
        return cached.result;
      }
    }

    // 评估条件
    const conditionResult = this.evaluateCondition(rule.condition, metrics);
    let triggered = conditionResult.matched;

    // 检查频率控制
    if (triggered) {
      triggered = this.checkFrequency(rule, metrics.project_id, now);
    }

    const result: RuleEvaluationResult = {
      rule_id: rule.id,
      rule_name: rule.name,
      triggered,
      score: conditionResult.score,
      message: triggered
        ? `规则 "${rule.name}" 触发: ${rule.description}`
        : `规则 "${rule.name}" 未触发`,
      details: {
        condition_result: conditionResult,
        metrics_snapshot: this.getMetricsSnapshot(metrics),
      },
      timestamp: now,
    };

    // 缓存结果
    if (this.config.cache_results) {
      const cacheKey = this.getCacheKey(rule.id, metrics);
      this.evaluationCache.set(cacheKey, {
        result,
        expires_at: now + this.config.cache_ttl_ms,
      });
    }

    // 如果触发，记录触发时间
    if (triggered) {
      this.lastTriggerTimes.set(`${rule.id}_${metrics.project_id}`, now);
    }

    return result;
  }

  /**
   * 评估所有适用的规则
   */
  evaluateAllRules(
    metrics: MonitoringMetrics,
    phase?: Phase,
    archetype?: string,
  ): AnomalyDetectionResult {
    const now = Date.now();
    const detectionId = randomUUID();

    // 获取适用的规则
    const applicableRules = this.getApplicableRules(metrics.project_id, phase, archetype);

    // 评估所有规则
    const evaluationResults: RuleEvaluationResult[] = [];
    for (const rule of applicableRules) {
      const result = this.evaluateRule(rule, metrics);
      evaluationResults.push(result);
    }

    // 筛选触发的规则
    const triggeredRules = evaluationResults.filter((r) => r.triggered);

    // 确定最高严重程度
    const maxSeverity = this.getMaxSeverity(triggeredRules);

    // 确定建议动作
    const recommendedAction = this.getRecommendedAction(triggeredRules);

    // 生成摘要
    const summary = this.generateSummary(triggeredRules, metrics);

    const result: AnomalyDetectionResult = {
      detection_id: detectionId,
      project_id: metrics.project_id,
      has_anomaly: triggeredRules.length > 0,
      triggered_rules: triggeredRules,
      max_severity: maxSeverity,
      recommended_action: recommendedAction,
      summary,
      timestamp: now,
      metrics,
    };

    // 记录触发历史
    for (const triggered of triggeredRules) {
      this.recordTrigger(triggered, metrics);
    }

    // 清理过期缓存
    this.cleanExpiredCache(now);

    // 限制历史记录大小
    this.limitHistorySize();

    return result;
  }

  // ============================================================
  // 规则条件评估（私有方法）
  // ============================================================

  /**
   * 评估条件（支持复合条件）
   */
  private evaluateCondition(
    condition: Condition,
    metrics: MonitoringMetrics,
  ): { matched: boolean; score: number; details: unknown } {
    if (this.isCompositeCondition(condition)) {
      return this.evaluateCompositeCondition(condition, metrics);
    }
    return this.evaluateSimpleCondition(condition, metrics);
  }

  /**
   * 判断是否为复合条件
   */
  private isCompositeCondition(condition: Condition): condition is CompositeRuleCondition {
    return 'operator' in condition &&
      ('conditions' in condition) &&
      Array.isArray((condition as CompositeRuleCondition).conditions) &&
      ['and', 'or', 'not'].includes((condition as CompositeRuleCondition).operator);
  }

  /**
   * 评估简单条件
   */
  private evaluateSimpleCondition(
    condition: RuleCondition,
    metrics: MonitoringMetrics,
  ): { matched: boolean; score: number; details: unknown } {
    const actualValue = this.getMetricValue(metrics, condition.metric);
    const matched = this.compareValues(actualValue, condition.operator, condition.value);
    const score = matched ? (condition.weight ?? 1) : 0;

    return {
      matched,
      score,
      details: {
        metric: condition.metric,
        actual: actualValue,
        operator: condition.operator,
        expected: condition.value,
        matched,
      },
    };
  }

  /**
   * 评估复合条件
   */
  private evaluateCompositeCondition(
    condition: CompositeRuleCondition,
    metrics: MonitoringMetrics,
  ): { matched: boolean; score: number; details: unknown } {
    const results = condition.conditions.map((c) => this.evaluateCondition(c, metrics));

    let matched: boolean;
    switch (condition.operator) {
      case 'and':
        matched = results.every((r) => r.matched);
        break;
      case 'or':
        matched = results.some((r) => r.matched);
        break;
      case 'not':
        matched = !(results[0]?.matched ?? false);
        break;
      default:
        matched = false;
    }

    // 计算总分（平均分 * 权重）
    const totalScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const score = matched ? totalScore * (condition.weight ?? 1) : 0;

    return {
      matched,
      score,
      details: {
        operator: condition.operator,
        results,
      },
    };
  }

  /**
   * 比较值
   */
  private compareValues(actual: unknown, operator: RuleOperator, expected: unknown): boolean {
    switch (operator) {
      case 'eq':
        return actual === expected;
      case 'ne':
        return actual !== expected;
      case 'gt':
        return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      case 'gte':
        return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
      case 'lt':
        return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      case 'lte':
        return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
      case 'contains':
        return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
      case 'not_contains':
        return typeof actual === 'string' && typeof expected === 'string' && !actual.includes(expected);
      case 'matches':
        return typeof actual === 'string' && typeof expected === 'string' &&
          new RegExp(expected).test(actual);
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual);
      default:
        return false;
    }
  }

  /**
   * 获取指标值（支持点号分隔的路径）
   */
  private getMetricValue(metrics: MonitoringMetrics, path: string): unknown {
    const parts = path.split('.');
    let value: unknown = metrics;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  // ============================================================
  // 频率控制
  // ============================================================

  /**
   * 检查触发频率
   */
  private checkFrequency(rule: AnomalyDetectionRule, projectId: string, now: number): boolean {
    const windowKey = `${rule.id}_${projectId}`;

    switch (rule.frequency) {
      case 'once':
        // 只触发一次
        return !this.triggerWindows.has(windowKey);

      case 'always':
        // 总是触发
        return true;

      case 'sliding':
        // 滑动窗口
        return this.checkSlidingWindow(rule, projectId, now);

      case 'burst':
        // 爆发检测
        return this.checkBurst(rule, projectId, now);

      default:
        return true;
    }
  }

  /**
   * 检查滑动窗口
   */
  private checkSlidingWindow(rule: AnomalyDetectionRule, projectId: string, now: number): boolean {
    const windowKey = `${rule.id}_${projectId}`;
    const windowSize = rule.window_size ?? 5;

    let window = this.triggerWindows.get(windowKey);
    if (!window) {
      window = { rule_id: rule.id, project_id: projectId, timestamps: [] };
      this.triggerWindows.set(windowKey, window);
    }

    // 清理过期的时间戳
    const cutoff = now - 60000; // 1分钟窗口
    window.timestamps = window.timestamps.filter((t) => t > cutoff);

    // 检查是否超过阈值
    if (window.timestamps.length >= windowSize) {
      return false; // 窗口已满，不再触发
    }

    // 记录此次触发
    window.timestamps.push(now);
    return true;
  }

  /**
   * 检查爆发模式
   */
  private checkBurst(rule: AnomalyDetectionRule, projectId: string, now: number): boolean {
    const windowKey = `${rule.id}_${projectId}`;
    const threshold = rule.burst_threshold ?? 3;

    let window = this.triggerWindows.get(windowKey);
    if (!window) {
      window = { rule_id: rule.id, project_id: projectId, timestamps: [] };
      this.triggerWindows.set(windowKey, window);
    }

    // 清理过期的时间戳（5秒窗口）
    const cutoff = now - 5000;
    window.timestamps = window.timestamps.filter((t) => t > cutoff);

    // 检查是否超过爆发阈值
    if (window.timestamps.length >= threshold) {
      window.timestamps = []; // 重置窗口
      return true; // 检测到爆发
    }

    // 记录此次触发
    window.timestamps.push(now);
    return false;
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 获取适用的规则
   */
  private getApplicableRules(
    projectId: string,
    phase?: Phase,
    archetype?: string,
  ): AnomalyDetectionRule[] {
    return this.getActiveRules().filter((rule) => {
      // 检查阶段
      if (rule.applicable_phases && rule.applicable_phases.length > 0) {
        if (!phase || !rule.applicable_phases.includes(phase)) {
          return false;
        }
      }

      // 检查项目类型
      if (rule.applicable_archetypes && rule.applicable_archetypes.length > 0) {
        if (!archetype || !rule.applicable_archetypes.includes(archetype)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * 获取最高严重程度
   */
  private getMaxSeverity(triggeredRules: RuleEvaluationResult[]): 'low' | 'medium' | 'high' | 'critical' | 'none' {
    if (triggeredRules.length === 0) return 'none';

    const severityMap: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };

    let maxSeverity = 'low';
    let maxScore = 0;

    for (const rule of triggeredRules) {
      const ruleInfo = this.rules.get(rule.rule_id);
      if (ruleInfo && severityMap[ruleInfo.severity] > maxScore) {
        maxScore = severityMap[ruleInfo.severity];
        maxSeverity = ruleInfo.severity;
      }
    }

    return maxSeverity as 'low' | 'medium' | 'high' | 'critical';
  }

  /**
   * 获取建议的干预动作
   */
  private getRecommendedAction(triggeredRules: RuleEvaluationResult[]): 'pause' | 'rollback' | 'scale' | 'alert' | 'ignore' {
    if (triggeredRules.length === 0) return 'ignore';

    // 优先级：pause > rollback > scale > alert > ignore
    const actionPriority: Record<string, number> = {
      pause: 5,
      rollback: 4,
      scale: 3,
      alert: 2,
      ignore: 1,
    };

    let recommendedAction: 'pause' | 'rollback' | 'scale' | 'alert' | 'ignore' = 'ignore';
    let maxPriority = 0;

    for (const result of triggeredRules) {
      const rule = this.rules.get(result.rule_id);
      if (rule) {
        const priority = actionPriority[rule.intervention_action] ?? 0;
        if (priority > maxPriority) {
          maxPriority = priority;
          recommendedAction = rule.intervention_action;
        }
      }
    }

    return recommendedAction;
  }

  /**
   * 生成摘要
   */
  private generateSummary(triggeredRules: RuleEvaluationResult[], metrics: MonitoringMetrics): string {
    if (triggeredRules.length === 0) {
      return `项目 ${metrics.project_id} 运行正常，未检测到异常。`;
    }

    const ruleNames = triggeredRules.map((r) => r.rule_name).join('、');
    return `检测到 ${triggeredRules.length} 个异常: ${ruleNames}`;
  }

  /**
   * 获取缓存键
   */
  private getCacheKey(ruleId: string, metrics: MonitoringMetrics): string {
    // 使用关键指标值而不是 timestamp 来生成缓存键
    const snapshot = this.getMetricsSnapshot(metrics);
    const snapshotStr = JSON.stringify(snapshot);
    return `${ruleId}_${metrics.project_id}_${snapshotStr}`;
  }

  /**
   * 获取指标快照（用于缓存和记录）
   */
  private getMetricsSnapshot(metrics: MonitoringMetrics): Record<string, unknown> {
    return {
      project_id: metrics.project_id,
      current_phase: metrics.current_phase,
      phase_duration_ms: metrics.phase_duration_ms,
      token_usage_ratio: metrics.token_usage_ratio,
      consecutive_failures: metrics.consecutive_failures,
      active_agents: metrics.active_agents,
    };
  }

  /**
   * 清理过期缓存
   */
  private cleanExpiredCache(now: number): void {
    for (const [key, entry] of this.evaluationCache) {
      if (entry.expires_at < now) {
        this.evaluationCache.delete(key);
      }
    }
  }

  /**
   * 限制历史记录大小
   */
  private limitHistorySize(): void {
    while (this.triggerHistory.length > this.config.max_history_size) {
      this.triggerHistory.shift();
    }
  }

  /**
   * 记录触发
   */
  private recordTrigger(result: RuleEvaluationResult, metrics: MonitoringMetrics): void {
    const rule = this.rules.get(result.rule_id);
    if (!rule) return;

    const record: RuleTriggerRecord = {
      id: randomUUID(),
      rule_id: result.rule_id,
      rule_name: result.rule_name,
      project_id: metrics.project_id,
      timestamp: result.timestamp,
      severity: rule.severity,
      message: result.message,
      details: result.details,
      intervention_executed: false, // 由外部执行
    };

    this.triggerHistory.push(record);
  }

  /**
   * 验证规则
   */
  private validateRule(rule: AnomalyDetectionRule): void {
    if (!rule.id || rule.id.trim() === '') {
      throw new Error('规则 ID 不能为空');
    }
    if (!rule.name || rule.name.trim() === '') {
      throw new Error('规则名称不能为空');
    }
    if (!['performance', 'budget', 'failure', 'governance', 'custom'].includes(rule.category)) {
      throw new Error(`无效的规则类别: ${rule.category}`);
    }
    if (!['low', 'medium', 'high', 'critical'].includes(rule.severity)) {
      throw new Error(`无效的严重程度: ${rule.severity}`);
    }
    if (!['pause', 'rollback', 'scale', 'alert', 'ignore'].includes(rule.intervention_action)) {
      throw new Error(`无效的干预动作: ${rule.intervention_action}`);
    }
  }

  // ============================================================
  // 历史记录查询
  // ============================================================

  /**
   * 获取触发历史
   */
  getTriggerHistory(projectId?: string, limit?: number): RuleTriggerRecord[] {
    let records = [...this.triggerHistory];

    if (projectId) {
      records = records.filter((r) => r.project_id === projectId);
    }

    // 最新的在前
    records.reverse();

    if (limit !== undefined && limit > 0) {
      records = records.slice(0, limit);
    }

    return records;
  }

  /**
   * 清空触发历史
   */
  clearTriggerHistory(): void {
    this.triggerHistory.length = 0;
  }

  // ============================================================
  // 预定义规则模板
  // ============================================================

  /**
   * 注册内置规则模板
   */
  private registerBuiltinTemplates(): void {
    // 卡住阶段检测
    this.registerTemplate({
      type: 'stuck-phase',
      name: '阶段卡住检测',
      description: '检测阶段是否超过最大执行时间',
      default_rule: {
        id: 'stuck-phase-default',
        name: '阶段卡住检测',
        description: '阶段执行时间超过阈值',
        status: 'active',
        category: 'performance',
        condition: {
          metric: 'phase_duration_ms',
          operator: 'gte',
          value: 300000, // 5分钟
          weight: 1,
        },
        frequency: 'always',
        severity: 'high',
        intervention_action: 'pause',
        requires_confirmation: true,
        cooldown_ms: 60000,
      },
      configurable_params: [
        {
          name: 'max_duration_ms',
          type: 'number',
          description: '最大阶段执行时间（毫秒）',
          default_value: 300000,
        },
      ],
    });

    // Token 预算耗尽检测
    this.registerTemplate({
      type: 'token-budget-exhausted',
      name: 'Token 预算耗尽检测',
      description: '检测 Token 预算是否耗尽',
      default_rule: {
        id: 'token-budget-exhausted-default',
        name: 'Token 预算耗尽',
        description: 'Token 使用率达到 100%',
        status: 'active',
        category: 'budget',
        condition: {
          metric: 'token_usage_ratio',
          operator: 'gte',
          value: 1.0,
          weight: 1,
        },
        frequency: 'always',
        severity: 'critical',
        intervention_action: 'pause',
        requires_confirmation: false,
        cooldown_ms: 30000,
      },
      configurable_params: [
        {
          name: 'threshold',
          type: 'number',
          description: '使用率阈值（0-1）',
          default_value: 1.0,
        },
      ],
    });

    // 连续失败检测
    this.registerTemplate({
      type: 'consecutive-failures',
      name: '连续失败检测',
      description: '检测连续 Agent 失败次数',
      default_rule: {
        id: 'consecutive-failures-default',
        name: '连续失败检测',
        description: '连续 Agent 失败次数超过阈值',
        status: 'active',
        category: 'failure',
        condition: {
          metric: 'consecutive_failures',
          operator: 'gte',
          value: 3,
          weight: 1,
        },
        frequency: 'always',
        severity: 'high',
        intervention_action: 'rollback',
        requires_confirmation: true,
        cooldown_ms: 60000,
      },
      configurable_params: [
        {
          name: 'threshold',
          type: 'number',
          description: '连续失败阈值',
          default_value: 3,
        },
      ],
    });

    // 内存泄漏检测
    this.registerTemplate({
      type: 'memory-leak',
      name: '内存泄漏检测',
      description: '检测内存使用是否持续增长',
      default_rule: {
        id: 'memory-leak-default',
        name: '内存泄漏检测',
        description: '内存使用超过阈值',
        status: 'active',
        category: 'performance',
        condition: {
          metric: 'memory_usage_mb',
          operator: 'gte',
          value: 1000, // 1GB
          weight: 1,
        },
        frequency: 'sliding',
        window_size: 3,
        severity: 'high',
        intervention_action: 'pause',
        requires_confirmation: true,
        cooldown_ms: 120000,
      },
      configurable_params: [
        {
          name: 'threshold_mb',
          type: 'number',
          description: '内存阈值（MB）',
          default_value: 1000,
        },
      ],
    });
  }

  /**
   * 注册规则模板
   */
  registerTemplate(template: RuleTemplate): void {
    this.templates.set(template.type, template);
  }

  /**
   * 获取规则模板
   */
  getTemplate(type: RuleTemplateType): RuleTemplate | undefined {
    return this.templates.get(type);
  }

  /**
   * 获取所有模板
   */
  getAllTemplates(): RuleTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * 从模板创建规则
   */
  createRuleFromTemplate(
    templateType: RuleTemplateType,
    params: Record<string, unknown>,
    customizations?: Partial<AnomalyDetectionRule>,
  ): AnomalyDetectionRule {
    const template = this.templates.get(templateType);
    if (!template) {
      throw new Error(`未找到模板: ${templateType}`);
    }

    // 应用参数到默认规则
    const rule: AnomalyDetectionRule = {
      ...template.default_rule,
      id: customizations?.id ?? `${templateType}-${randomUUID()}`,
      name: customizations?.name ?? template.name,
      description: customizations?.description ?? template.description,
      created_at: Date.now(),
      updated_at: Date.now(),
      ...customizations,
    } as AnomalyDetectionRule;

    // 应用参数
    for (const param of template.configurable_params) {
      if (param.name in params) {
        this.applyParamToRule(rule, param.name, params[param.name]);
      }
    }

    return rule;
  }

  /**
   * 应用参数到规则
   */
  private applyParamToRule(rule: AnomalyDetectionRule, paramName: string, value: unknown): void {
    // 根据参数名应用到相应的位置
    switch (paramName) {
      case 'max_duration_ms':
        if (this.isSimpleCondition(rule.condition)) {
          rule.condition.value = value;
        }
        break;
      case 'threshold':
      case 'threshold_mb':
        if (this.isSimpleCondition(rule.condition)) {
          rule.condition.value = value;
        }
        break;
    }
  }

  /**
   * 判断是否为简单条件
   */
  private isSimpleCondition(condition: Condition): condition is RuleCondition {
    return 'metric' in condition && 'operator' in condition && !('conditions' in condition);
  }

  // ============================================================
  // 统计信息
  // ============================================================

  /**
   * 获取统计信息
   */
  getStats(): {
    total_rules: number;
    active_rules: number;
    total_triggers: number;
    cache_size: number;
    templates_count: number;
  } {
    return {
      total_rules: this.rules.size,
      active_rules: this.getActiveRules().length,
      total_triggers: this.triggerHistory.length,
      cache_size: this.evaluationCache.size,
      templates_count: this.templates.size,
    };
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.evaluationCache.clear();
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建规则引擎实例
 */
export function createRuleEngine(config?: Partial<RuleEngineConfig>): AnomalyRuleEngine {
  return new AnomalyRuleEngine(config);
}

/**
 * 默认规则引擎实例
 */
export const defaultRuleEngine = createRuleEngine();
