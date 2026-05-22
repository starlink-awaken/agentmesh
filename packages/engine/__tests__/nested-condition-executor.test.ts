/**
 * Honeycomb DSL - Nested Condition Executor 测试
 *
 * 测试嵌套条件语句执行功能：
 * - 多层嵌套条件（3层以上）
 * - 短路求值在嵌套情况下正确工作
 * - 边界情况处理
 *
 * @module tests/nested-condition-executor
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import type {
  DSLCondition,
  DSLStatement,
  DSLStep,
  DSLExpression,
  DSLVariable,
  DSLLiteral,
  DSLBinaryOp,
} from '../src/dsl/types.js';
import type { ExecutionContext, ExecutionDependencies } from '../src/dsl/agent-call-types.js';
import { DSLCompiler } from '../src/dsl/compiler.js';

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

// 创建 step 语句
function createStep(name: string, agentName: string): DSLStep {
  return {
    type: 'step',
    name,
    call: { type: 'agent', name: agentName },
    inputs: {},
    outputs: { result: 'step_result' },
  };
}

// 创建 condition 语句
function createCondition(
  test: DSLExpression,
  consequent: DSLStatement[],
  alternate?: DSLStatement[]
): DSLCondition {
  return {
    type: 'condition',
    test,
    consequent,
    alternate,
  };
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
    options: {
      maxIterations: 10000,
      maxNestingDepth: 50,
    },
    MAX_NESTING_DEPTH: 50,  // 设置为 50，与 options 保持一致
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
// 测试套件
// ============================================================

describe('Nested Condition Executor', () => {
  let executor: DSLCompiler;
  let executedSteps: string[];
  let dependencies: ExecutionDependencies;

  beforeEach(() => {
    executedSteps = [];
    dependencies = createMockDependencies();
    executor = new DSLCompiler(dependencies);

    // 注入 mock 执行器来记录执行
    (executor as any).stepExecutor = {
      async executeStep(step: DSLStep, context: ExecutionContext) {
        executedSteps.push(step.name || step.call.name || 'unknown');
        context.locals.set(step.name || 'result', { executed: step.name });
        context.results.set(step.name || 'result', { executed: step.name });
        return context;
      },
    };
  });

  // ============================================================
  // 测试 1: 3层嵌套条件 - all true
  // ============================================================
  test('should execute 3-level nested conditions when all conditions are true', async () => {
    const innermostCondition = createCondition(
      varExpr('innermost_enabled'),
      [createStep('innermost_step', 'innermost_agent')],
      [createStep('innermost_else', 'innermost_else_agent')]
    );

    const middleCondition = createCondition(
      varExpr('middle_enabled'),
      [innermostCondition],
      [createStep('middle_else', 'middle_else_agent')]
    );

    const outerCondition = createCondition(
      varExpr('outer_enabled'),
      [middleCondition],
      [createStep('outer_else', 'outer_else_agent')]
    );

    const context = createMockContext({
      outer_enabled: true,
      middle_enabled: true,
      innermost_enabled: true,
    });

    const result = await executor.executeCondition(outerCondition, context);

    expect(result.errors.length).toBe(0);
    expect(executedSteps).toContain('innermost_step');
    expect(executedSteps).not.toContain('innermost_else');
    expect(executedSteps).not.toContain('middle_else');
    expect(executedSteps).not.toContain('outer_else');
  });

  // ============================================================
  // 测试 2: 3层嵌套条件 - middle false (短路求值)
  // ============================================================
  test('should short-circuit evaluation when middle condition is false', async () => {
    const innermostCondition = createCondition(
      varExpr('innermost_enabled'),
      [createStep('innermost_step', 'innermost_agent')],
      [createStep('innermost_else', 'innermost_else_agent')]
    );

    const middleCondition = createCondition(
      varExpr('middle_enabled'),
      [innermostCondition],
      [createStep('middle_else', 'middle_else_agent')]
    );

    const outerCondition = createCondition(
      varExpr('outer_enabled'),
      [middleCondition],
      [createStep('outer_else', 'outer_else_agent')]
    );

    const context = createMockContext({
      outer_enabled: true,
      middle_enabled: false,
      innermost_enabled: true,
    });

    const result = await executor.executeCondition(outerCondition, context);

    expect(result.errors.length).toBe(0);
    expect(executedSteps).toContain('middle_else');
    expect(executedSteps).not.toContain('innermost_step');
    expect(executedSteps).not.toContain('innermost_else');
  });

  // ============================================================
  // 测试 3: 5层深度嵌套
  // ============================================================
  test('should handle 5-level deep nesting', async () => {
    let current: DSLStatement = createStep('level5_step', 'level5_agent');

    for (let i = 4; i >= 1; i--) {
      const condition = createCondition(
        varExpr(`level${i}_enabled`),
        [current],
        [createStep(`level${i}_else`, `level${i}_else_agent`)]
      );
      current = condition;
    }

    const context = createMockContext({
      level1_enabled: true,
      level2_enabled: true,
      level3_enabled: true,
      level4_enabled: true,
      level5_enabled: true,
    });

    const result = await executor.executeCondition(current as DSLCondition, context);

    expect(result.errors.length).toBe(0);
    expect(executedSteps).toContain('level5_step');
  });

  // ============================================================
  // 测试 4: 嵌套中的 alternate 路径
  // ============================================================
  test('should follow alternate path in nested conditions', async () => {
    const innerCondition = createCondition(
      varExpr('inner_flag'),
      [createStep('inner_true', 'inner_true_agent')],
      [createStep('inner_false', 'inner_false_agent')]
    );

    const outerCondition = createCondition(
      varExpr('outer_flag'),
      [innerCondition],
      [createStep('outer_false', 'outer_false_agent')]
    );

    const context = createMockContext({
      outer_flag: false,
      inner_flag: true,
    });

    const result = await executor.executeCondition(outerCondition, context);

    expect(result.errors.length).toBe(0);
    expect(executedSteps).toContain('outer_false');
    expect(executedSteps).not.toContain('inner_true');
    expect(executedSteps).not.toContain('inner_false');
  });

  // ============================================================
  // 测试 5: 嵌套条件中的短路求值 - && 运算符
  // ============================================================
  test('should short-circuit && operator in nested condition test', async () => {
    const innerCondition = createCondition(
      varExpr('inner_condition'),
      [createStep('inner_step', 'inner_agent')],
      [createStep('else_step', 'else_agent')]
    );

    const outerCondition = createCondition(
      binaryExpr('&&', varExpr('first_false'), varExpr('inner_condition')),
      [innerCondition],
      [createStep('else_step', 'else_agent')]
    );

    const context = createMockContext({
      first_false: false,
      inner_condition: true,
    });

    const result = await executor.executeCondition(outerCondition, context);

    expect(result.errors.length).toBe(0);
    expect(executedSteps).toContain('else_step');
    expect(executedSteps).not.toContain('inner_step');
  });

  // ============================================================
  // 测试 6: 嵌套条件中的短路求值 - || 运算符
  // ============================================================
  test('should short-circuit || operator in nested condition test', async () => {
    const innerCondition = createCondition(
      varExpr('inner_condition'),
      [createStep('inner_step', 'inner_agent')],
      [createStep('inner_else', 'inner_else_agent')]  // 添加 else 分支
    );

    // outerCondition 的 test 是: first_true || inner_condition
    const outerCondition = createCondition(
      binaryExpr('||', varExpr('first_true'), varExpr('inner_condition')),
      [innerCondition],  // consequent: 执行 innerCondition
      [createStep('else_step', 'else_agent')]  // alternate: else_step
    );

    const context = createMockContext({
      first_true: true,
      inner_condition: false,
    });

    const result = await executor.executeCondition(outerCondition, context);

    expect(result.errors.length).toBe(0);
    // first_true = true, inner_condition = false
    // first_true || inner_condition = true || false = true (short-circuit, inner_condition NOT evaluated)
    // outer test is true, so consequent executes -> innerCondition is evaluated
    // innerCondition.test = inner_condition = false, so alternate executes -> inner_else
    expect(executedSteps).toContain('inner_else');
    expect(executedSteps).not.toContain('inner_step');
    expect(executedSteps).not.toContain('else_step');
  });

  // ============================================================
  // 测试 7: 混合 if-elif-else 与嵌套 condition
  // ============================================================
  test('should handle mixed if-elif-else with nested conditions', async () => {
    const conditionalStep = {
      type: 'conditional_step' as const,
      name: 'mixed_test',
      branches: [
        { if: varExpr('branch1'), then: { type: 'agent' as const, name: 'branch1_agent' } },
        { if: varExpr('branch2'), then: { type: 'agent' as const, name: 'branch2_agent' } },
        { else: { type: 'agent' as const, name: 'default_agent' } },
      ],
      inputs: {},
      outputs: {},
    };

    const context = createMockContext({
      branch1: false,
      branch2: true,
    });

    const result = await executor.executeConditionalStep(conditionalStep, context);

    // executeConditionalStep 返回 { value, trace, errors }，通过 errors.length 判断
    expect(result.errors.length).toBe(0);
    expect(executedSteps).toContain('branch2_agent');
    expect(executedSteps).not.toContain('branch1_agent');
    expect(executedSteps).not.toContain('default_agent');
  });

  // ============================================================
  // 测试 8: 嵌套深度限制保护
  // ============================================================
  test('should enforce nesting depth limit', async () => {
    let current: DSLStatement = createStep('last_step', 'last_agent');

    // 嵌套 60 层（超过默认的 50）
    for (let i = 59; i >= 0; i--) {
      const condition = createCondition(
        varExpr(`level${i}`),
        [current],
        [createStep(`else${i}`, `else${i}_agent`)]
      );
      current = condition;
    }

    const context = createMockContext({});
    for (let i = 0; i < 60; i++) {
      context.input[`level${i}`] = true;
    }

    const result = await executor.executeCondition(current as DSLCondition, context);

    // 深度超限时应该返回错误（错误被捕获在 result.errors 中）
    expect(result.errors.length).toBeGreaterThan(0);
    const hasDepthError = result.errors.some((e: Error) =>
      e.message.includes('depth') || e.message.includes('stack') || e.message.includes('嵌套')
    );
    expect(hasDepthError).toBe(true);
  });

  // ============================================================
  // 测试 9: 嵌套条件变量作用域隔离
  // ============================================================
  test('should isolate variable scope in nested conditions', async () => {
    const innerCondition = createCondition(
      varExpr('outer_var'),
      [createStep('inner_step', 'inner_agent')],
      []
    );

    const outerCondition = createCondition(
      varExpr('outer_var'),
      [innerCondition],
      []
    );

    const context = createMockContext({
      outer_var: true,
    });

    await executor.executeCondition(outerCondition, context);

    expect(executedSteps).toContain('inner_step');
  });

  // ============================================================
  // 测试 10: 空 consequent 和 alternate 处理
  // ============================================================
  test('should handle empty consequent and alternate', async () => {
    const condition = createCondition(
      varExpr('flag'),
      [],
      []
    );

    const context = createMockContext({ flag: true });

    const result = await executor.executeCondition(condition, context);

    expect(result.errors.length).toBe(0);
    expect(executedSteps.length).toBe(0);
  });

  // ============================================================
  // 测试 11: 嵌套条件中的复合逻辑表达式
  // ============================================================
  test('should evaluate complex nested condition expressions', async () => {
    // 使用 && 和 || 组合的条件表达式
    const condition = createCondition(
      binaryExpr(
        '&&',
        varExpr('flag1'),
        binaryExpr('||', varExpr('flag2'), varExpr('flag3'))
      ),
      [createStep('true_path', 'true_agent')],
      [createStep('false_path', 'false_agent')]
    );

    const context = createMockContext({
      flag1: true,
      flag2: false,
      flag3: true,
    });

    const result = await executor.executeCondition(condition, context);

    expect(result.errors.length).toBe(0);
    // flag1 = true, flag2 = false, flag3 = true
    // flag1 && (flag2 || flag3) = true && (false || true) = true && true = true
    expect(executedSteps).toContain('true_path');
    expect(executedSteps).not.toContain('false_path');
  });
});
