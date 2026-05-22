/**
 * Honeycomb DSL - Conditional Step Parser 测试
 *
 * 测试条件分支步骤的解析功能，遵循 TDD 原则。
 * 验证 parser 能正确解析 conditional_step 语法并生成 AST。
 */

import { describe, test, expect } from 'bun:test';
import { DSLParser } from '../src/dsl/parser.js';
import type { DSLConditionalStep, ConditionalBranch } from '../src/dsl/types.js';

// ============================================================
// 测试辅助函数
// ============================================================

/**
 * 创建一个包含 conditional_step 的完整 DSL
 * @param bodyContent body 中的内容
 */
function createConditionalDSL(bodyContent: string): string {
  return `
agent test_agent {
  description: "Test agent for conditional steps"
  type: worker
  layer: L3

  input data: any {
    description: "Input data"
    required: false
  }

  output result: string {
    description: "Output result"
  }

  tools: []

  body {
    ${bodyContent}
  }

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: true
    max_retries: 3
    token_budget: 10000
  }
}`;
}

// ============================================================
// 测试套件
// ============================================================

describe('Conditional Step Parser', () => {
  // ============================================================
  // 测试 1: 基本条件步骤解析（if-else）
  // ============================================================
  test('should parse basic conditional_step with if-else', () => {
    const parser = new DSLParser();
    const dsl = createConditionalDSL(`
      conditional_step route_request {
        branches: [
          { if: input.size > 1000, then: agent:big-data-agent },
          { else: agent:default-agent }
        ],
        inputs: { data: input },
        outputs: { result: output }
      }
    `);

    const result = parser.parse(dsl);

    expect(result.errors).toHaveLength(0);
    expect(result.ast).toBeDefined();

    const agent = result.ast as any;
    expect(agent.type).toBe('agent');
    expect(agent.body).toBeDefined();

    const conditionalStep = agent.body.find((s: any) => s.type === 'conditional_step');
    expect(conditionalStep).toBeDefined();
    expect(conditionalStep.name).toBe('route_request');
    expect(conditionalStep.branches).toHaveLength(2);

    // 第一个分支：if
    const ifBranch = conditionalStep.branches[0];
    expect(ifBranch.if).toBeDefined();
    expect(ifBranch.then).toBeDefined();
    expect(ifBranch.then.type).toBe('agent');
    expect(ifBranch.then.name).toBe('big-data-agent');

    // 第二个分支：else
    const elseBranch = conditionalStep.branches[1];
    expect(elseBranch.else).toBeDefined();
    expect(elseBranch.else.type).toBe('agent');
    expect(elseBranch.else.name).toBe('default-agent');
  });

  // ============================================================
  // 测试 2: 多个 elif 分支
  // ============================================================
  test('should parse conditional_step with multiple elif branches', () => {
    const parser = new DSLParser();
    const dsl = createConditionalDSL(`
      conditional_step multi_branch {
        branches: [
          { if: input.priority, then: agent:critical-agent },
          { if: input.level > 7, then: agent:high-agent },
          { if: input.type == "text", then: agent:text-agent },
          { else: agent:default-agent }
        ],
        inputs: { priority: input.priority, level: input.level, type: input.type },
        outputs: { result: output }
      }
    `);

    const result = parser.parse(dsl);

    expect(result.errors).toHaveLength(0);

    const agent = result.ast as any;
    const conditionalStep = agent.body.find((s: any) => s.type === 'conditional_step');

    expect(conditionalStep.branches).toHaveLength(4);

    // 验证各个分支
    expect(conditionalStep.branches[0].if).toBeDefined();
    expect(conditionalStep.branches[0].then.type).toBe('agent');
    expect(conditionalStep.branches[0].then.name).toBe('critical-agent');

    expect(conditionalStep.branches[1].if).toBeDefined();
    expect(conditionalStep.branches[1].then.type).toBe('agent');
    expect(conditionalStep.branches[1].then.name).toBe('high-agent');

    expect(conditionalStep.branches[2].if).toBeDefined();
    expect(conditionalStep.branches[2].then.type).toBe('agent');
    expect(conditionalStep.branches[2].then.name).toBe('text-agent');

    expect(conditionalStep.branches[3].else).toBeDefined();
    expect(conditionalStep.branches[3].else.type).toBe('agent');
    expect(conditionalStep.branches[3].else.name).toBe('default-agent');
  });

  // ============================================================
  // 测试 3: skill 和 tool 调用类型
  // ============================================================
  test('should parse conditional_step with skill and tool calls', () => {
    const parser = new DSLParser();
    const dsl = createConditionalDSL(`
      conditional_step mixed_calls {
        branches: [
          { if: input.use_skill, then: skill:analysis-skill },
          { else: tool:data-processor }
        ],
        inputs: { use_skill: input.use_skill },
        outputs: { result: output }
      }
    `);

    const result = parser.parse(dsl);

    expect(result.errors).toHaveLength(0);

    const agent = result.ast as any;
    const conditionalStep = agent.body.find((s: any) => s.type === 'conditional_step');

    expect(conditionalStep.branches[0].then.type).toBe('skill');
    expect(conditionalStep.branches[0].then.skill_id).toBe('analysis-skill');

    expect(conditionalStep.branches[1].else.type).toBe('tool');
    expect(conditionalStep.branches[1].else.name).toBe('data-processor');
  });

  // ============================================================
  // 测试 4: 无名称的条件步骤
  // ============================================================
  test('should parse conditional_step without name', () => {
    const parser = new DSLParser();
    const dsl = createConditionalDSL(`
      conditional_step {
        branches: [
          { if: input.condition, then: agent:agent-a },
          { else: agent:agent-b }
        ],
        inputs: { condition: input.condition },
        outputs: { result: output }
      }
    `);

    const result = parser.parse(dsl);

    expect(result.errors).toHaveLength(0);

    const agent = result.ast as any;
    const conditionalStep = agent.body.find((s: any) => s.type === 'conditional_step');

    expect(conditionalStep.name).toBeUndefined();
    expect(conditionalStep.branches).toHaveLength(2);
  });

  // ============================================================
  // 测试 5: 无 outputs 的条件步骤
  // ============================================================
  test('should parse conditional_step without outputs', () => {
    const parser = new DSLParser();
    const dsl = createConditionalDSL(`
      conditional_step no_output {
        branches: [
          { if: input.condition, then: agent:agent-a },
          { else: agent:agent-b }
        ],
        inputs: { condition: input.condition }
      }
    `);

    const result = parser.parse(dsl);

    expect(result.errors).toHaveLength(0);

    const agent = result.ast as any;
    const conditionalStep = agent.body.find((s: any) => s.type === 'conditional_step');

    expect(conditionalStep.outputs).toBeUndefined();
    expect(conditionalStep.inputs).toBeDefined();
  });

  // ============================================================
  // 测试 6: 复杂条件表达式
  // ============================================================
  test('should parse complex expressions in branch conditions', () => {
    const parser = new DSLParser();
    const dsl = createConditionalDSL(`
      conditional_step complex_expr {
        branches: [
          { if: input.a && input.b, then: agent:and-agent },
          { if: input.x > 10 || input.y < 5, then: agent:or-agent },
          { if: input.a && input.b && input.c, then: agent:multi-and-agent },
          { else: agent:default-agent }
        ],
        inputs: { a: input.a, b: input.b, c: input.c, x: input.x, y: input.y },
        outputs: { result: output }
      }
    `);

    const result = parser.parse(dsl);

    expect(result.errors).toHaveLength(0);

    const agent = result.ast as any;
    const conditionalStep = agent.body.find((s: any) => s.type === 'conditional_step');

    // 验证第一个分支的条件是二元操作
    expect(conditionalStep.branches[0].if.type).toBe('binary_op');
    expect(conditionalStep.branches[0].if.operator).toBe('&&');

    // 验证第二个分支的条件是二元操作
    expect(conditionalStep.branches[1].if.type).toBe('binary_op');
    expect(conditionalStep.branches[1].if.operator).toBe('||');
  });

  // ============================================================
  // 测试 7: 对象字面量语法的 call
  // ============================================================
  test('should parse conditional_step with object literal call syntax', () => {
    const parser = new DSLParser();
    const dsl = createConditionalDSL(`
      conditional_step object_call {
        branches: [
          { if: input.condition, then: { type: agent, name: agent-a } },
          { else: { type: skill, skill_id: fallback-skill } }
        ],
        inputs: { condition: input.condition },
        outputs: { result: output }
      }
    `);

    const result = parser.parse(dsl);

    expect(result.errors).toHaveLength(0);

    const agent = result.ast as any;
    const conditionalStep = agent.body.find((s: any) => s.type === 'conditional_step');

    expect(conditionalStep.branches[0].then.type).toBe('agent');
    expect(conditionalStep.branches[0].then.name).toBe('agent-a');

    expect(conditionalStep.branches[1].else.type).toBe('skill');
    expect(conditionalStep.branches[1].else.skill_id).toBe('fallback-skill');
  });

  // ============================================================
  // 测试 8: 嵌套在其他语句中
  // ============================================================
  test('should parse conditional_step nested in parallel', () => {
    const parser = new DSLParser();
    const dsl = createConditionalDSL(`
      parallel {
        branches: [
          {
            conditional_step branch_a {
              branches: [
                { if: input.route_a, then: agent:agent-a },
                { else: agent:agent-b }
              ],
              inputs: { route_a: input.route_a }
            }
          },
          {
            step other_step {
              call: agent:agent-c
            }
          }
        ]
      }
    `);

    const result = parser.parse(dsl);

    // 打印错误详情用于调试
    if (result.errors.length > 0) {
      console.log('\n=== 解析错误详情 ===');
      for (const err of result.errors) {
        console.log(`  - ${err.message} at line ${err.loc?.line}, col ${err.loc?.column}`);
      }
      console.log('=====================\n');
    }

    expect(result.errors).toHaveLength(0);

    const agent = result.ast as any;
    const parallel = agent.body.find((s: any) => s.type === 'parallel');

    expect(parallel).toBeDefined();
    expect(parallel.branches).toHaveLength(2);

    const conditionalStep = parallel.branches[0].find((s: any) => s.type === 'conditional_step');
    expect(conditionalStep).toBeDefined();
    expect(conditionalStep.name).toBe('branch_a');
  });

  // ============================================================
  // 测试 9: 只有 if 分支（没有 else）
  // ============================================================
  test('should parse conditional_step with only if branches', () => {
    const parser = new DSLParser();
    const dsl = createConditionalDSL(`
      conditional_step no_else {
        branches: [
          { if: input.condition, then: agent:agent-a },
          { if: !input.condition, then: agent:agent-b }
        ],
        inputs: { condition: input.condition }
      }
    `);

    const result = parser.parse(dsl);

    expect(result.errors).toHaveLength(0);

    const agent = result.ast as any;
    const conditionalStep = agent.body.find((s: any) => s.type === 'conditional_step');

    expect(conditionalStep.branches).toHaveLength(2);
    expect(conditionalStep.branches[0].if).toBeDefined();
    expect(conditionalStep.branches[1].if).toBeDefined();
  });

  // ============================================================
  // 测试 10: 属性访问表达式
  // ============================================================
  test('should parse property access in conditions', () => {
    const parser = new DSLParser();
    const dsl = createConditionalDSL(`
      conditional_step property_access {
        branches: [
          { if: input.user.role == "admin", then: agent:admin-agent },
          { else: agent:user-agent }
        ],
        inputs: { user: input.user },
        outputs: { result: output }
      }
    `);

    const result = parser.parse(dsl);

    expect(result.errors).toHaveLength(0);

    const agent = result.ast as any;
    const conditionalStep = agent.body.find((s: any) => s.type === 'conditional_step');

    // 第一个分支的条件应该是二元操作
    const firstBranchCondition = conditionalStep.branches[0].if;
    expect(firstBranchCondition.type).toBe('binary_op');
    expect(firstBranchCondition.operator).toBe('==');
  });
});
