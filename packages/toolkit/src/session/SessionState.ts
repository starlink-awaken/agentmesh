/**
 * SessionState - 会话状态管理
 *
 * 负责状态转换、验证、序列化/反序列化
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  SessionState,
  SessionStatus,
  SessionError,
  SessionMetadata,
  SessionEventListener,
  StateTransition,
} from './types.js';

import { DEFAULT_TRANSITIONS } from './types.js';

/**
 * 默认会话状态
 */
export const DEFAULT_SESSION_STATE: SessionState = {
  currentStep: 0,
  completedSteps: [],
  context: {},
  errors: [],
  metadata: {
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

/**
 * 会话状态管理器
 *
 * 处理状态转换、验证和序列化
 */
export class SessionStateManager {
  private state: SessionState;
  private status: SessionStatus;
  private transitions: StateTransition[];
  private listeners: Map<SessionStatus, Set<SessionEventListener>>;

  /**
   * 构造函数
   */
  constructor(initialState?: Partial<SessionState>) {
    // 注意：需要深拷贝数组，避免共享引用导致状态污染
    const initial = initialState || {};
    this.state = {
      currentStep: initial.currentStep ?? DEFAULT_SESSION_STATE.currentStep,
      completedSteps: [...(initial.completedSteps || DEFAULT_SESSION_STATE.completedSteps)],
      context: { ...DEFAULT_SESSION_STATE.context, ...initial.context },
      errors: [...(initial.errors || DEFAULT_SESSION_STATE.errors)],
      result: initial.result,
      metadata: {
        ...DEFAULT_SESSION_STATE.metadata,
        ...initial.metadata,
      },
    };
    this.status = 'pending';
    // 使用默认转换规则
    this.transitions = [...DEFAULT_TRANSITIONS];
    this.listeners = new Map();
  }

  /**
   * 获取当前状态
   */
  getState(): SessionState {
    return { ...this.state };
  }

  /**
   * 获取当前状态
   */
  getStatus(): SessionStatus {
    return this.status;
  }

  /**
   * 设置状态
   */
  setState(state: Partial<SessionState>): void {
    // 深度合并 context
    const newContext = state.context
      ? { ...this.state.context, ...state.context }
      : this.state.context;

    this.state = {
      ...this.state,
      ...state,
      context: newContext,
      metadata: {
        ...this.state.metadata,
        ...state.metadata,
        updatedAt: new Date(),
      },
    };
  }

  /**
   * 转换状态
   */
  transition(to: SessionStatus): boolean {
    const transition = this.findTransition(this.status, to);

    if (!transition || !transition.allowed) {
      return false;
    }

    const from = this.status;
    this.status = to;

    // 更新元数据
    const now = new Date();
    switch (to) {
      case 'running':
        if (!this.state.metadata.startedAt) {
          this.state.metadata.startedAt = now;
        }
        break;
      case 'paused':
        this.state.metadata.pausedAt = now;
        break;
      case 'completed':
      case 'failed':
        this.state.metadata.completedAt = now;
        if (this.state.metadata.startedAt) {
          this.state.metadata.duration =
            now.getTime() - this.state.metadata.startedAt.getTime();
        }
        break;
    }

    this.state.metadata.updatedAt = now;

    // 触发事件
    this.emit({ type: to, sessionId: '', timestamp: now });

    return true;
  }

  /**
   * 查找状态转换规则
   */
  private findTransition(
    from: SessionStatus,
    to: SessionStatus
  ): StateTransition | undefined {
    // 从后往前找，返回最后一个匹配的规则（用户自定义的优先级更高）
    for (let i = this.transitions.length - 1; i >= 0; i--) {
      const t = this.transitions[i];
      if (t.from === from && t.to === to) {
        return t;
      }
    }
    return undefined;
  }

  /**
   * 设置状态转换规则
   */
  setTransitions(transitions: StateTransition[]): void {
    this.transitions = transitions;
  }

  /**
   * 添加转换规则
   */
  addTransition(transition: StateTransition): void {
    this.transitions.push(transition);
  }

  /**
   * 添加步骤完成记录
   */
  completeStep(step: number): void {
    if (!this.state.completedSteps.includes(step)) {
      this.state.completedSteps.push(step);
      this.state.currentStep = step + 1;
    }
    this.state.metadata.updatedAt = new Date();
  }

  /**
   * 设置当前步骤
   */
  setCurrentStep(step: number): void {
    this.state.currentStep = step;
    this.state.metadata.updatedAt = new Date();
  }

  /**
   * 添加错误
   */
  addError(error: Omit<SessionError, 'timestamp'>): void {
    this.state.errors.push({
      ...error,
      timestamp: new Date(),
    });
    this.state.metadata.updatedAt = new Date();
  }

  /**
   * 设置已完成步骤（测试用）
   * 允许直接设置内部状态以验证 validate 功能
   */
  setCompletedSteps(steps: number[]): void {
    this.state.completedSteps = steps;
  }

  /**
   * 清除错误
   */
  clearErrors(): void {
    this.state.errors = [];
    this.state.metadata.updatedAt = new Date();
  }

  /**
   * 设置上下文
   */
  setContext(key: string, value: unknown): void {
    this.state.context[key] = value;
    this.state.metadata.updatedAt = new Date();
  }

  /**
   * 获取上下文值
   */
  getContext<T = unknown>(key: string): T | undefined {
    return this.state.context[key] as T | undefined;
  }

  /**
   * 设置结果
   */
  setResult(result: unknown): void {
    this.state.result = result;
    this.state.metadata.updatedAt = new Date();
  }

  /**
   * 获取结果
   */
  getResult<T = unknown>(): T | undefined {
    return this.state.result as T | undefined;
  }

  /**
   * 序列化状态为 JSON
   */
  serialize(): string {
    return JSON.stringify({
      state: this.state,
      status: this.status,
    });
  }

  /**
   * 从 JSON 反序列化
   */
  static deserialize(json: string): SessionStateManager {
    const data = JSON.parse(json);
    const manager = new SessionStateManager(data.state);
    manager.status = data.status;
    // 确保转换规则也被恢复
    if (data.transitions) {
      manager.transitions = data.transitions;
    }
    return manager;
  }

  /**
   * 注册事件监听器
   */
  on(event: SessionStatus, listener: SessionEventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * 移除事件监听器
   */
  off(event: SessionStatus, listener: SessionEventListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  /**
   * 触发事件
   */
  private emit(event: { type: SessionStatus; sessionId: string; timestamp: Date; data?: unknown }): void {
    this.listeners.get(event.type)?.forEach((listener) => {
      listener(event);
    });
  }

  /**
   * 验证状态是否有效
   * 直接访问内部状态，不使用 getState() 获取副本
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查是否有未恢复的错误
    const recoverableErrors = this.state.errors.filter((e) => e.recoverable);
    if (recoverableErrors.length > 0 && this.status === 'running') {
      errors.push('会话包含未恢复的可恢复错误');
    }

    // 检查步骤是否合理 - 直接访问内部状态
    if (this.state.currentStep < 0) {
      errors.push('当前步骤不能为负数');
    }

    // 检查已完成步骤是否有重复 - 直接访问内部状态
    const uniqueSteps = new Set(this.state.completedSteps);
    if (uniqueSteps.size !== this.state.completedSteps.length) {
      errors.push('已完成步骤存在重复');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 克隆当前状态
   */
  clone(): SessionStateManager {
    const cloned = new SessionStateManager({
      ...this.state,
      // 深拷贝数组，避免共享引用
      completedSteps: [...this.state.completedSteps],
      errors: [...this.state.errors],
      context: { ...this.state.context },
      // 深度复制 Date 对象
      metadata: {
        ...this.state.metadata,
        createdAt: this.state.metadata.createdAt,
        updatedAt: this.state.metadata.updatedAt,
        startedAt: this.state.metadata.startedAt,
        pausedAt: this.state.metadata.pausedAt,
        completedAt: this.state.metadata.completedAt,
      },
    });
    cloned.status = this.status;
    cloned.transitions = [...this.transitions];
    return cloned;
  }
}
