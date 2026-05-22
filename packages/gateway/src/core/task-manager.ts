import { v4 as uuidv4 } from 'uuid';
import type { Task, AgentMessage, Error } from '../types/index.js';
import { eventBus } from './event-bus.js';
import { router } from './router.js';
import { contextManager } from './context-manager.js';
import { agentRegistry } from './agent-registry.js';
import type { TaskStore } from './store.js';

export class TaskManager {
  private tasks = new Map<string, Task>();
  private controllers = new Map<string, AbortController>();
  private store: TaskStore | null = null;

  /** 接入持久化存储 */
  useStore(store: TaskStore): void {
    this.store = store;
    // 从存储恢复任务到内存
    for (const task of store.loadAll()) {
      this.tasks.set(task.id, task);
    }
  }

  private _save(task: Task): void {
    this.tasks.set(task.id, task);
    this.store?.save(task);
  }

  /** 创建新任务 */
  async createTask(request: AgentMessage): Promise<Task> {
    const taskId = uuidv4();
    const task: Task = {
      id: taskId,
      status: 'pending',
      request,
      assignedAgents: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this._save(task);
    this.controllers.set(taskId, new AbortController());

    eventBus.publishTaskEvent('task.submitted', { ...request, id: taskId });
    return task;
  }

  /** 分配任务 */
  assignTask(taskId: string, agentIds: string[]): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    task.assignedAgents = agentIds;
    task.status = 'assigned';
    task.updatedAt = Date.now();
    this._save(task);

    eventBus.publishTaskEvent('task.assigned', { ...task.request, id: taskId });
    return task;
  }

  /** 开始执行 */
  startTask(taskId: string): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    task.status = 'running';
    task.updatedAt = Date.now();
    this._save(task);

    eventBus.publishTaskEvent('task.started', { ...task.request, id: taskId });
    return task;
  }

  /** 完成任务 */
  completeTask(taskId: string, result: unknown): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    task.status = 'completed';
    task.result = result;
    task.updatedAt = Date.now();
    this._save(task);
    this.controllers.delete(taskId);

    eventBus.publishTaskEvent('task.completed', { ...task.request, id: taskId, result });
    return task;
  }

  /** 任务失败 */
  failTask(taskId: string, error: Error): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    task.status = 'failed';
    task.error = error;
    task.updatedAt = Date.now();
    this._save(task);
    this.controllers.delete(taskId);

    eventBus.publishTaskEvent('task.failed', { ...task.request, id: taskId, error });
    return task;
  }

  /** 取消任务 */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // 只能取消 pending/running 状态的任务
    if (task.status !== 'pending' && task.status !== 'assigned' && task.status !== 'running') {
      return false;
    }

    const ctrl = this.controllers.get(taskId);
    if (ctrl) {
      ctrl.abort();
      this.controllers.delete(taskId);
    }

    task.status = 'failed';
    task.error = { code: 'CANCELLED', message: 'Task cancelled by user' };
    task.updatedAt = Date.now();
    this._save(task);

    eventBus.publishTaskEvent('task.failed', {
      ...task.request, id: taskId,
      error: task.error,
    });

    return true;
  }

  /** 获取任务的 AbortSignal */
  getSignal(taskId: string): AbortSignal | undefined {
    return this.controllers.get(taskId)?.signal;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /** 清理已完成/失败的任务（内存 + 持久化） */
  purgeCompleted(olderThanDays = 7): number {
    if (!this.store) return 0;
    const deletedIds = this.store.purgeCompleted(olderThanDays);
    for (const id of deletedIds) {
      this.tasks.delete(id);
      this.controllers.delete(id);
    }
    return deletedIds.length;
  }

  /** 处理任务 */
  async processTask(message: AgentMessage): Promise<Task> {
    const task = await this.createTask(message);

    if (message.payload?.context?.shared_space_id) {
      await contextManager.addMessage(message.payload.context.shared_space_id, message);
    }

    const { agentIds, strategy } = router.route(message);

    if (agentIds.length === 0) {
      this.failTask(task.id, {
        code: 'NO_AGENT_AVAILABLE',
        message: 'No available agents to handle this task'
      });
      throw new Error('No available agents');
    }

    this.assignTask(task.id, agentIds);
    this.startTask(task.id);

    await this.executeTask(task, agentIds, strategy);
    return task;
  }

  /** 执行任务 */
  private async executeTask(
    task: Task,
    agentIds: string[],
    strategy: 'direct' | 'broadcast'
  ): Promise<void> {
    const signal = this.controllers.get(task.id)?.signal;
    const results: Record<string, unknown> = {};

    if (strategy === 'direct' && agentIds[0]) {
      const agentId = agentIds[0]!;
      const adapter = agentRegistry.get(agentId);

      if (!adapter) {
        this.failTask(task.id, { code: 'AGENT_NOT_FOUND', message: `Agent ${agentId} not found` });
        return;
      }

      try {
        console.log(`[TaskManager] Executing task ${task.id} with agent ${agentId}`);
        const response = await adapter.invoke(task.request);
        if (signal?.aborted) return;
        results[agentId] = response.result;

        if (task.request.payload?.context?.shared_space_id) {
          await contextManager.addMessage(task.request.payload.context.shared_space_id, response);
        }

        this.completeTask(task.id, response.result);
      } catch (error: unknown) {
        if (signal?.aborted) return;
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.failTask(task.id, { code: 'EXECUTION_ERROR', message: errorMessage });
      }
    } else {
      const promises = agentIds.map(async (agentId) => {
        if (signal?.aborted) return;
        const adapter = agentRegistry.get(agentId);
        if (!adapter) { results[agentId] = { error: `Agent ${agentId} not found` }; return; }

        try {
          const response = await adapter.invoke(task.request);
          results[agentId] = response.result;

          if (task.request.payload?.context?.shared_space_id) {
            await contextManager.addMessage(task.request.payload.context.shared_space_id, response);
          }
        } catch (error: unknown) {
          results[agentId] = { error: error instanceof Error ? error.message : String(error) };
        }
      });

      await Promise.all(promises);
      if (!signal?.aborted) this.completeTask(task.id, results);
    }
  }
}

export const taskManager = new TaskManager();
