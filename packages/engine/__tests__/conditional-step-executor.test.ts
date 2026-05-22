/**
 * Honeycomb DSL - Condition Step Executor 测试
 *
 * 测试条件分支 Agent 调用功能，遵循 TDD 原则。
 * 测试优先编写（RED Phase），然后实现功能。
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import type {
  DSLConditionalStep,
  DSLCall,
  DSLExpression,
  DSLVariable,
  DSLLiteral,
  DSLBinaryOp,
} from '../src/dsl/types.js';
import type { ExecutionContext, ExecutionDependencies } from '../src/dsl/agent-call-types.js';
import { ConditionStepExecutor } from '../src/dsl/executors/conditional-step-executor.js';

// ============================================================
// 辅助函数：创建 DSL 表达式
// ============================================================

function varExpr(name: string): DSLVariable {
  return { type: 'variable', name };
}

function litExpr(value: string | number | boolean | null): DSLLiteral {
  return { type: 'literal', value };
}

function binaryExpr(
  op: string,
  left: DSLExpression,
  right: DSLExpression
): DSLBinaryOp {
  return { type: 'binary_op', operator: op as any, left, right };
}

// ============================================================
// Mock 依赖
// ============================================================

/** 创建 Mock ExecutionContext */
function createMockContext(input: Record<string, unknown> = {}): ExecutionContext {
  return {
    input,
    locals: new Map(),
    results: new Map(),
    traceId: 'test-trace-123',
    depth: 0,
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

/** Mock StepExecutor */
class MockStepExecutor {
  public lastCallName: string | null = null;
  public callCount: number = 0;
  public returnData: unknown = { result: 'mock-result' };
  public shouldFail: boolean = false;

  async executeStep(
    step: any,
    context: ExecutionContext
  ): Promise<ExecutionContext> {
    this.callCount++;
    this.lastCallName = step.name;

    if (this.shouldFail) {
      throw new Error('Mock execution failed');
    }

    // 设置结果到上下文
    context.locals.set(step.name || 'result', this.returnData);
    context.results.set(step.name || 'result', this.returnData);

    return context;
  }

  reset(): void {
    this.lastCallName = null;
    this.callCount = 0;
    this.returnData = { result: 'mock-result' };
    this.shouldFail = false;
  }
}

// ============================================================
// 测试套件
// ============================================================

describe('Conditional Step Executor', () => {
  let executor: ConditionStepExecutor;
  let mockStepExecutor: MockStepExecutor;
  let mockDependencies: ExecutionDependencies;

  beforeEach(() => {
    mockStepExecutor = new MockStepExecutor();
    mockDependencies = createMockDependencies();
    executor = new ConditionStepExecutor(
      mockDependencies,
      mockStepExecutor as any
    );
  });

  // ============================================================
  // 测试 1: 第一个 if 分支匹配时执行
  // ============================================================
  test('should execute first matching if branch', async () => {
    const step: DSLConditionalStep = {
      type: 'conditional_step',
      name: 'test_conditional',
      branches: [
        {
          if: varExpr('input_data.size'),
          then: { type: 'agent', name: 'big-data-agent' },
        },
        {
          if: varExpr('input_data.type'),
          then: { type: 'agent', name: 'text-agent' },
        },
        {
          else: { type: 'agent', name: 'default-agent' },
        },
      ],
      inputs: {},
      outputs: { result: 'analysis_result' },
    };

    const context = createMockContext({
      input_data: { size: 50000, type: 'text' },
    });

    const result = await executor.executeStep(step, context);

    expect(result.success).toBe(true);
    expect(mockStepExecutor.lastCallName).toBe('big-data-agent');
    expect(mockStepExecutor.callCount).toBe(1);
  });

  // ============================================================
  // 测试 2: elif 分支匹配时执行
  // ============================================================
  test('should execute elif when if does not match', async () => {
    const step: DSLConditionalStep = {
      type: 'conditional_step',
      name: 'test_elif',
      branches: [
        {
          if: varExpr('should_skip'), // false，跳过
          then: { type: 'agent', name: 'skip-agent' },
        },
        {
          if: varExpr('data_type'),
          then: { type: 'agent', name: 'text-agent' },
        },
        {
          else: { type: 'agent', name: 'default-agent' },
        },
      ],
      inputs: {},
      outputs: { result: 'analysis_result' },
    };

    const context = createMockContext({
      data_type: 'text',
      should_skip: false,
    });

    const result = await executor.executeStep(step, context);

    expect(result.success).toBe(true);
    expect(mockStepExecutor.lastCallName).toBe('text-agent');
    expect(mockStepExecutor.callCount).toBe(1);
  });

  // ============================================================
  // 测试 3: else 分支作为默认选项
  // ============================================================
  test('should execute else when no if/elif matches', async () => {
    const step: DSLConditionalStep = {
      type: 'conditional_step',
      name: 'test_else',
      branches: [
        {
          if: varExpr('condition1'),
          then: { type: 'agent', name: 'agent1' },
        },
        {
          if: varExpr('condition2'),
          then: { type: 'agent', name: 'agent2' },
        },
        {
          else: { type: 'agent', name: 'default-agent' },
        },
      ],
      inputs: {},
      outputs: { result: 'analysis_result' },
    };

    const context = createMockContext({
      condition1: false,
      condition2: null,
    });

    const result = await executor.executeStep(step, context);

    expect(result.success).toBe(true);
    expect(mockStepExecutor.lastCallName).toBe('default-agent');
    expect(mockStepExecutor.callCount).toBe(1);
  });

  // ============================================================
  // 测试 4: 二元表达式条件求值
  // ============================================================
  test('should evaluate binary expression conditions', async () => {
    const step: DSLConditionalStep = {
      type: 'conditional_step',
      name: 'test_binary_expr',
      branches: [
        {
          if: binaryExpr('>', varExpr('count'), litExpr(100)),
          then: { type: 'agent', name: 'high-count-agent' },
        },
        {
          else: { type: 'agent', name: 'low-count-agent' },
        },
      ],
      inputs: {},
      outputs: { result: 'count_result' },
    };

    // 测试大于条件
    let context = createMockContext({ count: 150 });
    let result = await executor.executeStep(step, context);
    expect(result.success).toBe(true);
    expect(mockStepExecutor.lastCallName).toBe('high-count-agent');

    mockStepExecutor.reset();

    // 测试小于等于条件
    context = createMockContext({ count: 50 });
    result = await executor.executeStep(step, context);
    expect(result.success).toBe(true);
    expect(mockStepExecutor.lastCallName).toBe('low-count-agent');
  });

  // ============================================================
  // 测试 5: 复杂布尔表达式
  // ============================================================
  test('should evaluate complex boolean expressions', async () => {
    const step: DSLConditionalStep = {
      type: 'conditional_step',
      name: 'test_complex_boolean',
      branches: [
        {
          if: binaryExpr('&&', varExpr('is_urgent'), varExpr('is_approved')),
          then: { type: 'agent', name: 'urgent-agent' },
        },
        {
          if: binaryExpr('||', varExpr('is_urgent'), varExpr('is_important')),
          then: { type: 'agent', name: 'important-agent' },
        },
        {
          else: { type: 'agent', name: 'normal-agent' },
        },
      ],
      inputs: {},
      outputs: { result: 'priority_result' },
    };

    // 测试 && 条件
    let context = createMockContext({
      is_urgent: true,
      is_approved: true,
      is_important: false,
    });
    let result = await executor.executeStep(step, context);
    expect(result.success).toBe(true);
    expect(mockStepExecutor.lastCallName).toBe('urgent-agent');

    mockStepExecutor.reset();

    // 测试 || 条件
    context = createMockContext({
      is_urgent: false,
      is_approved: false,
      is_important: true,
    });
    result = await executor.executeStep(step, context);
    expect(result.success).toBe(true);
    expect(mockStepExecutor.lastCallName).toBe('important-agent');
  });

  // ============================================================
  // 测试 6: 无匹配分支时抛出错误
  // ============================================================
  test('should throw error when no branch matches without else', async () => {
    const step: DSLConditionalStep = {
      type: 'conditional_step',
      name: 'test_no_match',
      branches: [
        {
          if: varExpr('condition1'),
          then: { type: 'agent', name: 'agent1' },
        },
        {
          if: varExpr('condition2'),
          then: { type: 'agent', name: 'agent2' },
        },
        // 没有 else 分支
      ],
      inputs: {},
      outputs: { result: 'result' },
    };

    const context = createMockContext({
      condition1: false,
      condition2: null,
    });

    await expect(executor.executeStep(step, context)).rejects.toThrow(
      'No matching branch in conditional step'
    );
  });

  // ============================================================
  // 测试 7: 条件中的变量引用（属性路径）
  // ============================================================
  test('should support variable references with property paths', async () => {
    const step: DSLConditionalStep = {
      type: 'conditional_step',
      name: 'test_var_reference',
      branches: [
        {
          if: binaryExpr('==', varExpr('user.role'), litExpr('admin')),
          then: { type: 'agent', name: 'admin-agent' },
        },
        {
          else: { type: 'agent', name: 'user-agent' },
        },
      ],
      inputs: {},
      outputs: { result: 'access_result' },
    };

    // 测试 admin 角色
    let context = createMockContext({
      user: { role: 'admin', name: 'Alice' },
    });
    let result = await executor.executeStep(step, context);
    expect(result.success).toBe(true);
    expect(mockStepExecutor.lastCallName).toBe('admin-agent');

    mockStepExecutor.reset();

    // 测试普通用户
    context = createMockContext({
      user: { role: 'user', name: 'Bob' },
    });
    result = await executor.executeStep(step, context);
    expect(result.success).toBe(true);
    expect(mockStepExecutor.lastCallName).toBe('user-agent');
  });

  // ============================================================
  // 测试 8: 多级 elif 链
  // ============================================================
  test('should handle multiple elif branches correctly', async () => {
    const step: DSLConditionalStep = {
      type: 'conditional_step',
      name: 'test_multiple_elif',
      branches: [
        {
          if: varExpr('priority'),
          then: { type: 'agent', name: 'critical-agent' },
        },
        {
          if: binaryExpr('>', varExpr('level'), litExpr(7)),
          then: { type: 'agent', name: 'high-agent' },
        },
        {
          if: binaryExpr('>', varExpr('level'), litExpr(4)),
          then: { type: 'agent', name: 'medium-agent' },
        },
        {
          else: { type: 'agent', name: 'low-agent' },
        },
      ],
      inputs: {},
      outputs: { result: 'priority_result' },
    };

    // 测试 medium 级别
    let context = createMockContext({
      priority: false,
      level: 5,
    });
    let result = await executor.executeStep(step, context);
    expect(result.success).toBe(true);
    expect(mockStepExecutor.lastCallName).toBe('medium-agent');

    mockStepExecutor.reset();

    // 测试 low 级别
    context = createMockContext({
      priority: false,
      level: 2,
    });
    result = await executor.executeStep(step, context);
    expect(result.success).toBe(true);
    expect(mockStepExecutor.lastCallName).toBe('low-agent');
  });

  // ============================================================
  // 测试 9: 输出映射
  // ============================================================
  test('should map outputs correctly', async () => {
    const step: DSLConditionalStep = {
      type: 'conditional_step',
      name: 'test_outputs',
      branches: [
        {
          if: varExpr('condition'),
          then: { type: 'agent', name: 'agent1' },
        },
        {
          else: { type: 'agent', name: 'agent2' },
        },
      ],
      inputs: {},
      outputs: { result: 'output_result' },
    };

    const context = createMockContext({ condition: true });
    mockStepExecutor.returnData = { value: 42, message: 'success' };

    const result = await executor.executeStep(step, context);

    expect(result.success).toBe(true);
    expect(result.outputs).toBeDefined();
  });

  // ============================================================
  // 测试 10: 嵌套条件表达式
  // ============================================================
  test('should evaluate nested conditions', async () => {
    const step: DSLConditionalStep = {
      type: 'conditional_step',
      name: 'test_nested',
      branches: [
        {
          if: binaryExpr(
            '&&',
            binaryExpr('||', varExpr('a'), varExpr('b')),
            varExpr('c')
          ),
          then: { type: 'agent', name: 'matched-agent' },
        },
        {
          else: { type: 'agent', name: 'default-agent' },
        },
      ],
      inputs: {},
      outputs: { result: 'nested_result' },
    };

    // (a || b) && c = (false || true) && true = true
    const context = createMockContext({
      a: false,
      b: true,
      c: true,
    });

    const result = await executor.executeStep(step, context);
    expect(result.success).toBe(true);
    expect(mockStepExecutor.lastCallName).toBe('matched-agent');
  });
});
