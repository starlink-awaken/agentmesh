/**
 * Honeycomb v2 - Guardian Monitoring Engine
 *
 * Provides continuous monitoring of project execution with:
 * - Anomaly pattern detection (stuck phases, token budget overruns, repeated failures)
 * - Policy enforcement (governance compliance, quality gates)
 * - Automatic escalation and intervention
 * - Alert history and monitoring statistics
 * - Intelligent intervention decision making (P0: 自动干预逻辑)
 */

import { randomUUID } from 'node:crypto';
import { EngineEvent, InterventionAction } from './types.js';
import type {
  EngineEventPayload,
  EventHandler,
  AnomalyPattern,
  InterventionResult,
  InterventionConfig,
  InterventionRecord,
  AnomalySeverity,
  AnomalyType,
  ConfirmationCallback,
} from './types.js';

// ============================================================
// Alert Types
// ============================================================

/** Severity levels for guardian alerts, ordered from least to most severe */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/** Categories that classify the nature of a guardian alert */
export enum AlertCategory {
  PERFORMANCE = 'performance',
  BUDGET = 'budget',
  FAILURE = 'failure',
  GOVERNANCE = 'governance',
  ANOMALY = 'anomaly',
}

// ============================================================
// Interfaces
// ============================================================

/** A structured alert raised by the guardian when a policy violation is detected */
export interface GuardianAlert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  message: string;
  details: Record<string, unknown>;
  timestamp: number;
  acknowledged: boolean;
  auto_action_taken?: string;
}

/** A pluggable policy that the guardian evaluates on every check cycle */
export interface GuardianPolicy {
  name: string;
  enabled: boolean;
  check: (context: MonitoringContext) => GuardianAlert | null;
}

/** Snapshot of the current monitoring state for a project */
export interface MonitoringContext {
  project_id: string;
  current_phase: string;
  phase_duration_ms: number;
  total_token_usage: number;
  token_budget: number;
  agent_failure_count: number;
  consecutive_failures: number;
  phase_retry_count: number;
  active_agents: number;
}

/** Configuration options for the guardian engine */
export interface GuardianConfig {
  /** Whether the guardian is enabled */
  enabled: boolean;
  /** Interval between policy check cycles in milliseconds */
  check_interval_ms: number;
  /** Maximum allowed phase duration before raising an alert */
  max_phase_duration_ms: number;
  /** Token budget usage ratio that triggers a warning (0.0 - 1.0) */
  token_budget_warning_threshold: number;
  /** Maximum consecutive agent failures before escalation */
  max_consecutive_failures: number;
  /** Maximum number of alerts retained in history (FIFO eviction) */
  max_alerts_history: number;
  /** 干预配置 (P0: 自动干预逻辑) */
  intervention?: Partial<InterventionConfig>;
}

/** 默认干预配置 */
const DEFAULT_INTERVENTION_CONFIG: InterventionConfig = {
  auto_intervention_enabled: true,
  confirmation_required: true,
  auto_pause_threshold: 'critical',
  auto_rollback_threshold: 'critical',
  scale_down_threshold: 'high',
  confirmation_timeout_ms: 30000, // 30 秒
};

/** Aggregate statistics about the guardian's operation */
export interface GuardianStats {
  total_alerts: number;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  policies_count: number;
  is_running: boolean;
  // P0: 干预统计
  total_interventions: number;
  interventions_by_action: Record<string, number>;
}

// ============================================================
// Constants
// ============================================================

/** Default guardian configuration values */
const DEFAULT_CONFIG: GuardianConfig = {
  enabled: true,
  check_interval_ms: 5000,
  max_phase_duration_ms: 300_000, // 5 minutes
  token_budget_warning_threshold: 0.8,
  max_consecutive_failures: 3,
  max_alerts_history: 1000,
};

// ============================================================
// Guardian Class
// ============================================================

export class Guardian {
  private readonly config: GuardianConfig;
  private readonly alerts: GuardianAlert[] = [];
  private readonly policies: GuardianPolicy[] = [];
  private readonly unsubscribers: Array<() => void> = [];
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;

  // Internal tracking state populated by engine events
  private projectContexts: Map<string, MonitoringContext> = new Map();
  private phaseStartTimes: Map<string, number> = new Map();
  private consecutiveFailures: Map<string, number> = new Map();
  private totalFailures: Map<string, number> = new Map();
  private governanceSkipped: Map<string, string[]> = new Map();

  // P0: 自动干预相关状态
  private interventionConfig: InterventionConfig;
  private interventionHistory: InterventionRecord[] = [];
  private interventionCallbacks: Map<string, ConfirmationCallback> = new Map();
  // 项目操作回调（暂停、回滚等）
  private projectPauseCallback?: (projectId: string, reason: string) => Promise<boolean>;
  private projectRollbackCallback?: (projectId: string, reason: string) => Promise<boolean>;
  private projectScaleCallback?: (projectId: string, scale: number, reason: string) => Promise<boolean>;

  constructor(config?: Partial<GuardianConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // 合并干预配置
    this.interventionConfig = {
      ...DEFAULT_INTERVENTION_CONFIG,
      ...config?.intervention,
    };
    this.registerDefaultPolicies();
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  /**
   * Start the guardian monitoring engine.
   *
   * Registers event handlers via the provided subscriber function and begins
   * periodic policy evaluation.  The subscriber should accept an EngineEvent
   * and an EventHandler, returning an unsubscribe function.
   *
   * @param eventSubscriber - Function to register engine event handlers
   */
  start(eventSubscriber: (event: EngineEvent, handler: EventHandler) => () => void): void {
    if (!this.config.enabled) return;
    if (this.running) return;

    this.running = true;

    // Subscribe to relevant engine events
    const eventsToWatch: EngineEvent[] = [
      EngineEvent.PROJECT_CREATED,
      EngineEvent.PROJECT_STARTED,
      EngineEvent.PROJECT_COMPLETED,
      EngineEvent.PROJECT_FAILED,
      EngineEvent.PHASE_ENTERED,
      EngineEvent.PHASE_COMPLETED,
      EngineEvent.PHASE_FAILED,
      EngineEvent.AGENT_STARTED,
      EngineEvent.AGENT_COMPLETED,
      EngineEvent.AGENT_FAILED,
      EngineEvent.AGENT_RETRYING,
      EngineEvent.CHECKPOINT_CREATED,
    ];

    for (const event of eventsToWatch) {
      const unsub = eventSubscriber(event, (payload) => this.handleEvent(payload));
      this.unsubscribers.push(unsub);
    }

    // Start periodic policy check cycle
    this.intervalHandle = setInterval(() => {
      this.runPeriodicChecks();
    }, this.config.check_interval_ms);
  }

  /**
   * Stop the guardian monitoring engine.
   *
   * Clears the periodic check interval and unsubscribes from all engine events.
   */
  stop(): void {
    this.running = false;

    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers.length = 0;
  }

  // ============================================================
  // Event Handling
  // ============================================================

  /**
   * Process an engine event and update internal monitoring state.
   *
   * This method is called for every subscribed engine event.  It maintains
   * the monitoring context that policies evaluate against, and triggers
   * immediate checks when critical events occur (e.g., agent failures).
   *
   * @param payload - The engine event payload to process
   */
  handleEvent(payload: EngineEventPayload): void {
    const { event, project_id, data, timestamp } = payload;

    switch (event) {
      case EngineEvent.PROJECT_CREATED:
      case EngineEvent.PROJECT_STARTED: {
        this.initProjectContext(project_id, data);
        break;
      }

      case EngineEvent.PHASE_ENTERED: {
        this.phaseStartTimes.set(project_id, timestamp);
        this.updateContext(project_id, {
          current_phase: (data.phase as string) ?? 'unknown',
          phase_duration_ms: 0,
          phase_retry_count: 0,
        });
        break;
      }

      case EngineEvent.PHASE_COMPLETED: {
        this.phaseStartTimes.delete(project_id);
        this.consecutiveFailures.set(project_id, 0);
        break;
      }

      case EngineEvent.PHASE_FAILED: {
        const retryCount = this.getContext(project_id)?.phase_retry_count ?? 0;
        this.updateContext(project_id, {
          phase_retry_count: retryCount + 1,
        });
        break;
      }

      case EngineEvent.AGENT_STARTED: {
        const ctx = this.getContext(project_id);
        if (ctx) {
          this.updateContext(project_id, {
            active_agents: ctx.active_agents + 1,
          });
        }
        break;
      }

      case EngineEvent.AGENT_COMPLETED: {
        const ctx = this.getContext(project_id);
        if (ctx) {
          this.updateContext(project_id, {
            active_agents: Math.max(0, ctx.active_agents - 1),
          });
        }
        this.consecutiveFailures.set(project_id, 0);

        // Update token usage if provided
        if (typeof data.token_usage === 'number') {
          const currentCtx = this.getContext(project_id);
          if (currentCtx) {
            this.updateContext(project_id, {
              total_token_usage: currentCtx.total_token_usage + (data.token_usage as number),
            });
          }
        }
        break;
      }

      case EngineEvent.AGENT_FAILED: {
        const ctx = this.getContext(project_id);
        if (ctx) {
          this.updateContext(project_id, {
            active_agents: Math.max(0, ctx.active_agents - 1),
          });
        }

        const prevConsecutive = this.consecutiveFailures.get(project_id) ?? 0;
        const newConsecutive = prevConsecutive + 1;
        this.consecutiveFailures.set(project_id, newConsecutive);

        const prevTotal = this.totalFailures.get(project_id) ?? 0;
        this.totalFailures.set(project_id, prevTotal + 1);

        this.updateContext(project_id, {
          consecutive_failures: newConsecutive,
          agent_failure_count: (this.totalFailures.get(project_id) ?? 0),
        });

        // Immediate policy check on failure events
        this.checkPoliciesForProject(project_id);
        break;
      }

      case EngineEvent.AGENT_RETRYING: {
        // Retries are tracked but do not reset the consecutive failure counter
        break;
      }

      case EngineEvent.PROJECT_COMPLETED:
      case EngineEvent.PROJECT_FAILED: {
        // Clean up tracking state for completed/failed projects
        this.phaseStartTimes.delete(project_id);
        this.consecutiveFailures.delete(project_id);
        this.totalFailures.delete(project_id);
        this.governanceSkipped.delete(project_id);
        this.projectContexts.delete(project_id);
        break;
      }

      case EngineEvent.CHECKPOINT_CREATED: {
        // Checkpoint creation is a healthy signal; no special handling needed
        break;
      }
    }
  }

  // ============================================================
  // Policy Management
  // ============================================================

  /**
   * Run all enabled policies against the given monitoring context.
   *
   * @param context - The monitoring context to evaluate
   * @returns Array of alerts generated by policy violations
   */
  checkPolicies(context: MonitoringContext): GuardianAlert[] {
    const alerts: GuardianAlert[] = [];

    for (const policy of this.policies) {
      if (!policy.enabled) continue;

      try {
        const alert = policy.check(context);
        if (alert !== null) {
          this.recordAlert(alert);
          alerts.push(alert);
        }
      } catch {
        // Policy check errors must not crash the guardian
      }
    }

    return alerts;
  }

  /**
   * Add a new policy to the guardian's policy set.
   *
   * If a policy with the same name already exists, it is replaced.
   *
   * @param policy - The policy to add
   */
  addPolicy(policy: GuardianPolicy): void {
    const existingIndex = this.policies.findIndex((p) => p.name === policy.name);
    if (existingIndex >= 0) {
      this.policies[existingIndex] = policy;
    } else {
      this.policies.push(policy);
    }
  }

  /**
   * Remove a policy by name.
   *
   * @param name - The name of the policy to remove
   */
  removePolicy(name: string): void {
    const index = this.policies.findIndex((p) => p.name === name);
    if (index >= 0) {
      this.policies.splice(index, 1);
    }
  }

  // ============================================================
  // Alert Management
  // ============================================================

  /**
   * Raise a new alert and record it in the alert history.
   *
   * @param severity   - The alert severity level
   * @param category   - The alert category
   * @param message    - Human-readable description of the alert
   * @param details    - Additional structured data about the alert
   * @param autoAction - Description of any automatic action taken
   * @returns The newly created alert
   */
  raiseAlert(
    severity: AlertSeverity,
    category: AlertCategory,
    message: string,
    details: Record<string, unknown> = {},
    autoAction?: string,
  ): GuardianAlert {
    const alert: GuardianAlert = {
      id: randomUUID(),
      severity,
      category,
      message,
      details,
      timestamp: Date.now(),
      acknowledged: false,
      auto_action_taken: autoAction,
    };

    this.recordAlert(alert);
    return alert;
  }

  /**
   * Acknowledge an alert by its ID, marking it as reviewed.
   *
   * @param alertId - The ID of the alert to acknowledge
   */
  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  /**
   * Retrieve alerts from history, optionally filtered by severity.
   *
   * @param severity - If provided, only return alerts of this severity
   * @param limit    - Maximum number of alerts to return (most recent first)
   * @returns Array of matching alerts, newest first
   */
  getAlerts(severity?: AlertSeverity, limit?: number): GuardianAlert[] {
    let result = [...this.alerts];

    if (severity !== undefined) {
      result = result.filter((a) => a.severity === severity);
    }

    // Return newest first
    result.reverse();

    if (limit !== undefined && limit > 0) {
      return result.slice(0, limit);
    }

    return result;
  }

  /**
   * Retrieve all unacknowledged alerts, newest first.
   *
   * @returns Array of unacknowledged alerts
   */
  getUnacknowledged(): GuardianAlert[] {
    return [...this.alerts]
      .filter((a) => !a.acknowledged)
      .reverse();
  }

  // ============================================================
  // Statistics
  // ============================================================

  /**
   * Get aggregate statistics about the guardian's current state.
   *
   * @returns A snapshot of guardian statistics
   */
  getStats(): GuardianStats {
    const bySeverity: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byAction: Record<string, number> = {};

    for (const alert of this.alerts) {
      bySeverity[alert.severity] = (bySeverity[alert.severity] ?? 0) + 1;
      byCategory[alert.category] = (byCategory[alert.category] ?? 0) + 1;
    }

    for (const record of this.interventionHistory) {
      byAction[record.result.action] = (byAction[record.result.action] ?? 0) + 1;
    }

    return {
      total_alerts: this.alerts.length,
      by_severity: bySeverity,
      by_category: byCategory,
      policies_count: this.policies.length,
      is_running: this.running,
      total_interventions: this.interventionHistory.length,
      interventions_by_action: byAction,
    };
  }

  // ============================================================
  // P0: 自动干预逻辑
  // ============================================================

  /**
   * 设置项目操作回调 - 允许 Guardian 执行干预动作
   *
   * @param pauseCallback - 暂停项目的回调
   * @param rollbackCallback - 回滚项目的回调
   * @param scaleCallback - 缩减资源的回调
   */
  setProjectCallbacks(
    pauseCallback?: (projectId: string, reason: string) => Promise<boolean>,
    rollbackCallback?: (projectId: string, reason: string) => Promise<boolean>,
    scaleCallback?: (projectId: string, scale: number, reason: string) => Promise<boolean>,
  ): void {
    this.projectPauseCallback = pauseCallback;
    this.projectRollbackCallback = rollbackCallback;
    this.projectScaleCallback = scaleCallback;
  }

  /**
   * 设置人工确认回调
   *
   * @param callback - 人工确认回调函数
   */
  setConfirmationCallback(callback: ConfirmationCallback): void {
    this.interventionConfig.confirmation_callback = callback;
  }

  /**
   * 根据异常自动决定干预动作
   *
   * 决策逻辑：
   * - critical 严重程度 → PAUSE
   * - high 性能异常 → SCALE
   * - high 预算异常 → PAUSE
   * - high 失败异常 → ROLLBACK
   * - medium/low → ALERT
   *
   * @param anomaly - 检测到的异常模式
   * @returns 应采取的干预动作
   */
  intervene(anomaly: AnomalyPattern): InterventionAction {
    const severity = anomaly.severity;
    const type = anomaly.type;

    // Critical: 总是暂停
    if (severity === 'critical') {
      return InterventionAction.PAUSE;
    }

    // High 性能问题: 尝试缩减资源
    if (type === 'performance' && severity === 'high') {
      return InterventionAction.SCALE;
    }

    // High 预算问题: 暂停以防超支
    if (type === 'budget' && severity === 'high') {
      return InterventionAction.PAUSE;
    }

    // High 失败问题: 回滚到安全检查点
    if (type === 'failure' && severity === 'high') {
      return InterventionAction.ROLLBACK;
    }

    // Medium/low: 仅告警
    if (severity === 'medium' || severity === 'low') {
      return InterventionAction.ALERT;
    }

    // 默认: 告警
    return InterventionAction.ALERT;
  }

  /**
   * 执行干预动作
   *
   * 根据配置决定是否需要人工确认，然后执行相应的干预动作。
   *
   * @param action - 要执行的干预动作
   * @param anomaly - 触发干预的异常
   * @returns 干预结果
   */
  async executeIntervention(action: InterventionAction, anomaly: AnomalyPattern): Promise<InterventionResult> {
    const timestamp = Date.now();
    const requiresConfirmation = this.requiresConfirmation(action);

    let confirmed = false;
    let executed = false;
    let message = '';
    const details: Record<string, unknown> = {
      anomaly_type: anomaly.type,
      anomaly_severity: anomaly.severity,
      project_id: anomaly.projectId,
    };

    // 检查是否需要人工确认
    if (requiresConfirmation) {
      confirmed = await this.requestConfirmation(action, anomaly);
      if (!confirmed) {
        return {
          action,
          executed: false,
          requiresConfirmation: true,
          confirmed: false,
          message: '干预被人工拒绝',
          details,
          timestamp,
        };
      }
    }

    // 执行干预动作
    switch (action) {
      case InterventionAction.PAUSE:
        executed = await this.pauseProject(anomaly);
        message = executed ? '项目已暂停' : '暂停项目失败';
        break;

      case InterventionAction.ROLLBACK:
        executed = await this.rollbackToSafeCheckpoint(anomaly);
        message = executed ? '项目已回滚到安全检查点' : '回滚失败';
        break;

      case InterventionAction.SCALE:
        executed = await this.scaleDownResources(anomaly);
        message = executed ? '资源已缩减' : '缩减资源失败';
        break;

      case InterventionAction.ALERT:
        executed = true; // 告警总是成功
        message = '已发出告警';
        break;

      case InterventionAction.IGNORE:
        executed = true;
        message = '异常已忽略';
        break;
    }

    const result: InterventionResult = {
      action,
      executed,
      requiresConfirmation,
      confirmed,
      message,
      details,
      timestamp,
    };

    // 记录干预历史
    this.recordIntervention(anomaly, result);

    return result;
  }

  /**
   * 检查干预动作是否需要人工确认
   *
   * @param action - 干预动作
   * @returns 是否需要确认
   */
  private requiresConfirmation(action: InterventionAction): boolean {
    // 如果禁用了自动干预，所有动作都需要确认
    if (!this.interventionConfig.auto_intervention_enabled) {
      return true;
    }

    // 如果全局启用了确认要求
    if (this.interventionConfig.confirmation_required) {
      return true;
    }

    // 高风险动作总是需要确认
    if (action === InterventionAction.PAUSE || action === InterventionAction.ROLLBACK) {
      return true;
    }

    return false;
  }

  /**
   * 请求人工确认
   *
   * @param action - 待确认的干预动作
   * @param anomaly - 触发干预的异常
   * @returns 是否确认
   */
  private async requestConfirmation(action: InterventionAction, anomaly: AnomalyPattern): Promise<boolean> {
    const callback = this.interventionConfig.confirmation_callback;
    if (callback) {
      try {
        return await callback(action, anomaly);
      } catch {
        // 回调出错，默认拒绝
        return false;
      }
    }

    // 没有设置回调，默认自动确认（仅用于测试）
    return true;
  }

  /**
   * 暂停项目
   *
   * @param anomaly - 触发暂停的异常
   * @returns 是否成功
   */
  private async pauseProject(anomaly: AnomalyPattern): Promise<boolean> {
    if (this.projectPauseCallback) {
      try {
        return await this.projectPauseCallback(
          anomaly.projectId,
          `自动干预暂停: ${anomaly.message}`,
        );
      } catch {
        return false;
      }
    }
    // 没有设置回调时，记录告警
    this.raiseAlert(
      AlertSeverity.CRITICAL,
      AlertCategory.ANOMALY,
      `项目 ${anomaly.projectId} 需要暂停: ${anomaly.message}`,
      anomaly.details,
      '自动暂停未配置回调',
    );
    return false;
  }

  /**
   * 回滚到安全检查点
   *
   * @param anomaly - 触发回滚的异常
   * @returns 是否成功
   */
  private async rollbackToSafeCheckpoint(anomaly: AnomalyPattern): Promise<boolean> {
    if (this.projectRollbackCallback) {
      try {
        return await this.projectRollbackCallback(
          anomaly.projectId,
          `自动干预回滚: ${anomaly.message}`,
        );
      } catch {
        return false;
      }
    }
    // 没有设置回调时，记录告警
    this.raiseAlert(
      AlertSeverity.ERROR,
      AlertCategory.ANOMALY,
      `项目 ${anomaly.projectId} 需要回滚: ${anomaly.message}`,
      anomaly.details,
      '自动回滚未配置回调',
    );
    return false;
  }

  /**
   * 缩减资源（降低 Agent 并发数）
   *
   * @param anomaly - 触发缩减的异常
   * @returns 是否成功
   */
  private async scaleDownResources(anomaly: AnomalyPattern): Promise<boolean> {
    if (this.projectScaleCallback) {
      try {
        // 默认缩减 50%
        return await this.projectScaleCallback(anomaly.projectId, 0.5, `自动干预缩减: ${anomaly.message}`);
      } catch {
        return false;
      }
    }
    // 没有设置回调时，记录告警
    this.raiseAlert(
      AlertSeverity.WARNING,
      AlertCategory.ANOMALY,
      `项目 ${anomaly.projectId} 建议缩减资源: ${anomaly.message}`,
      anomaly.details,
      '自动缩减未配置回调',
    );
    return false;
  }

  /**
   * 记录干预历史
   *
   * @param anomaly - 触发干预的异常
   * @param result - 干预结果
   */
  private recordIntervention(anomaly: AnomalyPattern, result: InterventionResult): void {
    const record: InterventionRecord = {
      id: randomUUID(),
      projectId: anomaly.projectId,
      anomaly,
      result,
      timestamp: Date.now(),
    };

    this.interventionHistory.push(record);

    // 限制历史记录数量
    const maxHistory = this.config.max_alerts_history;
    if (this.interventionHistory.length > maxHistory) {
      this.interventionHistory.splice(0, this.interventionHistory.length - maxHistory);
    }
  }

  /**
   * 获取干预历史记录
   *
   * @param projectId - 可选的项目 ID 过滤
   * @param limit - 最大返回数量
   * @returns 干预历史记录
   */
  getInterventionHistory(projectId?: string, limit?: number): InterventionRecord[] {
    let records = [...this.interventionHistory];

    if (projectId) {
      records = records.filter((r) => r.projectId === projectId);
    }

    // 最新的在前
    records.reverse();

    if (limit !== undefined && limit > 0) {
      records = records.slice(0, limit);
    }

    return records;
  }

  /**
   * 获取干预配置
   *
   * @returns 当前干预配置
   */
  getInterventionConfig(): InterventionConfig {
    return { ...this.interventionConfig };
  }

  /**
   * 更新干预配置
   *
   * @param updates - 配置更新
   */
  updateInterventionConfig(updates: Partial<InterventionConfig>): void {
    this.interventionConfig = { ...this.interventionConfig, ...updates };
  }

  /**
   * 将 GuardianAlert 转换为 AnomalyPattern
   *
   * @param alert - Guardian 告警
   * @returns 异常模式
   */
  alertToAnomaly(alert: GuardianAlert): AnomalyPattern {
    // 映射严重程度
    const severityMap: Record<string, AnomalySeverity> = {
      info: 'low',
      warning: 'medium',
      error: 'high',
      critical: 'critical',
    };

    // 映射类别
    const typeMap: Record<string, AnomalyType> = {
      performance: 'performance',
      budget: 'budget',
      failure: 'failure',
      governance: 'governance',
      anomaly: 'performance',
    };

    return {
      type: typeMap[alert.category] ?? 'performance',
      severity: severityMap[alert.severity] ?? 'medium',
      projectId: (alert.details.project_id as string) ?? 'unknown',
      message: alert.message,
      details: alert.details,
    };
  }

  /**
   * 自动处理告警 - 根据告警触发干预
   *
   * @param alert - Guardian 告警
   * @returns 干预结果（如果触发了干预）
   */
  async handleAlertWithIntervention(alert: GuardianAlert): Promise<InterventionResult | null> {
    // 转换为异常模式
    const anomaly = this.alertToAnomaly(alert);

    // 决定干预动作
    const action = this.intervene(anomaly);

    // 如果不是 IGNORE，则执行干预
    if (action !== InterventionAction.IGNORE) {
      return await this.executeIntervention(action, anomaly);
    }

    return null;
  }

  // ============================================================
  // Private: Context Management
  // ============================================================

  /**
   * Initialize a monitoring context for a new project.
   */
  private initProjectContext(projectId: string, data: Record<string, unknown>): void {
    const context: MonitoringContext = {
      project_id: projectId,
      current_phase: (data.phase as string) ?? 'init',
      phase_duration_ms: 0,
      total_token_usage: 0,
      token_budget: (data.token_budget as number) ?? 0,
      agent_failure_count: 0,
      consecutive_failures: 0,
      phase_retry_count: 0,
      active_agents: 0,
    };

    this.projectContexts.set(projectId, context);
    this.consecutiveFailures.set(projectId, 0);
    this.totalFailures.set(projectId, 0);
  }

  /**
   * Retrieve the current monitoring context for a project.
   */
  private getContext(projectId: string): MonitoringContext | undefined {
    return this.projectContexts.get(projectId);
  }

  /**
   * Merge partial updates into an existing project context.
   */
  private updateContext(projectId: string, updates: Partial<MonitoringContext>): void {
    const existing = this.projectContexts.get(projectId);
    if (existing) {
      Object.assign(existing, updates);
    }
  }

  // ============================================================
  // Private: Periodic Checks
  // ============================================================

  /**
   * Run policy checks for all active projects.
   * Called periodically by the check interval.
   */
  private runPeriodicChecks(): void {
    const now = Date.now();

    for (const [projectId, context] of this.projectContexts) {
      // Update phase duration based on elapsed time
      const phaseStart = this.phaseStartTimes.get(projectId);
      if (phaseStart !== undefined) {
        context.phase_duration_ms = now - phaseStart;
      }

      this.checkPolicies(context);
    }
  }

  /**
   * Run policy checks for a single project (used for immediate checks on events).
   */
  private checkPoliciesForProject(projectId: string): void {
    const context = this.projectContexts.get(projectId);
    if (context) {
      // Update phase duration
      const phaseStart = this.phaseStartTimes.get(projectId);
      if (phaseStart !== undefined) {
        context.phase_duration_ms = Date.now() - phaseStart;
      }

      this.checkPolicies(context);
    }
  }

  // ============================================================
  // Private: Alert Recording
  // ============================================================

  /**
   * Record an alert in the FIFO history, enforcing the max history limit.
   */
  private recordAlert(alert: GuardianAlert): void {
    this.alerts.push(alert);

    // FIFO eviction when history exceeds maximum
    while (this.alerts.length > this.config.max_alerts_history) {
      this.alerts.shift();
    }
  }

  // ============================================================
  // Private: Default Policies
  // ============================================================

  /**
   * Register the built-in set of default governance policies.
   */
  private registerDefaultPolicies(): void {
    // Policy 1: Stuck Phase Detection
    this.addPolicy({
      name: 'stuck-phase',
      enabled: true,
      check: (context: MonitoringContext): GuardianAlert | null => {
        const maxDuration = this.config.max_phase_duration_ms;

        if (context.phase_duration_ms >= maxDuration) {
          return {
            id: randomUUID(),
            severity: AlertSeverity.ERROR,
            category: AlertCategory.PERFORMANCE,
            message: `Phase "${context.current_phase}" exceeded maximum duration of ${maxDuration}ms (current: ${context.phase_duration_ms}ms)`,
            details: {
              project_id: context.project_id,
              phase: context.current_phase,
              duration_ms: context.phase_duration_ms,
              max_duration_ms: maxDuration,
            },
            timestamp: Date.now(),
            acknowledged: false,
            auto_action_taken: 'Flagged for manual review',
          };
        }

        // Early warning at 80% of max duration
        const warningThreshold = maxDuration * 0.8;
        if (context.phase_duration_ms >= warningThreshold) {
          return {
            id: randomUUID(),
            severity: AlertSeverity.WARNING,
            category: AlertCategory.PERFORMANCE,
            message: `Phase "${context.current_phase}" approaching maximum duration (${Math.round((context.phase_duration_ms / maxDuration) * 100)}% of limit)`,
            details: {
              project_id: context.project_id,
              phase: context.current_phase,
              duration_ms: context.phase_duration_ms,
              max_duration_ms: maxDuration,
              percentage: Math.round((context.phase_duration_ms / maxDuration) * 100),
            },
            timestamp: Date.now(),
            acknowledged: false,
          };
        }

        return null;
      },
    });

    // Policy 2: Token Budget Monitoring
    this.addPolicy({
      name: 'token-budget',
      enabled: true,
      check: (context: MonitoringContext): GuardianAlert | null => {
        if (context.token_budget <= 0) return null;

        const usageRatio = context.total_token_usage / context.token_budget;

        // Critical: budget exhausted
        if (usageRatio >= 1.0) {
          return {
            id: randomUUID(),
            severity: AlertSeverity.CRITICAL,
            category: AlertCategory.BUDGET,
            message: `Token budget exhausted for project "${context.project_id}" (${context.total_token_usage}/${context.token_budget} tokens)`,
            details: {
              project_id: context.project_id,
              total_token_usage: context.total_token_usage,
              token_budget: context.token_budget,
              usage_ratio: usageRatio,
            },
            timestamp: Date.now(),
            acknowledged: false,
            auto_action_taken: 'Recommend project pause',
          };
        }

        // Error: 95% usage
        if (usageRatio >= 0.95) {
          return {
            id: randomUUID(),
            severity: AlertSeverity.ERROR,
            category: AlertCategory.BUDGET,
            message: `Token budget at 95% for project "${context.project_id}" (${context.total_token_usage}/${context.token_budget} tokens)`,
            details: {
              project_id: context.project_id,
              total_token_usage: context.total_token_usage,
              token_budget: context.token_budget,
              usage_ratio: usageRatio,
            },
            timestamp: Date.now(),
            acknowledged: false,
          };
        }

        // Warning at configurable threshold (default 80%)
        if (usageRatio >= this.config.token_budget_warning_threshold) {
          return {
            id: randomUUID(),
            severity: AlertSeverity.WARNING,
            category: AlertCategory.BUDGET,
            message: `Token budget at ${Math.round(usageRatio * 100)}% for project "${context.project_id}" (${context.total_token_usage}/${context.token_budget} tokens)`,
            details: {
              project_id: context.project_id,
              total_token_usage: context.total_token_usage,
              token_budget: context.token_budget,
              usage_ratio: usageRatio,
              warning_threshold: this.config.token_budget_warning_threshold,
            },
            timestamp: Date.now(),
            acknowledged: false,
          };
        }

        return null;
      },
    });

    // Policy 3: Consecutive Failure Detection
    this.addPolicy({
      name: 'consecutive-failures',
      enabled: true,
      check: (context: MonitoringContext): GuardianAlert | null => {
        const maxConsecutive = this.config.max_consecutive_failures;

        if (context.consecutive_failures >= maxConsecutive) {
          return {
            id: randomUUID(),
            severity: AlertSeverity.ERROR,
            category: AlertCategory.FAILURE,
            message: `${context.consecutive_failures} consecutive agent failures in project "${context.project_id}" (threshold: ${maxConsecutive})`,
            details: {
              project_id: context.project_id,
              consecutive_failures: context.consecutive_failures,
              total_failures: context.agent_failure_count,
              max_consecutive_failures: maxConsecutive,
              phase: context.current_phase,
            },
            timestamp: Date.now(),
            acknowledged: false,
            auto_action_taken: 'Recommend phase rollback',
          };
        }

        // Early warning at threshold - 1
        if (context.consecutive_failures >= maxConsecutive - 1 && context.consecutive_failures > 0) {
          return {
            id: randomUUID(),
            severity: AlertSeverity.WARNING,
            category: AlertCategory.FAILURE,
            message: `${context.consecutive_failures} consecutive agent failures in project "${context.project_id}" (approaching threshold of ${maxConsecutive})`,
            details: {
              project_id: context.project_id,
              consecutive_failures: context.consecutive_failures,
              total_failures: context.agent_failure_count,
              max_consecutive_failures: maxConsecutive,
              phase: context.current_phase,
            },
            timestamp: Date.now(),
            acknowledged: false,
          };
        }

        return null;
      },
    });

    // Policy 4: Governance Compliance
    this.addPolicy({
      name: 'governance-compliance',
      enabled: true,
      check: (context: MonitoringContext): GuardianAlert | null => {
        const skipped = this.governanceSkipped.get(context.project_id);
        if (skipped && skipped.length > 0) {
          return {
            id: randomUUID(),
            severity: AlertSeverity.WARNING,
            category: AlertCategory.GOVERNANCE,
            message: `Governance checks skipped in project "${context.project_id}": ${skipped.join(', ')}`,
            details: {
              project_id: context.project_id,
              skipped_checks: skipped,
              phase: context.current_phase,
            },
            timestamp: Date.now(),
            acknowledged: false,
          };
        }

        return null;
      },
    });
  }
}

// ============================================================
// Factory & Global Instance
// ============================================================

/**
 * Create a new Guardian instance with the given configuration.
 *
 * @param config - Partial configuration (defaults are applied for missing fields)
 * @returns A configured Guardian instance
 */
export function createGuardian(config?: Partial<GuardianConfig>): Guardian {
  return new Guardian(config);
}

/**
 * Global guardian singleton instance.
 * Can be replaced at engine startup with a configured instance.
 */
export const guardian: Guardian = createGuardian();
