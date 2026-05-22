/**
 * Honeycomb DSL - Try-Catch Executor
 *
 * Try-Catch 异常处理执行器，支持嵌套异常处理。
 * 实现完整的 try-catch-finally 语义：
 * - 执行 try_block
 * - 如果抛出异常，执行 catch_block（如果存在）
 * - 无论是否异常，都执行 finally_block（如果存在）
 * - 支持嵌套 try_catch 语句
 * - 支持异常在不同嵌套层级的传播
 *
 * @module dsl/executors/try-catch-executor
 */

import type {
  DSLTryCatch,
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
 * Try-Catch 执行器配置
 */
export interface TryCatchExecutorConfig {
  /** 最大嵌套深度（默认 100） */
  maxNestingDepth?: number;
  /** 是否启用追踪 */
  enableTracing?: boolean;
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
// Try-Catch 执行器
// ============================================================

/**
 * Try-Catch 执行器
 *
 * 职责：
 * - 实现完整的 try-catch-finally 语义
 * - 支持嵌套 try_catch 语句的递归执行
 * - 管理异常在不同嵌套层级的传播
 * - 确保 finally 块总是执行（即使发生异常）
 * - 强制执行嵌套深度限制
 * - 收集执行追踪和错误信息
 *
 * @example
 * ```ts
 * const tryCatchExecutor = new TryCatchExecutor(
 *   dependencies,
 *   statementExecutor,
 *   { maxNestingDepth: 50 }
 * );
 *
 * const result = await tryCatchExecutor.execute(tryCatchStmt, context);
 * ```
 */
export class TryCatchExecutor {
  /** 执行依赖 */
  protected readonly dependencies: ExecutionDependencies;
  /** 语句执行器 */
  protected readonly statementExecutor: IStatementExecutor;
  /** 配置 */
  protected readonly config: TryCatchExecutorConfig;
  /** 追踪启用状态 */
  private readonly tracingEnabled: boolean;

  /**
   * 创建 Try-Catch 执行器
   *
   * @param dependencies 执行依赖
   * @param statementExecutor 语句执行器
   * @param config 配置选项
   */
  constructor(
    dependencies: ExecutionDependencies,
    statementExecutor: IStatementExecutor,
    config: TryCatchExecutorConfig = {}
  ) {
    this.dependencies = dependencies;
    this.statementExecutor = statementExecutor;
    this.config = {
      maxNestingDepth: config.maxNestingDepth ?? 100,
      enableTracing: config.enableTracing ?? true,
    };
    // 修复：使用 || 而不是 ??，因为 enableTracing 是 boolean 类型
    // 当 enableTracing = true 时，true || false = true（正确）
    // 如果使用 true ?? false = false（错误）
    this.tracingEnabled = this.config.enableTracing || false;
  }

  /**
   * 执行 try_catch 语句
   *
   * 实现完整的 try-catch-finally 语义：
   * 1. 执行 try_block
   * 2. 如果抛出异常，执行 catch_block（如果存在）
   * 3. 无论是否异常，都执行 finally_block（如果存在）
   * 4. 支持嵌套的 try_catch 语句
   *
   * @param stmt try_catch 语句 AST 节点
   * @param context 执行上下文
   * @returns 执行结果
   */
  async execute(
    stmt: DSLTryCatch,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const errors: Error[] = [];
    const trace: TraceEntry[] = [];
    let caughtError: Error | null = null;

    // 创建子上下文（深度+1，实现作用域隔离）
    const childContext: ExecutionContext = {
      input: { ...context.input },
      locals: new Map(),
      results: new Map(),
      traceId: context.traceId,
      parent: context,
      depth: (context.depth ?? 0) + 1,
      options: context.options,
      stats: {
        totalDurationMs: 0,
        agentCalls: 0,
        skillCalls: 0,
        toolCalls: 0,
        totalTokens: 0,
        successfulCalls: 0,
        failedCalls: 0,
      },
    };

    // 检查嵌套深度（在创建子上下文之后检查子上下文的深度）
    const maxDepth = this.config.maxNestingDepth ?? 100;
    // 深度检查：如果子上下文深度已经达到或超过 maxDepth，则拒绝执行
    // 例如：maxNestingDepth=2 时，depth=0,1 可执行，depth=2 拒绝
    //      这样可以防止嵌套的语句执行器超过深度限制
    if (childContext.depth >= maxDepth) {
      const error = new Error(
        `Maximum nesting depth (${maxDepth}) exceeded at try_catch statement (current depth: ${childContext.depth})`
      );
      return {
        success: false,
        value: null,
        trace: this.createTrace(stmt, context, startTime, 'failure', errors),
        errors: [error],
      };
    }

    let finallyError: Error | null = null;

    // 1. 执行 try_block
    try {
      for (const tryStmt of stmt.try_block) {
        const result = await this.statementExecutor.executeStatement(tryStmt, childContext);
        trace.push(...result.trace);
        errors.push(...result.errors);
      }
    } catch (error) {
      // 捕获 try_block 中的异常
      caughtError = error as Error;
      // 将异常添加到错误列表（稍后根据是否有 catch 块决定是否保留）
      errors.push(caughtError);

      if (this.tracingEnabled) {
        trace.push({
          timestamp: Date.now(),
          statementType: 'try_catch',
          location: stmt.loc,
          status: 'failure',
          data: {
            phase: 'try',
            errorMessage: caughtError.message,
            hasCatch: stmt.catch_block !== undefined,
            hasFinally: stmt.finally_block !== undefined,
          },
        });
      }
    }

    // 2. 执行 catch_block（如果存在）
    if (stmt.catch_block && stmt.catch_block.length > 0) {
      // 绑定异常到变量（如果没有异常则为 null）
      if (stmt.catch_variable) {
        childContext.locals.set(stmt.catch_variable, caughtError);
      }

      for (const catchStmt of stmt.catch_block) {
        try {
          const result = await this.statementExecutor.executeStatement(catchStmt, childContext);
          trace.push(...result.trace);
          errors.push(...result.errors);
        } catch (catchError) {
          // catch_block 中的异常会追加到错误列表
          errors.push(catchError as Error);
        }
      }
    }

    // 3. 执行 finally_block（如果存在）
    try {
      if (stmt.finally_block && stmt.finally_block.length > 0) {
        for (const finallyStmt of stmt.finally_block) {
          try {
            const result = await this.statementExecutor.executeStatement(finallyStmt, childContext);
            trace.push(...result.trace);
            errors.push(...result.errors);
          } catch (finallyError_) {
            // finally 中的异常会追加到错误列表
            const error = finallyError_ as Error;
            errors.push(error);
            finallyError = error;
          }
        }
      }
    } finally {
      // 最终处理逻辑
    }

    // 判断执行成功与否
    // DSL 语义说明：
    // - catch 块总是执行（如果存在），作为异常处理机制
    // - finally 块总是执行（如果存在），作为清理代码
    // - try 块中的异常会被捕获并存储在 caughtError
    //
    // errors 列表语义：
    // - 只包含未处理的异常
    // - 如果有 catch 块，try 块的异常被视为已处理，不应出现在 errors 中
    // - 如果没有 catch 块，try 块的异常被视为未处理，应保留在 errors 中
    // - finally 块的异常总是未处理的（会导致失败）
    //
    // success 条件：
    // 1. 有 catch 块：
    //    - try 块的异常已处理，从 errors 中移除
    //    - success = !finallyError（finally 块没有错误）
    // 2. 没有 catch 块：
    //    - try 块的异常保留在 errors 中
    //    - success = !caughtError && !finallyError（try 和 finally 都没有错误）
    const hasCatchBlock = !!(stmt.catch_block && stmt.catch_block.length > 0);
    let success: boolean;

    if (hasCatchBlock) {
      // 有 catch 块：try 块的异常被视为已处理，不应出现在 errors 中
      // 移除 caughtError 从 errors 列表（如果存在）
      const caughtErrorIndex = errors.indexOf(caughtError!);
      if (caughtErrorIndex !== -1) {
        errors.splice(caughtErrorIndex, 1);
      }
      // 只要 finally 没有错误就成功
      success = !finallyError;
    } else {
      // 没有 catch 块：try 块的异常保留在 errors 中
      // 只有当 try 和 finally 都没有错误时才成功
      success = !caughtError && !finallyError;
    }

    if (this.tracingEnabled) {
      trace.push({
        timestamp: Date.now(),
        statementType: 'try_catch',
        location: stmt.loc,
        status: success ? 'success' : 'failure',
        data: {
          caught: caughtError !== null,
          hasCatch: stmt.catch_block !== undefined,
          hasFinally: stmt.finally_block !== undefined,
          catchVariable: stmt.catch_variable,
          nestedDepth: (context.depth ?? 0) + 1,
        },
      });
    }

    return {
      success,
      value: null,
      trace,
      errors: errors.length > 0 ? errors : [],
    };
  }

  /**
   * 创建追踪记录
   */
  private createTrace(
    stmt: DSLTryCatch,
    context: ExecutionContext,
    startTime: number,
    status: 'success' | 'failure',
    errors: Error[]
  ): TraceEntry[] {
    return [
      {
        timestamp: startTime,
        statementType: 'try_catch',
        location: stmt.loc,
        status,
        data: {
          hasCatch: stmt.catch_block !== undefined,
          hasFinally: stmt.finally_block !== undefined,
          catchVariable: stmt.catch_variable,
          errorCount: errors.length,
        },
      },
    ];
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
 * 创建 TryCatchExecutor 实例的工厂函数
 *
 * @param dependencies 执行依赖
 * @param statementExecutor 语句执行器
 * @param config 配置选项
 * @returns TryCatchExecutor 实例
 */
export function createTryCatchExecutor(
  dependencies: ExecutionDependencies,
  statementExecutor: IStatementExecutor,
  config?: TryCatchExecutorConfig
): TryCatchExecutor {
  return new TryCatchExecutor(dependencies, statementExecutor, config);
}
