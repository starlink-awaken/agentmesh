/** 任务状态 */
export type TaskStatus = 'pending' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled';

/** 任务 */
export interface Task {
  id: string;
  status: TaskStatus;
  request: unknown;
  result?: unknown;
  error?: string;
  assignedAgent?: string;
  assignedModel?: string;
  createdAt: number;
  updatedAt?: number;
  completedAt?: number;
}

/** 任务创建请求 */
export interface TaskCreateRequest {
  type: string;
  payload: unknown;
  priority?: number;
  ttl?: number;
}

/** 任务进度 */
export interface TaskProgress {
  taskId: string;
  status: TaskStatus;
  progress?: number;
  message?: string;
}
