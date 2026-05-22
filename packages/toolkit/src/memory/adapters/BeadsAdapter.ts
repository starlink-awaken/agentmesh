/**
 * BeadsAdapter - Beads 记忆系统适配器
 *
 * 提供基于 Hash ID 的任务管理、依赖图谱和上下文检索能力
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';

// ============================================================================
// 类型定义
// ============================================================================

export type BeadsTaskType = 'epic' | 'task' | 'subtask' | 'message';
export type BeadsTaskStatus = 'open' | 'in_progress' | 'pending_review' | 'closed' | 'blocked';
export type BeadsRelationType = 'blocks' | 'relates_to' | 'parent_child' | 'duplicates' | 'supersedes' | 'replies_to';

export interface BeadsConfig {
  storagePath?: string;
  stealthMode?: boolean;
  contributorMode?: boolean;
  autoSync?: boolean;
  syncOnClose?: boolean;
  remote?: string;
  defaultPriority?: number;
  defaultType?: BeadsTaskType;
  maxContextTokens?: number;
  includeRelated?: boolean;
}

export interface BeadsMetadata {
  tags?: string[];
  source?: string;
  custom?: Record<string, unknown>;
}

export interface BeadsTask {
  id: string;
  content: string;
  metadata: BeadsMetadata;
  type: BeadsTaskType;
  status: BeadsTaskStatus;
  priority: number;
  assignee?: string;
  parentId?: string;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
}

export interface BeadsRelation {
  sourceId: string;
  targetId: string;
  type: BeadsRelationType;
  createdAt: number;
}

export interface BeadsContextOptions {
  maxTokens?: number;
  includeRelated?: boolean;
  includeParent?: boolean;
  includeChildren?: boolean;
}

export interface BeadsContext {
  task: BeadsTask;
  related: BeadsTask[];
  parent?: BeadsTask;
  children: BeadsTask[];
  totalTokens: number;
}

export interface TaskFilter {
  status?: BeadsTaskStatus;
  type?: BeadsTaskType;
  assignee?: string;
  parentId?: string;
}

export interface CreateTaskOptions {
  content: string;
  type?: BeadsTaskType;
  priority?: number;
  assignee?: string;
  parentId?: string;
  metadata?: BeadsMetadata;
}

export interface UpdateTaskOptions {
  content?: string;
  status?: BeadsTaskStatus;
  priority?: number;
  assignee?: string;
  parentId?: string;
  metadata?: BeadsMetadata;
}

// ============================================================================
// BeadsAdapter 主类
// ============================================================================

export class BeadsAdapter {
  private config: Required<BeadsConfig>;
  private tasks: Map<string, BeadsTask> = new Map();
  private relations: BeadsRelation[] = [];
  private storagePath: string;
  private tasksFilePath: string;
  private relationsFilePath: string;

  constructor(config: BeadsConfig = {}) {
    this.config = {
      storagePath: config.storagePath || './beads-data',
      stealthMode: config.stealthMode ?? false,
      contributorMode: config.contributorMode ?? false,
      autoSync: config.autoSync ?? false,
      syncOnClose: config.syncOnClose ?? false,
      remote: config.remote ?? '',
      defaultPriority: config.defaultPriority ?? 3,
      defaultType: config.defaultType ?? 'task',
      maxContextTokens: config.maxContextTokens ?? 4000,
      includeRelated: config.includeRelated ?? true,
    };

    this.storagePath = this.config.storagePath;
    this.tasksFilePath = join(this.storagePath, 'tasks.jsonl');
    this.relationsFilePath = join(this.storagePath, 'relations.jsonl');

    this.ensureStorageDirectory();
    this.loadFromStorage();
  }

  /**
   * 获取当前配置
   */
  getConfig(): BeadsConfig {
    return {
      storagePath: this.config.storagePath,
      stealthMode: this.config.stealthMode,
      contributorMode: this.config.contributorMode,
      autoSync: this.config.autoSync,
      syncOnClose: this.config.syncOnClose,
      remote: this.config.remote || undefined,
      defaultPriority: this.config.defaultPriority,
      defaultType: this.config.defaultType,
      maxContextTokens: this.config.maxContextTokens,
      includeRelated: this.config.includeRelated,
    };
  }

  /**
   * 确保存储目录存在
   */
  private ensureStorageDirectory(): void {
    if (!existsSync(this.storagePath)) {
      mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * 从存储加载数据
   */
  private loadFromStorage(): void {
    // 加载任务
    if (existsSync(this.tasksFilePath)) {
      try {
        const content = readFileSync(this.tasksFilePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        for (const line of lines) {
          const task = JSON.parse(line) as BeadsTask;
          this.tasks.set(task.id, task);
        }
      } catch (error) {
        console.warn('Failed to load tasks from storage:', error);
      }
    }

    // 加载关系
    if (existsSync(this.relationsFilePath)) {
      try {
        const content = readFileSync(this.relationsFilePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        this.relations = lines.map(line => JSON.parse(line) as BeadsRelation);
      } catch (error) {
        console.warn('Failed to load relations from storage:', error);
      }
    }
  }

  /**
   * 保存任务到存储
   */
  private saveTask(task: BeadsTask): void {
    const line = JSON.stringify(task) + '\n';
    const exists = existsSync(this.tasksFilePath);

    if (exists) {
      // 读取现有内容，检查是否已存在
      const content = readFileSync(this.tasksFilePath, 'utf-8');
      const lines = content.split('\n').filter(line => {
        if (!line.trim()) return false;
        const existing = JSON.parse(line) as BeadsTask;
        return existing.id !== task.id;
      });
      lines.push(JSON.stringify(task));
      writeFileSync(this.tasksFilePath, lines.join('\n') + '\n');
    } else {
      writeFileSync(this.tasksFilePath, line);
    }

    this.tasks.set(task.id, task);
  }

  /**
   * 删除任务从存储
   */
  private deleteTaskFromStorage(taskId: string): void {
    if (!existsSync(this.tasksFilePath)) return;

    const content = readFileSync(this.tasksFilePath, 'utf-8');
    const lines = content.split('\n').filter(line => {
      if (!line.trim()) return false;
      const task = JSON.parse(line) as BeadsTask;
      return task.id !== taskId;
    });

    if (lines.length > 0) {
      writeFileSync(this.tasksFilePath, lines.join('\n') + '\n');
    } else {
      unlinkSync(this.tasksFilePath);
    }

    this.tasks.delete(taskId);
  }

  /**
   * 保存关系到存储
   */
  private saveRelation(relation: BeadsRelation): void {
    const line = JSON.stringify(relation) + '\n';
    const exists = existsSync(this.relationsFilePath);

    if (exists) {
      const content = readFileSync(this.relationsFilePath, 'utf-8');
      const lines = content.split('\n').filter(line => {
        if (!line.trim()) return false;
        const existing = JSON.parse(line) as BeadsRelation;
        return !(existing.sourceId === relation.sourceId &&
                 existing.targetId === relation.targetId &&
                 existing.type === relation.type);
      });
      lines.push(JSON.stringify(relation));
      writeFileSync(this.relationsFilePath, lines.join('\n') + '\n');
    } else {
      writeFileSync(this.relationsFilePath, line);
    }

    // 更新内存
    const existingIndex = this.relations.findIndex(
      r => r.sourceId === relation.sourceId &&
           r.targetId === relation.targetId &&
           r.type === relation.type
    );

    if (existingIndex >= 0) {
      this.relations[existingIndex] = relation;
    } else {
      this.relations.push(relation);
    }
  }

  /**
   * 从存储中删除关系
   */
  private deleteRelationFromStorage(sourceId: string, targetId: string, type: BeadsRelationType): void {
    if (!existsSync(this.relationsFilePath)) return;

    const content = readFileSync(this.relationsFilePath, 'utf-8');
    const lines = content.split('\n').filter(line => {
      if (!line.trim()) return false;
      const rel = JSON.parse(line) as BeadsRelation;
      return !(rel.sourceId === sourceId && rel.targetId === targetId && rel.type === type);
    });

    if (lines.length > 0) {
      writeFileSync(this.relationsFilePath, lines.join('\n') + '\n');
    } else {
      unlinkSync(this.relationsFilePath);
    }

    this.relations = this.relations.filter(
      r => !(r.sourceId === sourceId && r.targetId === targetId && r.type === type)
    );
  }

  /**
   * 生成 Hash ID (bd-xxx 格式)
   */
  generateHashId(content: string): string {
    const hash = createHash('sha256').update(content + Date.now()).digest('hex');
    const base36 = parseInt(hash.substring(0, 12), 16).toString(36);
    return `bd-${base36}`;
  }

  /**
   * 估算 token 数量 (简单估算: 1 token ≈ 4 字符)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * 创建任务
   */
  async createTask(options: CreateTaskOptions): Promise<BeadsTask> {
    const now = Date.now();
    const task: BeadsTask = {
      id: this.generateHashId(options.content),
      content: options.content,
      metadata: options.metadata || {},
      type: options.type || this.config.defaultType,
      status: 'open',
      priority: options.priority ?? this.config.defaultPriority,
      assignee: options.assignee,
      parentId: options.parentId,
      createdAt: now,
      updatedAt: now,
    };

    this.saveTask(task);
    return task;
  }

  /**
   * 获取任务
   */
  async getTask(id: string): Promise<BeadsTask | undefined> {
    return this.tasks.get(id);
  }

  /**
   * 更新任务
   */
  async updateTask(id: string, options: UpdateTaskOptions): Promise<BeadsTask | undefined> {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const updated: BeadsTask = {
      ...task,
      ...(options.content !== undefined && { content: options.content }),
      ...(options.status !== undefined && { status: options.status }),
      ...(options.priority !== undefined && { priority: options.priority }),
      ...(options.assignee !== undefined && { assignee: options.assignee }),
      ...(options.parentId !== undefined && { parentId: options.parentId }),
      ...(options.metadata !== undefined && { metadata: options.metadata }),
      updatedAt: Date.now(),
    };

    this.saveTask(updated);
    return updated;
  }

  /**
   * 关闭任务
   */
  async closeTask(id: string): Promise<BeadsTask | undefined> {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const closed: BeadsTask = {
      ...task,
      status: 'closed',
      closedAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.saveTask(closed);
    return closed;
  }

  /**
   * 删除任务
   */
  async deleteTask(id: string): Promise<boolean> {
    if (!this.tasks.has(id)) return false;

    // 删除相关的所有关系
    const relatedRelations = this.relations.filter(
      r => r.sourceId === id || r.targetId === id
    );

    for (const rel of relatedRelations) {
      this.deleteRelationFromStorage(rel.sourceId, rel.targetId, rel.type);
    }

    this.deleteTaskFromStorage(id);
    return true;
  }

  /**
   * 添加阻塞关系
   */
  async addBlock(blockerId: string, blockedId: string): Promise<void> {
    await this.addRelation(blockerId, blockedId, 'blocks');

    // 更新被阻塞任务的状态
    const blocked = this.tasks.get(blockedId);
    if (blocked && blocked.status === 'open') {
      await this.updateTask(blockedId, { status: 'blocked' });
    }
  }

  /**
   * 移除阻塞关系
   */
  async removeBlock(blockerId: string, blockedId: string): Promise<void> {
    await this.removeRelation(blockerId, blockedId, 'blocks');

    // 检查是否还有其他阻塞者
    const hasBlockers = await this.getBlockingTasks(blockedId);
    if (hasBlockers.length === 0) {
      const blocked = this.tasks.get(blockedId);
      if (blocked && blocked.status === 'blocked') {
        await this.updateTask(blockedId, { status: 'open' });
      }
    }
  }

  /**
   * 检查任务是否可以继续（没有阻塞者）
   */
  async canProceed(taskId: string): Promise<boolean> {
    const blockers = await this.getBlockingTasks(taskId);
    return blockers.length === 0;
  }

  /**
   * 获取阻塞指定任务的所有任务
   */
  async getBlockingTasks(taskId: string): Promise<BeadsTask[]> {
    const blocks = this.relations.filter(
      r => r.targetId === taskId && r.type === 'blocks'
    );

    return blocks
      .map(b => this.tasks.get(b.sourceId))
      .filter((t): t is BeadsTask => t !== undefined && t.status !== 'closed');
  }

  /**
   * 添加关系
   */
  async addRelation(sourceId: string, targetId: string, type: BeadsRelationType): Promise<void> {
    const relation: BeadsRelation = {
      sourceId,
      targetId,
      type,
      createdAt: Date.now(),
    };

    this.saveRelation(relation);
  }

  /**
   * 移除关系
   */
  async removeRelation(sourceId: string, targetId: string, type: BeadsRelationType): Promise<void> {
    this.deleteRelationFromStorage(sourceId, targetId, type);
  }

  /**
   * 获取相关任务
   */
  async getRelatedTasks(taskId: string): Promise<BeadsTask[]> {
    const relations = this.relations.filter(
      r => r.sourceId === taskId && r.type !== 'blocks'
    );

    return relations
      .map(r => this.tasks.get(r.targetId))
      .filter((t): t is BeadsTask => t !== undefined);
  }

  /**
   * 获取子任务
   */
  async getChildTasks(parentId: string): Promise<BeadsTask[]> {
    // 首先检查 parentId 字段
    const byParentId = Array.from(this.tasks.values()).filter(
      t => t.parentId === parentId && t.status !== 'closed'
    );

    // 同时检查 parent_child 关系
    const relations = this.relations.filter(
      r => r.sourceId === parentId && r.type === 'parent_child'
    );

    const byRelation = relations
      .map(r => this.tasks.get(r.targetId))
      .filter((t): t is BeadsTask => t !== undefined && t.status !== 'closed');

    // 合并两个结果并去重
    const all = [...byParentId];
    for (const child of byRelation) {
      if (!all.some(t => t.id === child.id)) {
        all.push(child);
      }
    }

    return all;
  }

  /**
   * 获取被取代的任务
   */
  async getSupersededTasks(taskId: string): Promise<BeadsTask[]> {
    const relations = this.relations.filter(
      r => r.sourceId === taskId && r.type === 'supersedes'
    );

    return relations
      .map(r => this.tasks.get(r.targetId))
      .filter((t): t is BeadsTask => t !== undefined);
  }

  /**
   * 获取可以开始的任务（无阻塞者且未关闭）
   */
  async getReadyTasks(): Promise<BeadsTask[]> {
    const allTasks = Array.from(this.tasks.values());

    const readyTasks: BeadsTask[] = [];

    for (const task of allTasks) {
      // 跳过已关闭的任务
      if (task.status === 'closed') continue;

      // 检查是否有阻塞者
      const blockers = await this.getBlockingTasks(task.id);
      if (blockers.length === 0) {
        readyTasks.push(task);
      }
    }

    // 按优先级排序（数字越小优先级越高）
    return readyTasks.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 列出任务
   */
  async listTasks(filter?: TaskFilter): Promise<BeadsTask[]> {
    let tasks = Array.from(this.tasks.values());

    if (filter) {
      if (filter.status) {
        tasks = tasks.filter(t => t.status === filter.status);
      }
      if (filter.type) {
        tasks = tasks.filter(t => t.type === filter.type);
      }
      if (filter.assignee) {
        tasks = tasks.filter(t => t.assignee === filter.assignee);
      }
      if (filter.parentId !== undefined) {
        tasks = tasks.filter(t => t.parentId === filter.parentId);
      }
    }

    return tasks;
  }

  /**
   * 检索上下文
   */
  async retrieveContext(taskId: string, options?: BeadsContextOptions): Promise<BeadsContext> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const maxTokens = options?.maxTokens ?? this.config.maxContextTokens;
    const includeRelated = options?.includeRelated ?? this.config.includeRelated;
    const includeParent = options?.includeParent ?? true;
    const includeChildren = options?.includeChildren ?? true;

    const related: BeadsTask[] = [];
    let currentTokens = this.estimateTokens(task.content);

    // 获取相关任务
    if (includeRelated) {
      const relations = this.relations.filter(
        r => r.sourceId === taskId && r.type !== 'blocks'
      );

      for (const rel of relations) {
        const relatedTask = this.tasks.get(rel.targetId);
        if (relatedTask) {
          const taskTokens = this.estimateTokens(relatedTask.content);
          if (currentTokens + taskTokens <= maxTokens) {
            related.push(relatedTask);
            currentTokens += taskTokens;
          }
        }
      }
    }

    // 获取父任务
    let parent: BeadsTask | undefined;
    if (includeParent && task.parentId) {
      const parentTask = this.tasks.get(task.parentId);
      if (parentTask) {
        const parentTokens = this.estimateTokens(parentTask.content);
        if (currentTokens + parentTokens <= maxTokens) {
          parent = parentTask;
          currentTokens += parentTokens;
        }
      }
    }

    // 获取子任务
    let children: BeadsTask[] = [];
    if (includeChildren) {
      const allChildren = Array.from(this.tasks.values()).filter(
        t => t.parentId === taskId
      );

      for (const child of allChildren) {
        const childTokens = this.estimateTokens(child.content);
        if (currentTokens + childTokens <= maxTokens) {
          children.push(child);
          currentTokens += childTokens;
        }
      }
    }

    return {
      task,
      related,
      parent,
      children,
      totalTokens: currentTokens,
    };
  }

  /**
   * 清除所有数据
   */
  async clear(): Promise<void> {
    this.tasks.clear();
    this.relations = [];

    if (existsSync(this.tasksFilePath)) {
      unlinkSync(this.tasksFilePath);
    }
    if (existsSync(this.relationsFilePath)) {
      unlinkSync(this.relationsFilePath);
    }
  }
}
