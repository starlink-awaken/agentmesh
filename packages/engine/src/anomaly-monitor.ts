/**
 * Honeycomb v2 - 异常检测实时监控器
 *
 * 核心功能：
 * - 持续监控系统指标
 * - 定期触发规则评估
 * - 异常自动触发干预
 * - 与 Guardian 系统集成
 * - 监控历史记录
 */

import { randomUUID } from 'node:crypto';
import type {
  MonitoringMetrics,
  AnomalyDetectionResult,
  RuleEngineConfig,
} from './anomaly-detection-types.js';
import { AnomalyRuleEngine, createRuleEngine } from './anomaly-rule-engine.js';
import { EngineEvent, type EngineEventPayload, Phase } from './types.js';

// ============================================================
// 监控器配置
// ============================================================

export interface AnomalyMonitorConfig {
  /** 规则引擎配置 */
  rule_engine?: Partial<RuleEngineConfig>;
  /** 是否启用自动干预 */
  auto_intervention_enabled?: boolean;
  /** 监控器名称 */
  name?: string;
  /** 最大监控项目数 */
  max_monitored_projects?: number;
  /** 指标采样间隔（毫秒） */
  sample_interval_ms?: number;
  /** 是否记录监控历史 */
  record_history?: boolean;
  /** 最大历史记录数 */
  max_history_size?: number;
}

/** 默认监控器配置 */
const DEFAULT_MONITOR_CONFIG: Required<AnomalyMonitorConfig> = {
  rule_engine: {},
  auto_intervention_enabled: false,
  name: 'default-monitor',
  max_monitored_projects: 100,
  sample_interval_ms: 5000,
  record_history: true,
  max_history_size: 10000,
};

// ============================================================
// 监控项目状态
// ============================================================

interface MonitoredProject {
  project_id: string;
  archetype: string;
  current_phase: Phase;
  started_at: number;
  last_check: number;
  check_count: number;
  anomaly_count: number;
  last_anomaly_time?: number;
}

// ============================================================
// 监控历史记录
// ============================================================

export interface MonitorHistoryEntry {
  id: string;
  project_id: string;
  timestamp: number;
  metrics: MonitoringMetrics;
  detection_result: AnomalyDetectionResult;
}

// ============================================================
// 干预回调类型
// ============================================================

export type InterventionCallback = (
  projectId: string,
  action: 'pause' | 'rollback' | 'scale' | 'alert',
  reason: string,
  details: Record<string, unknown>,
) => Promise<boolean>;

// ============================================================
// 异常监控器类
// ============================================================

export class AnomalyMonitor {
  private readonly config: Required<AnomalyMonitorConfig>;
  private readonly ruleEngine: AnomalyRuleEngine;
  private readonly monitoredProjects: Map<string, MonitoredProject> = new Map();
  private readonly history: MonitorHistoryEntry[] = [];
  private readonly interventionCallbacks: Map<string, InterventionCallback> = new Map();

  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private eventUnsubscribers: Array<() => void> = [];

  // 内部状态追踪
  private phaseStartTimes: Map<string, number> = new Map();
  private phaseDurations: Map<string, number> = new Map();
  private consecutiveFailures: Map<string, number> = new Map();
  private agentStartTimes: Map<string, Map<string, number>> = new Map();
  private messageCounts: Map<string, number> = new Map();
  private checkpointTimes: Map<string, number> = new Map();

  constructor(config?: AnomalyMonitorConfig) {
    this.config = { ...DEFAULT_MONITOR_CONFIG, ...config };
    this.ruleEngine = createRuleEngine(this.config.rule_engine);
  }

  // ============================================================
  // 生命周期管理
  // ============================================================

  /**
   * 启动监控器
   */
  start(eventSubscriber?: (event: EngineEvent, handler: (payload: EngineEventPayload) => void) => () => void): void {
    if (this.running) return;

    this.running = true;

    // 订阅引擎事件
    if (eventSubscriber) {
      this.subscribeToEvents(eventSubscriber);
    }

    // 启动定期检查
    this.intervalHandle = setInterval(() => {
      this.runMonitoringCycle();
    }, this.config.sample_interval_ms);
  }

  /**
   * 停止监控器
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;

    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    // 取消事件订阅
    for (const unsub of this.eventUnsubscribers) {
      try {
        unsub();
      } catch {
        // 忽略取消订阅时的错误
      }
    }
    this.eventUnsubscribers = [];
  }

  // ============================================================
  // 项目监控管理
  // ============================================================

  /**
   * 添加监控项目
   */
  addMonitoredProject(projectId: string, archetype: string = 'software-dev'): void {
    if (this.monitoredProjects.size >= this.config.max_monitored_projects) {
      throw new Error(`已达到最大监控项目数: ${this.config.max_monitored_projects}`);
    }

    if (this.monitoredProjects.has(projectId)) {
      return; // 已在监控中
    }

    const project: MonitoredProject = {
      project_id: projectId,
      archetype,
      current_phase: Phase.INIT,
      started_at: Date.now(),
      last_check: Date.now(),
      check_count: 0,
      anomaly_count: 0,
    };

    this.monitoredProjects.set(projectId, project);
    this.initializeProjectTracking(projectId);
  }

  /**
   * 移除监控项目
   */
  removeMonitoredProject(projectId: string): boolean {
    this.cleanupProjectTracking(projectId);
    return this.monitoredProjects.delete(projectId);
  }

  /**
   * 获取监控项目
   */
  getMonitoredProject(projectId: string): MonitoredProject | undefined {
    return this.monitoredProjects.get(projectId);
  }

  /**
   * 获取所有监控项目
   */
  getAllMonitoredProjects(): MonitoredProject[] {
    return Array.from(this.monitoredProjects.values());
  }

  // ============================================================
  // 事件处理
  // ============================================================

  /**
   * 订阅引擎事件
   */
  private subscribeToEvents(
    eventSubscriber: (event: EngineEvent, handler: (payload: EngineEventPayload) => void) => () => void,
  ): void {
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
      EngineEvent.CHECKPOINT_CREATED,
      EngineEvent.MESSAGE_SENT,
    ];

    for (const event of eventsToWatch) {
      const unsub = eventSubscriber(event, (payload) => this.handleEngineEvent(payload));
      this.eventUnsubscribers.push(unsub);
    }
  }

  /**
   * 处理引擎事件
   */
  private handleEngineEvent(payload: EngineEventPayload): void {
    const { event, project_id, data, timestamp } = payload;

    switch (event) {
      case EngineEvent.PROJECT_CREATED:
      case EngineEvent.PROJECT_STARTED: {
        const archetype = (data.archetype as string) ?? 'software-dev';
        this.addMonitoredProject(project_id, archetype);
        break;
      }

      case EngineEvent.PROJECT_COMPLETED:
      case EngineEvent.PROJECT_FAILED: {
        this.removeMonitoredProject(project_id);
        break;
      }

      case EngineEvent.PHASE_ENTERED: {
        const phase = data.phase as Phase;
        this.phaseStartTimes.set(project_id, timestamp);
        this.updateProjectPhase(project_id, phase);
        break;
      }

      case EngineEvent.PHASE_COMPLETED: {
        this.phaseStartTimes.delete(project_id);
        this.consecutiveFailures.set(project_id, 0);
        break;
      }

      case EngineEvent.AGENT_STARTED: {
        const agentName = data.agent_name as string;
        if (!this.agentStartTimes.has(project_id)) {
          this.agentStartTimes.set(project_id, new Map());
        }
        this.agentStartTimes.get(project_id)!.set(agentName, timestamp);
        break;
      }

      case EngineEvent.AGENT_COMPLETED: {
        const agentName = data.agent_name as string;
        this.consecutiveFailures.set(project_id, 0);
        this.agentStartTimes.get(project_id)?.delete(agentName);
        break;
      }

      case EngineEvent.AGENT_FAILED: {
        const current = this.consecutiveFailures.get(project_id) ?? 0;
        this.consecutiveFailures.set(project_id, current + 1);
        break;
      }

      case EngineEvent.CHECKPOINT_CREATED: {
        this.checkpointTimes.set(project_id, timestamp);
        break;
      }

      case EngineEvent.MESSAGE_SENT: {
        const current = this.messageCounts.get(project_id) ?? 0;
        this.messageCounts.set(project_id, current + 1);
        break;
      }
    }
  }

  /**
   * 更新项目阶段
   */
  private updateProjectPhase(projectId: string, phase: Phase): void {
    const project = this.monitoredProjects.get(projectId);
    if (project) {
      project.current_phase = phase;
    }
  }

  // ============================================================
  // 监控周期
  // ============================================================

  /**
   * 运行监控周期
   */
  private runMonitoringCycle(): void {
    const now = Date.now();

    for (const [projectId, project] of this.monitoredProjects) {
      // 更新检查时间
      project.last_check = now;
      project.check_count++;

      // 收集监控指标
      const metrics = this.collectMetrics(projectId, now);

      // 执行规则评估
      const detectionResult = this.ruleEngine.evaluateAllRules(
        metrics,
        project.current_phase,
        project.archetype,
      );

      // 处理检测结果
      if (detectionResult.has_anomaly) {
        project.anomaly_count++;
        project.last_anomaly_time = now;
        this.handleAnomalyDetection(detectionResult);
      }

      // 记录历史
      if (this.config.record_history) {
        this.recordHistory(metrics, detectionResult);
      }
    }

    // 清理历史
    this.limitHistorySize();
  }

  /**
   * 收集监控指标
   */
  private collectMetrics(projectId: string, now: number): MonitoringMetrics {
    const project = this.monitoredProjects.get(projectId);
    if (!project) {
      throw new Error(`项目未在监控中: ${projectId}`);
    }

    // 计算阶段持续时间
    const phaseStart = this.phaseStartTimes.get(projectId) ?? now;
    const phaseDuration = now - phaseStart;

    // 获取 Token 使用（从追踪状态中获取，这里使用默认值）
    const tokenUsage = 0;
    const tokenBudget = 300000;

    return {
      project_id: projectId,
      current_phase: project.current_phase,
      phase_duration_ms: phaseDuration,
      total_token_usage: tokenUsage,
      token_budget: tokenBudget,
      token_usage_ratio: tokenBudget > 0 ? tokenUsage / tokenBudget : 0,
      agent_failure_count: 0,
      consecutive_failures: this.consecutiveFailures.get(projectId) ?? 0,
      phase_retry_count: 0,
      active_agents: this.agentStartTimes.get(projectId)?.size ?? 0,
      avg_agent_execution_time_ms: 0,
      total_messages: this.messageCounts.get(projectId) ?? 0,
      message_throughput: 0,
      checkpoint_count: this.checkpointTimes.has(projectId) ? 1 : 0,
      last_checkpoint_age_ms: this.checkpointTimes.get(projectId)
        ? now - this.checkpointTimes.get(projectId)!
        : 0,
      memory_usage_mb: 0,
      timestamp: now,
    };
  }

  /**
   * 处理异常检测
   */
  private handleAnomalyDetection(result: AnomalyDetectionResult): void {
    const { project_id, recommended_action, summary, max_severity } = result;

    // 如果启用自动干预，执行干预
    if (this.config.auto_intervention_enabled && recommended_action !== 'ignore') {
      this.executeIntervention(project_id, recommended_action, summary, {
        detection_id: result.detection_id,
        severity: max_severity,
        triggered_rules: result.triggered_rules.map((r) => ({
          rule_id: r.rule_id,
          rule_name: r.rule_name,
          score: r.score,
        })),
      });
    }
  }

  /**
   * 执行干预
   */
  private async executeIntervention(
    projectId: string,
    action: 'pause' | 'rollback' | 'scale' | 'alert',
    reason: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    const callback = this.interventionCallbacks.get(action);
    if (callback) {
      try {
        await callback(projectId, action, reason, details);
      } catch (error) {
        console.error(`干预执行失败: ${action}`, error);
      }
    }
  }

  // ============================================================
  // 回调管理
  // ============================================================

  /**
   * 注册干预回调
   */
  registerInterventionCallback(
    action: 'pause' | 'rollback' | 'scale' | 'alert',
    callback: InterventionCallback,
  ): void {
    this.interventionCallbacks.set(action, callback);
  }

  /**
   * 批量注册干预回调
   */
  registerInterventionCallbacks(callbacks: {
    pause?: InterventionCallback;
    rollback?: InterventionCallback;
    scale?: InterventionCallback;
    alert?: InterventionCallback;
  }): void {
    for (const [action, callback] of Object.entries(callbacks)) {
      if (callback) {
        this.registerInterventionCallback(action as any, callback);
      }
    }
  }

  // ============================================================
  // 历史记录管理
  // ============================================================

  /**
   * 记录历史
   */
  private recordHistory(metrics: MonitoringMetrics, detectionResult: AnomalyDetectionResult): void {
    const entry: MonitorHistoryEntry = {
      id: randomUUID(),
      project_id: metrics.project_id,
      timestamp: metrics.timestamp,
      metrics,
      detection_result: detectionResult,
    };

    this.history.push(entry);
  }

  /**
   * 限制历史记录大小
   */
  private limitHistorySize(): void {
    while (this.history.length > this.config.max_history_size) {
      this.history.shift();
    }
  }

  /**
   * 获取历史记录
   */
  getHistory(projectId?: string, limit?: number): MonitorHistoryEntry[] {
    let records = [...this.history];

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
   * 清空历史记录
   */
  clearHistory(): void {
    this.history.length = 0;
  }

  // ============================================================
  // 项目追踪初始化和清理
  // ============================================================

  /**
   * 初始化项目追踪
   */
  private initializeProjectTracking(projectId: string): void {
    this.phaseStartTimes.set(projectId, Date.now());
    this.consecutiveFailures.set(projectId, 0);
    this.messageCounts.set(projectId, 0);
  }

  /**
   * 清理项目追踪
   */
  private cleanupProjectTracking(projectId: string): void {
    this.phaseStartTimes.delete(projectId);
    this.phaseDurations.delete(projectId);
    this.consecutiveFailures.delete(projectId);
    this.agentStartTimes.delete(projectId);
    this.messageCounts.delete(projectId);
    this.checkpointTimes.delete(projectId);
  }

  // ============================================================
  // 规则引擎访问
  // ============================================================

  /**
   * 获取规则引擎实例
   */
  getRuleEngine(): AnomalyRuleEngine {
    return this.ruleEngine;
  }

  // ============================================================
  // 统计信息
  // ============================================================

  /**
   * 获取监控器统计信息
   */
  getStats(): {
    name: string;
    running: boolean;
    monitored_projects: number;
    total_checks: number;
    total_anomalies: number;
    history_size: number;
    rule_engine_stats: ReturnType<AnomalyRuleEngine['getStats']>;
  } {
    const totalChecks = Array.from(this.monitoredProjects.values())
      .reduce((sum, p) => sum + p.check_count, 0);
    const totalAnomalies = Array.from(this.monitoredProjects.values())
      .reduce((sum, p) => sum + p.anomaly_count, 0);

    return {
      name: this.config.name,
      running: this.running,
      monitored_projects: this.monitoredProjects.size,
      total_checks: totalChecks,
      total_anomalies: totalAnomalies,
      history_size: this.history.length,
      rule_engine_stats: this.ruleEngine.getStats(),
    };
  }

  /**
   * 获取项目统计信息
   */
  getProjectStats(projectId: string): {
    project_id: string;
    check_count: number;
    anomaly_count: number;
    last_check: number;
    last_anomaly_time?: number;
    anomaly_rate: number;
  } | null {
    const project = this.monitoredProjects.get(projectId);
    if (!project) return null;

    return {
      project_id: projectId,
      check_count: project.check_count,
      anomaly_count: project.anomaly_count,
      last_check: project.last_check,
      last_anomaly_time: project.last_anomaly_time,
      anomaly_rate: project.check_count > 0 ? project.anomaly_count / project.check_count : 0,
    };
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建异常监控器实例
 */
export function createAnomalyMonitor(config?: AnomalyMonitorConfig): AnomalyMonitor {
  return new AnomalyMonitor(config);
}

/**
 * 默认监控器实例
 */
export const defaultAnomalyMonitor = createAnomalyMonitor();
