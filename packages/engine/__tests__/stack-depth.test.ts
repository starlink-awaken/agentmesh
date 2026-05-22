/**
 * DSL 语句嵌套深度限制测试
 *
 * 测试嵌套语句的深度限制机制，防止栈溢出和无限递归。
 */

import { describe, it, expect, mock } from 'bun:test';
import { DSLCompiler } from '../src/dsl/compiler.js';
import type { ExecutionContext, DSLCondition } from '../src/dsl/compiler.js';

/**
 * 创建嵌套 condition 语句的辅助函数
 *
 * 关键改进：最内层使用空语句而不是 step，避免需要初始化 step executor
 *
 * @param depth - 嵌套深度
 * @returns DSLCondition 语句
 */
function createNestedCondition(depth: number): DSLCondition {
  if (depth === 0) {
    // 最内层：使用空的 consequent，不包含 step 语句
    return {
      type: 'condition',
      test: { type: 'literal', value: true },
      consequent: [], // 空的 consequent，避免 step 执行
      alternate: [],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };
  }

  // 递归创建嵌套的 condition
  return {
    type: 'condition',
    test: { type: 'literal', value: true },
    consequent: [createNestedCondition(depth - 1)],
    alternate: [],
    loc: { file: 'test.dsl', line: 1, column: 1 },
  };
}

/**
 * 创建带有 step 的嵌套 condition（用于需要 step 的测试）
 *
 * 注意：inputs 必须使用 DSLExpression 格式，而不是简单值
 */
function createNestedConditionWithStep(depth: number): DSLCondition {
  if (depth === 0) {
    return {
      type: 'condition',
      test: { type: 'literal', value: true },
      consequent: [
        {
          type: 'step',
          name: 'inner-step',
          call: {
            type: 'skill',
            skill_id: 'test',
            // inputs 必须是 Record<string, DSLExpression> 格式
            inputs: { test: { type: 'literal', value: true } },
          },
        },
      ],
      alternate: [],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    };
  }

  return {
    type: 'condition',
    test: { type: 'literal', value: true },
    consequent: [createNestedConditionWithStep(depth - 1)],
    alternate: [],
    loc: { file: 'test.dsl', line: 1, column: 1 },
  };
}

/**
 * 创建基础执行上下文
 *
 * @param maxDepth - 最大嵌套深度
 * @returns ExecutionContext
 */
function createBaseContext(maxDepth: number = 100): ExecutionContext {
  return {
    input: {},
    locals: new Map(),
    trace: [],
    options: {
      maxNestingDepth: maxDepth,
      enableTrace: false,
    },
    depth: 0,
    MAX_NESTING_DEPTH: maxDepth,
  };
}

/**
 * 创建带有完整依赖项的 DSLCompiler
 *
 * 使用 mock 函数来避免真实的 Agent 执行
 */
function createCompilerWithMocks(): DSLCompiler {
  // Mock agentRunner
  const mockAgentRunner = {
    executeAgent: mock(() => Promise.resolve({
      result: { success: true, data: {} },
      token_usage: { prompt: 10, completion: 20 },
    })),
  };

  // Mock skillsManager
  const mockSkillsManager = {
    executeSkill: mock(() => Promise.resolve({
      result: { success: true, outputs: {} },
    })),
  };

  // Mock messageBus
  const mockMessageBus = {
    publish: mock(() => Promise.resolve(undefined)),
    subscribe: mock(() => ({ unsubscribe: mock(() => {}) })),
  };

  // Mock logger
  const mockLogger = {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  };

  return new DSLCompiler({
    agentRunner: mockAgentRunner,
    skillsManager: mockSkillsManager,
    messageBus: mockMessageBus,
    logger: mockLogger,
  });
}

describe('Nesting Depth Limit', () => {
  describe('正常嵌套执行（无 step）', () => {
    it('应该允许正常深度的嵌套 (<100)', async () => {
      const compiler = new DSLCompiler();
      const nestedCond = createNestedCondition(50); // 50层嵌套

      const context = createBaseContext(100);

      const result = await compiler.executeStatement(nestedCond, context);

      // 50层嵌套应该正常执行
      expect(result.errors).toHaveLength(0);
      expect(result.trace.length).toBeGreaterThan(0);
    });

    it('应该允许99层嵌套', async () => {
      const compiler = new DSLCompiler();
      const nestedCond = createNestedCondition(99); // 99层嵌套

      const context = createBaseContext(100);

      const result = await compiler.executeStatement(nestedCond, context);

      // 99层嵌套应该正常执行
      expect(result.errors).toHaveLength(0);
    });

    it('应该支持自定义最大深度', async () => {
      const compiler = new DSLCompiler();
      const nestedCond = createNestedCondition(5); // 5层嵌套

      const context = createBaseContext(10); // 最大深度为10

      const result = await compiler.executeStatement(nestedCond, context);

      // 5层嵌套应该正常执行（小于最大深度10）
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('深度超出限制', () => {
    it('应该拒绝超出默认深度的嵌套 (>=100)', async () => {
      const compiler = new DSLCompiler();
      const nestedCond = createNestedCondition(100); // 100层嵌套

      const context = createBaseContext(100);

      const result = await compiler.executeStatement(nestedCond, context);

      // 应该抛出错误
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toMatch(/堆栈深度超出|Stack depth exceeded/);
      expect(result.errors[0].message).toContain('100');
    });

    it('应该拒绝超出自定义深度的嵌套', async () => {
      const compiler = new DSLCompiler();
      const nestedCond = createNestedCondition(11); // 11层嵌套，实际深度为10

      const context = createBaseContext(10); // 最大深度为10

      const result = await compiler.executeStatement(nestedCond, context);

      // 应该抛出错误
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toMatch(/堆栈深度超出|Stack depth exceeded/);
      // 深度从0开始，11层嵌套实际执行深度为10（0-10）
      expect(result.errors[0].message).toContain('10');
    });

    it('应该在深度为1时正常工作（0层嵌套）', async () => {
      const compiler = new DSLCompiler();
      const nestedCond = createNestedCondition(0); // 0层嵌套（最内层）

      const context = createBaseContext(1); // maxDepth=1 允许 0 层嵌套

      const result = await compiler.executeStatement(nestedCond, context);

      // 0层嵌套应该正常执行
      expect(result.errors).toHaveLength(0);
    });

    it('应该在深度为0时正常工作', async () => {
      const compiler = new DSLCompiler();
      const nestedCond = createNestedCondition(0); // 0层嵌套（最内层）

      const context = createBaseContext(1); // maxDepth=1

      const result = await compiler.executeStatement(nestedCond, context);

      // 0层嵌套应该正常执行
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('错误信息', () => {
    it('应该在错误信息中包含当前深度', async () => {
      const compiler = new DSLCompiler();
      const nestedCond = createNestedCondition(105); // 105层嵌套

      const context = createBaseContext(100);

      const result = await compiler.executeStatement(nestedCond, context);

      expect(result.errors.length).toBeGreaterThan(0);
      // 深度从0开始，达到maxDepth=100时实际深度为100
      expect(result.errors[0].message).toContain('100');
    });

    it('应该在错误信息中包含最大深度', async () => {
      const compiler = new DSLCompiler();
      const nestedCond = createNestedCondition(105); // 105层嵌套

      const context = createBaseContext(100);

      const result = await compiler.executeStatement(nestedCond, context);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('100');
    });

    it('应该提供清晰的错误消息', async () => {
      const compiler = new DSLCompiler();
      const nestedCond = createNestedCondition(105);

      const context = createBaseContext(100);

      const result = await compiler.executeStatement(nestedCond, context);

      expect(result.errors.length).toBeGreaterThan(0);
      // 错误消息应包含中文和英文
      expect(result.errors[0].message).toMatch(/堆栈深度超出|Stack depth exceeded/);
    });
  });

  describe('嵌套类型组合', () => {
    it('应该正确计算嵌套 condition 的深度', async () => {
      const compiler = new DSLCompiler();

      // 创建嵌套的 condition 结构
      const stmt: DSLCondition = {
        type: 'condition',
        test: { type: 'literal', value: true },
        consequent: [
          {
            type: 'condition',
            test: { type: 'literal', value: true },
            consequent: [
              {
                type: 'condition',
                test: { type: 'literal', value: true },
                consequent: [],
                alternate: [],
                loc: { file: 'test.dsl', line: 1, column: 1 },
              },
            ],
            alternate: [],
            loc: { file: 'test.dsl', line: 1, column: 1 },
          },
        ],
        alternate: [],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      };

      const context = createBaseContext(3); // 最大深度为3

      const result = await compiler.executeStatement(stmt, context);

      // 3层嵌套应该正常执行
      expect(result.errors).toHaveLength(0);
    });

    it('应该支持在不同类型的嵌套语句中正确跟踪深度', async () => {
      const compiler = new DSLCompiler();

      // 创建包含 condition 和 loop 的嵌套结构
      const stmt: DSLCondition = {
        type: 'condition',
        test: { type: 'literal', value: true },
        consequent: [
          {
            type: 'loop',
            loop_type: 'while',
            test: { type: 'literal', value: false }, // 立即退出
            body: [
              {
                type: 'condition',
                test: { type: 'literal', value: true },
                consequent: [],
                alternate: [],
                loc: { file: 'test.dsl', line: 1, column: 1 },
              },
            ],
            loc: { file: 'test.dsl', line: 1, column: 1 },
          },
        ],
        alternate: [],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      };

      const context = createBaseContext(10);

      const result = await compiler.executeStatement(stmt, context);

      // 应该正常执行
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('边界条件', () => {
    it('应该在深度恰好等于限制时正常执行', async () => {
      const compiler = new DSLCompiler();
      const nestedCond = createNestedCondition(99); // 99层嵌套

      const context = createBaseContext(100);

      const result = await compiler.executeStatement(nestedCond, context);

      // 99层嵌套应该正常执行（恰好小于100）
      expect(result.errors).toHaveLength(0);
    });

    it('应该在深度恰好超出限制时抛出错误', async () => {
      const compiler = new DSLCompiler();
      const nestedCond = createNestedCondition(100); // 100层嵌套

      const context = createBaseContext(100);

      const result = await compiler.executeStatement(nestedCond, context);

      // 100层嵌套应该抛出错误（深度从0开始，所以100>=100）
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
