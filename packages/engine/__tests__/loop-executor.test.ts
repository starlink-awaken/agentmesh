/**
 * Honeycomb DSL - Loop Executor Tests
 *
 * 循环语句执行器测试用例，验证：
 * - 三种循环类型（for/while/for_each）
 * - 嵌套循环执行
 * - 变量作用域隔离
 * - 循环深度限制
 * - 最大迭代次数限制
 *
 * @module tests/loop-executor.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import type { ExecutionContext, ExecutionDependencies } from '../src/dsl/agent-call-types.js';
import type { DSLLoop, DSLStatement, DSLExpression } from '../src/dsl/types.js';
import type { ExecutionResult } from '../src/dsl/step-executor.js';
import { LoopExecutor, createLoopExecutor } from '../src/dsl/executors/loop-executor.js';

// ============================================================
// Mock 类
// ============================================================

/**
 * Mock 表达式求值器
 */
class MockExpressionEvaluator {
  private values: Map<string, unknown> = new Map();
  private autoIncrementVars: Set<string> = new Set();

  /**
   * 设置变量的值
   */
  setVariable(name: string, value: unknown): void {
    this.values.set(name, value);
  }

  /**
   * 启用变量的自动递增（每次求值时递增）
   */
  enableAutoIncrement(name: string): void {
    this.autoIncrementVars.add(name);
  }

  /**
   * 求值表达式
   */
  evaluate(expr: DSLExpression, context: ExecutionContext): unknown {
    // 简化实现：直接返回变量引用的值
    if (expr.type === 'variable') {
      const varName = (expr as { type: 'variable'; name: string }).name;
      const value = this.resolveVariable(varName, context);

      // 如果启用了自动递增，在返回值后递增
      if (this.autoIncrementVars.has(varName) && typeof value === 'number') {
        const newValue = value + 1;
        this.values.set(varName, newValue);
        if (context.locals) {
          context.locals.set(varName, newValue);
        }
      }

      return value;
    }
    if (expr.type === 'literal') {
      return (expr as { type: 'literal'; value: unknown }).value;
    }
    if (expr.type === 'binary_op') {
      const op = (expr as { type: 'binary_op'; operator: string }).operator;
      const left = this.evaluate((expr as { type: 'binary_op'; left: DSLExpression }).left, context);
      const right = this.evaluate((expr as { type: 'binary_op'; right: DSLExpression }).right, context);
      return this.computeBinaryOp(op, left, right);
    }
    return null;
  }

  private resolveVariable(name: string, context: ExecutionContext): unknown {
    if (context.locals.has(name)) {
      return context.locals.get(name);
    }
    return this.values.get(name);
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
    return null;
  }
}

/**
 * Mock 语句执行器
 */
class MockStatementExecutor {
  private executedSteps: Array<{ name: string; context: ExecutionContext }> = [];
  private breakOnIteration: number | null = null;
  private shouldThrowError = false;
  private loopExecutor: LoopExecutor | null = null;  // 用于递归执行嵌套循环

  /**
   * 设置循环执行器引用（用于递归执行嵌套循环）
   */
  setLoopExecutor(executor: LoopExecutor): void {
    this.loopExecutor = executor;
  }

  /**
   * 设置在特定迭代次数中断
   */
  setBreakOnIteration(iter: number | null): void {
    this.breakOnIteration = iter;
  }

  /**
   * 设置是否抛出错误
   */
  setShouldThrowError(value: boolean): void {
    this.shouldThrowError = value;
  }

  /**
   * 重置执行记录
   */
  reset(): void {
    this.executedSteps = [];
    this.breakOnIteration = null;
    this.shouldThrowError = false;
  }

  /**
   * 获取执行的步骤
   */
  getExecutedSteps(): Array<{ name: string; context: ExecutionContext }> {
    return this.executedSteps;
  }

  /**
   * 获取执行计数
   */
  getExecutionCount(): number {
    return this.executedSteps.length;
  }

  /**
   * 执行语句
   */
  async executeStatement(
    stmt: DSLStatement,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    // 记录执行
    const name = (stmt as { name?: string }).name || 'anonymous';
    this.executedSteps.push({ name, context });

    // 如果是嵌套循环，递归执行
    if (stmt.type === 'loop' && this.loopExecutor) {
      return await this.loopExecutor.execute(stmt, context);
    }

    // 检查是否需要中断
    if (this.breakOnIteration !== null) {
      const iteration = this.getCurrentIteration(context);
      if (iteration === this.breakOnIteration) {
        return {
          success: true,
          outputs: { break: true },
          trace: [],
        };
      }
    }

    // 检查是否需要抛出错误
    if (this.shouldThrowError) {
      return {
        success: false,
        errors: [new Error('Mock execution error')],
        trace: [],
      };
    }

    return {
      success: true,
      outputs: {},
      trace: [],
    };
  }

  private getCurrentIteration(context: ExecutionContext): number {
    if (context.locals.has('_iteration')) {
      return context.locals.get('_iteration') as number;
    }
    return 0;
  }
}

// ============================================================
// 测试辅助函数
// ============================================================

/**
 * 创建基础执行上下文
 */
function createBaseContext(): ExecutionContext {
  return {
    input: {},
    locals: new Map(),
    results: new Map(),
    errors: [],
    trace: [],
    parent: undefined,
    options: {
      maxIterations: 10000,
      maxNestingDepth: 100,
      timeout: 30000,
    },
    depth: 0,
    MAX_NESTING_DEPTH: 100,
    traceId: 'test-trace-id',
  };
}

/**
 * 创建执行依赖
 */
function createDependencies(): ExecutionDependencies {
  return {
    logger: undefined,
    messageBus: undefined,
  };
}

// ============================================================
// 测试套件
// ============================================================

describe('LoopExecutor', () => {
  let expressionEvaluator: MockExpressionEvaluator;
  let statementExecutor: MockStatementExecutor;
  let loopExecutor: LoopExecutor;

  beforeEach(() => {
    expressionEvaluator = new MockExpressionEvaluator();
    statementExecutor = new MockStatementExecutor();
    const dependencies = createDependencies();
    loopExecutor = createLoopExecutor(
      dependencies,
      expressionEvaluator,
      statementExecutor
    );
    statementExecutor.reset();
    // 设置循环执行器引用，用于递归执行嵌套循环
    statementExecutor.setLoopExecutor(loopExecutor);
  });

  // ============================================================
  // 基本功能测试
  // ============================================================

  describe('基本功能', () => {
    it('应该能够创建 LoopExecutor 实例', () => {
      expect(loopExecutor).toBeDefined();
      expect(loopExecutor).toBeInstanceOf(LoopExecutor);
    });

    it('应该返回正确的默认配置', () => {
      const config = loopExecutor.getConfig();
      expect(config.maxIterations).toBe(10000);
      expect(config.maxNestingDepth).toBe(100);
      expect(config.enableTracing).toBe(true);
    });

    it('应该能够更新配置', () => {
      loopExecutor.updateConfig({ maxIterations: 500, maxNestingDepth: 50 });
      const config = loopExecutor.getConfig();
      expect(config.maxIterations).toBe(500);
      expect(config.maxNestingDepth).toBe(50);
    });
  });

  // ============================================================
  // While 循环测试
  // ============================================================

  describe('While 循环', () => {
    it('应该正确执行 while 循环', async () => {
      expressionEvaluator.setVariable('i', 0);
      expressionEvaluator.setVariable('limit', 3);
      expressionEvaluator.enableAutoIncrement('i'); // 启用自动递增

      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'while',
        test: {
          type: 'binary_op',
          operator: '<',
          left: { type: 'variable', name: 'i' },
          right: { type: 'variable', name: 'limit' },
        },
        body: [
          { type: 'step', name: 'step1', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
        ],
      };

      const context = createBaseContext();
      const result = await loopExecutor.execute(loop, context);

      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(statementExecutor.getExecutionCount()).toBe(3);
    });

    it('应该正确处理条件为假的 while 循环（零次执行）', async () => {
      expressionEvaluator.setVariable('i', 5);
      expressionEvaluator.setVariable('limit', 3);

      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'while',
        test: {
          type: 'binary_op',
          operator: '<',
          left: { type: 'variable', name: 'i' },
          right: { type: 'variable', name: 'limit' },
        },
        body: [
          { type: 'step', name: 'step1', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
        ],
      };

      const context = createBaseContext();
      const result = await loopExecutor.execute(loop, context);

      expect(result.success).toBe(true);
      expect(statementExecutor.getExecutionCount()).toBe(0);
    });

    it('应该在达到最大迭代次数时抛出错误', async () => {
      expressionEvaluator.setVariable('i', 0);
      expressionEvaluator.setVariable('limit', 99999);

      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'while',
        test: {
          type: 'binary_op',
          operator: '<',
          left: { type: 'variable', name: 'i' },
          right: { type: 'variable', name: 'limit' },
        },
        body: [
          { type: 'step', name: 'step1', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
        ],
      };

      const context = createBaseContext();
      context.options.maxIterations = 10;

      const result = await loopExecutor.execute(loop, context);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('maximum iteration limit');
    });
  });

  // ============================================================
  // For Each 循环测试
  // ============================================================

  describe('For Each 循环', () => {
    it('应该正确执行 for_each 循环', async () => {
      expressionEvaluator.setVariable('items', [1, 2, 3]);

      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'for_each',
        variable: 'item',
        collection: { type: 'variable', name: 'items' },
        body: [
          { type: 'step', name: 'process-item', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
        ],
      };

      const context = createBaseContext();
      const result = await loopExecutor.execute(loop, context);

      expect(result.success).toBe(true);
      expect(statementExecutor.getExecutionCount()).toBe(3);
    });

    it('应该正确设置循环变量', async () => {
      expressionEvaluator.setVariable('items', ['a', 'b', 'c']);

      const items: unknown[] = [];
      let lastContext: ExecutionContext | null = null;

      // 修改 mock 来记录变量值
      const originalExecute = statementExecutor.executeStatement.bind(statementExecutor);
      statementExecutor.executeStatement = async (stmt, context) => {
        lastContext = context;
        return originalExecute(stmt, context);
      };

      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'for_each',
        variable: 'item',
        collection: { type: 'variable', name: 'items' },
        body: [
          { type: 'step', name: 'record-item', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
        ],
      };

      const context = createBaseContext();
      await loopExecutor.execute(loop, context);

      expect(lastContext).not.toBeNull();
      expect(lastContext!.locals.get('item')).toBe('c'); // 最后一次迭代的值
    });

    it('应该正确处理空集合', async () => {
      expressionEvaluator.setVariable('items', []);

      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'for_each',
        variable: 'item',
        collection: { type: 'variable', name: 'items' },
        body: [
          { type: 'step', name: 'step1', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
        ],
      };

      const context = createBaseContext();
      const result = await loopExecutor.execute(loop, context);

      expect(result.success).toBe(true);
      expect(statementExecutor.getExecutionCount()).toBe(0);
    });

    it('应该正确处理对象集合', async () => {
      expressionEvaluator.setVariable('obj', { key1: 'value1', key2: 'value2' });

      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'for_each',
        variable: 'entry',
        collection: { type: 'variable', name: 'obj' },
        body: [
          { type: 'step', name: 'process-entry', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
        ],
      };

      const context = createBaseContext();
      const result = await loopExecutor.execute(loop, context);

      expect(result.success).toBe(true);
      expect(statementExecutor.getExecutionCount()).toBe(2);
    });
  });

  // ============================================================
  // For 循环测试
  // ============================================================

  describe('For 循环', () => {
    it('应该正确执行无条件的 for 循环', async () => {
      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'for',
        variable: 'i',
        body: [
          { type: 'step', name: 'step1', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
        ],
      };

      const context = createBaseContext();
      context.options.maxIterations = 5;

      const result = await loopExecutor.execute(loop, context);

      expect(result.success).toBe(true);
      expect(statementExecutor.getExecutionCount()).toBe(5);
    });

    it('should correctly set loop counter in for loop', async () => {
      let lastCounter: number | null = null;

      const originalExecute = statementExecutor.executeStatement.bind(statementExecutor);
      statementExecutor.executeStatement = async (stmt, context) => {
        if (context.locals.has('i')) {
          lastCounter = context.locals.get('i') as number;
        }
        return originalExecute(stmt, context);
      };

      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'for',
        variable: 'i',
        body: [
          { type: 'step', name: 'step1', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
        ],
      };

      const context = createBaseContext();
      context.options.maxIterations = 3;

      await loopExecutor.execute(loop, context);

      expect(lastCounter).toBe(2); // 0, 1, 2 - 最后是 2
    });

    it('应该正确执行带条件的 for 循环', async () => {
      expressionEvaluator.setVariable('limit', 3);

      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'for',
        variable: 'i',
        test: {
          type: 'binary_op',
          operator: '<',
          left: { type: 'variable', name: 'i' },
          right: { type: 'variable', name: 'limit' },
        },
        body: [
          { type: 'step', name: 'step1', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
        ],
      };

      const context = createBaseContext();
      const result = await loopExecutor.execute(loop, context);

      expect(result.success).toBe(true);
      expect(statementExecutor.getExecutionCount()).toBe(3);
    });
  });

  // ============================================================
  // 嵌套循环测试
  // ============================================================

  describe('嵌套循环', () => {
    it('应该正确执行双层嵌套循环', async () => {
      expressionEvaluator.setVariable('outerLimit', 2);
      expressionEvaluator.enableAutoIncrement('i');
      expressionEvaluator.enableAutoIncrement('j');
      statementExecutor.setBreakOnIteration(null); // 不中断

      const innerLoop: DSLLoop = {
        type: 'loop',
        loop_type: 'for',
        variable: 'j',
        body: [
          { type: 'step', name: 'inner-step', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
        ],
      };

      const outerLoop: DSLLoop = {
        type: 'loop',
        loop_type: 'for',
        variable: 'i',
        test: {
          type: 'binary_op',
          operator: '<',
          left: { type: 'variable', name: 'i' },
          right: { type: 'variable', name: 'outerLimit' },
        },
        body: [innerLoop],
      };

      const context = createBaseContext();
      context.options.maxIterations = 100; // 外层限制
      context.options.maxIterations = 10; // 内层限制（会被覆盖）

      const result = await loopExecutor.execute(outerLoop, context);

      expect(result.success).toBe(true);
      // 2 * 3 = 6 次执行（外层循环 2 次，内层每次 3 次默认）
      expect(statementExecutor.getExecutionCount()).toBeGreaterThanOrEqual(6);
    });

    it('应该正确执行三层嵌套循环', async () => {
      // 三层嵌套循环
      const innermostLoop: DSLLoop = {
        type: 'loop',
        loop_type: 'for',
        variable: 'k',
        test: {
          type: 'binary_op',
          operator: '<',
          left: { type: 'variable', name: 'k' },
          right: { type: 'literal', value: 3 },
        },
        body: [
          { type: 'step', name: 'innermost-step', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
        ],
      };

      const middleLoop: DSLLoop = {
        type: 'loop',
        loop_type: 'for',
        variable: 'j',
        test: {
          type: 'binary_op',
          operator: '<',
          left: { type: 'variable', name: 'j' },
          right: { type: 'literal', value: 2 },
        },
        body: [innermostLoop],
      };

      const outerLoop: DSLLoop = {
        type: 'loop',
        loop_type: 'for',
        variable: 'i',
        test: {
          type: 'binary_op',
          operator: '<',
          left: { type: 'variable', name: 'i' },
          right: { type: 'literal', value: 2 },
        },
        body: [middleLoop],
      };

      const context = createBaseContext();
      const result = await loopExecutor.execute(outerLoop, context);

      expect(result.success).toBe(true);
      // 2 (middleLoop) + 2*2 (innermostLoop) + 2*2*3 (innermost-step) = 18 次执行
      expect(statementExecutor.getExecutionCount()).toBe(18);
    });

    it('应该正确隔离嵌套循环的变量作用域', async () => {
      let outerIValue: number | null = null;
      let innerIValue: number | null = null;

      const originalExecute = statementExecutor.executeStatement.bind(statementExecutor);
      statementExecutor.executeStatement = async (stmt, context) => {
        if (context.locals.has('i')) {
          if (context.depth === 1) {
            outerIValue = context.locals.get('i') as number;
          } else if (context.depth === 2) {
            innerIValue = context.locals.get('i') as number;
          }
        }
        return originalExecute(stmt, context);
      };

      const innerLoop: DSLLoop = {
        type: 'loop',
        loop_type: 'for',
        variable: 'i', // 内部也使用 i 作为变量名
        test: {
          type: 'binary_op',
          operator: '<',
          left: { type: 'variable', name: 'i' },
          right: { type: 'literal', value: 2 },
        },
        body: [
          { type: 'step', name: 'inner-step', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
        ],
      };

      const outerLoop: DSLLoop = {
        type: 'loop',
        loop_type: 'for',
        variable: 'i',
        test: {
          type: 'binary_op',
          operator: '<',
          left: { type: 'variable', name: 'i' },
          right: { type: 'literal', value: 2 },
        },
        body: [innerLoop],
      };

      const context = createBaseContext();
      context.options.maxIterations = 10;

      await loopExecutor.execute(outerLoop, context);

      // 验证深度
      expect(outerIValue).not.toBeNull();
      expect(innerIValue).not.toBeNull();
      // 内层和外层的变量应该独立
      expect(innerIValue).toBeLessThan(2);
    });

    it('应该在达到最大嵌套深度时抛出错误', async () => {
      // 创建深度限制很低的 LoopExecutor
      const shallowLoopExecutor = createLoopExecutor(
        createDependencies(),
        expressionEvaluator,
        statementExecutor,
        { maxNestingDepth: 3 }
      );
      // 更新 statementExecutor 的循环执行器引用
      statementExecutor.setLoopExecutor(shallowLoopExecutor);

      // 创建三层循环（每层都有终止条件，但会超过最大深度）
      const innermost: DSLLoop = {
        type: 'loop',
        loop_type: 'for',
        variable: 'k',
        test: {
          type: 'binary_op',
          operator: '<',
          left: { type: 'variable', name: 'k' },
          right: { type: 'literal', value: 2 },
        },
        body: [{ type: 'step', name: 'step', call: { type: 'agent', name: 'test' }, inputs: {} }],
      };

      const middle1: DSLLoop = {
        type: 'loop',
        loop_type: 'for',
        variable: 'j',
        test: {
          type: 'binary_op',
          operator: '<',
          left: { type: 'variable', name: 'j' },
          right: { type: 'literal', value: 2 },
        },
        body: [innermost],
      };

      const middle2: DSLLoop = {
        type: 'loop',
        loop_type: 'for',
        variable: 'i',
        test: {
          type: 'binary_op',
          operator: '<',
          left: { type: 'variable', name: 'i' },
          right: { type: 'literal', value: 2 },
        },
        body: [middle1],
      };

      const outer: DSLLoop = {
        type: 'loop',
        loop_type: 'for',
        variable: 'x',
        test: {
          type: 'binary_op',
          operator: '<',
          left: { type: 'variable', name: 'x' },
          right: { type: 'literal', value: 2 },
        },
        body: [middle2],
      };

      const context = createBaseContext();

      const result = await shallowLoopExecutor.execute(outer, context);

      console.log('Result success:', result.success);
      console.log('Result errors:', result.errors);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Maximum loop nesting depth');
    });
  });

  // ============================================================
  // 错误处理测试
  // ============================================================

  describe('错误处理', () => {
    it('应该正确处理循环体内的错误', async () => {
      expressionEvaluator.setVariable('limit', 5);
      statementExecutor.setShouldThrowError(true);

      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'for',
        variable: 'i',
        test: {
          type: 'binary_op',
          operator: '<',
          left: { type: 'variable', name: 'i' },
          right: { type: 'variable', name: 'limit' },
        },
        body: [
          { type: 'step', name: 'step1', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
        ],
      };

      const context = createBaseContext();

      const result = await loopExecutor.execute(loop, context);

      // 循环应该停止，但不会抛出致命错误
      expect(result.errors.length).toBeGreaterThan(0);
      expect(statementExecutor.getExecutionCount()).toBeLessThan(5);
    });

    it('应该正确处理无效的循环类型', async () => {
      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'invalid' as 'for', // 无效类型
        body: [{ type: 'step', name: 'step', call: { type: 'agent', name: 'test' }, inputs: {} }],
      };

      const context = createBaseContext();

      const result = await loopExecutor.execute(loop, context);

      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('Unsupported loop type');
    });

    it('应该正确处理缺失的循环条件表达式', async () => {
      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'while',
        test: undefined, // 缺失条件
        body: [{ type: 'step', name: 'step', call: { type: 'agent', name: 'test' }, inputs: {} }],
      };

      const context = createBaseContext();

      const result = await loopExecutor.execute(loop, context);

      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('test condition');
    });

    it('应该正确处理缺失的集合表达式', async () => {
      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'for_each',
        variable: 'item',
        collection: undefined, // 缺失集合
        body: [{ type: 'step', name: 'step', call: { type: 'agent', name: 'test' }, inputs: {} }],
      };

      const context = createBaseContext();

      const result = await loopExecutor.execute(loop, context);

      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('collection');
    });
  });

  // ============================================================
  // 追踪记录测试
  // ============================================================

  describe('追踪记录', () => {
    it('应该生成正确的追踪记录', async () => {
      expressionEvaluator.setVariable('items', [1, 2]);

      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'for_each',
        variable: 'item',
        collection: { type: 'variable', name: 'items' },
        body: [
          { type: 'step', name: 'process', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
        ],
      };

      const context = createBaseContext();
      const result = await loopExecutor.execute(loop, context);

      // 检查追踪记录
      const loopTrace = result.trace.find(t => t.statementType === 'loop');
      expect(loopTrace).toBeDefined();
      expect(loopTrace?.data).toBeDefined();
      expect((loopTrace?.data as { iterations: number }).iterations).toBe(2);
      expect((loopTrace?.data as { loopType: string }).loopType).toBe('for_each');
    });

    it('应该在禁用追踪时不生成追踪记录', async () => {
      const noTraceExecutor = createLoopExecutor(
        createDependencies(),
        expressionEvaluator,
        statementExecutor,
        { enableTracing: false }
      );

      expressionEvaluator.setVariable('items', [1, 2]);

      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'for_each',
        variable: 'item',
        collection: { type: 'variable', name: 'items' },
        body: [
          { type: 'step', name: 'process', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
        ],
      };

      const context = createBaseContext();
      const result = await noTraceExecutor.execute(loop, context);

      // 循环追踪不应该存在
      const loopTrace = result.trace.find(t => t.statementType === 'loop');
      expect(loopTrace).toBeUndefined();
    });
  });

  // ============================================================
  // 混合嵌套测试
  // ============================================================

  describe('混合嵌套控制结构', () => {
    it('应该在循环内正确执行条件语句', async () => {
      let executeCount = 0;

      const originalExecute = statementExecutor.executeStatement.bind(statementExecutor);
      statementExecutor.executeStatement = async (stmt, context) => {
        executeCount++;
        return originalExecute(stmt, context);
      };

      const conditionStmt: DSLStatement = {
        type: 'condition',
        test: {
          type: 'variable',
          name: 'shouldExecute',
        },
        consequent: [
          { type: 'step', name: 'conditional-step', call: { type: 'agent', name: 'test' }, inputs: {} },
        ],
      };

      const loop: DSLLoop = {
        type: 'loop',
        loop_type: 'for',
        variable: 'i',
        test: {
          type: 'binary_op',
          operator: '<',
          left: { type: 'variable', name: 'i' },
          right: { type: 'literal', value: 3 },
        },
        body: [conditionStmt],
      };

      const context = createBaseContext();
      context.locals.set('shouldExecute', true);
      context.options.maxIterations = 10;

      const result = await loopExecutor.execute(loop, context);

      expect(result.success).toBe(true);
      // 循环执行 3 次，每次执行条件语句中的 step
      expect(executeCount).toBe(3);
    });
  });
});

// ============================================================
// 性能测试
// ============================================================

describe('LoopExecutor 性能', () => {
  let expressionEvaluator: MockExpressionEvaluator;
  let statementExecutor: MockStatementExecutor;

  beforeEach(() => {
    expressionEvaluator = new MockExpressionEvaluator();
    statementExecutor = new MockStatementExecutor();
  });

  it('应该高效执行大量迭代', async () => {
    const loopExecutor = createLoopExecutor(
      createDependencies(),
      expressionEvaluator,
      statementExecutor
    );

    const loop: DSLLoop = {
      type: 'loop',
      loop_type: 'for',
      variable: 'i',
      body: [
        { type: 'step', name: 'step', call: { type: 'agent', name: 'test-agent' }, inputs: {} },
      ],
    };

    const context = createBaseContext();
    context.options.maxIterations = 100;

    const startTime = Date.now();
    const result = await loopExecutor.execute(loop, context);
    const endTime = Date.now();

    expect(result.success).toBe(true);
    expect(statementExecutor.getExecutionCount()).toBe(100);
    expect(endTime - startTime).toBeLessThan(5000); // 5 秒内完成
  });
});
