/**
 * IdleProcessor - 空闲处理器
 *
 * 利用系统空闲时间进行后台任务处理
 * 源自 Advanced RAG 架构 - 主动式"做梦"
 *
 * 功能：
 * - 自动归档文件
 * - 每日反思生成
 * - 知识图谱构建
 */

import type { IdleTask } from './types.js';

/**
 * 系统资源状态
 */
export interface SystemResources {
  cpuUsage: number;
  memoryUsage: number;
  batteryLevel?: number;
  isIdle: boolean;
}

/**
 * 空闲处理器配置
 */
export interface IdleProcessorConfig {
  checkIntervalMs?: number;
  idleThresholdMs?: number;
  maxCpuUsage?: number;
  maxMemoryUsage?: number;
  enabledTasks?: string[];
}

/**
 * 空闲任务处理器
 */
export class IdleProcessor {
  private tasks: Map<string, IdleTask> = new Map();
  private config: Required<IdleProcessorConfig>;
  private intervalId?: ReturnType<typeof setInterval>;
  private lastActivity: number = Date.now();
  private isRunning: boolean = false;

  constructor(config: IdleProcessorConfig = {}) {
    this.config = {
      checkIntervalMs: config.checkIntervalMs ?? 60000,      // 每分钟检查一次
      idleThresholdMs: config.idleThresholdMs ?? 300000,    // 5分钟无操作视为空闲
      maxCpuUsage: config.maxCpuUsage ?? 30,                // CPU < 30% 视为空闲
      maxMemoryUsage: config.maxMemoryUsage ?? 60,          // 内存 < 60% 视为空闲
      enabledTasks: config.enabledTasks ?? [],
    };
  }

  /**
   * 注册空闲任务
   */
  registerTask(task: IdleTask): void {
    this.tasks.set(task.id, task);
  }

  /**
   * 移除任务
   */
  removeTask(taskId: string): boolean {
    return this.tasks.delete(taskId);
  }

  /**
   * 启动空闲处理器
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastActivity = Date.now();

    this.intervalId = setInterval(() => {
      this.checkAndExecute();
    }, this.config.checkIntervalMs);

    // 监听用户活动
    this.setupActivityListeners();
  }

  /**
   * 停止空闲处理器
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
  }

  /**
   * 设置活动监听
   */
  private setupActivityListeners(): void {
    // Node.js 环境，跳过浏览器事件监听
    // 实际使用时可以根据环境条件启用
  }

  /**
   * 检查并执行任务
   */
  private async checkAndExecute(): Promise<void> {
    // 检查系统资源
    const resources = await this.getSystemResources();

    // 检查是否空闲
    const timeSinceActivity = Date.now() - this.lastActivity;
    const isTimeIdle = timeSinceActivity > this.config.idleThresholdMs;
    const isResourceIdle = resources.cpuUsage < this.config.maxCpuUsage &&
                          resources.memoryUsage < this.config.maxMemoryUsage;

    if (!isTimeIdle || !isResourceIdle) {
      return;
    }

    // 执行空闲任务
    for (const task of this.tasks.values()) {
      if (!task.enabled) continue;

      // 检查是否启用特定任务
      if (this.config.enabledTasks.length > 0 &&
          !this.config.enabledTasks.includes(task.id)) {
        continue;
      }

      try {
        console.log(`[IdleProcessor] Executing task: ${task.name}`);
        await task.handler();
        console.log(`[IdleProcessor] Task completed: ${task.name}`);
      } catch (error) {
        console.error(`[IdleProcessor] Task failed: ${task.name}`, error);
      }
    }
  }

  /**
   * 获取系统资源状态
   */
  async getSystemResources(): Promise<SystemResources> {
    // 简化实现
    // 实际可以使用 node-os-utils 或 systeminformation
    const resources: SystemResources = {
      cpuUsage: 10,        // 默认值
      memoryUsage: 40,     // 默认值
      isIdle: false,
    };

    // 尝试获取更准确的信息
    try {
      // Node.js 环境
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const mem = process.memoryUsage();
        resources.memoryUsage = Math.round((mem.heapUsed / mem.heapTotal) * 100);
      }
    } catch {
      // 忽略
    }

    return resources;
  }

  /**
   * 手动触发任务执行（不检查空闲状态）
   */
  async executeNow(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    await task.handler();
  }

  /**
   * 获取状态
   */
  getStatus(): {
    running: boolean;
    tasks: Array<{ id: string; name: string; schedule: string; enabled: boolean }>;
    lastActivity: number;
  } {
    return {
      running: this.isRunning,
      tasks: Array.from(this.tasks.values()).map(t => ({
        id: t.id,
        name: t.name,
        schedule: t.schedule,
        enabled: t.enabled,
      })),
      lastActivity: this.lastActivity,
    };
  }
}

/**
 * 创建空闲处理器
 */
export function createIdleProcessor(config?: IdleProcessorConfig): IdleProcessor {
  return new IdleProcessor(config);
}
