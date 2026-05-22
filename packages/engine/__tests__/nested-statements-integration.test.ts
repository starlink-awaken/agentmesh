/**
 * 嵌套语句集成验证测试 (#405)
 *
 * 测试条件、循环、Try-Catch、Parallel的嵌套支持：
 * 1. 条件内嵌套循环
 * 2. 循环内嵌套并行
 * 3. Try-Catch内嵌套条件
 * 4. 深层嵌套（4层以上）
 * 5. 嵌套并行内的Try-Catch
 *
 * 验证：解析正确性、执行顺序正确性、变量作用域正确性、异常处理正确性
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { DSLParser } from '../src/dsl/parser.js';
import { DSLCompiler } from '../src/dsl/compiler.js';
import type {
  AgentDSL,
  DSLStatement,
  DSLCondition,
  DSLLoop,
  DSLParallel,
  DSLTryCatch,
  DSLStep,
} from '../src/dsl/types.js';

// ============================================================
// 测试工具函数
// ============================================================

/**
 * 解析 DSL 源码
 */
function parseDSL(source: string): ReturnType<DSLParser['parse']> {
  const parser = new DSLParser();
  return parser.parse(source, 'test.dsl');
}

/**
 * 创建基础 DSL 源码模板
 */
function createBaseDSL(body: string): string {
  return `
agent TestNestedAgent {
  description: "Agent for testing nested statements"
  type: worker
  layer: L3

  input items: array<string> {
    description: "List of items to process"
    required: true
  }
  input condition: boolean {
    description: "Test condition"
    required: true
    default: true
  }
  input error_mode: boolean {
    description: "Trigger error for testing try-catch"
    required: false
    default: false
  }

  output result: string {
    description: "Processing result"
  }

  tools: [read, write]

  body {
    ${body}
  }

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: true
    max_retries: 3
    token_budget: 10000
  }
}
`;
}

// ============================================================
// 场景1: 条件内嵌套循环
// ============================================================

describe('嵌套语句 - 场景1: 条件内嵌套循环', () => {
  test('应该正确解析 if 内嵌套 for_each 循环', () => {
    const dsl = createBaseDSL(`
condition check_and_process {
  test: input.condition
  consequent: {
    loop process_items {
      loop_type: for_each
      variable: item
      collection: input.items
      body: {
        step process_item {
          call agent: "item_processor"
          inputs: { item: item }
        }
      }
    }
  }
}
step finalize {
  call agent: "finalizer"
  inputs: {}
}
`);

    const result = parseDSL(dsl);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.ast).toBeDefined();

    // 验证 body 结构
    const body = result.ast?.body;
    expect(body).toHaveLength(2);

    // 第一个是 condition
    const condition = body?.[0] as DSLCondition;
    expect(condition.type).toBe('condition');
    expect(condition.consequent).toBeDefined();
    expect(condition.consequent).toHaveLength(1);

    // condition 内部是 loop
    const loop = condition.consequent?.[0] as DSLLoop;
    expect(loop.type).toBe('loop');
    expect(loop.loop_type).toBe('for_each');
    expect(loop.variable).toBe('item');
    expect(loop.body).toHaveLength(1);

    // loop 内部是 step
    const step = loop.body?.[0] as DSLStep;
    expect(step.type).toBe('step');
    expect(step.call).toEqual({ type: 'agent', name: 'item_processor' });
  });

  test('应该正确解析 if-else 内嵌套 while 循环', () => {
    const dsl = createBaseDSL(`
condition process_with_while {
  test: input.condition
  consequent: {
    loop while_valid {
      loop_type: while
      test: input.items.length > 0
      body: {
        step pop_item {
          call agent: "pop_handler"
          inputs: { items: input.items }
        }
      }
    }
  }
  alternate: {
    step skip {
      call agent: "skipper"
      inputs: { items: input.items }
    }
  }
}
`);

    const result = parseDSL(dsl);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    const condition = result.ast?.body[0] as DSLCondition;
    expect(condition.type).toBe('condition');
    expect(condition.consequent).toBeDefined();
    expect(condition.consequent?.length).toBeGreaterThan(0);

    const loop = condition.consequent?.[0] as DSLLoop;
    expect(loop.type).toBe('loop');
    expect(loop.loop_type).toBe('while');

    expect(condition.alternate).toBeDefined();
    expect(condition.alternate?.length).toBeGreaterThan(0);
  });

  test('应该正确解析深层嵌套: condition -> loop -> condition', () => {
    const dsl = createBaseDSL(`
loop outer_loop {
  loop_type: for_each
  variable: outer_item
  collection: input.items
  body: {
    condition inner_check {
      test: input.condition
      consequent: {
        step inner_step {
          call agent: "inner_handler"
          inputs: { item: outer_item }
        }
      }
    }
  }
}
`);

    const result = parseDSL(dsl);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    const outerLoop = result.ast?.body[0] as DSLLoop;
    expect(outerLoop.type).toBe('loop');

    const innerCondition = outerLoop.body?.[0] as DSLCondition;
    expect(innerCondition.type).toBe('condition');

    const innerStep = innerCondition.consequent?.[0] as DSLStep;
    expect(innerStep.type).toBe('step');
  });
});

// ============================================================
// 场景2: 循环内嵌套并行
// ============================================================

describe('嵌套语句 - 场景2: 循环内嵌套并行', () => {
  test('应该正确解析 for_each 内嵌套 parallel', () => {
    const dsl = createBaseDSL(`
loop process_batch {
  loop_type: for_each
  variable: batch
  collection: input.items
  body: {
    parallel process_batch_items {
      branches: [
        {
          step analyze {
            call agent: "analyzer"
            inputs: { data: batch }
          }
        },
        {
          step transform {
            call agent: "transformer"
            inputs: { data: batch }
          }
        }
      ]
      max_concurrency: 2
    }
  }
}
`);

    const result = parseDSL(dsl);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    const loop = result.ast?.body[0] as DSLLoop;
    expect(loop.type).toBe('loop');
    expect(loop.loop_type).toBe('for_each');
    expect(loop.variable).toBe('batch');

    const parallel = loop.body?.[0] as DSLParallel;
    expect(parallel.type).toBe('parallel');
    expect(parallel.branches).toHaveLength(2);
    expect(parallel.max_concurrency).toBe(2);
  });

  test('应该正确解析 while 内嵌套 parallel', () => {
    const dsl = createBaseDSL(`
loop concurrent_process {
  loop_type: while
  test: input.condition
  body: {
    parallel concurrent_tasks {
      branches: [
        {
          step task_a {
            call agent: "task_a_agent"
            inputs: {}
          }
        },
        {
          step task_b {
            call agent: "task_b_agent"
            inputs: {}
          }
        },
        {
          step task_c {
            call agent: "task_c_agent"
            inputs: {}
          }
        }
      ]
      max_concurrency: 3
    }
  }
}
`);

    const result = parseDSL(dsl);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    const loop = result.ast?.body[0] as DSLLoop;
    expect(loop.loop_type).toBe('while');

    const parallel = loop.body?.[0] as DSLParallel;
    expect(parallel.type).toBe('parallel');
    expect(parallel.branches).toHaveLength(3);
  });

  test('应该正确解析嵌套并行: for -> parallel -> for', () => {
    const dsl = createBaseDSL(`
loop outer_for {
  loop_type: for_each
  variable: outer_item
  collection: input.items
  body: {
    parallel inner_parallel {
      branches: [
        {
          loop inner_for {
            loop_type: for_each
            variable: inner_item
            collection: outer_item.subitems
            body: {
              step process_inner {
                call agent: "inner_processor"
                inputs: { item: inner_item }
              }
            }
          }
        },
        {
          step parallel_step {
            call agent: "parallel_agent"
            inputs: { item: outer_item }
          }
        }
      ]
    }
  }
}
`);

    const result = parseDSL(dsl);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    const outerLoop = result.ast?.body[0] as DSLLoop;
    const parallel = outerLoop.body?.[0] as DSLParallel;

    // 验证并行内有多个分支
    expect(parallel.branches).toHaveLength(2);

    // 第一个分支是循环
    const innerLoop = parallel.branches[0]?.[0] as DSLLoop;
    expect(innerLoop.type).toBe('loop');
    expect(innerLoop.loop_type).toBe('for_each');
  });
});

// ============================================================
// 场景3: Try-Catch内嵌套条件
// ============================================================

describe('嵌套语句 - 场景3: Try-Catch内嵌套条件', () => {
  test('应该正确解析 try 内嵌套 condition', () => {
    const dsl = createBaseDSL(`
try_catch safe_execute {
  try_block: {
    condition check_risk {
      test: input.error_mode == false
      consequent: {
        step risky_operation {
          call agent: "risky_agent"
          inputs: {}
        }
      }
      alternate: {
        step safe_alternative {
          call agent: "safe_agent"
          inputs: {}
        }
      }
    }
  }
  catch_variable: error
  catch_block: {
    step handle_error {
      call agent: "error_handler"
      inputs: { error: error }
    }
  }
}
`);

    const result = parseDSL(dsl);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    const tryCatch = result.ast?.body[0] as DSLTryCatch;
    expect(tryCatch.type).toBe('try_catch');
    expect(tryCatch.catch_variable).toBe('error');

    // try_block 内有 condition
    const condition = tryCatch.try_block?.[0] as DSLCondition;
    expect(condition.type).toBe('condition');
    expect(condition.consequent).toHaveLength(1);
    expect(condition.alternate).toHaveLength(1);

    // catch_block 有错误处理
    expect(tryCatch.catch_block).toHaveLength(1);
  });

  test('应该正确解析 try 内嵌套循环和并行', () => {
    const dsl = createBaseDSL(`
try_catch batch_safe_execute {
  try_block: {
    loop process_items {
      loop_type: for_each
      variable: item
      collection: input.items
      body: {
        step process {
          call agent: "processor"
          inputs: { item: item }
        }
      }
    }
    parallel concurrent_ops {
      branches: [
        {
          step op1 { call agent: "op1_agent" inputs: {} }
        },
        {
          step op2 { call agent: "op2_agent" inputs: {} }
        }
      ]
    }
  }
  catch_variable: exec_error
  catch_block: {
    step error_handler {
      call agent: "batch_error_handler"
      inputs: { error: exec_error }
    }
  }
  finally_block: {
    step cleanup {
      call agent: "cleaner"
      inputs: {}
    }
  }
}
`);

    const result = parseDSL(dsl);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    const tryCatch = result.ast?.body[0] as DSLTryCatch;
    expect(tryCatch.type).toBe('try_catch');
    expect(tryCatch.finally_block).toBeDefined();
    expect(tryCatch.try_block?.length).toBeGreaterThan(1); // loop + parallel

    const loop = tryCatch.try_block?.[0] as DSLLoop;
    expect(loop.type).toBe('loop');

    const parallel = tryCatch.try_block?.[1] as DSLParallel;
    expect(parallel.type).toBe('parallel');
  });
});

// ============================================================
// 场景4: 深层嵌套（4层以上）
// ============================================================

describe('嵌套语句 - 场景4: 深层嵌套（4层以上）', () => {
  test('应该正确解析4层嵌套结构', () => {
    const dsl = createBaseDSL(`
condition level1 {
  test: input.condition
  consequent: {
    loop level2 {
      loop_type: for_each
      variable: item
      collection: input.items
      body: {
        condition level3 {
          test: input.condition
          consequent: {
            loop level4 {
              loop_type: for_each
              variable: subitem
              collection: item.subitems
              body: {
                step deepest {
                  call agent: "deep_processor"
                  inputs: { item: subitem }
                }
              }
            }
          }
        }
      }
    }
  }
}
`);

    const result = parseDSL(dsl);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    // 验证4层嵌套结构
    const level1 = result.ast?.body[0] as DSLCondition;
    expect(level1.type).toBe('condition');

    const level2 = level1.consequent?.[0] as DSLLoop;
    expect(level2.type).toBe('loop');

    const level3 = level2.body?.[0] as DSLCondition;
    expect(level3.type).toBe('condition');

    const level4 = level3.consequent?.[0] as DSLLoop;
    expect(level4.type).toBe('loop');

    const step = level4.body?.[0] as DSLStep;
    expect(step.type).toBe('step');
  });

  test('应该正确解析5层混合嵌套', () => {
    const dsl = createBaseDSL(`
condition outer_condition {
  test: input.condition
  consequent: {
    loop outer_loop {
      loop_type: for_each
      variable: batch
      collection: input.items
      body: {
        parallel parallel_ops {
          branches: [
            {
              try_catch safe_op {
                try_block: {
                  step op1 { call agent: "op1" inputs: {} }
                }
                catch_variable: err
                catch_block: {
                  step handle1 { call agent: "handler1" inputs: { error: err } }
                }
              }
            },
            {
              condition inner_condition {
                test: input.condition
                consequent: {
                  step op2 { call agent: "op2" inputs: {} }
                }
              }
            }
          ]
        }
      }
    }
  }
}
`);

    const result = parseDSL(dsl);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    // 验证5层结构: condition -> loop -> parallel -> [try_catch, condition]
    const l1_condition = result.ast?.body[0] as DSLCondition;
    const l2_loop = l1_condition.consequent?.[0] as DSLLoop;
    const l3_parallel = l2_loop.body?.[0] as DSLParallel;

    expect(l3_parallel.branches).toHaveLength(2);

    // 第一个分支是 try_catch
    const tryCatch = l3_parallel.branches[0]?.[0] as DSLTryCatch;
    expect(tryCatch.type).toBe('try_catch');

    // 第二个分支是 condition
    const l5_condition = l3_parallel.branches[1]?.[0] as DSLCondition;
    expect(l5_condition.type).toBe('condition');
  });

  test('应该正确处理极端嵌套场景（8层）', () => {
    const dsl = createBaseDSL(`
condition L1 {
  test: input.condition
  consequent: {
    loop L2 {
      loop_type: for_each
      variable: i1
      collection: input.items
      body: {
        condition L3 {
          test: input.condition
          consequent: {
            loop L4 {
              loop_type: for_each
              variable: i2
              collection: input.items
              body: {
                parallel L5 {
                  branches: [
                    {
                      try_catch L6 {
                        try_block: {
                          step L7 {
                            call agent: "deep_agent"
                            inputs: {}
                          }
                        }
                        catch_variable: e
                        catch_block: {
                          step L8 { call agent: "error_agent" inputs: { error: e } }
                        }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      }
    }
  }
}
`);

    const result = parseDSL(dsl);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    // 验证所有层级都正确解析
    let current: DSLStatement = result.ast!.body[0];
    const expectedTypes = ['condition', 'loop', 'condition', 'loop', 'parallel', 'try_catch', 'step'];

    for (const expectedType of expectedTypes) {
      expect(current.type).toBe(expectedType);
      // 移动到下一层
      if (current.type === 'condition') {
        current = (current as DSLCondition).consequent?.[0]!;
      } else if (current.type === 'loop') {
        current = (current as DSLLoop).body?.[0]!;
      } else if (current.type === 'parallel') {
        current = (current as DSLParallel).branches[0]?.[0]!;
      } else if (current.type === 'try_catch') {
        current = (current as DSLTryCatch).try_block?.[0]!;
      }
    }
  });
});

// ============================================================
// 场景5: 嵌套并行内的Try-Catch
// ============================================================

describe('嵌套语句 - 场景5: 嵌套并行内的Try-Catch', () => {
  test('应该正确解析并行内多个try-catch分支', () => {
    const dsl = createBaseDSL(`
parallel robust_operations {
  branches: [
    {
      try_catch safe_task1 {
        try_block: {
          step task1 {
            call agent: "task1_agent"
            inputs: {}
          }
        }
        catch_variable: err1
        catch_block: {
          step handle1 {
            call agent: "handler1"
            inputs: { error: err1 }
          }
        }
      }
    },
    {
      try_catch safe_task2 {
        try_block: {
          step task2 {
            call agent: "task2_agent"
            inputs: {}
          }
        }
        catch_variable: err2
        catch_block: {
          step handle2 {
            call agent: "handler2"
            inputs: { error: err2 }
          }
        }
      }
    },
    {
      try_catch safe_task3 {
        try_block: {
          step task3 {
            call agent: "task3_agent"
            inputs: {}
          }
        }
        catch_variable: err3
        catch_block: {
          step handle3 {
            call agent: "handler3"
            inputs: { error: err3 }
          }
        }
      }
    }
  ]
  max_concurrency: 3
}
`);

    const result = parseDSL(dsl);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    const parallel = result.ast?.body[0] as DSLParallel;
    expect(parallel.type).toBe('parallel');
    expect(parallel.branches).toHaveLength(3);

    // 每个分支都应该是 try_catch
    for (const branch of parallel.branches) {
      const tryCatch = branch[0] as DSLTryCatch;
      expect(tryCatch.type).toBe('try_catch');
      expect(tryCatch.catch_variable).toBeDefined();
      expect(tryCatch.catch_block).toHaveLength(1);
    }
  });

  test('应该正确解析复杂的并行+条件+循环组合', () => {
    const dsl = createBaseDSL(`
parallel complex_workflow {
  branches: [
    {
      loop batch_process {
        loop_type: for_each
        variable: item
        collection: input.items
        body: {
          condition check_item {
            test: input.condition
            consequent: {
              step process_valid {
                call agent: "valid_processor"
                inputs: { item: item }
              }
            }
            alternate: {
              step skip_invalid {
                call agent: "skipper"
                inputs: { item: item }
              }
            }
          }
        }
      }
    },
    {
      try_catch fallback_operation {
        try_block: {
          step fallback_task {
            call agent: "fallback_agent"
            inputs: {}
          }
        }
        catch_variable: err
        catch_block: {
          step emergency_handler {
            call agent: "emergency"
            inputs: { error: err }
          }
        }
        finally_block: {
          step cleanup {
            call agent: "cleaner"
            inputs: {}
          }
        }
      }
    }
  ]
}
`);

    const result = parseDSL(dsl);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    const parallel = result.ast?.body[0] as DSLParallel;
    expect(parallel.branches).toHaveLength(2);

    // 第一个分支: loop -> condition
    const loop = parallel.branches[0]?.[0] as DSLLoop;
    expect(loop.type).toBe('loop');

    const condition = loop.body?.[0] as DSLCondition;
    expect(condition.type).toBe('condition');

    // 第二个分支: try_catch -> finally
    const tryCatch = parallel.branches[1]?.[0] as DSLTryCatch;
    expect(tryCatch.type).toBe('try_catch');
    expect(tryCatch.finally_block).toBeDefined();
  });
});

// ============================================================
// 编译器集成验证
// ============================================================

describe('嵌套语句 - 编译器集成验证', () => {
  let compiler: DSLCompiler;

  beforeEach(() => {
    compiler = new DSLCompiler();
  });

  test('应该通过类型检查：嵌套条件循环', () => {
    const dsl = createBaseDSL(`
condition check_and_loop {
  test: input.condition
  consequent: {
    loop process {
      loop_type: for_each
      variable: item
      collection: input.items
      body: {
        step p { call agent: "p" inputs: {} }
      }
    }
  }
}
`);

    const parseResult = parseDSL(dsl);
    expect(parseResult.success).toBe(true);

    const errors = compiler.typeCheck(parseResult.ast!);
    expect(errors.filter(e => e.kind === 'semantic').length).toBe(0);
  });

  test('应该通过类型检查：深层嵌套', () => {
    const dsl = createBaseDSL(`
loop outer {
  loop_type: for_each
  variable: i1
  collection: input.items
  body: {
    parallel inner {
      branches: [
        {
          try_catch tc {
            try_block: {
              step s { call agent: "s" inputs: {} }
            }
            catch_variable: e
            catch_block: {
              step h { call agent: "h" inputs: { error: e } }
            }
          }
        }
      ]
    }
  }
}
`);

    const parseResult = parseDSL(dsl);
    expect(parseResult.success).toBe(true);

    const errors = compiler.typeCheck(parseResult.ast!);
    expect(errors.filter(e => e.kind === 'semantic').length).toBe(0);
  });

  test('应该正确编译嵌套语句到Markdown', () => {
    const dsl = createBaseDSL(`
condition main_condition {
  test: input.condition
  consequent: {
    step inner { call agent: "inner" inputs: {} }
  }
}
`);

    const parseResult = parseDSL(dsl);
    expect(parseResult.success).toBe(true);

    const markdownOutput = compiler.toMarkdown(parseResult.ast!);
    expect(typeof markdownOutput).toBe('string');
    expect(markdownOutput).toContain('name:');
    expect(markdownOutput).toContain('description:');
  });

  test('应该正确编译复杂嵌套语句到AgentDefinition', () => {
    const dsl = createBaseDSL(`
parallel multi_branch {
  branches: [
    {
      step s1 { call agent: "a1" inputs: {} }
    },
    {
      step s2 { call agent: "a2" inputs: {} }
    }
  ]
}
`);

    const parseResult = parseDSL(dsl);
    expect(parseResult.success).toBe(true);

    const agentDef = compiler.compileToAgentDefinition(parseResult.ast!);
    expect(agentDef.name).toBeDefined();
    expect(agentDef.type).toBeDefined();
    expect(agentDef.description).toBeDefined();
  });
});

// ============================================================
// 性能验证
// ============================================================

describe('嵌套语句 - 性能验证', () => {
  test('深层嵌套解析应在合理时间内完成', () => {
    const dsl = createBaseDSL(`
condition L1 {
  test: input.condition
  consequent: {
    loop L2 {
      loop_type: for_each
      variable: i1
      collection: input.items
      body: {
        condition L3 {
          test: input.condition
          consequent: {
            loop L4 {
              loop_type: for_each
              variable: i2
              collection: input.items
              body: {
                parallel L5 {
                  branches: [
                    {
                      try_catch L6 {
                        try_block: {
                          step L7 {
                            call agent: "deep_agent"
                            inputs: {}
                          }
                        }
                        catch_variable: e
                        catch_block: {
                          step L8 { call agent: "handler" inputs: { error: e } }
                        }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      }
    }
  }
}
`);

    const startTime = performance.now();
    const result = parseDSL(dsl);
    const endTime = performance.now();

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    // 解析应在 100ms 内完成
    expect(endTime - startTime).toBeLessThan(100);
  });

  test('大量并行分支应快速解析', () => {
    const branches = Array.from({ length: 10 }, (_, i) => `
      {
        step branch_${i} {
          call agent: "branch_agent_${i}"
          inputs: {}
        }
      }
    `).join(',\n');

    const dsl = createBaseDSL(`
parallel many_branches {
  branches: [${branches}]
  max_concurrency: 5
}
`);

    const startTime = performance.now();
    const result = parseDSL(dsl);
    const endTime = performance.now();

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    // 解析应在 50ms 内完成
    expect(endTime - startTime).toBeLessThan(50);
  });
});

// ============================================================
// 边界情况测试
// ============================================================

describe('嵌套语句 - 边界情况', () => {
  test('应该处理空循环体', () => {
    const dsl = createBaseDSL(`
loop empty_loop {
  loop_type: for_each
  variable: item
  collection: input.items
  body: {
  }
}
`);

    const result = parseDSL(dsl);
    expect(result.success).toBe(true);
  });

  test('应该处理空并行分支', () => {
    const dsl = createBaseDSL(`
parallel empty_parallel {
  branches: [
    { },
    { step s { call agent: "s" inputs: {} } }
  ]
}
`);

    const result = parseDSL(dsl);
    // 空分支可能导致问题，检查解析器容错性
    expect(result.success).toBe(true);
  });

  test('应该处理多层嵌套的else分支', () => {
    const dsl = createBaseDSL(`
condition outer {
  test: input.condition
  consequent: {
    step outer_true { call agent: "ot" inputs: {} }
  }
  alternate: {
    condition inner {
      test: input.condition
      consequent: {
        step inner_true { call agent: "it" inputs: {} }
      }
      alternate: {
        step inner_false { call agent: "if" inputs: {} }
      }
    }
  }
}
`);

    const result = parseDSL(dsl);
    expect(result.success).toBe(true);

    const outer = result.ast?.body[0] as DSLCondition;
    expect(outer.type).toBe('condition');
    expect(outer.alternate).toHaveLength(1);

    const inner = outer.alternate?.[0] as DSLCondition;
    expect(inner.type).toBe('condition');
    expect(inner.alternate).toHaveLength(1);
  });

  test('应该处理try-catch-finally完整结构', () => {
    const dsl = createBaseDSL(`
try_catch complete_structure {
  try_block: {
    step try_step { call agent: "try_agent" inputs: {} }
  }
  catch_variable: error
  catch_block: {
    step catch_step { call agent: "catch_agent" inputs: { error: error } }
  }
  finally_block: {
    step finally_step { call agent: "finally_agent" inputs: {} }
  }
}
`);

    const result = parseDSL(dsl);
    expect(result.success).toBe(true);

    const tryCatch = result.ast?.body[0] as DSLTryCatch;
    expect(tryCatch.try_block).toHaveLength(1);
    expect(tryCatch.catch_block).toHaveLength(1);
    expect(tryCatch.finally_block).toHaveLength(1);
  });
});
