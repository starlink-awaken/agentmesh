/**
 * TeamManager - 轻量级多代理协作框架
 *
 * 模拟 Claude Code agent-teams 的核心功能：
 * - 成员管理
 * - 任务分配与依赖
 * - 消息传递
 * - 任务状态追踪
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * 团队成员
 */
export interface Teammate {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'working' | 'blocked' | 'completed';
  currentTask?: string;
  context: Record<string, unknown>;
}

/**
 * 任务项
 */
export interface TeamTask {
  id: string;
  title: string;
  description: string;
  assignee?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
  dependencies: string[];  // 依赖的任务ID
  result?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 消息
 */
export interface TeamMessage {
  id: string;
  from: string;
  to: string | 'broadcast';
  content: string;
  timestamp: Date;
  read: boolean;
}

/**
 * 团队配置
 */
export interface TeamConfig {
  name: string;
  description?: string;
  model?: 'haiku' | 'sonnet' | 'opus';
  teammateMode?: 'in-process' | 'split-panes';
}

/**
 * 团队管理器
 *
 * 提供轻量级的多代理协作能力
 */
export class TeamManager {
  private config: TeamConfig;
  private teammates: Map<string, Teammate> = new Map();
  private tasks: Map<string, TeamTask> = new Map();
  private messages: TeamMessage[] = [];
  private taskIdCounter = 0;
  private messageIdCounter = 0;

  constructor(config: TeamConfig) {
    this.config = config;
  }

  // ==================== 成员管理 ====================

  /**
   * 添加成员
   */
  addTeammate(name: string, role: string, context: Record<string, unknown> = {}): Teammate {
    const id = `teammate_${this.teammates.size + 1}`;
    const teammate: Teammate = {
      id,
      name,
      role,
      status: 'idle',
      context,
    };
    this.teammates.set(id, teammate);
    return teammate;
  }

  /**
   * 获取所有成员
   */
  getTeammates(): Teammate[] {
    return Array.from(this.teammates.values());
  }

  /**
   * 根据角色获取成员
   */
  getTeammatesByRole(role: string): Teammate[] {
    return Array.from(this.teammates.values()).filter(t => t.role === role);
  }

  /**
   * 更新成员状态
   */
  updateTeammateStatus(id: string, status: Teammate['status'], currentTask?: string): void {
    const teammate = this.teammates.get(id);
    if (teammate) {
      teammate.status = status;
      teammate.currentTask = currentTask;
    }
  }

  /**
   * 移除成员
   */
  removeTeammate(id: string): boolean {
    return this.teammates.delete(id);
  }

  // ==================== 任务管理 ====================

  /**
   * 创建任务
   */
  createTask(
    title: string,
    description: string = '',
    priority: TeamTask['priority'] = 'medium',
    dependencies: string[] = []
  ): TeamTask {
    const id = `task_${++this.taskIdCounter}`;
    const now = new Date();
    const task: TeamTask = {
      id,
      title,
      description,
      status: 'pending',
      priority,
      dependencies,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(id, task);
    return task;
  }

  /**
   * 获取所有任务
   */
  getTasks(): TeamTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取待处理任务（无依赖或依赖已完成）
   */
  getAvailableTasks(): TeamTask[] {
    return Array.from(this.tasks.values()).filter(task => {
      if (task.status !== 'pending') return false;
      // 检查所有依赖是否已完成
      return task.dependencies.every(depId => {
        const dep = this.tasks.get(depId);
        return dep?.status === 'completed';
      });
    });
  }

  /**
   * 分配任务
   */
  assignTask(taskId: string, teammateId: string): boolean {
    const task = this.tasks.get(taskId);
    const teammate = this.teammates.get(teammateId);

    if (!task || !teammate) return false;

    // 检查依赖是否满足
    const depsMet = task.dependencies.every(depId => {
      const dep = this.tasks.get(depId);
      return dep?.status === 'completed';
    });

    if (!depsMet) {
      task.status = 'blocked';
      return false;
    }

    task.assignee = teammateId;
    task.status = 'in_progress';
    task.updatedAt = new Date();

    teammate.status = 'working';
    teammate.currentTask = taskId;

    return true;
  }

  /**
   * 完成任务
   */
  completeTask(taskId: string, result?: unknown): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = 'completed';
    task.result = result;
    task.updatedAt = new Date();

    // 更新成员状态
    if (task.assignee) {
      const teammate = this.teammates.get(task.assignee);
      if (teammate) {
        teammate.status = 'idle';
        teammate.currentTask = undefined;
      }
    }

    // 检查是否有被阻塞的任务可以解锁
    this.unblockDependentTasks(taskId);

    return true;
  }

  /**
   * 解锁依赖任务
   */
  private unblockDependentTasks(completedTaskId: string): void {
    for (const task of this.tasks.values()) {
      if (task.status === 'blocked' && task.dependencies.includes(completedTaskId)) {
        // 检查所有依赖是否都已完成
        const allDepsMet = task.dependencies.every(depId => {
          const dep = this.tasks.get(depId);
          return dep?.status === 'completed';
        });

        if (allDepsMet) {
          task.status = 'pending';
          task.updatedAt = new Date();
        }
      }
    }
  }

  /**
   * 添加任务依赖
   */
  addDependency(taskId: string, dependsOn: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (!task.dependencies.includes(dependsOn)) {
      task.dependencies.push(dependsOn);
      task.updatedAt = new Date();

      // 如果新依赖未完成，阻塞此任务
      const dep = this.tasks.get(dependsOn);
      if (dep && dep.status !== 'completed') {
        task.status = 'blocked';
      }
    }

    return true;
  }

  /**
   * 获取任务统计
   */
  getTaskStats(): { pending: number; inProgress: number; completed: number; blocked: number } {
    const tasks = Array.from(this.tasks.values());
    return {
      pending: tasks.filter(t => t.status === 'pending').length,
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      blocked: tasks.filter(t => t.status === 'blocked').length,
    };
  }

  // ==================== 消息传递 ====================

  /**
   * 发送消息
   */
  sendMessage(from: string, to: string | 'broadcast', content: string): TeamMessage {
    const message: TeamMessage = {
      id: `msg_${++this.messageIdCounter}`,
      from,
      to,
      content,
      timestamp: new Date(),
      read: false,
    };
    this.messages.push(message);
    return message;
  }

  /**
   * 获取消息
   */
  getMessages(teammateId?: string): TeamMessage[] {
    if (!teammateId) return [...this.messages];

    return this.messages.filter(m =>
      m.to === 'broadcast' ||
      m.to === teammateId ||
      m.from === teammateId
    );
  }

  /**
   * 标记消息为已读
   */
  markAsRead(messageId: string): boolean {
    const message = this.messages.find(m => m.id === messageId);
    if (message) {
      message.read = true;
      return true;
    }
    return false;
  }

  // ==================== 团队操作 ====================

  /**
   * 获取团队信息
   */
  getInfo(): { config: TeamConfig; memberCount: number; taskStats: ReturnType<TeamManager['getTaskStats']> } {
    return {
      config: this.config,
      memberCount: this.teammates.size,
      taskStats: this.getTaskStats(),
    };
  }

  /**
   * 导出团队状态
   */
  exportState(): {
    config: TeamConfig;
    teammates: Teammate[];
    tasks: TeamTask[];
    messages: TeamMessage[];
  } {
    return {
      config: this.config,
      teammates: this.getTeammates(),
      tasks: this.getTasks(),
      messages: this.messages,
    };
  }

  /**
   * 从状态恢复
   */
  static fromState(state: ReturnType<TeamManager['exportState']>): TeamManager {
    const manager = new TeamManager(state.config);

    // 恢复成员
    for (const t of state.teammates) {
      manager.teammates.set(t.id, { ...t });
    }

    // 恢复任务
    for (const t of state.tasks) {
      manager.tasks.set(t.id, {
        ...t,
        createdAt: new Date(t.createdAt),
        updatedAt: new Date(t.updatedAt),
      });
    }

    // 恢复消息
    for (const m of state.messages) {
      manager.messages.push({
        ...m,
        timestamp: new Date(m.timestamp),
      });
    }

    // 更新计数器
    manager.taskIdCounter = Math.max(0, ...Array.from(manager.tasks.keys()).map(k => {
      const match = k.match(/task_(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    }));

    manager.messageIdCounter = Math.max(0, ...manager.messages.map(m => {
      const match = m.id.match(/msg_(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    }));

    return manager;
  }
}

export default TeamManager;
