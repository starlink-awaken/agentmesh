/**
 * Session 模块 - 统一导出
 *
 * 会话管理系统 - 提供会话创建、暂停、恢复、检查点管理等功能
 *
 * @author PAI
 * @version 1.0.0
 */

export {
  SessionManager,
} from './SessionManager.js';

export {
  SessionStateManager,
  DEFAULT_SESSION_STATE,
} from './SessionState.js';

export {
  MemoryCheckpointStore,
  FileCheckpointStore,
  createCheckpointStore,
  generateCheckpointId,
} from './CheckpointStore.js';

export type {
  SessionStatus,
  SessionConfig,
  SessionState,
  SessionError,
  SessionMetadata,
  Checkpoint,
  CheckpointMetadata,
  SessionInfo,
  CreateSessionOptions,
  SessionEvent,
  SessionEventListener,
  StateTransition,
  ICheckpointStore,
  ISessionManager,
  SessionManagerConfig,
} from './types.js';

export {
  DEFAULT_TRANSITIONS,
} from './types.js';

import type { SessionManagerConfig } from './types.js';
import { SessionManager } from './SessionManager.js';

/**
 * 创建会话管理器
 */
export function createSessionManager(config?: SessionManagerConfig): SessionManager {
  return new SessionManager(config);
}

/**
 * 默认会话管理器实例
 */
let defaultManager: SessionManager | null = null;

/**
 * 获取默认会话管理器
 */
export function getDefaultSessionManager(): SessionManager {
  if (!defaultManager) {
    defaultManager = new SessionManager();
  }
  return defaultManager;
}

/**
 * 重置默认会话管理器
 */
export function resetDefaultSessionManager(): void {
  defaultManager = null;
}
