/**
 * DSL Parser 单元测试
 *
 * 测试 DSL 解析器的词法分析、语法分析和 AST 构建功能。
 * 遵循 TDD 原则：测试先行，红-绿-重构。
 */

import { describe, test, expect } from 'bun:test';
import {
  DSLParser,
  DSLNodeType,
  type AgentDSL,
  type DSLInput,
  type DSLOutput,
  type DSLStep,
  type SourceLocation,
} from '../src/dsl/parser.js';

// ============================================================
// 测试工具函数
// ============================================================

/**
 * 创建一个最小有效的 DSL 源码
 * @param overrideBody 可选的 body 内容覆盖（用于测试控制结构）
 */
function createMinimalDSL(name: string = 'TestAgent', overrideBody?: string): string {
  const defaultBody = `    step main {
      call agent: "helper"
      inputs: { task: task }
    }`;

  return `
agent ${name} {
  description: "A test agent"
  type: worker
  layer: L3

  input task: string {
    description: "The task to execute"
    required: true
  }

  output result: string {
    description: "The execution result"
  }

  tools: [read, write]

  body {
    ${overrideBody !== undefined ? overrideBody : defaultBody}
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

/**
 * 检查位置信息是否有效
 */
function isValidLocation(loc: SourceLocation | undefined): boolean {
  return loc !== undefined &&
    typeof loc.line === 'number' && loc.line >= 1 &&
    typeof loc.column === 'number' && loc.column >= 1 &&
    typeof loc.file === 'string';
}

// ============================================================
// 词法分析测试
// ============================================================

describe('DSLParser - 词法分析', () => {
  test('应该正确识别标识符', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL('MyAgent');
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();
    expect(result.ast?.name).toBe('MyAgent');
  });

  test('应该正确处理带连字符的标识符', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL('my-test-agent');
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.name).toBe('my-test-agent');
  });

  test('应该正确识别字符串字面量', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL();
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.description).toBe('A test agent');
  });

  test('应该正确识别数字字面量', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL();
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.governance.max_retries).toBe(3);
    expect(result.ast?.governance.token_budget).toBe(10000);
  });

  test('应该正确识别布尔字面量', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL();
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.governance.first_principles_check).toBe(false);
    expect(result.ast?.governance.quality_gate_enabled).toBe(true);
  });

  test('应该正确处理注释', () => {
    const parser = new DSLParser();
    const source = `
# This is a comment
agent CommentedAgent {
  description: "Test"
  type: worker
  layer: L3

  input task: string { required: true }
  output result: string

  tools: []

  body { }

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: false
    max_retries: 1
    token_budget: 1000
  }
}
`;
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.name).toBe('CommentedAgent');
  });
});

// ============================================================
// 语法分析测试 - Agent 定义
// ============================================================

describe('DSLParser - Agent 定义解析', () => {
  test('应该解析最小有效的 Agent 定义', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL();
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();
    expect(result.ast?.type).toBe('agent');
    expect(result.ast?.name).toBe('TestAgent');
    expect(result.ast?.description).toBe('A test agent');
  });

  test('应该正确解析 Agent 类型', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL();
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.agent_type).toBe('worker');
  });

  test('应该正确解析 structural 类型 Agent', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL().replace('type: worker', 'type: structural');
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.agent_type).toBe('structural');
  });

  test('应该正确解析所有有效的层', () => {
    const layers = ['L1', 'L2', 'L3', 'L4', 'governance'] as const;

    for (const layer of layers) {
      const parser = new DSLParser();
      const source = createMinimalDSL().replace('layer: L3', `layer: ${layer}`);
      const result = parser.parse(source, 'test.dsl');

      expect(result.success).toBe(true);
      expect(result.ast?.layer).toBe(layer);
    }
  });

  test('应该正确解析 domain 字段', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL().replace(
      'layer: L3',
      'layer: L3\n  domain: software'
    );
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.domain).toBe('software');
  });

  test('应该记录源码位置信息', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL();
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(isValidLocation(result.ast?.loc)).toBe(true);
    expect(result.ast?.loc?.file).toBe('test.dsl');
    expect(result.ast?.loc?.line).toBe(2); // agent 关键字在第 2 行
  });
});

// ============================================================
// 语法分析测试 - 输入/输出定义
// ============================================================

describe('DSLParser - 输入/输出解析', () => {
  test('应该解析单个输入定义', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL();
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.inputs).toHaveLength(1);
    expect(result.ast?.inputs[0].name).toBe('task');
    expect(result.ast?.inputs[0].data_type).toEqual({ kind: 'string' });
    expect(result.ast?.inputs[0].required).toBe(true);
  });

  test('应该解析多个输入定义', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL().replace(
      'input task: string {',
      `input task: string {
    description: "The task"
    required: true
  }

  input priority: number {
    description: "Task priority"
    required: false
    default: 5
  }

  input options: object {`
    );
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.inputs.length).toBeGreaterThanOrEqual(2);

    const taskInput = result.ast?.inputs.find((i: DSLInput) => i.name === 'task');
    expect(taskInput?.required).toBe(true);

    const priorityInput = result.ast?.inputs.find((i: DSLInput) => i.name === 'priority');
    expect(priorityInput?.required).toBe(false);
    expect(priorityInput?.data_type).toEqual({ kind: 'number' });
  });

  test('应该解析输出定义', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL();
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.outputs).toHaveLength(1);
    expect(result.ast?.outputs[0].name).toBe('result');
  });

  test('应该解析复杂数据类型', () => {
    const parser = new DSLParser();
    const source = `
agent ComplexTypesAgent {
  description: "Test complex types"
  type: worker
  layer: L3

  input items: array<string> {
    description: "List of items"
    required: true
  }

  input config: object {
    description: "Configuration object"
    required: false
  }

  input status: union<string, number> {
    description: "Status can be string or number"
    required: true
  }

  output result: string

  tools: []

  body { }

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: false
    max_retries: 1
    token_budget: 1000
  }
}
`;
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);

    const itemsInput = result.ast?.inputs.find((i: DSLInput) => i.name === 'items');
    expect(itemsInput?.data_type).toEqual({
      kind: 'array',
      item_type: { kind: 'string' },
    });

    const configInput = result.ast?.inputs.find((i: DSLInput) => i.name === 'config');
    expect(configInput?.data_type).toEqual({
      kind: 'object',
      properties: {},
    });

    const statusInput = result.ast?.inputs.find((i: DSLInput) => i.name === 'status');
    expect(statusInput?.data_type).toEqual({
      kind: 'union',
      types: [
        { kind: 'string' },
        { kind: 'number' },
      ],
    });
  });
});

// ============================================================
// 语法分析测试 - 工具和能力
// ============================================================

describe('DSLParser - 工具和能力解析', () => {
  test('应该解析工具列表', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL().replace(
      'tools: [read, write]',
      'tools: [read, write, execute, search]'
    );
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.tools).toHaveLength(4);
    expect(result.ast?.tools.map((t) => t.name)).toEqual([
      'read',
      'write',
      'execute',
      'search',
    ]);
  });

  test('应该解析空工具列表', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL().replace('tools: [read, write]', 'tools: []');
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.tools).toHaveLength(0);
  });

  test('应该解析能力声明', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL().replace(
      'tools: [read, write]',
      `tools: [read, write]

  capability code_analysis: advanced
  capability security_review: intermediate`
    );
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.capabilities).toHaveLength(2);

    const codeCap = result.ast?.capabilities.find((c) => c.capability_type === 'code_analysis');
    expect(codeCap?.level).toBe('advanced');

    const secCap = result.ast?.capabilities.find((c) => c.capability_type === 'security_review');
    expect(secCap?.level).toBe('intermediate');
  });
});

// ============================================================
// 语法分析测试 - 执行步骤（Body）
// ============================================================

describe('DSLParser - 执行步骤解析', () => {
  test('应该解析单个步骤', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL();
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.body).toHaveLength(1);
    expect(result.ast?.body[0].type).toBe('step');
  });

  test('应该解析步骤名称', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL();
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const step = result.ast?.body[0] as DSLStep;
    expect(step.name).toBe('main');
  });

  test('应该解析 Agent 调用', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL();
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const step = result.ast?.body[0] as DSLStep;
    expect(step.call).toEqual({ type: 'agent', name: 'helper' });
  });

  test('应该解析 Skill 调用', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL().replace(
      'call agent: "helper"',
      'call skill: "honeycomb.code.analyze"'
    );
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const step = result.ast?.body[0] as DSLStep;
    expect(step.call).toEqual({ type: 'skill', skill_id: 'honeycomb.code.analyze' });
  });

  test('应该解析输入绑定', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL();
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const step = result.ast?.body[0] as DSLStep;
    expect(step.inputs).toBeDefined();
    expect(step.inputs['task']).toBeDefined();
    expect(step.inputs['task'].type).toBe('variable');
    expect((step.inputs['task'] as any).name).toBe('task');
  });

  test('应该解析多个步骤', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL('TestAgent', `step analyze {
      call agent: "analyzer"
      inputs: { task: input.task }
    }

    step execute {
      call agent: "executor"
      inputs: { plan: analyze.output }
    }

    step verify {
      call agent: "verifier"
      inputs: { result: execute.output }
    }`);
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.body.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================
// 语法分析测试 - 控制结构
// ============================================================

describe('DSLParser - 控制结构解析', () => {
  test('应该解析条件语句', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL('TestAgent', `condition if_task_exists {
      test: input.task != null
      consequent: {
        step process {
          call agent: "processor"
          inputs: { task: input.task }
        }
      }
    }`);
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.body[0].type).toBe('condition');
  });

  test('应该解析带 else 分支的条件语句', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL('TestAgent', `condition check_priority {
      test: input.priority > 5
      consequent: {
        step high_priority {
          call agent: "high_handler"
          inputs: { task: input.task }
        }
      }
      alternate: {
        step normal_priority {
          call agent: "normal_handler"
          inputs: { task: input.task }
        }
      }
    }`);
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const cond = result.ast?.body[0];
    expect(cond?.type).toBe('condition');
    expect(cond?.alternate).toBeDefined();
  });

  test('应该解析 for_each 循环', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL('TestAgent', `loop process_items {
      loop_type: for_each
      variable: item
      collection: input.items
      body: {
        step process {
          call agent: "item_processor"
          inputs: { item: item }
        }
      }
    }`);
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const loop = result.ast?.body[0];
    expect(loop?.type).toBe('loop');
    expect((loop as any)?.loop_type).toBe('for_each');
  });

  test('应该解析条件步骤 conditional_step', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL('TestAgent', `conditional_step route_task {
      branches: [
        { if: input.priority == "high", then: agent: "high_priority_handler" },
        { if: input.priority == "medium", then: agent: "medium_priority_handler" },
        { else: agent: "default_handler" }
      ],
      inputs: { priority: input.priority }
    }`);
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const cs = result.ast?.body[0];
    expect(cs?.type).toBe('conditional_step');
    expect((cs as any)?.name).toBe('route_task');
  });

  test('应该解析带输入绑定的 conditional_step', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL('TestAgent', `conditional_step {
      branches: [
        { if: input.count > 10, then: skill: "bulk_processor" }
      ],
      inputs: { count: input.count }
    }`);
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const cs = result.ast?.body[0];
    expect(cs?.type).toBe('conditional_step');
    expect((cs as any)?.inputs).toBeDefined();
  });

  test('应该解析带输出的 conditional_step', () => {
    const parser = new DSLParser();
    // outputs 放在 conditional_step 顶层，而不是 branches 内部
    const source = createMinimalDSL('TestAgent', `conditional_step result_selector {
      branches: [
        { if: input.condition, then: agent: "processor_a" },
        { else: agent: "processor_b" }
      ],
      outputs: { result: "output.result" }
    }`);
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const cs = result.ast?.body[0];
    expect(cs?.type).toBe('conditional_step');
    expect((cs as any)?.outputs).toBeDefined();
  });

  test('应该解析 while 循环', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL('TestAgent', `loop while_process {
      loop_type: while
      test: input.count > 0
      body: {
        step decrement {
          call agent: "decrementer"
          inputs: { count: input.count }
        }
      }
    }`);
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const loop = result.ast?.body[0];
    expect(loop?.type).toBe('loop');
    expect((loop as any)?.loop_type).toBe('while');
  });

  test('应该解析 for 循环', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL('TestAgent', `loop for_process {
      loop_type: for
      variable: i
      collection: input.items
      body: {
        step process_item {
          call agent: "item_processor"
          inputs: { index: i }
        }
      }
    }`);
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const loop = result.ast?.body[0];
    expect(loop?.type).toBe('loop');
    expect((loop as any)?.loop_type).toBe('for');
    expect((loop as any)?.variable).toBe('i');
  });

  test('应该解析并行执行', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL('TestAgent', `parallel {
      branches: [
        {
          step analyze {
            call agent: "analyzer"
            inputs: { task: input.task }
          }
        },
        {
          step research {
            call agent: "researcher"
            inputs: { task: input.task }
          }
        }
      ]
      max_concurrency: 2
    }`);
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const parallel = result.ast?.body[0];
    expect(parallel?.type).toBe('parallel');
  });

  test('应该解析 try-catch 语句', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL('TestAgent', `try_catch safe_execute {
      try_block: {
        step risky {
          call agent: "risky_agent"
          inputs: { task: input.task }
        }
      }
      catch_variable: error
      catch_block: {
        step handle_error {
          call agent: "error_handler"
          inputs: { error: error }
        }
      }
    }`);
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const tryCatch = result.ast?.body[0];
    expect(tryCatch?.type).toBe('try_catch');
  });
});

// ============================================================
// 语法分析测试 - 治理配置
// ============================================================

describe('DSLParser - 治理配置解析', () => {
  test('应该解析完整的治理配置', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL();
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const gov = result.ast?.governance;
    expect(gov).toBeDefined();
    expect(gov?.first_principles_check).toBe(false);
    expect(gov?.red_team_threshold).toBe('low');
    expect(gov?.quality_gate_enabled).toBe(true);
    expect(gov?.max_retries).toBe(3);
    expect(gov?.token_budget).toBe(10000);
  });

  test('应该解析所有有效的风险阈值', () => {
    const thresholds = ['very_low', 'low', 'medium', 'high', 'critical'] as const;

    for (const threshold of thresholds) {
      const parser = new DSLParser();
      const source = createMinimalDSL().replace(
        'red_team_threshold: low',
        `red_team_threshold: ${threshold}`
      );
      const result = parser.parse(source, 'test.dsl');

      expect(result.success).toBe(true);
      expect(result.ast?.governance.red_team_threshold).toBe(threshold);
    }
  });
});

// ============================================================
// 错误处理测试
// ============================================================

describe('DSLParser - 错误处理', () => {
  test('应该报告缺失的 agent 关键字', () => {
    const parser = new DSLParser();
    const source = `
MyAgent {
  description: "Missing agent keyword"
}
`;
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  test('应该报告缺失的描述', () => {
    const parser = new DSLParser();
    const source = `
agent TestAgent {
  type: worker
  layer: L3
}
`;
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(false);
    expect(result.errors?.some(e => e.kind === 'syntax')).toBe(true);
  });

  test('应该报告无效的 Agent 类型', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL().replace('type: worker', 'type: invalid_type');
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(false);
    expect(result.errors?.some(e => e.message.includes('type'))).toBe(true);
  });

  test('应该报告无效的层', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL().replace('layer: L3', 'layer: L5');
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(false);
    expect(result.errors?.some(e => e.message.includes('layer'))).toBe(true);
  });

  test('应该报告缺失的治理配置', () => {
    const parser = new DSLParser();
    const source = `
agent TestAgent {
  description: "Test"
  type: worker
  layer: L3

  input task: string { required: true }
  output result: string

  tools: []

  body { }
}
`;
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(false);
    expect(result.errors?.some(e => e.message.includes('Governance'))).toBe(true);
  });

  test('应该报告不匹配的大括号', () => {
    const parser = new DSLParser();
    const source = `
agent TestAgent {
  description: "Test"
  type: worker
  layer: L3

  input task: string { required: true }
  output result: string

  tools: []

  body {

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: false
    max_retries: 1
    token_budget: 1000
  }
}
`;
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(false);
  });

  test('应该提供有用的错误位置信息', () => {
    const parser = new DSLParser();
    const source = `
agent TestAgent {
  description: "Test"
  type: invalid
  layer: L3

  input task: string { required: true }
  output result: string

  tools: []

  body { }

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: false
    max_retries: 1
    token_budget: 1000
  }
}
`;
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(false);
    const error = result.errors?.[0];
    expect(error).toBeDefined();
    expect(error?.loc).toBeDefined();
    expect(error?.loc.line).toBe(4); // type: invalid 在第 4 行
    expect(error?.message).toContain('agent type');
  });
});

// ============================================================
// 表达式解析测试
// ============================================================

describe('DSLParser - 表达式解析', () => {
  test('应该解析变量引用', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL();
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const step = result.ast?.body[0] as DSLStep;
    const taskExpr = step.inputs['task'];
    expect(taskExpr?.type).toBe('variable');
    expect((taskExpr as any)?.name).toBe('task');
  });

  test('应该解析属性访问', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL('TestAgent', `step main {
      call agent: "helper"
      inputs: { value: input.config.value }
    }`);
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const step = result.ast?.body[0] as DSLStep;
    const valueExpr = step.inputs['value'];
    expect(valueExpr?.type).toBe('property_access');
  });

  test('应该解析二元操作', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL('TestAgent', `step main {
      call agent: "helper"
      inputs: { valid: input.count > 0 }
    }`);
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const step = result.ast?.body[0] as DSLStep;
    const validExpr = step.inputs['valid'];
    expect(validExpr?.type).toBe('binary_op');
    expect((validExpr as any)?.operator).toBe('>');
  });

  test('应该解析函数调用', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL('TestAgent', `step main {
      call agent: "helper"
      inputs: { id: generate_uuid() }
    }`);
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const step = result.ast?.body[0] as DSLStep;
    const idExpr = step.inputs['id'];
    expect(idExpr?.type).toBe('function_call');
  });

  test('应该解析模板字符串', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL('TestAgent', `step main {
      call agent: "helper"
      inputs: { message: "Task \\\${input.task} started" }
    }`);
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    const step = result.ast?.body[0] as DSLStep;
    const msgExpr = step.inputs['message'];
    expect(msgExpr?.type).toBe('template_string');
  });
});

// ============================================================
// 元数据测试
// ============================================================

describe('DSLParser - 元数据解析', () => {
  test('应该解析元数据块', () => {
    const parser = new DSLParser();
    const source = createMinimalDSL().replace(
      'governance {',
      `metadata {
    author: "Test Author"
    version: "1.0.0"
    license: "MIT"
    tags: ["test", "example"]
  }

  governance {`
    );
    const result = parser.parse(source, 'test.dsl');

    expect(result.success).toBe(true);
    expect(result.ast?.metadata).toBeDefined();
    expect(result.ast?.metadata?.author).toBe('Test Author');
    expect(result.ast?.metadata?.version).toBe('1.0.0');
    expect(result.ast?.metadata?.license).toBe('MIT');
    expect(result.ast?.metadata?.tags).toEqual(['test', 'example']);
  });
});
