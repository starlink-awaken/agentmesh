/**
 * TelosContext - Telos 实体生命周期管理
 *
 * 实体生命周期框架 - TCF (Trigger-Condition-Force) 模型
 *
 * @author PAI
 * @version 1.0.0
 */

import type { EntityState } from './types.js';

/**
 * 实体配置
 */
export interface EntityConfig {
  /** 实体类型 */
  type: string;
  /** 初始属性 */
  attributes: Record<string, any>;
  /** 允许的状态转换 */
  allowedTransitions?: Record<string, string[]>;
}

/**
 * 实体事件
 */
export interface EntityEvent {
  type: string;
  timestamp: number;
  data: any;
  actor?: string;
}

/**
 * TelosContext 类
 *
 * 提供实体的生命周期管理能力
 */
export class TelosContext {
  private id: string;
  private type: string;
  private attributes: Record<string, any>;
  private state: EntityState;
  private history: EntityEvent[];
  private allowedTransitions: Record<string, string[]>;

  /**
   * 构造函数
   */
  constructor(id: string, attributes: Record<string, any> = {}, type: string = 'default') {
    this.id = id;
    this.type = type;
    this.attributes = attributes;
    this.state = {
      current: 'initialized',
      previous: null,
      timestamp: Date.now(),
    };
    this.history = [];
    this.allowedTransitions = {
      // 默认状态转换规则
      '*': ['initialized', 'active', 'inactive', 'archived', 'deleted'],
    };

    this.recordEvent('created', { attributes });
  }

  /**
   * 获取实体 ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * 获取实体类型
   */
  getType(): string {
    return this.type;
  }

  /**
   * 获取当前状态
   */
  getState(): EntityState {
    return { ...this.state };
  }

  /**
   * 获取属性
   */
  getAttributes(): Record<string, any> {
    return { ...this.attributes };
  }

  /**
   * 获取单个属性
   */
  getAttribute(key: string): any {
    return this.attributes[key];
  }

  /**
   * 设置属性
   */
  setAttribute(key: string, value: any): void {
    const oldValue = this.attributes[key];
    this.attributes[key] = value;
    this.recordEvent('attribute_changed', { key, oldValue, newValue: value });
  }

  /**
   * 批量设置属性
   */
  setAttributes(attributes: Record<string, any>): void {
    for (const [key, value] of Object.entries(attributes)) {
      this.setAttribute(key, value);
    }
  }

  /**
   * 状态转换
   */
  transition(from: string, to: string): boolean {
    // 检查是否允许此转换
    const allowed = this.canTransition(to);

    if (!allowed) {
      throw new Error(`不允许的状态转换: ${from} -> ${to}`);
    }

    const previous = this.state.current;
    this.state = {
      current: to,
      previous,
      timestamp: Date.now(),
    };

    this.recordEvent('state_changed', { from, to });
    return true;
  }

  /**
   * 检查是否可以转换到目标状态
   */
  canTransition(to: string): boolean {
    const current = this.state.current;
    const allowedFromCurrent = this.allowedTransitions[current] || [];
    const allowedWildcard = this.allowedTransitions['*'] || [];

    return allowedFromCurrent.includes(to) || allowedWildcard.includes(to);
  }

  /**
   * 应用动作/操作
   */
  apply(action: string, data?: any): void {
    this.recordEvent('action', { action, data });

    // 根据动作自动触发状态转换
    const actionTriggers: Record<string, string> = {
      'activate': 'active',
      'deactivate': 'inactive',
      'archive': 'archived',
      'delete': 'deleted',
      'restore': 'active',
    };

    if (actionTriggers[action] && this.canTransition(actionTriggers[action])) {
      this.transition(this.state.current, actionTriggers[action]);
    }
  }

  /**
   * 评估条件 (TCF 模型)
   */
  evaluate(trigger: string, condition: (entity: TelosContext) => boolean): boolean {
    try {
      return condition(this);
    } catch (error) {
      this.recordEvent('condition_error', { trigger, error: String(error) });
      return false;
    }
  }

  /**
   * 检查触发器 (TCF 模型)
   */
  checkTrigger(trigger: string): boolean {
    this.recordEvent('trigger_checked', { trigger });

    // 预留：可以根据触发器类型执行不同的检查逻辑
    return true;
  }

  /**
   * 执行生命周期钩子
   */
  executeHook(hookName: string, callback: () => void): void {
    this.recordEvent('hook_executed', { hook: hookName });
    callback();
  }

  /**
   * 记录事件
   */
  private recordEvent(type: string, data: any): void {
    this.history.push({
      type,
      timestamp: Date.now(),
      data,
    });
  }

  /**
   * 获取历史记录
   */
  getHistory(): EntityEvent[] {
    return [...this.history];
  }

  /**
   * 获取指定类型的历史事件
   */
  getHistoryByType(type: string): EntityEvent[] {
    return this.history.filter(e => e.type === type);
  }

  /**
   * 序列化
   */
  toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      attributes: this.attributes,
      state: this.state,
      history: this.history,
    };
  }

  /**
   * 从 JSON 恢复
   */
  static fromJSON(json: any): TelosContext {
    const entity = new TelosContext(json.id, json.attributes, json.type);
    entity.state = json.state;
    entity.history = json.history || [];
    return entity;
  }
}

/**
 * 预定义实体状态
 */
export const EntityStates = {
  INITIALIZED: 'initialized',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived',
  DELETED: 'deleted',
} as const;

/**
 * 预定义实体动作
 */
export const EntityActions = {
  ACTIVATE: 'activate',
  DEACTIVATE: 'deactivate',
  ARCHIVE: 'archive',
  DELETE: 'delete',
  RESTORE: 'restore',
} as const;

export default TelosContext;
