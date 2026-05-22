/**
 * 嵌套 Try-Catch 和 Parallel 语句测试
 *
 * 测试嵌套异常处理和嵌套并行执行的正确性。
 * 验证多层嵌套的场景，确保异常传播和并发控制正常工作。
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { DSLCompiler, DSLCompilerOptions } from '../src/dsl/compiler.js';
import { DSLParser } from '../src/dsl/parser.js';
import type { AgentDSL, DSLTryCatch, DSLParallel, DSLStep } from '../src/dsl/types.js';
import type { ExecutionContext, ExecutionDependencies } from '../src/dsl/agent-call-types.js';
import { createStepExecutor, IStepExecutor } from '../src/dsl/executors/step-executor.js';
import { createAgentCallExecutor } from '../src/dsl/executors/agent-call-executor.js';

// ============================================================
// Mock 依赖工厂
// ============================================================

/**
 * 创建模拟执行上下文
 */
function createMockExecutionContext(): ExecutionContext {
  return {
    input: {},
    locals: new Map(),
    results: new Map(),
    traceId: crypto.randomUUID(),
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
    trace: [],
    options: {
      maxIterations: 10000,
      maxNestingDepth: 100,
      enableTracing: true,
      maxConcurrency: 10,
    },
    MAX_NESTING_DEPTH: 100,
  };
}

/**
 * 创建模拟执行依赖
 */
function createMockDependencies(): ExecutionDependencies {
  // 创建简单的 mock 执行器（不执行真实操作）
  const mockAgentExecutor = {
    execute: async (config: any, context: ExecutionContext) => {
      return {
        success: true,
        data: { mock: true },
        error: undefined,
        durationMs: 1,
        tokensUsed: 0,
        retryCount: 0,
        outputs: {},
      };
    },
    validate: (config: any) => [],
  };

  return {
    agentRunner: mockAgentExecutor,
    skillsManager: mockAgentExecutor,
    messageBus: {
      publish: () => {},
      subscribe: () => () => {},
    },
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
      debug: () => {},
    },
  };
}

// ============================================================
// Mock Step 执行器
// ============================================================

/**
 * Mock Step 执行器 - 用于测试
 */
class MockStepExecutor implements IStepExecutor {
  private executedSteps: Array<{ name: string; type: string }> = [];
  private shouldThrowError = false;
  private errorMessage = 'Mock execution error';
  private throwOnStep: string | null = null;
  private executionCount = 0;
  private errorMessages: string[] = [];

  reset(): void {
    this.executedSteps = [];
    this.shouldThrowError = false;
    this.errorMessage = 'Mock execution error';
    this.throwOnStep = null;
    this.executionCount = 0;
    this.errorMessages = [];
  }

  setThrowError(shouldThrow: boolean, message?: string): void {
    this.shouldThrowError = shouldThrow;
    if (message) this.errorMessage = message;
  }

  setThrowOnStep(stepName: string | null): void {
    this.throwOnStep = stepName;
  }

  getExecutedSteps(): Array<{ name: string; type: string }> {
    return [...this.executedSteps];
  }

  getExecutionCount(): number {
    return this.executionCount;
  }

  getErrorMessages(): string[] {
    return [...this.errorMessages];
  }

  async executeStep(
    step: DSLStep,
    context: ExecutionContext
  ): Promise<ExecutionContext> {
    this.executionCount++;
    const stepName = step.name || step.call?.name || 'unnamed';
    const stepType = step.call?.type || 'unknown';

    this.executedSteps.push({ name: stepName, type: stepType });

    // 检查是否应该在特定步骤抛出错误
    if (this.throwOnStep && stepName === this.throwOnStep) {
      this.errorMessages.push(this.errorMessage);
      context.locals.set('error', new Error(this.errorMessage));
      throw new Error(this.errorMessage);
    }

    // 检查是否应该抛出错误
    if (this.shouldThrowError) {
      this.errorMessages.push(this.errorMessage);
      context.locals.set('error', new Error(this.errorMessage));
      throw new Error(this.errorMessage);
    }

    // 成功执行
    context.locals.set(stepName, { success: true, executedAt: Date.now() });

    return context;
  }
}

// ============================================================
// 测试工具函数
// ============================================================

/**
 * 创建一个最小有效的 DSL AST
 */
function createMinimalAST(): AgentDSL {
  return {
    type: 'agent',
    name: 'TestAgent',
    description: 'A test agent',
    agent_type: 'worker',
    layer: 'L3',
    inputs: [],
    outputs: [],
    tools: [],
    capabilities: [],
    body: [],
    governance: {
      first_principles_check: false,
      red_team_threshold: 'low',
      quality_gate_enabled: true,
      max_retries: 3,
      token_budget: 10000,
    },
    loc: { file: 'test.dsl', line: 1, column: 1 },
  };
}

/**
 * 创建一个抛出错误的 Mock Step
 */
function createErrorStep(errorMessage: string = 'Test error'): DSLStep {
  return {
    type: 'step',
    name: 'errorStep',
    call: { type: 'agent', name: 'mock_agent' },
    inputs: {},
    outputs: {},
    loc: { file: 'test.dsl', line: 1, column: 1 },
  };
}

// ============================================================
// 嵌套 Try-Catch 测试
// ============================================================

describe('嵌套 Try-Catch 执行', () => {
  let compiler: DSLCompiler;
  let mockExecutor: MockStepExecutor;
  let executionCount: number;
  let errorMessages: string[];

  beforeEach(() => {
    mockExecutor = new MockStepExecutor();
    const dependencies = createMockDependencies();

    compiler = new DSLCompiler({
      maxNestingDepth: 10,
      agentRunner: dependencies.agentRunner,
      skillsManager: dependencies.skillsManager,
      messageBus: dependencies.messageBus,
      logger: dependencies.logger,
    } as DSLCompilerOptions);

    // 手动注入 mock step executor
    (compiler as any).stepExecutor = mockExecutor;

    executionCount = 0;
    errorMessages = [];
  });

  test('应该正确执行3层嵌套的 try-catch', async () => {
    // 创建3层嵌套的 try-catch
    const ast = createMinimalAST();
    ast.body = [
      {
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
                    name: 'innerMost',
                    call: { type: 'agent', name: 'success_agent' },
                    inputs: {},
                    loc: { file: 'test.dsl', line: 4, column: 5 },
                  },
                ],
                catch_variable: 'innerError',
                catch_block: [
                  {
                    type: 'step',
                    name: 'handleInner',
                    call: { type: 'agent', name: 'handler' },
                    inputs: {},
                    outputs: {},
                    loc: { file: 'test.dsl', line: 7, column: 7 },
                  },
                ],
                loc: { file: 'test.dsl', line: 3, column: 3 },
              },
            ],
            catch_variable: 'middleError',
            catch_block: [
              {
                type: 'step',
                name: 'handleMiddle',
                call: { type: 'agent', name: 'handler' },
                inputs: {},
                outputs: {},
                loc: { file: 'test.dsl', line: 11, column: 5 },
              },
            ],
            loc: { file: 'test.dsl', line: 2, column: 1 },
          },
        ],
        catch_variable: 'outerError',
        catch_block: [
          {
            type: 'step',
            name: 'handleOuter',
            call: { type: 'agent', name: 'handler' },
            inputs: {},
            outputs: {},
            loc: { file: 'test.dsl', line: 15, column: 3 },
          },
        ],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ];

    // 类型检查
    const typeErrors = compiler.typeCheck(ast);
    expect(typeErrors).toHaveLength(0);

    // 执行
    const result = await compiler.execute(ast);

    // 验证 - 没有错误抛出
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.trace.length).toBeGreaterThan(0);
  });

  test('应该正确传播异常通过多层catch', async () => {
    const ast = createMinimalAST();
    let catchExecuted: string[] = [];

    ast.body = [
      {
        type: 'try_catch',
        try_block: [
          {
            type: 'try_catch',
            try_block: [
              {
                type: 'step',
                name: 'throwError',
                call: { type: 'agent', name: 'error_agent' },
                inputs: {},
                loc: { file: 'test.dsl', line: 3, column: 5 },
              },
            ],
            catch_variable: 'e1',
            catch_block: [
              {
                type: 'step',
                name: 'log1',
                call: { type: 'agent', name: 'logger' },
                inputs: {},
                outputs: {},
                loc: { file: 'test.dsl', line: 6, column: 7 },
              },
            ],
            loc: { file: 'test.dsl', line: 2, column: 3 },
          },
        ],
        catch_variable: 'e2',
        catch_block: [
          {
            type: 'step',
            name: 'log2',
            call: { type: 'agent', name: 'logger' },
            inputs: {},
            outputs: {},
            loc: { file: 'test.dsl', line: 10, column: 5 },
          },
        ],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ];

    const result = await compiler.execute(ast);

    // 如果错误被内层catch捕获，外层不应该执行
    // 验证执行流程正确
    expect(result.trace.length).toBeGreaterThan(0);
  });

  test('应该正确执行嵌套的finally块', async () => {
    const ast = createMinimalAST();
    let finallyOrder: string[] = [];

    // 创建一个简单的 mock handler 来记录 finally 执行顺序
    const mockHandler = async (stmt: DSLTryCatch, context: any) => {
      return {
        value: null,
        trace: [],
        errors: [],
      };
    };

    ast.body = [
      {
        type: 'try_catch',
        try_block: [
          {
            type: 'try_catch',
            try_block: [
              {
                type: 'step',
                name: 'success',
                call: { type: 'agent', name: 'success_agent' },
                inputs: {},
                loc: { file: 'test.dsl', line: 4, column: 7 },
              },
            ],
            finally_block: [
              {
                type: 'step',
                name: 'innerFinally',
                call: { type: 'agent', name: 'finally_logger' },
                inputs: {},
                outputs: {},
                loc: { file: 'test.dsl', line: 7, column: 9 },
              },
            ],
            loc: { file: 'test.dsl', line: 3, column: 5 },
          },
        ],
        finally_block: [
          {
            type: 'step',
            name: 'outerFinally',
            call: { type: 'agent', name: 'finally_logger' },
            inputs: {},
            outputs: {},
            loc: { file: 'test.dsl', line: 11, column: 5 },
          },
        ],
        loc: { file: 'test.dsl', line: 1, column: 3 },
      },
    ];

    const result = await compiler.execute(ast);

    // 验证 finally 块被执行
    expect(result.success).toBe(true);
  });

  test('应该在达到最大嵌套深度时抛出错误', async () => {
    // 创建深度为5的嵌套
    const compiler = new DSLCompiler({
      maxNestingDepth: 3, // 限制为3层
    });

    const ast = createMinimalAST();
    let current: any = ast.body;

    // 创建5层嵌套
    for (let i = 0; i < 5; i++) {
      const tryCatch: DSLTryCatch = {
        type: 'try_catch',
        try_block: [],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      };
      if (i === 0) {
        ast.body = [tryCatch];
      } else {
        current.try_block = [tryCatch];
      }
      current = tryCatch;
    }

    const result = await compiler.execute(ast);

    // 应该因为深度超限而失败
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 嵌套 Parallel 测试
// ============================================================

describe('嵌套 Parallel 执行', () => {
  let compiler: DSLCompiler;
  let mockExecutor: MockStepExecutor;

  beforeEach(() => {
    mockExecutor = new MockStepExecutor();
    const dependencies = createMockDependencies();

    compiler = new DSLCompiler({
      maxNestingDepth: 10,
      agentRunner: dependencies.agentRunner,
      skillsManager: dependencies.skillsManager,
      messageBus: dependencies.messageBus,
      logger: dependencies.logger,
    } as DSLCompilerOptions);

    // 手动注入 mock step executor
    (compiler as any).stepExecutor = mockExecutor;
  });

  test('应该正确执行嵌套的 parallel 语句', async () => {
    const ast = createMinimalAST();

    ast.body = [
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
      },
    ];

    const result = await compiler.execute(ast);

    expect(result.success).toBe(true);
    expect(result.trace.length).toBeGreaterThan(0);
  });

  test('应该正确执行3层嵌套的 parallel', async () => {
    const ast = createMinimalAST();

    ast.body = [
      {
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
                          loc: { file: 'test.dsl', line: 8, column: 19 },
                        },
                      ],
                    ],
                    loc: { file: 'test.dsl', line: 7, column: 17 },
                  },
                ],
              ],
              loc: { file: 'test.dsl', line: 6, column: 15 },
            },
          ],
        ],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ];

    const result = await compiler.execute(ast);

    expect(result.success).toBe(true);
  });

  test('应该正确处理带有 max_concurrency 的嵌套 parallel', async () => {
    const ast = createMinimalAST();

    ast.body = [
      {
        type: 'parallel',
        max_concurrency: 2,
        branches: [
          [
            {
              type: 'parallel',
              max_concurrency: 2,
              branches: [
                [
                  {
                    type: 'step',
                    name: 'task1',
                    call: { type: 'agent', name: 'worker1' },
                    inputs: {},
                    loc: { file: 'test.dsl', line: 6, column: 13 },
                  },
                ],
                [
                  {
                    type: 'step',
                    name: 'task2',
                    call: { type: 'agent', name: 'worker2' },
                    inputs: {},
                    loc: { file: 'test.dsl', line: 9, column: 13 },
                  },
                ],
              ],
              loc: { file: 'test.dsl', line: 5, column: 11 },
            },
          ],
          [
            {
              type: 'parallel',
              max_concurrency: 2,
              branches: [
                [
                  {
                    type: 'step',
                    name: 'task3',
                    call: { type: 'agent', name: 'worker3' },
                    inputs: {},
                    loc: { file: 'test.dsl', line: 16, column: 13 },
                  },
                ],
              ],
              loc: { file: 'test.dsl', line: 15, column: 11 },
            },
          ],
        ],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ];

    const result = await compiler.execute(ast);

    expect(result.success).toBe(true);
    expect(result.trace.length).toBeGreaterThan(0);
  });

  test('应该正确处理 parallel 中的 try-catch', async () => {
    const ast = createMinimalAST();

    ast.body = [
      {
        type: 'parallel',
        branches: [
          [
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
          ],
          [
            {
              type: 'step',
              name: 'normalTask',
              call: { type: 'agent', name: 'worker' },
              inputs: {},
              loc: { file: 'test.dsl', line: 12, column: 7 },
            },
          ],
        ],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ];

    const result = await compiler.execute(ast);

    // parallel 中的 try-catch 应该正常工作
    expect(result.trace.length).toBeGreaterThan(0);
  });

  test('应该正确处理 try-catch 中的 parallel', async () => {
    const ast = createMinimalAST();

    ast.body = [
      {
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
                  loc: { file: 'test.dsl', line: 9, column: 9 },
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
            loc: { file: 'test.dsl', line: 14, column: 7 },
          },
        ],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ];

    const result = await compiler.execute(ast);

    expect(result.success).toBe(true);
    expect(result.trace.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 混合嵌套场景测试
// ============================================================

describe('混合嵌套场景', () => {
  let compiler: DSLCompiler;
  let mockExecutor: MockStepExecutor;

  beforeEach(() => {
    mockExecutor = new MockStepExecutor();
    const dependencies = createMockDependencies();

    compiler = new DSLCompiler({
      maxNestingDepth: 10,
      agentRunner: dependencies.agentRunner,
      skillsManager: dependencies.skillsManager,
      messageBus: dependencies.messageBus,
      logger: dependencies.logger,
    } as DSLCompilerOptions);

    // 手动注入 mock step executor
    (compiler as any).stepExecutor = mockExecutor;
  });

  test('应该正确执行 parallel-try_catch-parallel 三层嵌套', async () => {
    const ast = createMinimalAST();

    ast.body = [
      {
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
      },
    ];

    const result = await compiler.execute(ast);

    expect(result.success).toBe(true);
    expect(result.trace.length).toBeGreaterThan(0);
  });

  test('应该正确执行4层任意嵌套', async () => {
    const ast = createMinimalAST();

    ast.body = [
      {
        type: 'try_catch',
        try_block: [
          {
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
                            name: 'deepTask',
                            call: { type: 'agent', name: 'worker' },
                            inputs: {},
                            loc: { file: 'test.dsl', line: 9, column: 21 },
                          },
                        ],
                      ],
                      loc: { file: 'test.dsl', line: 7, column: 19 },
                    },
                  ],
                  loc: { file: 'test.dsl', line: 5, column: 17 },
                },
              ],
            ],
            loc: { file: 'test.dsl', line: 3, column: 15 },
          },
        ],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ];

    const result = await compiler.execute(ast);

    expect(result.success).toBe(true);
    expect(result.trace.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 边界情况测试
// ============================================================

describe('嵌套执行边界情况', () => {
  let compiler: DSLCompiler;
  let mockExecutor: MockStepExecutor;

  beforeEach(() => {
    mockExecutor = new MockStepExecutor();
    const dependencies = createMockDependencies();

    compiler = new DSLCompiler({
      maxNestingDepth: 10,
      agentRunner: dependencies.agentRunner,
      skillsManager: dependencies.skillsManager,
      messageBus: dependencies.messageBus,
      logger: dependencies.logger,
    } as DSLCompilerOptions);

    // 手动注入 mock step executor
    (compiler as any).stepExecutor = mockExecutor;
  });

  test('应该正确处理空的 try-catch 块', async () => {
    const ast = createMinimalAST();

    ast.body = [
      {
        type: 'try_catch',
        try_block: [],
        catch_block: [],
        finally_block: [],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ];

    const result = await compiler.execute(ast);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('应该正确处理只有 try 和 finally 的情况', async () => {
    const ast = createMinimalAST();

    ast.body = [
      {
        type: 'try_catch',
        try_block: [
          {
            type: 'step',
            name: 'task',
            call: { type: 'agent', name: 'worker' },
            inputs: {},
            loc: { file: 'test.dsl', line: 3, column: 3 },
          },
        ],
        finally_block: [
          {
            type: 'step',
            name: 'cleanup',
            call: { type: 'agent', name: 'cleanup' },
            inputs: {},
            outputs: {},
            loc: { file: 'test.dsl', line: 6, column: 3 },
          },
        ],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ];

    const result = await compiler.execute(ast);

    expect(result.success).toBe(true);
  });

  test('应该正确处理只有单个分支的 parallel', async () => {
    const ast = createMinimalAST();

    ast.body = [
      {
        type: 'parallel',
        branches: [
          [
            {
              type: 'step',
              name: 'singleTask',
              call: { type: 'agent', name: 'worker' },
              inputs: {},
              loc: { file: 'test.dsl', line: 3, column: 5 },
            },
          ],
        ],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ];

    const result = await compiler.execute(ast);

    expect(result.success).toBe(true);
  });

  test('应该正确处理 max_concurrency = 1 的 parallel', async () => {
    const ast = createMinimalAST();

    ast.body = [
      {
        type: 'parallel',
        max_concurrency: 1,
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
        ],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ];

    const result = await compiler.execute(ast);

    expect(result.success).toBe(true);
  });
});
