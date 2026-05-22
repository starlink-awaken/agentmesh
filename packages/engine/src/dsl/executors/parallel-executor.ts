/**
 * Honeycomb DSL - Parallel Executor
 *
 * Parallel 并行执行器，支持嵌套并行执行。
 * 实现完整的并行执行语义：
 * - 并发执行多个分支
 * - 支持 max_concurrency 限制并发数
 * - 支持嵌套 parallel 语句
 * - 支持资源使用控制
 *
 * @module dsl/executors/parallel-executor
 */

import type {
  DSLParallel,
  DSLStatement,
} from '../types.js';

import type {
  ExecutionContext,
  ExecutionDependencies,
  ExecutionResult,
  TraceEntry,
} from '../agent-call-types.js';

// ============================================================
// 配置接口
// ============================================================

/**
 * Parallel 执行器配置
 */
export interface ParallelExecutorConfig {
  /** 最大并发数（默认无限制） */
  maxConcurrency?: number;
  /** 最大嵌套深度（默认 100） */
  maxNestingDepth?: number;
  /** 是否启用追踪 */
  enableTracing?: boolean;
  /** 是否启用详细日志 */
  enableLogging?: boolean;
}

// ============================================================
// 语句执行器接口
// ============================================================

/**
 * 语句执行器接口
 *
 * 用于执行嵌套语句（包括 step、condition、loop 等）。
 */
export interface IStatementExecutor {
  /**
   * 执行语句
   * @param stmt DSL 语句
   * @param context 执行上下文
   * @returns 执行结果
   */
  executeStatement(
    stmt: DSLStatement,
    context: ExecutionContext
  ): Promise<ExecutionResult>;
}

// ============================================================
// Parallel 执行器
// ============================================================

/**
 * Parallel 执行器
 *
 * 职责：
 * - 并发执行多个分支
 * - 支持 max_concurrency 限制并发数
 * - 支持嵌套 parallel 语句的递归执行
 * - 实现资源使用控制和并发管理
 * - 收集执行追踪和错误信息
 *
 * @example
 * ```ts
 * const parallelExecutor = new ParallelExecutor(
 *   dependencies,
 *   statementExecutor,
 *   { maxConcurrency: 4, maxNestingDepth: 50 }
 * );
 *
 * const result = await parallelExecutor.execute(parallelStmt, context);
 * ```
 */
export class ParallelExecutor {
  /** 执行依赖 */
  protected readonly dependencies: ExecutionDependencies;
  /** 语句执行器 */
  protected readonly statementExecutor: IStatementExecutor;
  /** 配置 */
  protected readonly config: ParallelExecutorConfig;
  /** 追踪启用状态 */
  private readonly tracingEnabled: boolean;
  /** 日志启用状态 */
  private readonly loggingEnabled: boolean;

  /**
   * 创建 Parallel 执行器
   *
   * @param dependencies 执行依赖
   * @param statementExecutor 语句执行器
   * @param config 配置选项
   */
  constructor(
    dependencies: ExecutionDependencies,
    statementExecutor: IStatementExecutor,
    config: ParallelExecutorConfig = {}
  ) {
    this.dependencies = dependencies;
    this.statementExecutor = statementExecutor;
    this.config = {
      maxConcurrency: config.maxConcurrency,
      maxNestingDepth: config.maxNestingDepth ?? 100,
      enableTracing: config.enableTracing ?? true,
      enableLogging: config.enableLogging ?? false,
    };
    this.tracingEnabled = this.config.enableTracing ?? false;
    this.loggingEnabled = this.config.enableLogging ?? false;
  }

  /**
   * 执行 parallel 语句
   *
   * 实现并行执行：
   * 1. 检查嵌套深度
   * 2. 解析 max_concurrency
   * 3. 并发执行所有分支
   * 4. 收集和合并结果
   *
   * @param stmt parallel 语句 AST 节点
   * @param context 执行上下文
   * @returns 执行结果
   */
  async execute(
    stmt: DSLParallel,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const errors: Error[] = [];
    const trace: TraceEntry[] = [];

    // 检查嵌套深度 - 在创建分支之前检查
    // 如果当前深度已经达到 maxDepth，则拒绝创建新的嵌套级别
    // 这样可以确保最大总深度不会超过 maxDepth
    const maxDepth = this.config.maxNestingDepth ?? 100;
    const currentDepth = context.depth ?? 0;
    if (currentDepth >= maxDepth) {
      const error = new Error(
        `Maximum nesting depth (${maxDepth}) exceeded at parallel statement (current depth: ${currentDepth})`
      );
      return {
        success: false,
        value: null,
        trace: this.createTrace(stmt, context, startTime, 'failure', errors, 0),
        errors: [error],
      };
    }

    // 解析最大并发数
    const maxConcurrency = this.resolveMaxConcurrency(stmt, context);

    if (this.loggingEnabled) {
      this.log(`Parallel execution: ${stmt.branches.length} branches, maxConcurrency: ${maxConcurrency}, depth: ${currentDepth + 1}`);
    }

    // 创建分支上下文并执行
    const results = await this.executeBranches(stmt, context, maxConcurrency, currentDepth + 1);

    // 合并结果
    for (const result of results) {
      trace.push(...result.trace);
      errors.push(...result.errors);
    }

    // 计算失败分支数
    const failureCount = results.filter(r => !r.success).length;

    if (this.tracingEnabled) {
      trace.push({
        timestamp: Date.now(),
        statementType: 'parallel',
        location: stmt.loc,
        status: errors.length > 0 ? 'failure' : 'success',
        data: {
          branchCount: stmt.branches.length,
          maxConcurrency,
          failureCount,
          nestedDepth: currentDepth + 1,
        },
      });
    }

    return {
      success: errors.length === 0,
      value: null,
      trace,
      errors: errors.length > 0 ? errors : [],
    };
  }

  /**
   * 解析最大并发数
   */
  private resolveMaxConcurrency(
    stmt: DSLParallel,
    context: ExecutionContext
  ): number {
    if (stmt.max_concurrency === undefined) {
      return Infinity;
    }

    if (typeof stmt.max_concurrency === 'number') {
      return Math.max(1, stmt.max_concurrency);
    }

    // 如果是表达式，求值它
    // 这里简化处理，实际可能需要表达式求值器
    return Infinity;
  }

  /**
   * 执行所有分支
   */
  private async executeBranches(
    stmt: DSLParallel,
    parentContext: ExecutionContext,
    maxConcurrency: number,
    newDepth: number
  ): Promise<ExecutionResult[]> {
    const branchCount = stmt.branches.length;

    if (branchCount === 0) {
      return [{
        success: true,
        value: null,
        trace: [],
        errors: [],
      }];
    }

    // 创建分支上下文并执行
    const createBranchContext = (): ExecutionContext => ({
      input: { ...parentContext.input },
      locals: new Map(),
      results: new Map(),
      traceId: parentContext.traceId,
      parent: parentContext,
      depth: newDepth,
      options: parentContext.options,
      stats: {
        totalDurationMs: 0,
        agentCalls: 0,
        skillCalls: 0,
        toolCalls: 0,
        totalTokens: 0,
        successfulCalls: 0,
        failedCalls: 0,
      },
    });

    // 执行单个分支
    const executeBranch = async (
      branch: DSLStatement[],
      branchIndex: number
    ): Promise<ExecutionResult> => {
      const branchContext = createBranchContext();
      const branchErrors: Error[] = [];
      const branchTrace: TraceEntry[] = [];

      for (const stmt of branch) {
        try {
          const result = await this.statementExecutor.executeStatement(stmt, branchContext);
          branchTrace.push(...result.trace);
          branchErrors.push(...result.errors);
        } catch (error) {
          branchErrors.push(error as Error);
        }
      }

      return {
        success: branchErrors.length === 0,
        value: null,
        trace: branchTrace,
        errors: branchErrors,
      };
    };

    // 根据并发限制执行
    if (maxConcurrency === Infinity || maxConcurrency >= branchCount) {
      // 无限制或足够大的并发限制 - 并发执行所有分支
      const promises = stmt.branches.map((branch, index) => executeBranch(branch, index));
      const settled = await Promise.allSettled(promises);

      return settled.map((result): ExecutionResult => {
        if (result.status === 'fulfilled') {
          return result.value;
        }
        return {
          success: false,
          value: null,
          trace: [],
          errors: [new Error(result.reason?.message || 'Unknown branch error')],
        };
      });
    } else {
      // 有限制并发 - 使用滑动窗口模式
      return this.executeWithConcurrencyLimit(
        stmt.branches,
        executeBranch,
        maxConcurrency
      );
    }
  }

  /**
   * 带并发限制的执行（修复版）
   *
   * 使用分批执行的方式控制并发数量，确保同时运行的分支不超过限制。
   *
   * 实现策略：
   * - 每个任务包装在一个对象中，包含 Promise 和完成标记
   * - 任务完成时设置标记
   * - Promise.race() 返回后，找出已完成的任务并移除
   * - 立即启动下一个任务（如果还有待执行的任务）
   */
  private async executeWithConcurrencyLimit(
    branches: DSLStatement[][],
    executeFn: (branch: DSLStatement[], index: number) => Promise<ExecutionResult>,
    limit: number
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = new Array(branches.length);
    const executing: Array<{ promise: Promise<void>; completed: boolean }> = [];
    let nextIndex = 0;

    // 执行单个分支
    const executeBranch = async (index: number): Promise<void> => {
      const result = await executeFn(branches[index], index);
      results[index] = result;
    };

    // 填充执行队列直到达到限制
    const fillQueue = (): void => {
      while (executing.length < limit && nextIndex < branches.length) {
        const index = nextIndex++;
        const taskWrapper = {
          completed: false,
          promise: executeBranch(index).then(() => {
            taskWrapper.completed = true;
          })
        };
        executing.push(taskWrapper);
      }
    };

    // 填充初始批次
    fillQueue();

    // 处理所有任务
    while (executing.length > 0) {
      // 等待任意任务完成
      await Promise.race(executing.map(t => t.promise));

      // 移除已完成的任务
      const stillExecuting: Array<{ promise: Promise<void>; completed: boolean }> = [];
      for (const task of executing) {
        if (!task.completed) {
          stillExecuting.push(task);
        }
      }
      executing.length = 0;
      executing.push(...stillExecuting);

      // 填充新任务到队列
      fillQueue();
    }

    return results;
  }

  /**
   * 创建追踪记录
   */
  private createTrace(
    stmt: DSLParallel,
    context: ExecutionContext,
    startTime: number,
    status: 'success' | 'failure',
    errors: Error[],
    failureCount: number
  ): TraceEntry[] {
    return [
      {
        timestamp: startTime,
        statementType: 'parallel',
        location: stmt.loc,
        status,
        data: {
          branchCount: stmt.branches.length,
          maxConcurrency: this.resolveMaxConcurrency(stmt, context),
          failureCount,
          nestedDepth: (context.depth ?? 0) + 1,
        },
      },
    ];
  }

  /**
   * 记录日志
   */
  private log(message: string): void {
    if (this.dependencies.logger && this.loggingEnabled) {
      if (typeof this.dependencies.logger.info === 'function') {
        this.dependencies.logger.info(message);
      }
    }
  }

  /**
   * 销毁执行器
   */
  dispose(): void {
    // 执行器本身不持有需要释放的资源
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建 ParallelExecutor 实例的工厂函数
 *
 * @param dependencies 执行依赖
 * @param statementExecutor 语句执行器
 * @param config 配置选项
 * @returns ParallelExecutor 实例
 */
export function createParallelExecutor(
  dependencies: ExecutionDependencies,
  statementExecutor: IStatementExecutor,
  config?: ParallelExecutorConfig
): ParallelExecutor {
  return new ParallelExecutor(dependencies, statementExecutor, config);
}
