import { v4 as uuidv4 } from 'uuid';
import type { Task, AgentMessage, Agent, Error } from '../types/index.js';
import { eventBus } from './event-bus.js';
import { router } from './router.js';
import { contextManager } from './context-manager.js';
import { agentRegistry } from './agent-registry.js';

export class TaskManager {
  private tasks: Map<string, Task> = new Map();

  /**
   * 创建新任务
   */
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

    this.tasks.set(taskId, task);

    // 发布任务提交事件
    eventBus.publishTaskEvent('task.submitted', {
      ...request,
      id: taskId
    });

    return task;
  }

  /**
   * 分配任务到 Agent
   */
  assignTask(taskId: string, agentIds: string[]): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    task.assignedAgents = agentIds;
    task.status = 'assigned';
    task.updatedAt = Date.now();

    // 发布任务分配事件
    eventBus.publishTaskEvent('task.assigned', {
      ...task.request,
      id: taskId
    });

    return task;
  }

  /**
   * 开始执行任务
   */
  startTask(taskId: string): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    task.status = 'running';
    task.updatedAt = Date.now();

    eventBus.publishTaskEvent('task.started', {
      ...task.request,
      id: taskId
    });

    return task;
  }

  /**
   * 完成任务
   */
  completeTask(taskId: string, result: unknown): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    task.status = 'completed';
    task.result = result;
    task.updatedAt = Date.now();

    eventBus.publishTaskEvent('task.completed', {
      ...task.request,
      id: taskId,
      result
    });

    return task;
  }

  /**
   * 任务失败
   */
  failTask(taskId: string, error: Error): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    task.status = 'failed';
    task.error = error;
    task.updatedAt = Date.now();

    eventBus.publishTaskEvent('task.failed', {
      ...task.request,
      id: taskId,
      error
    });

    return task;
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 处理任务
   */
  async processTask(message: AgentMessage): Promise<Task> {
    // 1. 创建任务
    const task = await this.createTask(message);

    // 2. 如果有共享空间，添加消息到上下文
    if (message.payload?.context?.shared_space_id) {
      await contextManager.addMessage(
        message.payload.context.shared_space_id,
        message
      );
    }

    // 3. 路由任务到 Agent
    const { agentIds, strategy } = router.route(message);

    if (agentIds.length === 0) {
      this.failTask(task.id, {
        code: 'NO_AGENT_AVAILABLE',
        message: 'No available agents to handle this task'
      });
      throw new Error('No available agents');
    }

    // 4. 分配任务
    this.assignTask(task.id, agentIds);
    this.startTask(task.id);

    // 5. 执行任务
    await this.executeTask(task, agentIds, strategy);

    return task;
  }

  /**
   * 执行任务
   */
  private async executeTask(
    task: Task,
    agentIds: string[],
    strategy: 'direct' | 'broadcast'
  ): Promise<void> {
    const results: Record<string, unknown> = {};

    if (strategy === 'direct' && agentIds[0]) {
      // 单 Agent 执行
      const agentId = agentIds[0]!;
      const adapter = agentRegistry.get(agentId);

      if (!adapter) {
        this.failTask(task.id, {
          code: 'AGENT_NOT_FOUND',
          message: `Agent ${agentId} not found`
        });
        return;
      }

      try {
        console.log(`[TaskManager] Executing task ${task.id} with agent ${agentId}`);
        const response = await adapter.invoke(task.request);
        results[agentId] = response.result;

        // 如果有共享空间，添加响应到上下文
        if (task.request.payload?.context?.shared_space_id) {
          await contextManager.addMessage(
            task.request.payload.context.shared_space_id,
            response
          );
        }

        this.completeTask(task.id, response.result);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.failTask(task.id, {
          code: 'EXECUTION_ERROR',
          message: errorMessage
        });
      }
    } else {
      // 广播模式：多个 Agent 同时执行
      const promises = agentIds.map(async (agentId) => {
        const adapter = agentRegistry.get(agentId);
        if (!adapter) {
          results[agentId] = { error: `Agent ${agentId} not found` };
          return;
        }

        try {
          const response = await adapter.invoke(task.request);
          results[agentId] = response.result;

          // 添加响应到上下文
          if (task.request.payload?.context?.shared_space_id) {
            await contextManager.addMessage(
              task.request.payload.context.shared_space_id,
              response
            );
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          results[agentId] = { error: errorMessage };
        }
      });

      await Promise.all(promises);
      this.completeTask(task.id, results);
    }
  }
}

export const taskManager = new TaskManager();
