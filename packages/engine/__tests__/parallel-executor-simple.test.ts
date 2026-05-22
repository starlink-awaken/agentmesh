/**
 * Honeycomb DSL - Parallel Executor 简单测试
 *
 * 快速验证基本功能
 */

import { test, expect } from 'bun:test';
import type {
  DSLParallel,
  DSLCall,
  DSLStatement,
} from '../src/dsl/types.js';
import type { ExecutionContext, ExecutionDependencies, ExecutionResult } from '../src/dsl/agent-call-types.js';
import { ParallelExecutor } from '../src/dsl/executors/parallel-executor.js';

// ============================================================
// Mock 依赖
// ============================================================

function createMockContext(
  input: Record<string, unknown> = {},
  depth: number = 0
): ExecutionContext {
  return {
    input,
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

class MockStatementExecutor {
  public executionCount: number = 0;

  async executeStatement(
    stmt: DSLStatement,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    this.executionCount++;
    return {
      success: true,
      value: { result: `executed-depth-${context.depth}` },
      trace: [],
      errors: [],
    };
  }

  reset(): void {
    this.executionCount = 0;
  }
}

// ============================================================
// 基本测试
// ============================================================

test('应该正确执行单个分支', async () => {
  const mockExecutor = new MockStatementExecutor();
  const mockDependencies = createMockDependencies();
  const parallelExecutor = new ParallelExecutor(
    mockDependencies,
    mockExecutor,
    {
      maxConcurrency: 3,
      maxNestingDepth: 10,
      enableTracing: false,
      enableLogging: false,
    }
  );

  const callStmt: DSLCall = {
    type: 'call',
    name: 'step1',
    agent: 'agent1',
    input: {},
  };

  const parallelStmt: DSLParallel = {
    type: 'parallel',
    branches: [[callStmt]],
    loc: { file: 'test.dsl', line: 1, column: 1 },
  };

  const context = createMockContext();
  const result = await parallelExecutor.execute(parallelStmt, context);

  expect(result.success).toBe(true);
  expect(result.errors).toHaveLength(0);
  expect(mockExecutor.executionCount).toBe(1);
});

test('应该正确执行多个分支（无并发限制）', async () => {
  const mockExecutor = new MockStatementExecutor();
  const mockDependencies = createMockDependencies();
  const parallelExecutor = new ParallelExecutor(
    mockDependencies,
    mockExecutor,
    {
      maxNestingDepth: 10,
      enableTracing: false,
      enableLogging: false,
    }
  );

  const parallelStmt: DSLParallel = {
    type: 'parallel',
    branches: [
      [{ type: 'call', name: 'step1', agent: 'agent1', input: {} }],
      [{ type: 'call', name: 'step2', agent: 'agent2', input: {} }],
      [{ type: 'call', name: 'step3', agent: 'agent3', input: {} }],
    ],
    loc: { file: 'test.dsl', line: 1, column: 1 },
  };

  const context = createMockContext();
  const result = await parallelExecutor.execute(parallelStmt, context);

  expect(result.success).toBe(true);
  expect(result.errors).toHaveLength(0);
  expect(mockExecutor.executionCount).toBe(3);
});

test('应该拒绝超过最大嵌套深度的执行', async () => {
  const mockExecutor = new MockStatementExecutor();
  const mockDependencies = createMockDependencies();
  const parallelExecutor = new ParallelExecutor(
    mockDependencies,
    mockExecutor,
    {
      maxNestingDepth: 5,
      enableTracing: false,
      enableLogging: false,
    }
  );

  const parallelStmt: DSLParallel = {
    type: 'parallel',
    branches: [[{ type: 'call', name: 'step1', agent: 'agent1', input: {} }]],
    loc: { file: 'test.dsl', line: 1, column: 1 },
  };

  const context = createMockContext({}, 5); // 深度等于最大深度
  const result = await parallelExecutor.execute(parallelStmt, context);

  expect(result.success).toBe(false);
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0].message).toContain('Maximum nesting depth');
});
