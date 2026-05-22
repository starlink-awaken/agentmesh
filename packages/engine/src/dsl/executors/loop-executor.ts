/**
 * Honeycomb DSL - Loop Executor
 *
 * 循环语句执行器，支持 for/while/for_each 三种循环类型。
 * 实现嵌套循环的递归执行、变量作用域管理和循环深度限制。
 *
 * @module dsl/executors/loop-executor
 */

import type {
  DSLLoop,
  DSLStatement,
  DSLExpression,
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
 * 循环执行器配置
 */
export interface LoopExecutorConfig {
  /** 最大迭代次数（默认 10000） */
  maxIterations?: number;
  /** 最大嵌套深度（默认 100） */
  maxNestingDepth?: number;
  /** 是否启用追踪 */
  enableTracing?: boolean;
}

// ============================================================
// 表达式求值器接口
// ============================================================

/**
 * 表达式求值器接口
 *
 * 用于在执行过程中求值 DSL 表达式。
 */
export interface IExpressionEvaluator {
  /**
   * 求值表达式
   * @param expr 表达式
   * @param context 执行上下文
   * @returns 求值结果
   */
  evaluate(expr: DSLExpression, context: ExecutionContext): unknown;
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
// 循环执行器
// ============================================================

/**
 * 循环执行器
 *
 * 职责：
 * - 支持 for、while、for_each 三种循环类型
 * - 实现循环体的递归执行（支持嵌套循环）
 * - 管理循环变量的作用域隔离
 * - 强制执行循环深度限制和最大迭代次数
 * - 收集执行追踪和错误信息
 *
 * @example
 * ```ts
 * const loopExecutor = new LoopExecutor(
 *   dependencies,
 *   expressionEvaluator,
 *   statementExecutor,
 *   { maxIterations: 10000, maxNestingDepth: 50 }
 * );
 *
 * const result = await loopExecutor.execute(loopStmt, context);
 * ```
 */
export class LoopExecutor {
  /** 执行依赖 */
  private readonly dependencies: ExecutionDependencies;
  /** 语句执行器（用于递归执行循环体） */
  private readonly statementExecutor: IStatementExecutor;
  /** 表达式求值器 */
  private readonly expressionEvaluator: IExpressionEvaluator;
  /** 配置 */
  private readonly config: Required<LoopExecutorConfig>;

  /**
   * 创建循环执行器
   *
   * @param dependencies 执行依赖
   * @param expressionEvaluator 表达式求值器
   * @param statementExecutor 语句执行器
   * @param config 执行器配置（可选）
   */
  constructor(
    dependencies: ExecutionDependencies,
    expressionEvaluator: IExpressionEvaluator,
    statementExecutor: IStatementExecutor,
    config?: LoopExecutorConfig
  ) {
    this.dependencies = dependencies;
    this.expressionEvaluator = expressionEvaluator;
    this.statementExecutor = statementExecutor;
    this.config = {
      maxIterations: config?.maxIterations ?? 10000,
      maxNestingDepth: config?.maxNestingDepth ?? 100,
      enableTracing: config?.enableTracing ?? true,
    };
  }

  /**
   * 执行循环语句
   *
   * @param loop 循环语句 AST 节点
   * @param context 执行上下文
   * @returns 执行结果
   * @throws Error 当循环超过最大迭代次数或嵌套深度时抛出
   */
  async execute(
    loop: DSLLoop,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const trace: TraceEntry[] = [];
    const errors: Error[] = [];
    let iterationCount = 0;

    try {
      // 检查嵌套深度并创建子上下文
      const newDepth = this.checkNestingDepth(context);
      const loopContext = this.createLoopContext(context, newDepth);

      switch (loop.loop_type) {
        case 'while':
          return await this.executeWhile(loop, loopContext, trace, errors);

        case 'for_each':
          return await this.executeForEach(loop, loopContext, trace, errors);

        case 'for':
          return await this.executeFor(loop, loopContext, trace, errors);

        default:
          throw new Error(`Unsupported loop type: ${(loop as { loop_type: unknown }).loop_type}`);
      }
    } catch (error) {
      return {
        success: false,
        value: null,
        trace,
        errors: [...errors, error instanceof Error ? error : new Error(String(error))],
      };
    }
  }

  /**
   * 执行 while 循环
   *
   * @param loop 循环语句
   * @param context 执行上下文
   * @param trace 追踪记录数组
   * @param errors 错误数组
   * @returns 执行结果
   */
  private async executeWhile(
    loop: DSLLoop,
    context: ExecutionContext,
    trace: TraceEntry[],
    errors: Error[]
  ): Promise<ExecutionResult> {
    let iterationCount = 0;
    const maxIterations = context.options?.maxIterations ?? this.config.maxIterations;

    while (true) {
      // 检查迭代次数限制
      if (++iterationCount > maxIterations) {
        throw new Error(`While loop exceeded maximum iteration limit (${maxIterations})`);
      }

      // 创建新的循环上下文，确保每次迭代的变量隔离
      const loopContext = this.createLoopContext(context, context.depth);

      // 评估循环条件
      if (!loop.test) {
        throw new Error('While loop requires a test condition expression');
      }

      const testResult = this.evaluateExpression(loop.test, loopContext);
      if (!Boolean(testResult)) {
        break;
      }

      // 执行循环体
      const bodyResult = await this.executeBody(loop.body, loopContext);
      trace.push(...bodyResult.trace);
      errors.push(...bodyResult.errors);

      // 如果循环体中有 break 或严重错误，停止循环
      if (bodyResult.errors.some(e => this.isFatalError(e))) {
        break;
      }
    }

    // 添加追踪记录
    this.addTrace(trace, loop, 'while', iterationCount);

    // 如果有错误，返回 success: false
    return { success: errors.length === 0, value: null, trace, errors };
  }

  /**
   * 执行 for_each 循环
   *
   * @param loop 循环语句
   * @param context 执行上下文
   * @param trace 追踪记录数组
   * @param errors 错误数组
   * @returns 执行结果
   */
  private async executeForEach(
    loop: DSLLoop,
    context: ExecutionContext,
    trace: TraceEntry[],
    errors: Error[]
  ): Promise<ExecutionResult> {
    let iterationCount = 0;
    const maxIterations = context.options?.maxIterations ?? this.config.maxIterations;

    // 评估集合表达式
    if (!loop.collection) {
      throw new Error('For_each loop requires a collection expression');
    }

    const collectionValue = this.evaluateExpression(loop.collection, context);
    const items = Array.isArray(collectionValue)
      ? collectionValue
      : Object.entries(collectionValue ?? {});

    for (const item of items) {
      // 检查迭代次数限制
      if (++iterationCount > maxIterations) {
        throw new Error(`For_each loop exceeded maximum iteration limit (${maxIterations})`);
      }

      // 创建新的循环上下文，确保每次迭代的变量隔离
      const loopContext = this.createLoopContext(context, context.depth);

      // 设置循环变量
      if (loop.variable) {
        loopContext.locals.set(loop.variable, item);
      }

      // 执行循环体
      const bodyResult = await this.executeBody(loop.body, loopContext);
      trace.push(...bodyResult.trace);
      errors.push(...bodyResult.errors);

      // 如果循环体中有致命错误，停止循环
      if (bodyResult.errors.some(e => this.isFatalError(e))) {
        break;
      }
    }

    // 添加追踪记录
    this.addTrace(trace, loop, 'for_each', iterationCount);

    // 如果有错误，返回 success: false
    return { success: errors.length === 0, value: null, trace, errors };
  }

  /**
   * 执行 for 循环
   *
   * @param loop 循环语句
   * @param context 执行上下文
   * @param trace 追踪记录数组
   * @param errors 错误数组
   * @returns 执行结果
   */
  private async executeFor(
    loop: DSLLoop,
    context: ExecutionContext,
    trace: TraceEntry[],
    errors: Error[]
  ): Promise<ExecutionResult> {
    let iterationCount = 0;
    const maxIterations = context.options?.maxIterations ?? this.config.maxIterations;
    const counterName = loop.variable ?? '_i';
    let counter = 0;

    if (loop.test) {
      // 带条件的 for 循环：类似 while 但带计数器
      while (true) {
        // 检查迭代次数限制
        if (++iterationCount > maxIterations) {
          throw new Error(`For loop exceeded maximum iteration limit (${maxIterations})`);
        }

        // 创建新的循环上下文，确保每次迭代的变量隔离
        const loopContext = this.createLoopContext(context, context.depth);

        // 设置计数器变量
        loopContext.locals.set(counterName, counter);

        // 评估循环条件
        const testResult = this.evaluateExpression(loop.test, loopContext);
        if (!Boolean(testResult)) {
          break;
        }

        // 执行循环体
        const bodyResult = await this.executeBody(loop.body, loopContext);
        trace.push(...bodyResult.trace);
        errors.push(...bodyResult.errors);

        // 检查是否有错误（非致命错误也会停止）
        if (bodyResult.errors.length > 0) {
          break;
        }

        counter++;
      }
    } else {
      // 无条件的 for 循环：默认执行到最大次数
      const defaultForLimit = 10000;
      while (counter < defaultForLimit && iterationCount < maxIterations) {
        iterationCount++;

        // 创建新的循环上下文，确保每次迭代的变量隔离
        const loopContext = this.createLoopContext(context, context.depth);

        // 设置计数器变量
        loopContext.locals.set(counterName, counter);

        // 执行循环体
        const bodyResult = await this.executeBody(loop.body, loopContext);
        trace.push(...bodyResult.trace);
        errors.push(...bodyResult.errors);

        // 检查致命错误
        if (bodyResult.errors.some(e => this.isFatalError(e))) {
          break;
        }

        counter++;
      }
    }

    // 添加追踪记录
    this.addTrace(trace, loop, 'for', iterationCount);

    // 如果有错误，返回 success: false
    return { success: errors.length === 0, value: null, trace, errors };
  }

  /**
   * 执行循环体（支持嵌套循环）
   *
   * 递归执行循环体内的每个语句。
   * 嵌套的循环会自动使用正确的上下文和深度。
   *
   * @param body 循环体语句数组
   * @param context 执行上下文
   * @returns 执行结果
   */
  private async executeBody(
    body: DSLStatement[],
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const trace: TraceEntry[] = [];
    const errors: Error[] = [];

    for (const stmt of body) {
      const result = await this.statementExecutor.executeStatement(stmt, context);
      trace.push(...(result.trace || []));
      errors.push(...(result.errors || []));
    }

    // 如果有错误，返回 success: false
    return { success: errors.length === 0, value: null, trace, errors };
  }

  /**
   * 检查嵌套深度
   *
   * @param context 执行上下文
   * @returns 新的嵌套深度
   * @throws Error 当超过最大嵌套深度时抛出
   */
  private checkNestingDepth(context: ExecutionContext): number {
    const currentDepth = context.depth ?? 0;
    // 优先使用 LoopExecutor 的配置，其次才是上下文中的设置
    const maxDepth = this.config.maxNestingDepth;

    if (currentDepth >= maxDepth) {
      throw new Error(
        `Maximum loop nesting depth (${maxDepth}) exceeded at depth ${currentDepth}. ` +
        'This may indicate an infinite loop. Consider restructuring your code.'
      );
    }

    return currentDepth + 1;
  }

  /**
   * 创建循环上下文
   *
   * 为循环创建新的执行上下文，确保变量作用域正确隔离。
   * 子上下文继承父上下文的变量，但循环内的修改不会影响父上下文。
   *
   * @param parentContext 父执行上下文
   * @param depth 嵌套深度
   * @returns 新的执行上下文
   */
  private createLoopContext(
    parentContext: ExecutionContext,
    depth: number
  ): ExecutionContext {
    // 创建新的 locals Map，确保循环变量的修改不会影响父上下文
    const newLocals = new Map(parentContext.locals);

    return {
      input: { ...parentContext.input },
      locals: newLocals,
      results: parentContext.results ? new Map(parentContext.results) : new Map(),
      traceId: parentContext.traceId,
      depth,
      stats: parentContext.stats ? { ...parentContext.stats } : {
        totalDurationMs: 0,
        agentCalls: 0,
        skillCalls: 0,
        toolCalls: 0,
        totalTokens: 0,
        successfulCalls: 0,
        failedCalls: 0,
      },
      trace: [],
      parent: parentContext,
      options: parentContext.options,
      MAX_NESTING_DEPTH: parentContext.MAX_NESTING_DEPTH ?? this.config.maxNestingDepth,
    };
  }

  /**
   * 求值表达式
   *
   * @param expr 表达式
   * @param context 执行上下文
   * @returns 求值结果
   */
  private evaluateExpression(
    expr: DSLExpression,
    context: ExecutionContext
  ): unknown {
    return this.expressionEvaluator.evaluate(expr, context);
  }

  /**
   * 添加追踪记录
   *
   * @param trace 追踪记录数组
   * @param loop 循环语句
   * @param loopType 循环类型
   * @param iterationCount 迭代次数
   */
  private addTrace(
    trace: TraceEntry[],
    loop: DSLLoop,
    loopType: string,
    iterationCount: number
  ): void {
    if (!this.config.enableTracing) {
      return;
    }

    trace.push({
      timestamp: Date.now(),
      statementType: 'loop',
      location: loop.loc,
      status: 'success',
      data: {
        iterations: iterationCount,
        loopType,
        maxNestingDepth: this.config.maxNestingDepth,
      },
    });
  }

  /**
   * 判断错误是否为致命错误
   *
   * 致命错误会导致循环立即停止。
   *
   * @param error 错误
   * @returns 是否为致命错误
   */
  private isFatalError(error: Error): boolean {
    // 致命错误类型列表
    const fatalErrorMessages = [
      'Maximum loop nesting depth exceeded',
      'Loop exceeded maximum iteration limit',
    ];

    return fatalErrorMessages.some(msg => error.message.includes(msg));
  }

  /**
   * 记录错误到日志
   *
   * @param loop 循环语句
   * @param error 错误
   * @param context 执行上下文
   */
  private logError(loop: DSLLoop, error: unknown, context: ExecutionContext): void {
    const logger = this.dependencies.logger;
    if (!logger) {
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    if (typeof logger.error === 'function') {
      logger.error(`Loop execution failed`, {
        loopType: loop.loop_type,
        location: loop.loc,
        traceId: context.traceId,
        error: errorMessage,
      });
    }
  }

  // ============================================================
  // Getter/Setter
  // ============================================================

  /**
   * 获取执行配置
   */
  getConfig(): Required<LoopExecutorConfig> {
    return this.config;
  }

  /**
   * 更新执行配置
   *
   * @param config 新配置
   */
  updateConfig(config: Partial<LoopExecutorConfig>): void {
    Object.assign(this.config, config);
  }
}

// ============================================================
// 导出工厂函数
// ============================================================

/**
 * 创建循环执行器
 *
 * @param dependencies 执行依赖
 * @param expressionEvaluator 表达式求值器
 * @param statementExecutor 语句执行器
 * @param config 执行器配置（可选）
 * @returns 循环执行器实例
 */
export function createLoopExecutor(
  dependencies: ExecutionDependencies,
  expressionEvaluator: IExpressionEvaluator,
  statementExecutor: IStatementExecutor,
  config?: LoopExecutorConfig
): LoopExecutor {
  return new LoopExecutor(dependencies, expressionEvaluator, statementExecutor, config);
}
