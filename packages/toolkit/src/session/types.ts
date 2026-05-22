/**
 * Session Types - 会话管理系统类型定义
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * 会话状态
 */
export type SessionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

/**
 * 会话配置
 */
export interface SessionConfig {
  sessionId: string;
  checkpointInterval?: number;  // 检查点保存间隔（毫秒）
  persistence?: 'memory' | 'file';  // 持久化方式
  storagePath?: string;  // 文件存储路径
  autoCheckpoint?: boolean;  // 是否自动保存检查点
  maxCheckpoints?: number;  // 最大检查点数量
}

/**
 * 会话状态数据
 */
export interface SessionState {
  currentStep: number;
  completedSteps: number[];
  context: Record<string, unknown>;
  result?: unknown;
  errors: SessionError[];
  metadata: SessionMetadata;
}

/**
 * 会话错误
 */
export interface SessionError {
  code: string;
  message: string;
  step?: number;
  timestamp: Date;
  recoverable: boolean;
}

/**
 * 会话元数据
 */
export interface SessionMetadata {
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  pausedAt?: Date;
  completedAt?: Date;
  duration?: number;
}

/**
 * 检查点
 */
export interface Checkpoint {
  id: string;
  sessionId: string;
  state: SessionState;
  timestamp: Date;
  metadata: CheckpointMetadata;
}

/**
 * 检查点元数据
 */
export interface CheckpointMetadata {
  step: number;
  description?: string;
  size?: number;  // 状态大小（字节）
}

/**
 * 会话信息（包含完整状态）
 */
export interface SessionInfo {
  id: string;
  status: SessionStatus;
  config: SessionConfig;
  state: SessionState;
  checkpoints: Checkpoint[];
}

/**
 * 会话创建选项
 */
export interface CreateSessionOptions {
  sessionId?: string;
  initialContext?: Record<string, unknown>;
  checkpointInterval?: number;
  persistence?: 'memory' | 'file';
  storagePath?: string;
  autoCheckpoint?: boolean;
  maxCheckpoints?: number;
}

/**
 * 会话事件
 */
export interface SessionEvent {
  type: SessionStatus;
  sessionId: string;
  timestamp: Date;
  data?: unknown;
}

/**
 * 会话事件监听器
 */
export type SessionEventListener = (event: SessionEvent) => void;

/**
 * 状态转换规则
 */
export interface StateTransition {
  from: SessionStatus;
  to: SessionStatus;
  allowed: boolean;
}

/**
 * 默认状态转换规则
 */
export const DEFAULT_TRANSITIONS: StateTransition[] = [
  { from: 'pending', to: 'running', allowed: true },
  { from: 'running', to: 'paused', allowed: true },
  { from: 'running', to: 'completed', allowed: true },
  { from: 'running', to: 'failed', allowed: true },
  { from: 'paused', to: 'running', allowed: true },
  { from: 'paused', to: 'failed', allowed: true },
  { from: 'paused', to: 'pending', allowed: false },
  { from: 'completed', to: 'running', allowed: false },
  { from: 'failed', to: 'running', allowed: true },  // 允许重试
];

/**
 * 检查点存储接口
 */
export interface ICheckpointStore {
  save(checkpoint: Checkpoint): Promise<void>;
  load(sessionId: string, checkpointId: string): Promise<Checkpoint | null>;
  list(sessionId: string): Promise<Checkpoint[]>;
  latest(sessionId: string): Promise<Checkpoint | null>;
  delete(sessionId: string, checkpointId: string): Promise<void>;
  clear(sessionId: string): Promise<void>;
}

/**
 * 会话管理器接口
 */
export interface ISessionManager {
  createSession(options: CreateSessionOptions): Promise<SessionInfo>;
  pause(sessionId: string): Promise<SessionInfo>;
  resume(sessionId: string): Promise<SessionInfo>;
  getState(sessionId: string): SessionState | null;
  checkpoint(sessionId: string, description?: string): Promise<Checkpoint>;
  restore(sessionId: string, checkpointId?: string): Promise<SessionState>;
  terminate(sessionId: string): Promise<void>;
  getSession(sessionId: string): SessionInfo | null;
  listSessions(): SessionInfo[];
  on(event: SessionStatus, listener: SessionEventListener): void;
  off(event: SessionStatus, listener: SessionEventListener): void;
}

/**
 * 会话管理器配置
 */
export interface SessionManagerConfig {
  persistence?: 'memory' | 'file';
  storagePath?: string;
  checkpointInterval?: number;
  autoCheckpoint?: boolean;
  maxCheckpoints?: number;
}
