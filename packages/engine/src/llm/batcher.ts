/**
 * Honeycomb LLM Integration - Request Batcher
 *
 * 请求批处理管理器将多个小请求合并为单个批次，
 * 减少 API 调用次数，提高吞吐量。
 *
 * 设计原则：
 * - 时间窗口：在指定时间内收集请求
 * - 大小限制：达到最大批次时立即刷新
 * - 非阻塞：异步处理，不阻塞调用者
 * - 可配置：灵活的批处理策略
 * - 并发控制：限制同时处理的批次数
 */

import type {
  CompletionRequest,
  CompletionResult,
  CompletionOptions,
  BatchConfig,
  LLMProvider,
} from './types.js';

// ============================================================
// 类型定义
// ============================================================

/**
 * 待处理的请求项
 */
interface PendingRequest {
  /** 请求 ID */
  id: string;
  /** 提示词 */
  prompt: string;
  /** 请求选项 */
  options?: CompletionOptions;
  /** 成功回调 */
  resolve: (result: CompletionResult) => void;
  /** 失败回调 */
  reject: (error: Error) => void;
  /** 添加时间戳 */
  timestamp: number;
}

/**
 * 批处理统计信息
 */
export interface BatchStats {
  /** 总请求数 */
  totalRequests: number;
  /** 总批次数 */
  totalBatches: number;
  /** 平均批次大小 */
  avgBatchSize: number;
  /** 总等待时间（毫秒） */
  totalWaitTime: number;
  /** 平均等待时间（毫秒） */
  avgWaitTime: number;
}

/**
 * 扩展的批处理配置
 */
export interface ExtendedBatchConfig extends BatchConfig {
  /** 最大并发批处理数 */
  maxConcurrent?: number;
}

// ============================================================
// 批处理管理器
// ============================================================

/**
 * 请求批处理管理器
 *
 * 将多个 LLM 请求合并为批次，减少 API 调用开销。
 * 支持基于时间和大小的触发策略，以及并发控制。
 */
export class RequestBatcher {
  // 待处理队列
  private queue: PendingRequest[] = [];

  // 配置
  private config: {
    maxBatchSize: number;
    maxWaitTime: number;
    maxConcurrent: number;
    enabled: boolean;
  };

  // 状态
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private activeBatches: number = 0;
  private isDisposed: boolean = false;
  private logger: any;

  // Provider（用于执行请求）
  private provider?: LLMProvider;

  // 统计
  private stats: BatchStats;

  constructor(config: ExtendedBatchConfig, logger: any, provider?: LLMProvider) {
    this.config = {
      maxBatchSize: config.maxBatchSize ?? 10,
      maxWaitTime: config.maxWaitTime ?? 100,
      maxConcurrent: config.maxConcurrent ?? 3,
      enabled: config.enabled !== false,
    };
    this.logger = logger;
    this.provider = provider;
    this.stats = this.initializeStats();
  }

  /**
   * 添加请求到批处理队列
   *
   * 返回 Promise，在批处理完成后 resolve。
   * 如果达到最大批次大小，立即触发刷新。
   * 否则，设置超时定时器。
   *
   * @param request - 完成请求
   * @returns Promise<CompletionResult>
   */
  async add(request: CompletionRequest): Promise<CompletionResult> {
    if (this.isDisposed) {
      throw new Error('RequestBatcher has been disposed');
    }

    if (!this.config.enabled) {
      throw new Error('Batching is disabled');
    }

    return new Promise((resolve, reject) => {
      const pending: PendingRequest = {
        id: request.id,
        prompt: request.prompt,
        options: request.options ?? {},
        resolve,
        reject,
        timestamp: Date.now(),
      };

      this.queue.push(pending);
      this.stats.totalRequests++;

      // 检查是否立即触发批处理
      if (this.queue.length >= this.config.maxBatchSize) {
        // 达到最大批次大小，立即刷新
        this.flush().catch(err => {
          this.logger.error('Batch flush failed', { error: err });
        });
      } else if (!this.flushTimer) {
        // 设置超时触发
        this.scheduleFlush();
      }
    });
  }

  /**
   * 立即发送当前队列中的所有请求
   *
   * 如果队列为空、正在刷新或达到并发限制，则跳过。
   */
  async flush(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    // 如果队列为空或已达到并发限制，跳过
    if (this.queue.length === 0 || this.activeBatches >= this.config.maxConcurrent) {
      return;
    }

    // 清除超时定时器
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // 取出当前批次（最多 maxBatchSize）
    const batchSize = Math.min(this.queue.length, this.config.maxBatchSize);
    const batch = this.queue.splice(0, batchSize);
    this.activeBatches++;

    // 记录批次开始时间
    const batchStartTime = Date.now();

    this.logger.debug('Processing batch', {
      size: batch.length,
      activeBatches: this.activeBatches,
      queueRemaining: this.queue.length,
    });

    try {
      // 执行批处理
      await this.processBatch(batch);

      // 更新统计（注意：avgBatchSize 计算依赖 totalBatches 的旧值）
      this.stats.avgBatchSize = this.calculateAvgBatchSize(batch.length);
      this.stats.totalBatches++;

      // 更新等待时间统计
      const waitTime = Date.now() - batchStartTime;
      this.stats.totalWaitTime += waitTime;
      this.stats.avgWaitTime = this.stats.totalWaitTime / this.stats.totalBatches;

    } catch (error) {
      this.logger.error('Batch processing failed', { error });
    } finally {
      this.activeBatches--;

      // 如果队列中还有请求且未达到并发限制，继续处理
      if (this.queue.length > 0 && this.activeBatches < this.config.maxConcurrent) {
        // 使用 setImmediate 避免阻塞
        setImmediate(() => {
          this.flush().catch(err => {
            this.logger.error('Follow-up flush failed', { error: err });
          });
        });
      }
    }
  }

  /**
   * 获取队列大小
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * 清空队列并拒绝所有待处理请求
   */
  clear(rejectPending: boolean = true): void {
    if (rejectPending) {
      // 拒绝所有待处理请求
      for (const item of this.queue) {
        item.reject(new Error('Batch cleared'));
      }
    }
    this.queue = [];
  }

  /**
   * 获取统计信息
   */
  getStats(): BatchStats {
    // 返回统计信息的副本
    return {
      totalRequests: this.stats.totalRequests,
      totalBatches: this.stats.totalBatches,
      avgBatchSize: this.stats.avgBatchSize,
      totalWaitTime: this.stats.totalWaitTime,
      avgWaitTime: this.stats.avgWaitTime,
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = this.initializeStats();
  }

  /**
   * 设置 Provider
   */
  setProvider(provider: LLMProvider): void {
    this.provider = provider;
  }

  /**
   * 清理资源
   *
   * 清除定时器，标记为已释放。
   * 已释放的 batcher 不能再添加新请求。
   * 队列中的请求会被处理（不拒绝）。
   */
  dispose(): void {
    this.isDisposed = true;

    // 清除定时器
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // 清空队列但不拒绝（让它们自然完成）
    this.clear(false);
  }

  // ==================== 私有方法 ====================

  /**
   * 安排刷新
   */
  private scheduleFlush(): void {
    if (this.flushTimer || this.isDisposed) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flush().catch(err => {
        this.logger.error('Scheduled flush failed', { error: err });
      });
    }, this.config.maxWaitTime);
  }

  /**
   * 处理一个批次
   */
  private async processBatch(batch: PendingRequest[]): Promise<void> {
    if (!this.provider) {
      throw new Error('Provider not set for batch execution');
    }

    try {
      // 检查 provider 是否支持原生批处理
      const providerConfig = this.provider.getConfig();
      const supportsBatch = providerConfig.supportsBatch;

      if (supportsBatch && typeof this.provider.batch === 'function') {
        // 使用原生批处理接口
        const requests: CompletionRequest[] = batch.map(req => ({
          id: req.id,
          prompt: req.prompt,
          options: req.options as Record<string, unknown> | undefined,
        }));

        const results = await this.provider.batch(requests);

        // 分发结果
        for (let i = 0; i < batch.length; i++) {
          batch[i].resolve(results[i]);
        }
      } else {
        // 降级：并发调用单个请求
        const promises = batch.map(async (req) => {
          return this.provider!.complete(req.prompt, req.options);
        });

        const results = await Promise.all(promises);

        // 分发结果
        for (let i = 0; i < batch.length; i++) {
          batch[i].resolve(results[i]);
        }
      }
    } catch (error) {
      // 批处理失败，拒绝所有请求
      const err = error instanceof Error ? error : new Error(String(error));
      for (const req of batch) {
        req.reject(err);
      }
      throw error; // 重新抛出以便上层处理
    }
  }

  /**
   * 初始化统计信息
   */
  private initializeStats(): BatchStats {
    return {
      totalRequests: 0,
      totalBatches: 0,
      avgBatchSize: 0,
      totalWaitTime: 0,
      avgWaitTime: 0,
    };
  }

  /**
   * 计算平均批次大小（增量更新）
   */
  private calculateAvgBatchSize(currentBatchSize: number): number {
    if (this.stats.totalBatches === 0) {
      return currentBatchSize;
    }
    // 使用增量平均公式：avg = (avg * n + new) / (n + 1)
    return (this.stats.avgBatchSize * this.stats.totalBatches + currentBatchSize) / (this.stats.totalBatches + 1);
  }
}

// RequestBatcher 已通过 export class 导出，无需重复导出
