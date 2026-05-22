/**
 * SessionManager - 会话管理器
 *
 * 提供会话的创建、暂停、恢复、检查点管理等功能
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  SessionInfo,
  SessionStatus,
  SessionConfig,
  SessionState,
  CreateSessionOptions,
  Checkpoint,
  SessionEvent,
  SessionEventListener,
  ICheckpointStore,
  SessionManagerConfig,
} from './types.js';
import { SessionStateManager, DEFAULT_SESSION_STATE } from './SessionState.js';
import {
  createCheckpointStore,
  generateCheckpointId,
} from './CheckpointStore.js';

/**
 * 会话管理器
 *
 * 管理会话的完整生命周期
 */
export class SessionManager {
  private sessions: Map<string, SessionInfo> = new Map();
  private stateManagers: Map<string, SessionStateManager> = new Map();
  private checkpointStores: Map<string, ICheckpointStore> = new Map();
  private config: SessionManagerConfig;
  private eventListeners: Map<SessionStatus, Set<SessionEventListener>> = new Map();

  /**
   * 构造函数
   */
  constructor(config: SessionManagerConfig = {}) {
    this.config = {
      persistence: 'memory',
      ...config,
    };
  }

  /**
   * 创建会话
   */
  async createSession(options: CreateSessionOptions = {}): Promise<SessionInfo> {
    const sessionId = options.sessionId || this.generateSessionId();

    // 创建状态管理器
    const stateManager = new SessionStateManager({
      ...DEFAULT_SESSION_STATE,
      context: options.initialContext || {},
    });

    // 创建检查点存储
    const checkpointStore = createCheckpointStore(this.config.persistence!, {
      basePath: this.config.storagePath,
    });

    // 创建会话配置
    const config: SessionConfig = {
      sessionId,
      checkpointInterval: options.checkpointInterval || this.config.checkpointInterval || 60000,
      persistence: options.persistence || this.config.persistence || 'memory',
      storagePath: options.storagePath || this.config.storagePath,
      autoCheckpoint: options.autoCheckpoint ?? this.config.autoCheckpoint ?? false,
      maxCheckpoints: options.maxCheckpoints || this.config.maxCheckpoints || 10,
    };

    // 创建会话信息
    const sessionInfo: SessionInfo = {
      id: sessionId,
      status: 'pending',
      config,
      state: stateManager.getState(),
      checkpoints: [],
    };

    // 保存会话
    this.sessions.set(sessionId, sessionInfo);
    this.stateManagers.set(sessionId, stateManager);
    this.checkpointStores.set(sessionId, checkpointStore);

    // 触发事件
    this.emitEvent({
      type: 'pending',
      sessionId,
      timestamp: new Date(),
    });

    return sessionInfo;
  }

  /**
   * 暂停会话
   */
  async pause(sessionId: string): Promise<SessionInfo> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'running') {
      throw new Error(`Cannot pause session in status: ${session.status}`);
    }

    const stateManager = this.stateManagers.get(sessionId)!;
    if (!stateManager.transition('paused')) {
      throw new Error('Failed to transition to paused state');
    }

    // 自动创建检查点
    if (session.config.autoCheckpoint) {
      await this.checkpoint(sessionId, 'Auto checkpoint on pause');
    }

    // 更新会话信息
    session.status = 'paused';
    session.state = stateManager.getState();

    this.emitEvent({
      type: 'paused',
      sessionId,
      timestamp: new Date(),
    });

    return session;
  }

  /**
   * 恢复会话
   */
  async resume(sessionId: string): Promise<SessionInfo> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'paused') {
      throw new Error(`Cannot resume session in status: ${session.status}`);
    }

    const stateManager = this.stateManagers.get(sessionId)!;
    if (!stateManager.transition('running')) {
      throw new Error('Failed to transition to running state');
    }

    // 更新会话信息
    session.status = 'running';
    session.state = stateManager.getState();

    this.emitEvent({
      type: 'running',
      sessionId,
      timestamp: new Date(),
    });

    return session;
  }

  /**
   * 获取当前状态
   */
  getState(sessionId: string): SessionState | null {
    const stateManager = this.stateManagers.get(sessionId);
    return stateManager ? stateManager.getState() : null;
  }

  /**
   * 保存检查点
   */
  async checkpoint(
    sessionId: string,
    description?: string
  ): Promise<Checkpoint> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const stateManager = this.stateManagers.get(sessionId)!;
    const checkpointStore = this.checkpointStores.get(sessionId)!;

    const checkpointId = generateCheckpointId();
    const currentState = stateManager.getState();

    // 计算状态大小
    const stateSize = JSON.stringify(currentState).length;

    const checkpoint: Checkpoint = {
      id: checkpointId,
      sessionId,
      state: currentState,
      timestamp: new Date(),
      metadata: {
        step: currentState.currentStep,
        description,
        size: stateSize,
      },
    };

    // 保存检查点
    await checkpointStore.save(checkpoint);

    // 获取检查点列表并更新会话信息
    const checkpoints = await checkpointStore.list(sessionId);

    // 限制检查点数量
    if (checkpoints.length > (session.config.maxCheckpoints || 10)) {
      const toDelete = checkpoints.slice(0, checkpoints.length - (session.config.maxCheckpoints || 10));
      for (const cp of toDelete) {
        await checkpointStore.delete(sessionId, cp.id);
      }
    }

    session.checkpoints = await checkpointStore.list(sessionId);

    return checkpoint;
  }

  /**
   * 恢复检查点
   */
  async restore(sessionId: string, checkpointId?: string): Promise<SessionState> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const checkpointStore = this.checkpointStores.get(sessionId)!;

    let checkpoint: Checkpoint | null;

    if (checkpointId) {
      checkpoint = await checkpointStore.load(sessionId, checkpointId);
    } else {
      // 使用最新的检查点
      checkpoint = await checkpointStore.latest(sessionId);
    }

    if (!checkpoint) {
      throw new Error(
        checkpointId
          ? `Checkpoint not found: ${checkpointId}`
          : 'No checkpoint available'
      );
    }

    // 恢复状态
    const stateManager = this.stateManagers.get(sessionId)!;
    stateManager.setState(checkpoint.state);

    // 更新会话状态
    session.state = stateManager.getState();

    return session.state;
  }

  /**
   * 终止会话
   */
  async terminate(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const stateManager = this.stateManagers.get(sessionId)!;

    // 如果正在运行，先暂停
    if (session.status === 'running') {
      await this.pause(sessionId);
    }

    // 转换到 failed 状态
    stateManager.transition('failed');

    // 更新会话状态
    session.status = 'failed';
    session.state = stateManager.getState();

    // 清除检查点
    const checkpointStore = this.checkpointStores.get(sessionId)!;
    await checkpointStore.clear(sessionId);

    this.emitEvent({
      type: 'failed',
      sessionId,
      timestamp: new Date(),
    });
  }

  /**
   * 完成会话
   */
  async complete(sessionId: string, result?: unknown): Promise<SessionInfo> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const stateManager = this.stateManagers.get(sessionId)!;

    // 设置结果
    if (result !== undefined) {
      stateManager.setResult(result);
    }

    // 转换到完成状态
    if (!stateManager.transition('completed')) {
      throw new Error('Failed to transition to completed state');
    }

    // 更新会话状态
    session.status = 'completed';
    session.state = stateManager.getState();

    // 自动创建最终检查点
    if (session.config.autoCheckpoint) {
      await this.checkpoint(sessionId, 'Final checkpoint on completion');
    }

    this.emitEvent({
      type: 'completed',
      sessionId,
      timestamp: new Date(),
      data: result,
    });

    return session;
  }

  /**
   * 获取会话信息
   */
  getSession(sessionId: string): SessionInfo | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * 列出所有会话
   */
  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 注册事件监听器
   */
  on(event: SessionStatus, listener: SessionEventListener): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  /**
   * 移除事件监听器
   */
  off(event: SessionStatus, listener: SessionEventListener): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  /**
   * 触发事件
   */
  private emitEvent(event: SessionEvent): void {
    this.eventListeners.get(event.type)?.forEach((listener) => {
      listener(event);
    });
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 更新会话状态
   */
  updateState(
    sessionId: string,
    updates: {
      currentStep?: number;
      completeStep?: boolean;
      context?: Record<string, unknown>;
      key?: string;
      value?: unknown;
      result?: unknown;
      error?: { code: string; message: string; step?: number; recoverable?: boolean };
    }
  ): SessionState {
    const stateManager = this.stateManagers.get(sessionId);
    if (!stateManager) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (updates.currentStep !== undefined) {
      stateManager.setCurrentStep(updates.currentStep);
    }

    if (updates.completeStep) {
      const state = stateManager.getState();
      stateManager.completeStep(state.currentStep);
    }

    if (updates.key !== undefined && updates.value !== undefined) {
      stateManager.setContext(updates.key, updates.value);
    }

    if (updates.context) {
      for (const [key, value] of Object.entries(updates.context)) {
        stateManager.setContext(key, value);
      }
    }

    if (updates.result !== undefined) {
      stateManager.setResult(updates.result);
    }

    if (updates.error) {
      stateManager.addError({
        code: updates.error.code,
        message: updates.error.message,
        step: updates.error.step,
        recoverable: updates.error.recoverable ?? true,
      });
    }

    // 更新会话信息
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = stateManager.getState();
    }

    return stateManager.getState();
  }

  /**
   * 开始会话
   */
  async start(sessionId: string): Promise<SessionInfo> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'pending') {
      throw new Error(`Cannot start session in status: ${session.status}`);
    }

    const stateManager = this.stateManagers.get(sessionId)!;
    if (!stateManager.transition('running')) {
      throw new Error('Failed to transition to running state');
    }

    // 更新会话信息
    session.status = 'running';
    session.state = stateManager.getState();

    this.emitEvent({
      type: 'running',
      sessionId,
      timestamp: new Date(),
    });

    return session;
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // 清除检查点
    const checkpointStore = this.checkpointStores.get(sessionId);
    if (checkpointStore) {
      await checkpointStore.clear(sessionId);
    }

    // 移除会话
    this.sessions.delete(sessionId);
    this.stateManagers.delete(sessionId);
    this.checkpointStores.delete(sessionId);
  }
}
