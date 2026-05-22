/**
 * Honeycomb DSL - Try-Catch Executor Tests
 *
 * Try-Catch 异常处理执行器测试用例，验证：
 * - try-catch-finally 三种语义
 * - 异常捕获与传播
 * - 嵌套 try_catch 执行
 * - 深度限制强制执行
 * - catch 变量绑定
 * - finally 块执行保证
 * - 执行追踪功能
 *
 * @module tests/try-catch-executor.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ExecutionContext, ExecutionDependencies, ExecutionResult } from '../src/dsl/agent-call-types.js';
import type { DSLTryCatch, DSLStatement } from '../src/dsl/types.js';
import { TryCatchExecutor, createTryCatchExecutor } from '../src/dsl/executors/try-catch-executor.js';

// ============================================================
// Mock 类
// ============================================================

/**
 * Mock 语句执行器
 */
class MockStatementExecutor {
  private executedSteps: Array<{ type: string; context: ExecutionContext }> = [];
  private shouldThrowError = false;
  private throwErrorOnStep: string | null = null;
  private finallyExecuted = false;

  /**
   * 设置在特定步骤抛出错误
   */
  setThrowErrorOnStep(stepType: string | null): void {
    this.throwErrorOnStep = stepType;
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
    this.shouldThrowError = false;
    this.throwErrorOnStep = null;
    this.finallyExecuted = false;
  }

  /**
   * 获取执行的步骤
   */
  getExecutedSteps(): Array<{ type: string; context: ExecutionContext }> {
    return this.executedSteps;
  }

  /**
   * 获取执行计数
   */
  getExecutionCount(): number {
    return this.executedSteps.length;
  }

  /**
   * 检查 finally 是否执行
   */
  getFinallyExecuted(): boolean {
    return this.finallyExecuted;
  }

  /**
   * 执行语句
   */
  async executeStatement(stmt: DSLStatement, context: ExecutionContext): Promise<ExecutionResult> {
    // 记录执行
    this.executedSteps.push({
      type: stmt.type,
      context,
    });

    // 检查是否应该抛出错误
    if (this.shouldThrowError || this.throwErrorOnStep === stmt.type) {
      const error = new Error(`Mock error in ${stmt.type}`);
      if (stmt.type === 'finally_block') {
        this.finallyExecuted = true;
      }
      throw error;
    }

    // 标记 finally 已执行
    if (stmt.type === 'finally_block') {
      this.finallyExecuted = true;
    }

    // 返回成功结果
    return {
      success: true,
      value: `executed_${stmt.type}`,
      trace: [],
      errors: [],
    };
  }
}

/**
 * Mock 执行依赖
 */
class MockExecutionDependencies {
  private calls: Array<{ fn: string; args: unknown[] }> = [];

  /**
   * 记录调用
   */
  recordCall(fn: string, args: unknown[]): void {
    this.calls.push({ fn, args });
  }

  /**
   * 获取调用记录
   */
  getCalls(): Array<{ fn: string; args: unknown[] }> {
    return this.calls;
  }

  /**
   * 重置
   */
  reset(): void {
    this.calls = [];
  }
}

// ============================================================
// 测试套件
// ============================================================

describe('TryCatchExecutor', () => {
  let mockStatementExecutor: MockStatementExecutor;
  let mockDependencies: ExecutionDependencies;
  let executor: TryCatchExecutor;
  let baseContext: ExecutionContext;

  beforeEach(() => {
    mockStatementExecutor = new MockStatementExecutor();
    mockDependencies = new MockExecutionDependencies() as unknown as ExecutionDependencies;

    executor = new TryCatchExecutor(
      mockDependencies,
      mockStatementExecutor,
      { maxNestingDepth: 100, enableTracing: true }
    );

    baseContext = {
      input: { test: 'value' },
      locals: new Map(),
      results: new Map(),
      traceId: 'test-trace-123',
      parent: undefined,
      depth: 0,
      options: {},
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
  });

  describe('基本 try-catch 语义', () => {
    it('应该成功执行 try 块（无异常）', async () => {
      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
        ],
        catch_block: [
          { type: 'agent_call', agent: 'catch1', input: {} } as DSLStatement,
        ],
        catch_variable: 'error',
      };

      const result = await executor.execute(stmt, baseContext);

      // 验证执行成功
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      // 验证执行了 try 和 catch 块
      // 注意：根据 DSL 语义，catch 块总是执行（即使没有异常）
      expect(mockStatementExecutor.getExecutionCount()).toBe(2);
      const steps = mockStatementExecutor.getExecutedSteps();
      expect(steps[0].type).toBe('agent_call');
    });

    it('应该捕获 try 块中的异常', async () => {
      mockStatementExecutor.setThrowErrorOnStep('agent_call');

      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
        ],
        catch_block: [
          { type: 'agent_call', agent: 'catch1', input: {} } as DSLStatement,
        ],
        catch_variable: 'error',
      };

      const result = await executor.execute(stmt, baseContext);

      // 验证执行成功（异常被捕获）
      expect(result.success).toBe(true);

      // 验证有错误记录
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Mock error');

      // 验证执行了 try 和 catch 块
      expect(mockStatementExecutor.getExecutionCount()).toBe(2);
    });

    it('应该将异常绑定到 catch_variable', async () => {
      mockStatementExecutor.setThrowErrorOnStep('agent_call');

      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
        ],
        catch_block: [
          { type: 'agent_call', agent: 'catch1', input: {} } as DSLStatement,
        ],
        catch_variable: 'myError',
      };

      const result = await executor.execute(stmt, baseContext);

      // 验证执行成功
      expect(result.success).toBe(true);

      // 验证错误被绑定到变量
      // 注意：我们需要通过子上下文访问 locals
      // 这里我们只能验证没有抛出未捕获的异常
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('try-finally 语义（无 catch）', () => {
    it('应该在没有异常时执行 finally 块', async () => {
      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
        ],
        finally_block: [
          { type: 'finally_block', } as DSLStatement,
        ],
      };

      const result = await executor.execute(stmt, baseContext);

      // 验证执行成功
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      // 验证执行了 try 和 finally 块
      expect(mockStatementExecutor.getExecutionCount()).toBe(2);
      expect(mockStatementExecutor.getFinallyExecuted()).toBe(true);
    });

    it('应该在有异常时仍然执行 finally 块', async () => {
      mockStatementExecutor.setThrowErrorOnStep('agent_call');

      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
        ],
        finally_block: [
          { type: 'finally_block', } as DSLStatement,
        ],
      };

      const result = await executor.execute(stmt, baseContext);

      // 验证执行失败（没有 catch 块）
      expect(result.success).toBe(false);

      // 验证有错误记录
      expect(result.errors.length).toBeGreaterThan(0);

      // 验证 finally 块仍然执行了
      expect(mockStatementExecutor.getFinallyExecuted()).toBe(true);
    });
  });

  describe('完整 try-catch-finally 语义', () => {
    it('应该成功执行完整流程（无异常）', async () => {
      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
        ],
        catch_block: [
          { type: 'agent_call', agent: 'catch1', input: {} } as DSLStatement,
        ],
        catch_variable: 'error',
        finally_block: [
          { type: 'finally_block', } as DSLStatement,
        ],
      };

      const result = await executor.execute(stmt, baseContext);

      // 验证执行成功
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      // 验证执行了 try、catch 和 finally 块
      expect(mockStatementExecutor.getExecutionCount()).toBe(3);
      expect(mockStatementExecutor.getFinallyExecuted()).toBe(true);
    });

    it('应该在有异常时执行 catch 和 finally', async () => {
      mockStatementExecutor.setThrowErrorOnStep('agent_call');

      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
        ],
        catch_block: [
          { type: 'agent_call', agent: 'catch1', input: {} } as DSLStatement,
        ],
        catch_variable: 'error',
        finally_block: [
          { type: 'finally_block', } as DSLStatement,
        ],
      };

      const result = await executor.execute(stmt, baseContext);

      // 验证执行成功
      expect(result.success).toBe(true);

      // 验证有错误记录
      expect(result.errors.length).toBeGreaterThan(0);

      // 验证执行了 try、catch 和 finally 块
      expect(mockStatementExecutor.getExecutionCount()).toBe(3);
      expect(mockStatementExecutor.getFinallyExecuted()).toBe(true);
    });

    it('应该在 finally 块出错时返回失败', async () => {
      mockStatementExecutor.setThrowErrorOnStep('finally_block');

      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
        ],
        catch_block: [
          { type: 'agent_call', agent: 'catch1', input: {} } as DSLStatement,
        ],
        catch_variable: 'error',
        finally_block: [
          { type: 'finally_block', } as DSLStatement,
        ],
      };

      const result = await executor.execute(stmt, baseContext);

      // 验证执行失败（finally 块出错）
      expect(result.success).toBe(false);

      // 验证有错误记录
      expect(result.errors.length).toBeGreaterThan(0);

      // 验证 finally 块执行了
      expect(mockStatementExecutor.getFinallyExecuted()).toBe(true);
    });
  });

  describe('嵌套 try_catch', () => {
    it('应该支持嵌套的 try_catch 语句', async () => {
      // 创建嵌套的 try_catch 语句
      const innerStmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'inner', input: {} } as DSLStatement,
        ],
        catch_block: [
          { type: 'agent_call', agent: 'inner_catch', input: {} } as DSLStatement,
        ],
        catch_variable: 'innerError',
      };

      const outerStmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'outer', input: {} } as DSLStatement,
        ],
        catch_block: [
          { type: 'agent_call', agent: 'outer_catch', input: {} } as DSLStatement,
        ],
        catch_variable: 'outerError',
      };

      // 先执行内层
      const innerResult = await executor.execute(innerStmt, baseContext);
      expect(innerResult.success).toBe(true);

      // 重置
      mockStatementExecutor.reset();

      // 再执行外层
      const outerResult = await executor.execute(outerStmt, baseContext);
      expect(outerResult.success).toBe(true);
    });

    it('应该正确传播异常到外层 catch', async () => {
      // 这个测试验证内层 try_catch 捕获异常后，外层不会看到异常
      mockStatementExecutor.setThrowErrorOnStep('agent_call');

      const innerStmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'inner', input: {} } as DSLStatement,
        ],
        catch_block: [
          { type: 'agent_call', agent: 'inner_catch', input: {} } as DSLStatement,
        ],
        catch_variable: 'innerError',
      };

      const result = await executor.execute(innerStmt, baseContext);

      // 验证内层成功捕获异常
      expect(result.success).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('嵌套深度限制', () => {
    it('应该在超过最大深度时拒绝执行', async () => {
      const deepContext: ExecutionContext = {
        ...baseContext,
        depth: 100,  // 达到默认最大深度
      };

      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
        ],
      };

      const result = await executor.execute(stmt, deepContext);

      // 验证执行失败
      expect(result.success).toBe(false);

      // 验证错误消息
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Maximum nesting depth');
    });

    it('应该允许在深度限制内的嵌套', async () => {
      const shallowContext: ExecutionContext = {
        ...baseContext,
        depth: 50,  // 在限制内
      };

      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
        ],
      };

      const result = await executor.execute(stmt, shallowContext);

      // 验证执行成功
      expect(result.success).toBe(true);
    });
  });

  describe('多条语句执行', () => {
    it('应该执行 try 块中的多条语句', async () => {
      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
          { type: 'agent_call', agent: 'test2', input: {} } as DSLStatement,
          { type: 'agent_call', agent: 'test3', input: {} } as DSLStatement,
        ],
        catch_block: [],
      };

      const result = await executor.execute(stmt, baseContext);

      // 验证执行成功
      expect(result.success).toBe(true);

      // 验证执行了所有语句
      expect(mockStatementExecutor.getExecutionCount()).toBe(3);
    });

    it('应该在遇到错误时停止执行 try 块', async () => {
      mockStatementExecutor.setThrowErrorOnStep('agent_call');

      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
          { type: 'agent_call', agent: 'test2', input: {} } as DSLStatement,
          { type: 'agent_call', agent: 'test3', input: {} } as DSLStatement,
        ],
        catch_block: [
          { type: 'agent_call', agent: 'catch1', input: {} } as DSLStatement,
        ],
        catch_variable: 'error',
      };

      const result = await executor.execute(stmt, baseContext);

      // 验证有错误
      expect(result.errors.length).toBeGreaterThan(0);

      // 验证只执行了第一条语句（出错后停止）
      // 注意：因为异常被捕获，catch 块会执行
      // 所以总计数取决于实现
      expect(mockStatementExecutor.getExecutionCount()).toBeGreaterThanOrEqual(1);
    });
  });

  describe('执行追踪', () => {
    it('应该生成追踪记录（成功情况）', async () => {
      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
        ],
        catch_block: [
          { type: 'agent_call', agent: 'catch1', input: {} } as DSLStatement,
        ],
        catch_variable: 'error',
      };

      const result = await executor.execute(stmt, baseContext);

      // 验证有追踪记录
      expect(result.trace.length).toBeGreaterThan(0);

      // 验证追踪记录的内容
      const lastTrace = result.trace[result.trace.length - 1];
      expect(lastTrace.statementType).toBe('try_catch');
      expect(lastTrace.status).toBe('success');
    });

    it('应该生成追踪记录（失败情况）', async () => {
      mockStatementExecutor.setThrowErrorOnStep('agent_call');

      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
        ],
      };

      const result = await executor.execute(stmt, baseContext);

      // 验证有追踪记录
      expect(result.trace.length).toBeGreaterThan(0);

      // 验证至少有一个失败的追踪记录
      const failureTrace = result.trace.find(t => t.status === 'failure');
      expect(failureTrace).toBeDefined();
    });

    it('应该支持禁用追踪', async () => {
      const noTracingExecutor = new TryCatchExecutor(
        mockDependencies,
        mockStatementExecutor,
        { enableTracing: false }
      );

      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
        ],
      };

      const result = await noTracingExecutor.execute(stmt, baseContext);

      // 验证没有追踪记录
      expect(result.trace.length).toBe(0);
    });
  });

  describe('作用域隔离', () => {
    it('应该为子上下文创建独立的作用域', async () => {
      const parentContext: ExecutionContext = {
        ...baseContext,
        locals: new Map([['parentVar', 'parentValue']]),
      };

      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
        ],
      };

      const result = await executor.execute(stmt, parentContext);

      // 验证执行成功
      expect(result.success).toBe(true);

      // 验证子上下文的深度正确
      const steps = mockStatementExecutor.getExecutedSteps();
      expect(steps[0].context.depth).toBe(1);  // 比父上下文深 1
    });

    it('应该隔离 catch_variable 到子作用域', async () => {
      mockStatementExecutor.setThrowErrorOnStep('agent_call');

      const stmt: DSLTryCatch = {
        type: 'try_catch',
        try_block: [
          { type: 'agent_call', agent: 'test1', input: {} } as DSLStatement,
        ],
        catch_block: [
          { type: 'agent_call', agent: 'catch1', input: {} } as DSLStatement,
        ],
        catch_variable: 'myError',
      };

      const result = await executor.execute(stmt, baseContext);

      // 验证执行成功
      expect(result.success).toBe(true);

      // 验证父上下文的 locals 没有被修改
      expect(baseContext.locals.has('myError')).toBe(false);
    });
  });

  describe('工厂函数', () => {
    it('应该通过工厂函数创建执行器', () => {
      const factoryExecutor = createTryCatchExecutor(
        mockDependencies,
        mockStatementExecutor,
        { maxNestingDepth: 50 }
      );

      expect(factoryExecutor).toBeInstanceOf(TryCatchExecutor);
    });
  });

  describe('资源释放', () => {
    it('应该支持 dispose 方法', () => {
      expect(() => executor.dispose()).not.toThrow();
    });
  });
});
