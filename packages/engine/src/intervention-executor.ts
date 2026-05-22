/**
 * Honeycomb v2 - 异常干预执行器
 *
 * 核心功能：
 * - 执行各种干预动作（暂停/回滚/缩减/告警）
 * - 支持人工确认流程
 * - 记录干预执行历史
 * - 与 Orchestrator 集成
 */

import { randomUUID } from 'node:crypto';
import type {
  AnomalyDetectionResult,
  RuleTriggerRecord,
} from './anomaly-detection-types.js';

// ============================================================
// 干预动作类型
// ============================================================

export type InterventionActionType = 'pause' | 'rollback' | 'scale' | 'alert' | 'ignore';

// ============================================================
// 干预执行结果
// ============================================================

export interface InterventionExecutionResult {
  /** 执行 ID */
  execution_id: string;
  /** 项目 ID */
  project_id: string;
  /** 干预动作 */
  action: InterventionActionType;
  /** 是否成功 */
  success: boolean;
  /** 是否需要确认 */
  required_confirmation: boolean;
  /** 是否已确认 */
  confirmed: boolean;
  /** 执行消息 */
  message: string;
  /** 错误信息 */
  error?: string;
  /** 执行详情 */
  details: Record<string, unknown>;
  /** 时间戳 */
  timestamp: number;
  /** 执行时长（毫秒） */
  duration_ms: number;
}

// ============================================================
// 确认回调类型
// ============================================================

export type ConfirmationCallback = (
  projectId: string,
  action: InterventionActionType,
  reason: string,
  details: Record<string, unknown>,
) => Promise<boolean>;

// ============================================================
// 项目操作回调类型
// ============================================================

export interface ProjectOperationCallbacks {
  /** 暂停项目回调 */
  pause?: (projectId: string, reason: string) => Promise<boolean>;
  /** 回滚项目回调 */
  rollback?: (projectId: string, reason: string) => Promise<boolean>;
  /** 缩减资源回调 */
  scale?: (projectId: string, scale: number, reason: string) => Promise<boolean>;
  /** 发送告警回调 */
  alert?: (projectId: string, level: string, message: string, details: Record<string, unknown>) => Promise<void>;
}

// ============================================================
// 干预执行器配置
// ============================================================

export interface InterventionExecutorConfig {
  /** 是否启用自动干预 */
  auto_intervention_enabled?: boolean;
  /** 是否默认需要确认 */
  default_require_confirmation?: boolean;
  /** 确认超时（毫秒） */
  confirmation_timeout_ms?: number;
  /** 最大重试次数 */
  max_retries?: number;
  /** 重试延迟（毫秒） */
  retry_delay_ms?: number;
  /** 是否记录执行历史 */
  record_history?: boolean;
  /** 最大历史记录数 */
  max_history_size?: number;
}

/** 默认配置 */
const DEFAULT_EXECUTOR_CONFIG: Required<InterventionExecutorConfig> = {
  auto_intervention_enabled: false,
  default_require_confirmation: true,
  confirmation_timeout_ms: 30000,
  max_retries: 3,
  retry_delay_ms: 1000,
  record_history: true,
  max_history_size: 1000,
};

// ============================================================
// 干预执行器类
// ============================================================

export class InterventionExecutor {
  private readonly config: Required<InterventionExecutorConfig>;
  private readonly operationCallbacks: ProjectOperationCallbacks;
  private readonly confirmationCallbacks: Map<string, ConfirmationCallback> = new Map();
  private readonly executionHistory: InterventionExecutionResult[] = [];

  constructor(
    operationCallbacks: ProjectOperationCallbacks,
    config?: InterventionExecutorConfig,
  ) {
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config };
    this.operationCallbacks = operationCallbacks;
  }

  // ============================================================
  // 干预执行
  // ============================================================

  /**
   * 执行干预
   */
  async executeIntervention(
    projectId: string,
    action: InterventionActionType,
    reason: string,
    details: Record<string, unknown> = {},
  ): Promise<InterventionExecutionResult> {
    const startTime = Date.now();
    const executionId = randomUUID();

    // 检查是否需要确认
    const requiresConfirmation = this.requiresConfirmation(action);
    let confirmed = !requiresConfirmation;

    if (requiresConfirmation) {
      confirmed = await this.requestConfirmation(projectId, action, reason, details);
      if (!confirmed) {
        return this.createResult(executionId, projectId, action, false, requiresConfirmation, confirmed, '干预被人工拒绝', { reason: 'confirmation_denied' }, startTime);
      }
    }

    // 执行干预动作
    let success = false;
    let message = '';
    let error: string | undefined;

    try {
      switch (action) {
        case 'pause':
          ({ success, message } = await this.executePause(projectId, reason));
          break;
        case 'rollback':
          ({ success, message } = await this.executeRollback(projectId, reason));
          break;
        case 'scale':
          ({ success, message } = await this.executeScale(projectId, reason));
          break;
        case 'alert':
          ({ success, message } = await this.executeAlert(projectId, reason, details));
          break;
        case 'ignore':
          success = true;
          message = '异常已忽略';
          break;
      }
    } catch (e) {
      success = false;
      error = e instanceof Error ? e.message : String(e);
      message = `执行失败: ${error}`;
    }

    return this.createResult(executionId, projectId, action, success, requiresConfirmation, confirmed, message, { ...details, error }, startTime);
  }

  /**
   * 执行异常检测结果推荐的干预
   */
  async executeFromDetection(
    detectionResult: AnomalyDetectionResult,
  ): Promise<InterventionExecutionResult> {
    return this.executeIntervention(
      detectionResult.project_id,
      detectionResult.recommended_action,
      detectionResult.summary,
      {
        detection_id: detectionResult.detection_id,
        triggered_rules: detectionResult.triggered_rules,
        severity: detectionResult.max_severity,
      },
    );
  }

  // ============================================================
  // 具体干预动作实现
  // ============================================================

  /**
   * 执行暂停
   */
  private async executePause(projectId: string, reason: string): Promise<{ success: boolean; message: string }> {
    if (this.operationCallbacks.pause) {
      const success = await this.operationCallbacks.pause(projectId, reason);
      return {
        success,
        message: success ? '项目已暂停' : '暂停项目失败',
      };
    }
    return {
      success: false,
      message: '暂停回调未配置',
    };
  }

  /**
   * 执行回滚
   */
  private async executeRollback(projectId: string, reason: string): Promise<{ success: boolean; message: string }> {
    if (this.operationCallbacks.rollback) {
      const success = await this.operationCallbacks.rollback(projectId, reason);
      return {
        success,
        message: success ? '项目已回滚到安全检查点' : '回滚失败',
      };
    }
    return {
      success: false,
      message: '回滚回调未配置',
    };
  }

  /**
   * 执行资源缩减
   */
  private async executeScale(projectId: string, reason: string): Promise<{ success: boolean; message: string }> {
    if (this.operationCallbacks.scale) {
      const scale = 0.5; // 默认缩减 50%
      const success = await this.operationCallbacks.scale(projectId, scale, reason);
      return {
        success,
        message: success ? '资源已缩减 50%' : '缩减资源失败',
      };
    }
    return {
      success: false,
      message: '缩减回调未配置',
    };
  }

  /**
   * 执行告警
   */
  private async executeAlert(
    projectId: string,
    reason: string,
    details: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }> {
    if (this.operationCallbacks.alert) {
      const severity = details.severity as string ?? 'warning';
      await this.operationCallbacks.alert(projectId, severity, reason, details);
      return {
        success: true,
        message: '告警已发送',
      };
    }
    // 没有回调时，只记录到控制台
    console.warn(`[告警] 项目 ${projectId}: ${reason}`, details);
    return {
      success: true,
      message: '告警已记录',
    };
  }

  // ============================================================
  // 确认机制
  // ============================================================

  /**
   * 检查是否需要确认
   */
  private requiresConfirmation(action: InterventionActionType): boolean {
    // 如果禁用自动干预，所有动作都需要确认
    if (!this.config.auto_intervention_enabled) {
      return true;
    }

    // 如果默认需要确认
    if (this.config.default_require_confirmation) {
      return true;
    }

    // 高风险动作总是需要确认
    if (action === 'pause' || action === 'rollback') {
      return true;
    }

    return false;
  }

  /**
   * 请求人工确认
   */
  private async requestConfirmation(
    projectId: string,
    action: InterventionActionType,
    reason: string,
    details: Record<string, unknown>,
  ): Promise<boolean> {
    // 查找项目特定的确认回调
    const callbackKey = `${projectId}_${action}`;
    let callback = this.confirmationCallbacks.get(callbackKey);

    // 如果没有项目特定的，查找全局的
    if (!callback) {
      callback = this.confirmationCallbacks.get('*');
    }

    if (callback) {
      try {
        return await callback(projectId, action, reason, details);
      } catch {
        return false;
      }
    }

    // 没有回调时，默认拒绝（安全优先）
    return false;
  }

  // ============================================================
  // 回调管理
  // ============================================================

  /**
   * 注册确认回调
   */
  registerConfirmationCallback(
    key: string,
    callback: ConfirmationCallback,
  ): void {
    this.confirmationCallbacks.set(key, callback);
  }

  /**
   * 批量注册确认回调
   */
  registerConfirmationCallbacks(callbacks: Record<string, ConfirmationCallback>): void {
    for (const [key, callback] of Object.entries(callbacks)) {
      this.registerConfirmationCallback(key, callback);
    }
  }

  // ============================================================
  // 历史记录管理
  // ============================================================

  /**
   * 创建执行结果
   */
  private createResult(
    executionId: string,
    projectId: string,
    action: InterventionActionType,
    success: boolean,
    requiredConfirmation: boolean,
    confirmed: boolean,
    message: string,
    details: Record<string, unknown>,
    startTime: number,
  ): InterventionExecutionResult {
    const result: InterventionExecutionResult = {
      execution_id: executionId,
      project_id: projectId,
      action,
      success,
      required_confirmation: requiredConfirmation,
      confirmed,
      message,
      details,
      timestamp: Date.now(),
      duration_ms: Date.now() - startTime,
    };

    // 记录历史
    if (this.config.record_history) {
      this.recordExecution(result);
    }

    return result;
  }

  /**
   * 记录执行历史
   */
  private recordExecution(result: InterventionExecutionResult): void {
    (this.executionHistory as InterventionExecutionResult[]).push(result);

    // 限制历史大小
    while ((this.executionHistory as InterventionExecutionResult[]).length > this.config.max_history_size) {
      (this.executionHistory as InterventionExecutionResult[]).shift();
    }
  }

  /**
   * 获取执行历史
   */
  getExecutionHistory(projectId?: string, limit?: number): InterventionExecutionResult[] {
    let history = this.executionHistory as InterventionExecutionResult[];

    if (projectId) {
      history = history.filter((r) => r.project_id === projectId);
    }

    // 最新的在前
    history = [...history].reverse();

    if (limit !== undefined && limit > 0) {
      history = history.slice(0, limit);
    }

    return history;
  }

  /**
   * 清空执行历史
   */
  clearHistory(): void {
    (this.executionHistory as InterventionExecutionResult[]).length = 0;
  }

  // ============================================================
  // 统计信息
  // ============================================================

  /**
   * 获取统计信息
   */
  getStats(): {
    total_executions: number;
    successful_executions: number;
    failed_executions: number;
    by_action: Record<string, number>;
    confirmation_rate: number;
    avg_duration_ms: number;
  } {
    const history = this.executionHistory as InterventionExecutionResult[];

    const byAction: Record<string, number> = {};
    let totalDuration = 0;

    for (const record of history) {
      byAction[record.action] = (byAction[record.action] ?? 0) + 1;
      totalDuration += record.duration_ms;
    }

    const successful = history.filter((r) => r.success).length;
    const confirmed = history.filter((r) => r.required_confirmation && r.confirmed).length;
    const requiredConfirmation = history.filter((r) => r.required_confirmation).length;

    return {
      total_executions: history.length,
      successful_executions: successful,
      failed_executions: history.length - successful,
      by_action: byAction,
      confirmation_rate: requiredConfirmation > 0 ? confirmed / requiredConfirmation : 1,
      avg_duration_ms: history.length > 0 ? totalDuration / history.length : 0,
    };
  }

  // ============================================================
  // 配置更新
  // ============================================================

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<InterventionExecutorConfig>): void {
    Object.assign(this.config, updates);
  }

  /**
   * 获取配置
   */
  getConfig(): Required<InterventionExecutorConfig> {
    return { ...this.config };
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建干预执行器实例
 */
export function createInterventionExecutor(
  operationCallbacks: ProjectOperationCallbacks,
  config?: InterventionExecutorConfig,
): InterventionExecutor {
  return new InterventionExecutor(operationCallbacks, config);
}
