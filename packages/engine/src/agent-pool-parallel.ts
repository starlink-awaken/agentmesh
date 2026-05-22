/**
 * Honeycomb v2 - AgentPool Parallel Execution
 *
 * 并行执行系统的核心实现，包括：
 * - TaskScheduler: 依赖感知的多级优先级任务调度
 * - ResultAggregator: 多模式结果聚合
 * - AgentPool.parallelRun(): 并行执行入口
 *
 * 设计原则：
 * - 零运行时依赖（仅使用 Bun/Node.js 内置 API）
 * - TypeScript strict mode
 * - TDD: 测试驱动开发
 * - 性能目标：≥5倍提升
 */

import type { AgentDefinition } from './types.js';
import { AgentStatus as CoreAgentStatus } from './types.js';
import {
  ScheduledTask,
  TaskPriority,
  TaskStatus,
  AggregationConfig,
  AggregationMode,
  AggregatedResult,
  PartialResult,
  ParallelExecutionConfig,
  QueueStatus,
  DependencyGraph,
  AggregationProgress,
} from './parallel-execution-types.js';

// ============================================================
// 常量
// ============================================================

const DEFAULT_EXECUTION_TIMEOUT = 30000; // 30秒
const MIN_RETRY_DELAY = 10; // 最小重试延迟（测试用）

// ============================================================
// 工具函数
// ============================================================

/**
 * 生成唯一 ID
 */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 延迟指定毫秒
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带抖动的延迟（避免雷鸣羊群效应）
 */
function delayWithJitter(baseMs: number, jitterFactor: number): Promise<void> {
  const jitter = (Math.random() - 0.5) * 2 * baseMs * jitterFactor;
  const actualDelay = Math.max(0, baseMs + jitter);
  return delay(actualDelay);
}

// ============================================================
// TaskScheduler - 任务调度器
// ============================================================

/**
 * 任务调度器
 *
 * 职责：
 * - 验证任务（检测循环依赖）
 * - 多级优先级队列管理
 * - 依赖感知调度
 * - 并发限制控制
 */
export class TaskScheduler {
  private readonly config: ParallelExecutionConfig;
  private readonly pendingQueue: Map<number, ScheduledTask[]>;
  private readonly runningTasks: Map<string, ScheduledTask>;
  private readonly completedTasks: Set<string>;
  private readonly failedTasks: Set<string>;
  private dependencyGraph: DependencyGraph | null;

  constructor(config: ParallelExecutionConfig) {
    this.config = config;
    this.pendingQueue = new Map([
      [TaskPriority.CRITICAL, []],
      [TaskPriority.HIGH, []],
      [TaskPriority.MEDIUM, []],
      [TaskPriority.LOW, []],
      [TaskPriority.DEFERRED, []],
    ]);
    this.runningTasks = new Map();
    this.completedTasks = new Set();
    this.failedTasks = new Set();
    this.dependencyGraph = null;
  }

  /**
   * 验证并入队任务
   */
  async validateAndEnqueue(tasks: ScheduledTask[]): Promise<void> {
    // 构建依赖图
    this.dependencyGraph = this.buildDependencyGraph(tasks);

    // 检测循环依赖
    if (this.hasCycle(this.dependencyGraph)) {
      throw new Error('检测到循环依赖，无法调度任务');
    }

    // 初始化入度
    for (const task of tasks) {
      task.status = TaskStatus.PENDING as any;
      task.createdAt = Date.now();

      // 无依赖的任务直接就绪
      if (task.dependencies.length === 0) {
        task.status = TaskStatus.READY as any;
        this.enqueueByPriority(task);
      }
    }
  }

  /**
   * 获取下一批可执行任务
   */
  getNextBatch(maxCount: number): ScheduledTask[] {
    const batch: ScheduledTask[] = [];
    const remainingSlots = maxCount - this.runningTasks.size;

    if (remainingSlots <= 0) {
      return batch;
    }

    // 按优先级顺序获取任务
    for (const priority of [
      TaskPriority.CRITICAL,
      TaskPriority.HIGH,
      TaskPriority.MEDIUM,
      TaskPriority.LOW,
      TaskPriority.DEFERRED,
    ]) {
      const queue = this.pendingQueue.get(priority)!;

      while (batch.length < remainingSlots && queue.length > 0) {
        const task = queue.shift()!;

        // 检查依赖是否都已满足
        if (this.areDependenciesSatisfied(task)) {
          task.status = TaskStatus.RUNNING as any;
          task.scheduledAt = Date.now();
          this.runningTasks.set(task.taskId, task);
          batch.push(task);
        } else {
          // 依赖未满足，放回队列
          queue.push(task);
        }
      }

      if (batch.length >= remainingSlots) {
        break;
      }
    }

    return batch;
  }

  /**
   * 标记任务完成
   */
  markTaskComplete(taskId: string, result: PartialResult): void {
    const task = this.runningTasks.get(taskId);
    if (!task) return;

    this.runningTasks.delete(taskId);
    this.completedTasks.add(taskId);
    task.status = TaskStatus.COMPLETED as any;
    task.completedAt = Date.now();

    // 解锁依赖此任务的其他任务
    this.unlockDependentTasks(taskId);
  }

  /**
   * 标记任务失败
   */
  markTaskFailed(taskId: string, error: Error): void {
    const task = this.runningTasks.get(taskId);
    if (!task) return;

    this.runningTasks.delete(taskId);
    this.failedTasks.add(taskId);
    task.status = TaskStatus.FAILED as any;
    task.completedAt = Date.now();

    // 选项：级联失败或让依赖任务等待
    // 当前实现：不级联，让调用者决定
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(): QueueStatus {
    let totalTasks = 0;
    let readyTasks = 0;
    const tasksByPriority = new Map<number, number>();

    for (const [priority, queue] of this.pendingQueue) {
      tasksByPriority.set(priority, queue.length);
      totalTasks += queue.length;
      readyTasks += queue.filter(t => t.status === TaskStatus.READY).length;
    }

    totalTasks += this.runningTasks.size;
    totalTasks += this.completedTasks.size;
    totalTasks += this.failedTasks.size;

    return {
      totalTasks,
      pendingTasks: totalTasks - this.runningTasks.size - this.completedTasks.size - this.failedTasks.size,
      readyTasks,
      runningTasks: this.runningTasks.size,
      blockedTasks: 0, // TODO: 实现阻塞任务计数
      tasksByPriority,
    };
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): boolean {
    // 从运行中移除
    if (this.runningTasks.has(taskId)) {
      this.runningTasks.delete(taskId);
      return true;
    }

    // 从队列中移除
    for (const queue of this.pendingQueue.values()) {
      const index = queue.findIndex(t => t.taskId === taskId);
      if (index !== -1) {
        queue.splice(index, 1);
        return true;
      }
    }

    return false;
  }

  // ----------------------------------------------------------
  // 私有方法
  // ----------------------------------------------------------

  /**
   * 按优先级入队
   */
  private enqueueByPriority(task: ScheduledTask): void {
    const queue = this.pendingQueue.get(task.priority);
    if (queue) {
      queue.push(task);
    }
  }

  /**
   * 构建依赖图
   */
  private buildDependencyGraph(tasks: ScheduledTask[]): DependencyGraph {
    const nodes = new Map<string, ScheduledTask>();
    const edges = new Map<string, Set<string>>();
    const reverseEdges = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    for (const task of tasks) {
      nodes.set(task.taskId, task);
      edges.set(task.taskId, new Set());
      reverseEdges.set(task.taskId, new Set());
      inDegree.set(task.taskId, task.dependencies.length);
    }

    for (const task of tasks) {
      for (const depId of task.dependencies) {
        if (nodes.has(depId)) {
          edges.get(depId)!.add(task.taskId);
          reverseEdges.get(task.taskId)!.add(depId);
        }
      }
    }

    return {
      nodes,
      edges,
      reverseEdges,
      inDegree,
      hasCycle: () => false, // 将在实例上设置
      topologicalSort: () => [],
    };
  }

  /**
   * 检测循环依赖（DFS）
   */
  private hasCycle(graph: DependencyGraph): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        return true; // 发现环
      }
      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const dependents = graph.edges.get(nodeId) || new Set();
      for (const depId of dependents) {
        if (dfs(depId)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of graph.nodes.keys()) {
      if (dfs(nodeId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查依赖是否都满足
   */
  private areDependenciesSatisfied(task: ScheduledTask): boolean {
    for (const depId of task.dependencies) {
      if (!this.completedTasks.has(depId)) {
        return false;
      }
    }
    return true;
  }

  /**
   * 解锁依赖此任务的其他任务
   */
  private unlockDependentTasks(completedTaskId: string): void {
    if (!this.dependencyGraph) return;

    const dependents = this.dependencyGraph.edges.get(completedTaskId);
    if (!dependents) return;

    for (const depId of dependents) {
      const dependentTask = this.dependencyGraph.nodes.get(depId);
      if (dependentTask && this.areDependenciesSatisfied(dependentTask)) {
        dependentTask.status = TaskStatus.READY as any;
        this.enqueueByPriority(dependentTask);
      }
    }
  }
}

// ============================================================
// ResultAggregator - 结果聚合器
// ============================================================

/**
 * 结果聚合器
 *
 * 支持多种聚合模式：
 * - WAIT_ALL: 等待所有任务完成
 * - WAIT_QUORUM: 等待法定数量
 * - WAIT_ANY: 等待任意一个完成
 * - TIMEOUT_BASED: 基于超时
 */
export class ResultAggregator {
  private readonly expectedResults: number;
  private readonly config: AggregationConfig;
  private readonly results: Map<string, PartialResult>;
  private readonly errors: Map<string, Error>;
  private startTime: number;

  constructor(expectedResults: number, config: AggregationConfig) {
    this.expectedResults = expectedResults;
    this.config = config;
    this.results = new Map();
    this.errors = new Map();
    this.startTime = Date.now();
  }

  /**
   * 添加部分结果
   */
  addResult(taskId: string, result: PartialResult): void {
    this.results.set(taskId, result);

    if (result.status === CoreAgentStatus.FAILED || (result.status as any) === 'failed') {
      this.errors.set(taskId, new Error(result.data as string));
    }
  }

  /**
   * 检查是否完成
   */
  isComplete(): boolean {
    const receivedCount = this.results.size;
    const successCount = this.results.size - this.errors.size;

    const mode = this.config.mode as any;

    switch (mode) {
      case 'wait_all':
        return receivedCount >= this.expectedResults;

      case 'wait_quorum':
        const quorumSize = this.config.quorumSize ?? Math.ceil(this.expectedResults * 0.5);
        return successCount >= quorumSize;

      case 'wait_any':
        return receivedCount >= 1;

      case 'timeout_based':
        const elapsed = Date.now() - this.startTime;
        return elapsed >= (this.config.timeout ?? DEFAULT_EXECUTION_TIMEOUT);

      default:
        return receivedCount >= this.expectedResults;
    }
  }

  /**
   * 获取聚合结果
   */
  getAggregatedResult(): AggregatedResult | null {
    if (this.results.size === 0) {
      return null;
    }

    const endTime = Date.now();
    const completedTasks = Array.from(this.results.values())
      .filter(r => r.status === CoreAgentStatus.COMPLETED || (r.status as any) === 'completed').length;
    const failedTasks = this.errors.size;

    return {
      executionId: generateId('exec'),
      totalTasks: this.expectedResults,
      completedTasks,
      failedTasks,
      results: this.buildResultsMap(),
      errors: this.errors,
      metadata: {
        startTime: this.startTime,
        endTime,
        duration: endTime - this.startTime,
        mode: this.config.mode as any,
        usedFallback: failedTasks > 0,
        consistencyScore: this.calculateConsistencyScore(),
      },
    };
  }

  /**
   * 获取当前进度
   */
  getProgress(): AggregationProgress {
    const receivedResults = this.results.size;
    const successResults = receivedResults - this.errors.size;

    return {
      receivedResults,
      expectedResults: this.expectedResults,
      successResults,
      failedResults: this.errors.size,
      progressPercentage: (receivedResults / this.expectedResults) * 100,
      estimatedRemainingTime: 0, // TODO: 实现预估
    };
  }

  /**
   * 重置聚合器
   */
  reset(): void {
    this.results.clear();
    this.errors.clear();
    this.startTime = Date.now();
  }

  /**
   * 设置聚合配置
   */
  setConfig(config: AggregationConfig): void {
    (this.config as any) = config;
  }

  // ----------------------------------------------------------
  // 私有方法
  // ----------------------------------------------------------

  /**
   * 构建结果映射
   */
  private buildResultsMap(): Map<string, unknown> {
    const map = new Map<string, unknown>();

    for (const [taskId, result] of this.results) {
      if (result.status === CoreAgentStatus.COMPLETED || (result.status as any) === 'completed') {
        map.set(taskId, result.data);
      }
    }

    return map;
  }

  /**
   * 计算一致性评分
   */
  private calculateConsistencyScore(): number {
    if (this.results.size === 0) return 0;

    const successRate = (this.results.size - this.errors.size) / this.expectedResults;
    const timestamps = Array.from(this.results.values()).map(r => r.timestamp);

    if (timestamps.length < 2) return successRate;

    // 计算时间方差
    const avgTime = timestamps.reduce((a, b) => a + b, 0) / timestamps.length;
    const variance = timestamps.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) / timestamps.length;
    const timeScore = Math.max(0, 1 - variance / 10000); // 10秒方差为0分

    return successRate * 0.7 + timeScore * 0.3;
  }
}

// ============================================================
// 并行执行主函数
// ============================================================

/**
 * 并行执行配置的默认值
 */
const DEFAULT_PARALLEL_CONFIG: ParallelExecutionConfig = {
  maxConcurrentAgents: 10,
  queueCapacity: 1000,
  executionTimeout: DEFAULT_EXECUTION_TIMEOUT,
  enableAutoScaling: false,
  monitoringInterval: 100,
  retryPolicy: {
    maxAttempts: 3,
    initialDelay: MIN_RETRY_DELAY,
    maxDelay: 1000,
    backoffStrategy: 'exponential' as any,
    jitterFactor: 0.1,
    retryableErrors: ['transient' as any, 'timeout' as any],
    stopOnErrorCodes: [],
    stopOnErrorPatterns: [],
  },
  circuitBreakerConfig: {
    enabled: false, // 简化实现，暂不启用熔断器
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000,
    halfOpenMaxCalls: 3,
  },
  fallbackStrategy: {
    type: 'none' as any,
    config: {},
  },
  aggregationConfig: {
    mode: 'wait_all' as any,
    timeout: DEFAULT_EXECUTION_TIMEOUT,
  },
  resourceLimits: {
    cpu: 16,
    memory: 8192,
    tokenBudget: 1000000,
  },
};

/**
 * 并行执行任务集合
 *
 * @param tasks - 要执行的任务列表
 * @param config - 并行执行配置
 * @param executeFn - 执行函数（执行单个任务）
 * @returns 聚合结果
 */
export async function parallelRun(
  tasks: ScheduledTask[],
  config: Partial<ParallelExecutionConfig> = {},
  executeFn: (task: ScheduledTask) => Promise<PartialResult>,
): Promise<AggregatedResult> {
  const mergedConfig: ParallelExecutionConfig = {
    ...DEFAULT_PARALLEL_CONFIG,
    ...config,
    retryPolicy: { ...DEFAULT_PARALLEL_CONFIG.retryPolicy, ...config.retryPolicy },
    circuitBreakerConfig: { ...DEFAULT_PARALLEL_CONFIG.circuitBreakerConfig, ...config.circuitBreakerConfig },
    aggregationConfig: { ...DEFAULT_PARALLEL_CONFIG.aggregationConfig, ...config.aggregationConfig },
    resourceLimits: { ...DEFAULT_PARALLEL_CONFIG.resourceLimits, ...config.resourceLimits },
    autoScalingConfig: config.autoScalingConfig,
    lifecycleHooks: config.lifecycleHooks,
  };

  const scheduler = new TaskScheduler(mergedConfig);
  const aggregator = new ResultAggregator(tasks.length, mergedConfig.aggregationConfig);
  const executionId = generateId('parallel-exec');

  // 验证并入队任务
  await scheduler.validateAndEnqueue(tasks);

  // 主执行循环
  const executeBatch = async (): Promise<void> => {
    while (true) {
      // 获取下一批任务
      const batch = scheduler.getNextBatch(mergedConfig.maxConcurrentAgents);

      if (batch.length === 0) {
        // 检查是否还有运行中任务
        const status = scheduler.getQueueStatus();
        if (status.runningTasks === 0) {
          break; // 所有任务完成
        }
        await delay(10); // 等待运行中任务完成
        continue;
      }

      // 并行执行批次
      const promises = batch.map(async (task) => {
        try {
          const result = await executeWithRetry(task, mergedConfig, executeFn);
          aggregator.addResult(task.taskId, result);
          scheduler.markTaskComplete(task.taskId, result);
        } catch (error) {
          const errorResult: PartialResult = {
            taskId: task.taskId,
            agentName: task.agentDefinition.name,
            status: CoreAgentStatus.FAILED,
            data: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
            metadata: { error },
          };
          aggregator.addResult(task.taskId, errorResult);
          scheduler.markTaskFailed(task.taskId, error as Error);
        }
      });

      await Promise.all(promises);

      // 检查是否可以提前完成
      if (aggregator.isComplete()) {
        break;
      }
    }
  };

  await executeBatch();

  return aggregator.getAggregatedResult()!;
}

/**
 * 带重试的执行
 */
async function executeWithRetry(
  task: ScheduledTask,
  config: ParallelExecutionConfig,
  executeFn: (task: ScheduledTask) => Promise<PartialResult>,
): Promise<PartialResult> {
  const { maxAttempts, initialDelay, backoffStrategy } = config.retryPolicy;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await executeFn(task);
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxAttempts - 1) {
        // 计算退避延迟
        let delayMs = initialDelay;
        if (backoffStrategy === 'exponential' || backoffStrategy === 'exponential_with_jitter') {
          delayMs = initialDelay * Math.pow(2, attempt);
        }

        delayMs = Math.min(delayMs, config.retryPolicy.maxDelay);

        if (backoffStrategy === 'exponential_with_jitter') {
          await delayWithJitter(delayMs, config.retryPolicy.jitterFactor);
        } else {
          await delay(delayMs);
        }
      }
    }
  }

  throw lastError;
}
