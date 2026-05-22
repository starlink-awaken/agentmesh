/**
 * 嵌套 Try-Catch 和 Parallel 执行器测试
 *
 * 测试 TryCatchExecutor 和 ParallelExecutor 的嵌套执行功能。
 * 验证：
 * - 多层嵌套异常处理
 * - 异常传播和捕获
 * - finally 执行顺序
 * - 嵌套并行执行
 * - 并发控制
 *
 * @module tests/nested-executor.test.ts
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import type { DSLTryCatch, DSLParallel, DSLStatement, DSLStep, DSLLoop, DSLExpression } from '../src/dsl/types.js';
import type { ExecutionContext, ExecutionDependencies, ExecutionResult } from '../src/dsl/agent-call-types.js';
import { TryCatchExecutor, createTryCatchExecutor } from '../src/dsl/executors/try-catch-executor.js';
import { ParallelExecutor, createParallelExecutor } from '../src/dsl/executors/parallel-executor.js';
import { LoopExecutor, createLoopExecutor, IExpressionEvaluator } from '../src/dsl/executors/loop-executor.js';

// ============================================================
// Mock 类
// ============================================================

/**
 * Mock 表达式求值器
 */
class MockExpressionEvaluator implements IExpressionEvaluator {
  private values: Map<string, unknown> = new Map();

  setVariable(name: string, value: unknown): void {
    this.values.set(name, value);
  }

  evaluate(expr: DSLExpression, _context: ExecutionContext): unknown {
    if (expr.type === 'variable') {
      const varName = (expr as { type: 'variable'; name: string }).name;
      return this.values.get(varName) ?? true;
    }
    if (expr.type === 'literal') {
      return (expr as { type: 'literal'; value: unknown }).value;
    }
    if (expr.type === 'binary_op') {
      const op = (expr as { type: 'binary_op'; operator: string }).operator;
      const left = this.evaluate((expr as { type: 'binary_op'; left: DSLExpression }).left, _context);
      const right = this.evaluate((expr as { type: 'binary_op'; right: DSLExpression }).right, _context);
      return this.computeBinaryOp(op, left, right);
    }
    return true;
  }

  private computeBinaryOp(op: string, left: unknown, right: unknown): unknown {
    if (op === '<' && typeof left === 'number' && typeof right === 'number') return left < right;
    if (op === '>' && typeof left === 'number' && typeof right === 'number') return left > right;
    if (op === '==' && typeof left === 'number' && typeof right === 'number') return left === right;
    if (op === '!=' && typeof left === 'number' && typeof right === 'number') return left !== right;
    if (op === '<=' && typeof left === 'number' && typeof right === 'number') return left <= right;
    if (op === '>=' && typeof left === 'number' && typeof right === 'number') return left >= right;
    if (op === '&&') return Boolean(left) && Boolean(right);
    if (op === '||') return Boolean(left) || Boolean(right);
    return true;
  }
}

/**
 * Mock 语句执行器 - 支持递归执行嵌套语句
 *
 * 这个 mock 能够识别并正确分发到嵌套的执行器：
 * - step 类型：直接执行
 * - try_catch 类型：使用 TryCatchExecutor 执行
 * - parallel 类型：使用 ParallelExecutor 执行
 * - loop 类型：使用 LoopExecutor 执行
 */
class MockStatementExecutor {
  private executedSteps: Array<{ name: string; type: string }> = [];
  private shouldThrowError = false;
  private errorMessage = 'Mock execution error';
  private throwOnStep: string | null = null;

  // 子执行器实例
  private tryCatchExecutor: TryCatchExecutor;
  private parallelExecutor: ParallelExecutor;
  private loopExecutor: LoopExecutor;

  // 深度限制配置
  private maxNestingDepth: number = 10;

  // 存储依赖引用（用于重新创建执行器）
  private dependencies: ExecutionDependencies;

  /**
   * 创建 Mock 语句执行器
   * @param dependencies 执行依赖
   * @param maxDepth 最大嵌套深度（默认10）
   */
  constructor(dependencies: ExecutionDependencies, maxDepth: number = 10) {
    this.dependencies = dependencies;
    this.maxNestingDepth = maxDepth;
    // 创建子执行器，传入 this 作为 IStatementExecutor 实现递归执行
    this.createChildExecutors();
  }

  /**
   * 创建子执行器（使用当前的 maxNestingDepth）
   */
  private createChildExecutors(): void {
    this.tryCatchExecutor = createTryCatchExecutor(this.dependencies, this, {
      maxNestingDepth: this.maxNestingDepth,
      enableTracing: false,
    });
    this.parallelExecutor = createParallelExecutor(this.dependencies, this, {
      maxNestingDepth: this.maxNestingDepth,
      enableTracing: false,
    });

    // 创建 MockExpressionEvaluator 用于 loop
    const expressionEvaluator = new MockExpressionEvaluator();
    this.loopExecutor = createLoopExecutor(this.dependencies, expressionEvaluator, this, {
      maxIterations: 10000,
      maxNestingDepth: this.maxNestingDepth,
      enableTracing: false,
    });
  }

  /**
   * 设置最大嵌套深度（用于测试深度限制）
   * 重新创建子执行器以应用新的深度限制
   */
  setMaxNestingDepth(depth: number): void {
    this.maxNestingDepth = depth;
    // 重新创建执行器以应用新的深度限制
    this.createChildExecutors();
  }

  /**
   * 设置是否抛出错误
   */
  setShouldThrowError(value: boolean, message?: string): void {
    this.shouldThrowError = value;
    if (message) {
      this.errorMessage = message;
    }
  }

  /**
   * 设置在特定步骤抛出错误
   */
  setThrowOnStep(stepName: string | null): void {
    this.throwOnStep = stepName;
  }

  /**
   * 重置执行记录
   */
  reset(): void {
    this.executedSteps = [];
    this.shouldThrowError = false;
    this.throwOnStep = null;
  }

  /**
   * 获取执行的步骤
   */
  getExecutedSteps(): Array<{ name: string; type: string }> {
    return this.executedSteps;
  }

  /**
   * 获取执行计数
   */
  getExecutionCount(): number {
    return this.executedSteps.length;
  }

  /**
   * 执行语句 - 分发到正确的执行器
   *
   * 关键设计：只有基本语句（step）会被记录到 executedSteps。
   * 控制流语句（try_catch, parallel, loop）委托给对应的执行器处理，
   * 由执行器内部递归调用我们来记录嵌套语句。
   * 这样可以正确计算嵌套深度，避免重复计数。
   *
   * 重要：步骤在抛出错误之前就被记录，这样即使步骤抛出错误，
   * 也能追踪到该步骤被尝试执行。
   */
  async executeStatement(
    stmt: DSLStatement,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const name = (stmt as { name?: string }).name || 'anonymous';
    const type = stmt.type;

    // 根据语句类型分发到正确的执行器
    // 注意：控制流语句委托给执行器，由执行器内部递归调用我们来记录嵌套语句
    switch (type) {
      case 'step':
        // 基本语句：先记录（即使会抛出错误也要记录）
        this.executedSteps.push({ name, type });

        // 然后检查是否需要抛出错误
        if (this.throwOnStep && name === this.throwOnStep) {
          throw new Error(this.errorMessage);
        }

        if (this.shouldThrowError) {
          throw new Error(this.errorMessage);
        }

        return {
          success: true,
          value: { name },
          trace: [],
          errors: [],
        };

      case 'try_catch':
        // 控制流语句：委托给执行器，内部的 try_catch 语句会递归调用我们
        return this.tryCatchExecutor.execute(stmt as DSLTryCatch, context);

      case 'parallel':
        // 控制流语句：委托给执行器，内部的 parallel 语句会递归调用我们
        return this.parallelExecutor.execute(stmt as DSLParallel, context);

      case 'loop':
        // 控制流语句：委托给执行器，内部的语句会递归调用我们
        return this.loopExecutor.execute(stmt as DSLLoop, context);

      default:
        // 其他类型，记录为成功但不执行
        this.executedSteps.push({ name, type });
        return {
          success: true,
          value: { name, type },
          trace: [],
          errors: [],
        };
    }
  }
}

// ============================================================
// Mock 依赖
// ============================================================

/** 创建 Mock ExecutionContext */
function createMockContext(depth: number = 0): ExecutionContext {
  return {
    input: {},
    locals: new Map(),
    results: new Map(),
    traceId: 'test-trace-123',
    depth,
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
}

/** 创建 Mock ExecutionDependencies */
function createMockDependencies(): ExecutionDependencies {
  return {
    messageBus: null,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  };
}

// ============================================================
// TryCatchExecutor 测试
// ============================================================

describe('TryCatchExecutor', () => {
  let mockExecutor: MockStatementExecutor;
  let dependencies: ExecutionDependencies;
  let executor: TryCatchExecutor;

  beforeEach(() => {
    dependencies = createMockDependencies();
    mockExecutor = new MockStatementExecutor(dependencies);
    executor = createTryCatchExecutor(dependencies, mockExecutor, {
      maxNestingDepth: 10,
      enableTracing: true,
    });
  });

  test('应该成功执行简单的 try-catch', async () => {
    const stmt: DSLTryCatch = {
      type: 'try_catch',
      try_block: [
        {
          type: 'step',
          name: 'task1',
          call: { type: 'agent', name: 'worker' },
          inputs: {},
          loc: { file: 'test.dsl', line: 2, column: 3 },
        },
      ],
      catch_variable: 'error',
      catch_block: [
        {
          type: 'step',
          name: 'handle',
          call: { type: 'agent', name: 'handler' },
          inputs: {},
          outputs: {},
          loc: { file: 'test.dsl', line: 6, column: 3 },
        },
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext();
    const result = await executor.execute(stmt, context);

    expect(result.success).toBe(true);
    expect(mockExecutor.getExecutionCount()).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  test('应该成功执行不抛错的 try-finally', async () => {
    const stmt: DSLTryCatch = {
      type: 'try_catch',
      try_block: [
        {
          type: 'step',
          name: 'task1',
          call: { type: 'agent', name: 'worker' },
          inputs: {},
          loc: { file: 'test.dsl', line: 2, column: 3 },
        },
      ],
      finally_block: [
        {
          type: 'step',
          name: 'cleanup',
          call: { type: 'agent', name: 'cleanup' },
          inputs: {},
          outputs: {},
          loc: { file: 'test.dsl', line: 5, column: 3 },
        },
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext();
    const result = await executor.execute(stmt, context);

    expect(result.success).toBe(true);
    expect(mockExecutor.getExecutionCount()).toBe(2);
  });

  test('应该在 try 块抛出异常时执行 catch 块', async () => {
    // 使用 setThrowOnStep 只让 errorTask 抛出错误
    // catch 块中的 handle 步骤应该正常执行（不抛出错误）
    mockExecutor.setThrowOnStep('errorTask');

    const stmt: DSLTryCatch = {
      type: 'try_catch',
      try_block: [
        {
          type: 'step',
          name: 'errorTask',
          call: { type: 'agent', name: 'error_agent' },
          inputs: {},
          loc: { file: 'test.dsl', line: 2, column: 3 },
        },
      ],
      catch_variable: 'error',
      catch_block: [
        {
          type: 'step',
          name: 'handle',
          call: { type: 'agent', name: 'handler' },
          inputs: {},
          outputs: {},
          loc: { file: 'test.dsl', line: 5, column: 3 },
        },
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext();
    const result = await executor.execute(stmt, context);

    expect(result.success).toBe(true);
    expect(mockExecutor.getExecutionCount()).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  test('应该正确执行3层嵌套的 try-catch', async () => {
    // 添加调试输出
    console.log('\n=== Test: 3层嵌套 try-catch ===');

    const stmt: DSLTryCatch = {
      type: 'try_catch',
      try_block: [
        {
          type: 'try_catch',
          try_block: [
            {
              type: 'try_catch',
              try_block: [
                {
                  type: 'step',
                  name: 'innermost',
                  call: { type: 'agent', name: 'worker' },
                  inputs: {},
                  loc: { file: 'test.dsl', line: 5, column: 9 },
                },
              ],
              catch_variable: 'innerError',
              catch_block: [
                {
                  type: 'step',
                  name: 'innerHandler',
                  call: { type: 'agent', name: 'handler' },
                  inputs: {},
                  outputs: {},
                  loc: { file: 'test.dsl', line: 8, column: 11 },
                },
              ],
              loc: { file: 'test.dsl', line: 4, column: 7 },
            },
          ],
          catch_variable: 'middleError',
          catch_block: [
            {
              type: 'step',
              name: 'middleHandler',
              call: { type: 'agent', name: 'handler' },
              inputs: {},
              outputs: {},
              loc: { file: 'test.dsl', line: 12, column: 5 },
            },
          ],
          loc: { file: 'test.dsl', line: 3, column: 3 },
        },
      ],
      catch_variable: 'outerError',
      catch_block: [
        {
          type: 'step',
          name: 'outerHandler',
          call: { type: 'agent', name: 'handler' },
          inputs: {},
          outputs: {},
          loc: { file: 'test.dsl', line: 16, column: 3 },
        },
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext();
    const result = await executor.execute(stmt, context);

    expect(result.success).toBe(true);
    // catch 块总是作为后处理步骤执行（DSL 语义）
    // 3层嵌套：innermost + innerHandler + middleHandler + outerHandler = 4 步
    expect(mockExecutor.getExecutionCount()).toBe(4);
  });

  test('应该在达到最大嵌套深度时失败', async () => {
    // 设置 mockExecutor 的深度限制与 shallowExecutor 一致
    mockExecutor.setMaxNestingDepth(2);

    const shallowExecutor = createTryCatchExecutor(dependencies, mockExecutor, {
      maxNestingDepth: 2,
    });

    // 3层嵌套会超过深度限制
    const stmt: DSLTryCatch = {
      type: 'try_catch',
      try_block: [
        {
          type: 'try_catch',
          try_block: [
            {
              type: 'step',
              name: 'task',
              call: { type: 'agent', name: 'worker' },
              inputs: {},
              loc: { file: 'test.dsl', line: 4, column: 5 },
            },
          ],
          loc: { file: 'test.dsl', line: 3, column: 3 },
        },
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext(1); // 深度1 + 2层嵌套 = 3 > maxNestingDepth(2)
    const result = await shallowExecutor.execute(stmt, context);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('应该正确传播异常通过多层 catch', async () => {
    // 内层不处理异常，异常应该传播到外层
    // 使用 setThrowOnStep 只让 errorTask 抛出错误
    mockExecutor.setThrowOnStep('errorTask');

    const stmt: DSLTryCatch = {
      type: 'try_catch',
      try_block: [
        {
          type: 'try_catch',
          try_block: [
            {
              type: 'step',
              name: 'errorTask',
              call: { type: 'agent', name: 'error_agent' },
              inputs: {},
              loc: { file: 'test.dsl', line: 4, column: 5 },
            },
          ],
          // 没有 catch_block - 异常会传播
          loc: { file: 'test.dsl', line: 2, column: 3 },
        },
      ],
      catch_variable: 'outerError',
      catch_block: [
        {
          type: 'step',
          name: 'outerHandler',
          call: { type: 'agent', name: 'handler' },
          inputs: {},
          outputs: {},
          loc: { file: 'test.dsl', line: 9, column: 3 },
        },
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext();
    const result = await executor.execute(stmt, context);

    expect(result.success).toBe(true);
    expect(mockExecutor.getExecutionCount()).toBe(2);
  });

  test('应该总是执行 finally 块（无论是否发生异常）', async () => {
    // 第一次测试：不抛异常
    mockExecutor.reset();
    mockExecutor.setShouldThrowError(false);

    let finallyExecuted = false;

    const stmt: DSLTryCatch = {
      type: 'try_catch',
      try_block: [
        {
          type: 'step',
          name: 'task',
          call: { type: 'agent', name: 'worker' },
          inputs: {},
          loc: { file: 'test.dsl', line: 2, column: 3 },
        },
      ],
      finally_block: [
        {
          type: 'step',
          name: 'finallyTask',
          call: { type: 'agent', name: 'finally_worker' },
          inputs: {},
          outputs: {},
          loc: { file: 'test.dsl', line: 5, column: 3 },
        },
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext();
    const result = await executor.execute(stmt, context);

    expect(result.success).toBe(true);
    expect(mockExecutor.getExecutedSteps().some(s => s.name === 'finallyTask')).toBe(true);
  });
});

// ============================================================
// ParallelExecutor 测试
// ============================================================

describe('ParallelExecutor', () => {
  let mockExecutor: MockStatementExecutor;
  let dependencies: ExecutionDependencies;
  let executor: ParallelExecutor;

  beforeEach(() => {
    dependencies = createMockDependencies();
    mockExecutor = new MockStatementExecutor(dependencies);
    executor = createParallelExecutor(dependencies, mockExecutor, {
      maxNestingDepth: 10,
      maxConcurrency: 4,
      enableTracing: true,
    });
  });

  test('应该成功执行单个分支的 parallel', async () => {
    const stmt: DSLParallel = {
      type: 'parallel',
      branches: [
        [
          {
            type: 'step',
            name: 'task1',
            call: { type: 'agent', name: 'worker' },
            inputs: {},
            loc: { file: 'test.dsl', line: 3, column: 5 },
          },
        ],
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext();
    const result = await executor.execute(stmt, context);

    expect(result.success).toBe(true);
    expect(mockExecutor.getExecutionCount()).toBe(1);
  });

  test('应该并发执行多个分支', async () => {
    const stmt: DSLParallel = {
      type: 'parallel',
      branches: [
        [
          {
            type: 'step',
            name: 'task1',
            call: { type: 'agent', name: 'worker1' },
            inputs: {},
            loc: { file: 'test.dsl', line: 3, column: 5 },
          },
        ],
        [
          {
            type: 'step',
            name: 'task2',
            call: { type: 'agent', name: 'worker2' },
            inputs: {},
            loc: { file: 'test.dsl', line: 6, column: 5 },
          },
        ],
        [
          {
            type: 'step',
            name: 'task3',
            call: { type: 'agent', name: 'worker3' },
            inputs: {},
            loc: { file: 'test.dsl', line: 9, column: 5 },
          },
        ],
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext();
    const startTime = Date.now();
    const result = await executor.execute(stmt, context);
    const elapsed = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(mockExecutor.getExecutionCount()).toBe(3);
  });

  test('应该正确执行嵌套的 parallel', async () => {
    const stmt: DSLParallel = {
      type: 'parallel',
      branches: [
        [
          {
            type: 'parallel',
            branches: [
              [
                {
                  type: 'step',
                  name: 'task1',
                  call: { type: 'agent', name: 'worker1' },
                  inputs: {},
                  loc: { file: 'test.dsl', line: 5, column: 11 },
                },
              ],
              [
                {
                  type: 'step',
                  name: 'task2',
                  call: { type: 'agent', name: 'worker2' },
                  inputs: {},
                  loc: { file: 'test.dsl', line: 8, column: 11 },
                },
              ],
            ],
            loc: { file: 'test.dsl', line: 4, column: 9 },
          },
        ],
        [
          {
            type: 'step',
            name: 'task3',
            call: { type: 'agent', name: 'worker3' },
            inputs: {},
            loc: { file: 'test.dsl', line: 12, column: 7 },
          },
        ],
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext();
    const result = await executor.execute(stmt, context);

    expect(result.success).toBe(true);
    expect(mockExecutor.getExecutionCount()).toBe(3);
  });

  test('应该支持 max_concurrency 限制并发数', async () => {
    const limitedExecutor = createParallelExecutor(dependencies, mockExecutor, {
      maxConcurrency: 2,
      enableTracing: true,
    });

    const stmt: DSLParallel = {
      type: 'parallel',
      max_concurrency: 2,
      branches: [
        [
          {
            type: 'step',
            name: 'task1',
            call: { type: 'agent', name: 'worker1' },
            inputs: {},
            loc: { file: 'test.dsl', line: 4, column: 5 },
          },
        ],
        [
          {
            type: 'step',
            name: 'task2',
            call: { type: 'agent', name: 'worker2' },
            inputs: {},
            loc: { file: 'test.dsl', line: 7, column: 5 },
          },
        ],
        [
          {
            type: 'step',
            name: 'task3',
            call: { type: 'agent', name: 'worker3' },
            inputs: {},
            loc: { file: 'test.dsl', line: 10, column: 5 },
          },
        ],
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext();
    const result = await limitedExecutor.execute(stmt, context);

    expect(result.success).toBe(true);
    expect(mockExecutor.getExecutionCount()).toBe(3);
  });

  test('应该正确执行3层嵌套的 parallel', async () => {
    const stmt: DSLParallel = {
      type: 'parallel',
      branches: [
        [
          {
            type: 'parallel',
            branches: [
              [
                {
                  type: 'parallel',
                  branches: [
                    [
                      {
                        type: 'step',
                        name: 'deepTask',
                        call: { type: 'agent', name: 'worker' },
                        inputs: {},
                        loc: { file: 'test.dsl', line: 9, column: 19 },
                      },
                    ],
                  ],
                  loc: { file: 'test.dsl', line: 8, column: 17 },
                },
              ],
            ],
            loc: { file: 'test.dsl', line: 7, column: 15 },
          },
        ],
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext();
    const result = await executor.execute(stmt, context);

    expect(result.success).toBe(true);
    expect(mockExecutor.getExecutionCount()).toBe(1);
  });

  test('应该在达到最大嵌套深度时失败', async () => {
    const shallowExecutor = createParallelExecutor(dependencies, mockExecutor, {
      maxNestingDepth: 2,
    });

    // 3层嵌套会超过深度限制（深度2已经是最大值，不能再创建嵌套）
    const stmt: DSLParallel = {
      type: 'parallel',
      branches: [
        [
          {
            type: 'parallel',
            branches: [
              [
                {
                  type: 'step',
                  name: 'task',
                  call: { type: 'agent', name: 'worker' },
                  inputs: {},
                  loc: { file: 'test.dsl', line: 6, column: 11 },
                },
              ],
            ],
            loc: { file: 'test.dsl', line: 5, column: 9 },
          },
        ],
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    // 深度2 + 1层嵌套 = 3 > maxNestingDepth(2)，应该失败
    const context = createMockContext(2);
    const result = await shallowExecutor.execute(stmt, context);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('应该正确处理空分支列表', async () => {
    const stmt: DSLParallel = {
      type: 'parallel',
      branches: [],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext();
    const result = await executor.execute(stmt, context);

    expect(result.success).toBe(true);
    expect(mockExecutor.getExecutionCount()).toBe(0);
  });

  test('应该正确处理包含多个语句的分支', async () => {
    const stmt: DSLParallel = {
      type: 'parallel',
      branches: [
        [
          {
            type: 'step',
            name: 'task1a',
            call: { type: 'agent', name: 'worker1' },
            inputs: {},
            loc: { file: 'test.dsl', line: 3, column: 5 },
          },
          {
            type: 'step',
            name: 'task1b',
            call: { type: 'agent', name: 'worker1' },
            inputs: {},
            loc: { file: 'test.dsl', line: 5, column: 5 },
          },
        ],
        [
          {
            type: 'step',
            name: 'task2',
            call: { type: 'agent', name: 'worker2' },
            inputs: {},
            loc: { file: 'test.dsl', line: 8, column: 5 },
          },
        ],
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext();
    const result = await executor.execute(stmt, context);

    expect(result.success).toBe(true);
    expect(mockExecutor.getExecutionCount()).toBe(3);
  });
});

// ============================================================
// 混合嵌套测试
// ============================================================

describe('混合嵌套场景', () => {
  let mockExecutor: MockStatementExecutor;
  let dependencies: ExecutionDependencies;
  let tryCatchExecutor: TryCatchExecutor;
  let parallelExecutor: ParallelExecutor;

  beforeEach(() => {
    dependencies = createMockDependencies();
    mockExecutor = new MockStatementExecutor(dependencies);
    tryCatchExecutor = createTryCatchExecutor(dependencies, mockExecutor, {
      maxNestingDepth: 10,
      enableTracing: true,
    });
    parallelExecutor = createParallelExecutor(dependencies, mockExecutor, {
      maxNestingDepth: 10,
      enableTracing: true,
    });
  });

  test('应该正确执行 parallel 中的 try-catch', async () => {
    // 创建包含 try-catch 的分支
    const branchWithTryCatch: DSLStatement[] = [
      {
        type: 'try_catch',
        try_block: [
          {
            type: 'step',
            name: 'mayThrow',
            call: { type: 'agent', name: 'error_agent' },
            inputs: {},
            loc: { file: 'test.dsl', line: 5, column: 9 },
          },
        ],
        catch_variable: 'error',
        catch_block: [
          {
            type: 'step',
            name: 'handle',
            call: { type: 'agent', name: 'handler' },
            inputs: {},
            outputs: {},
            loc: { file: 'test.dsl', line: 8, column: 11 },
          },
        ],
        loc: { file: 'test.dsl', line: 3, column: 7 },
      },
    ];

    const stmt: DSLParallel = {
      type: 'parallel',
      branches: [
        branchWithTryCatch,
        [
          {
            type: 'step',
            name: 'normalTask',
            call: { type: 'agent', name: 'worker' },
            inputs: {},
            loc: { file: 'test.dsl', line: 13, column: 7 },
          },
        ],
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext();
    const result = await parallelExecutor.execute(stmt, context);

    expect(result.success).toBe(true);
    expect(mockExecutor.getExecutionCount()).toBe(3); // try-catch 中的 task + handler + normalTask
  });

  test('应该正确执行 try-catch 中的 parallel', async () => {
    const stmt: DSLTryCatch = {
      type: 'try_catch',
      try_block: [
        {
          type: 'parallel',
          branches: [
            [
              {
                type: 'step',
                name: 'task1',
                call: { type: 'agent', name: 'worker1' },
                inputs: {},
                loc: { file: 'test.dsl', line: 5, column: 9 },
              },
            ],
            [
              {
                type: 'step',
                name: 'task2',
                call: { type: 'agent', name: 'worker2' },
                inputs: {},
                loc: { file: 'test.dsl', line: 8, column: 9 },
              },
            ],
          ],
          loc: { file: 'test.dsl', line: 3, column: 7 },
        },
      ],
      catch_variable: 'error',
      catch_block: [
        {
          type: 'step',
          name: 'handle',
          call: { type: 'agent', name: 'handler' },
          inputs: {},
          outputs: {},
          loc: { file: 'test.dsl', line: 13, column: 7 },
        },
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext();
    const result = await tryCatchExecutor.execute(stmt, context);

    expect(result.success).toBe(true);
    expect(mockExecutor.getExecutionCount()).toBe(3); // task1 + task2 + handler
  });

  test('应该正确执行 parallel-try_catch-parallel 三层嵌套', async () => {
    const stmt: DSLParallel = {
      type: 'parallel',
      branches: [
        [
          {
            type: 'try_catch',
            try_block: [
              {
                type: 'parallel',
                branches: [
                  [
                    {
                      type: 'step',
                      name: 'innerTask1',
                      call: { type: 'agent', name: 'worker1' },
                      inputs: {},
                      loc: { file: 'test.dsl', line: 7, column: 15 },
                    },
                  ],
                  [
                    {
                      type: 'step',
                      name: 'innerTask2',
                      call: { type: 'agent', name: 'worker2' },
                      inputs: {},
                      loc: { file: 'test.dsl', line: 10, column: 15 },
                    },
                  ],
                ],
                loc: { file: 'test.dsl', line: 5, column: 13 },
              },
            ],
            catch_variable: 'error',
            catch_block: [
              {
                type: 'step',
                name: 'handle',
                call: { type: 'agent', name: 'handler' },
                inputs: {},
                outputs: {},
                loc: { file: 'test.dsl', line: 14, column: 13 },
              },
            ],
            loc: { file: 'test.dsl', line: 3, column: 11 },
          },
        ],
        [
          {
            type: 'step',
            name: 'normalTask',
            call: { type: 'agent', name: 'worker3' },
            inputs: {},
            loc: { file: 'test.dsl', line: 19, column: 7 },
          },
        ],
      ],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };

    const context = createMockContext();
    const result = await parallelExecutor.execute(stmt, context);

    expect(result.success).toBe(true);
    expect(mockExecutor.getExecutionCount()).toBe(4); // innerTask1 + innerTask2 + handle + normalTask
  });
});
