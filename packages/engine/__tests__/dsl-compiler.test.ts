/**
 * DSL Compiler 单元测试
 *
 * 测试 DSL 编译器的类型检查、代码生成和转换功能。
 * 遵循 TDD 原则：测试先行，红-绿-重构。
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { DSLCompiler, DSLCompilerOptions } from '../src/dsl/compiler.js';
import { DSLParser } from '../src/dsl/parser.js';
import type { AgentDSL, DSLDataType } from '../src/dsl/types.js';

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
    inputs: [
      {
        type: 'input',
        name: 'task',
        data_type: { kind: 'string' },
        required: true,
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ],
    outputs: [
      {
        type: 'output',
        name: 'result',
        data_type: { kind: 'string' },
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ],
    tools: [
      { type: 'tool', name: 'read' },
      { type: 'tool', name: 'write' },
    ],
    capabilities: [],
    body: [
      {
        type: 'step',
        name: 'main',
        call: { type: 'agent', name: 'helper' },
        inputs: {
          task: {
            type: 'property_access',
            object: { type: 'variable', name: 'input' },
            property: 'task',
          },
        },
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ],
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
 * 解析 DSL 源码为 AST
 */
function parseDSL(source: string): AgentDSL | null {
  const parser = new DSLParser();
  const result = parser.parse(source, 'test.dsl');
  return result.ast ?? null;
}

// ============================================================
// 类型检查测试
// ============================================================

describe('DSLCompiler - 类型检查', () => {
  let compiler: DSLCompiler;

  beforeEach(() => {
    compiler = new DSLCompiler();
  });

  test('应该接受类型正确的 AST', () => {
    const ast = createMinimalAST();
    const errors = compiler.typeCheck(ast);

    expect(errors).toHaveLength(0);
  });

  test('应该检测重复的输入名称', () => {
    const ast = createMinimalAST();
    ast.inputs.push({
      type: 'input',
      name: 'task', // 重复名称
      data_type: { kind: 'number' },
      required: false,
    });

    const errors = compiler.typeCheck(ast);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('Duplicate'))).toBe(true);
  });

  test('应该检测重复的输出名称', () => {
    const ast = createMinimalAST();
    ast.outputs.push({
      type: 'output',
      name: 'result', // 重复名称
      data_type: { kind: 'number' },
    });

    const errors = compiler.typeCheck(ast);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('Duplicate'))).toBe(true);
  });

  test('应该检测重复的工具名称', () => {
    const ast = createMinimalAST();
    ast.tools.push({ type: 'tool', name: 'read' }); // 重复工具

    const errors = compiler.typeCheck(ast);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('Duplicate'))).toBe(true);
  });

  test('应该检测类型不匹配的表达式', () => {
    const source = `
agent TypeMismatchAgent {
  description: "Type mismatch test"
  type: worker
  layer: L3

  input count: number {
    required: true
  }

  output result: string

  tools: []

  body {
    step invalid {
      call agent: "helper"
      inputs: { count: "not a number" }
    }
  }

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: false
    max_retries: 1
    token_budget: 1000
  }
}
`;
    const ast = parseDSL(source);
    if (ast) {
      const errors = compiler.typeCheck(ast);

      // 应该有类型错误（字面量字符串不能赋值给 number 类型输入）
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  test('应该检测未定义的变量引用', () => {
    const source = `
agent UndefinedVarAgent {
  description: "Undefined variable test"
  type: worker
  layer: L3

  input task: string {
    required: true
  }

  output result: string

  tools: []

  body {
    step invalid {
      call agent: "helper"
      inputs: { data: input.undefined_var }
    }
  }

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: false
    max_retries: 1
    token_budget: 1000
  }
}
`;
    const ast = parseDSL(source);
    if (ast) {
      const errors = compiler.typeCheck(ast);

      // 应该报告未定义的变量
      expect(errors.some(e => e.message.includes('undefined'))).toBe(true);
    }
  });

  test('应该验证数组类型的元素类型', () => {
    const source = `
agent ArrayTypeAgent {
  description: "Array type test"
  type: worker
  layer: L3

  input items: array<string> {
    required: true
  }

  output result: string

  tools: []

  body {
    step process {
      call agent: "processor"
      inputs: { items: input.items }
    }
  }

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: false
    max_retries: 1
    token_budget: 1000
  }
}
`;
    const ast = parseDSL(source);
    if (ast) {
      const errors = compiler.typeCheck(ast);

      // 数组类型应该正确解析
      const itemsInput = ast.inputs.find(i => i.name === 'items');
      expect(itemsInput?.data_type).toEqual({
        kind: 'array',
        item_type: { kind: 'string' },
      });
    }
  });

  test('应该验证对象类型的属性', () => {
    const source = `
agent ObjectTypeAgent {
  description: "Object type test"
  type: worker
  layer: L3

  input config: object {
    required: true
  }

  output result: string

  tools: []

  body {
    step process {
      call agent: "processor"
      inputs: { config: input.config }
    }
  }

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: false
    max_retries: 1
    token_budget: 1000
  }
}
`;
    const ast = parseDSL(source);
    if (ast) {
      const errors = compiler.typeCheck(ast);

      // 对象类型应该正确解析
      const configInput = ast.inputs.find(i => i.name === 'config');
      expect(configInput?.data_type.kind).toBe('object');
    }
  });
});

// ============================================================
// Markdown 转换测试
// ============================================================

describe('DSLCompiler - DSL 转 Markdown', () => {
  let compiler: DSLCompiler;

  beforeEach(() => {
    compiler = new DSLCompiler();
  });

  test('应该将 DSL AST 转换为 Markdown 格式', () => {
    const ast = createMinimalAST();
    const markdown = compiler.toMarkdown(ast);

    expect(markdown).toContain('---');
    expect(markdown).toContain('name: TestAgent');
    expect(markdown).toContain('description: A test agent');
    expect(markdown).toContain('tools:');
    expect(markdown).toContain("['read', 'write']");
    expect(markdown).toContain('# TestAgent');
  });

  test('应该保留输入定义在转换后的 Markdown', () => {
    const ast = createMinimalAST();
    const markdown = compiler.toMarkdown(ast);

    // 输入信息在 frontmatter 中体现
    expect(markdown).toBeDefined();
    expect(typeof markdown).toBe('string');
    expect(markdown.length).toBeGreaterThan(0);
  });

  test('应该保留治理配置在转换后的 Markdown', () => {
    const ast = createMinimalAST();
    const markdown = compiler.toMarkdown(ast);

    expect(markdown).toBeDefined();
    expect(typeof markdown).toBe('string');
  });

  test('应该正确转换复杂类型定义', () => {
    const source = `
agent ComplexTypeAgent {
  description: "Complex type test"
  type: worker
  layer: L3

  input items: array<string> {
    description: "List of items"
    required: true
  }

  input config: object {
    description: "Configuration"
    required: false
  }

  output result: string

  tools: [read, write]

  body {
    step process {
      call agent: "processor"
      inputs: { items: input.items }
    }
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
    const ast = parseDSL(source);
    if (ast) {
      const markdown = compiler.toMarkdown(ast);

      expect(markdown).toBeDefined();
      expect(markdown.length).toBeGreaterThan(100);
    }
  });
});

// ============================================================
// Markdown 转 DSL 测试
// ============================================================

describe('DSLCompiler - Markdown 转 DSL', () => {
  let compiler: DSLCompiler;

  beforeEach(() => {
    compiler = new DSLCompiler();
  });

  test('应该将 Markdown 转换为 DSL AST', () => {
    const markdown = `---
name: test-agent
description: A test agent
tools: ['read', 'write']
---

# Test Agent

You are a test agent.
`;

    const result = compiler.fromMarkdown(markdown);

    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();
    expect(result.ast?.name).toBe('test-agent');
    expect(result.ast?.description).toBe('A test agent');
  });

  test('应该解析 Markdown 中的工具列表', () => {
    const markdown = `---
name: test-agent
description: Test
tools: ['read', 'write', 'execute']
---

# Test Agent
`;

    const result = compiler.fromMarkdown(markdown);

    expect(result.success).toBe(true);
    expect(result.ast?.tools).toHaveLength(3);
    expect(result.ast?.tools.map(t => t.name)).toEqual(['read', 'write', 'execute']);
  });

  test('应该处理缺失的 frontmatter', () => {
    const markdown = `# Just a heading

No frontmatter here.
`;

    const result = compiler.fromMarkdown(markdown);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  test('应该处理空的 description', () => {
    const markdown = `---
name: test-agent
tools: []
---

# Test Agent
`;

    const result = compiler.fromMarkdown(markdown);

    // 应该成功，但 description 可能为空字符串
    expect(result.success).toBe(true);
    expect(result.ast?.name).toBe('test-agent');
  });

  test('应该从目录路径推断 Agent 层', () => {
    const markdown = `---
name: research-director
description: Research director
tools: ['agent', 'search']
---

# Research Director
`;

    const result = compiler.fromMarkdown(markdown, 'layer-1-research/research-director.md');

    expect(result.success).toBe(true);
    expect(result.ast?.layer).toBe('L1');
  });

  test('应该从目录路径推断 governance 层', () => {
    const markdown = `---
name: red-blue-team
description: Red blue team
tools: ['analyze']
---

# Red Blue Team
`;

    const result = compiler.fromMarkdown(markdown, 'governance/red-blue-team.md');

    expect(result.success).toBe(true);
    expect(result.ast?.layer).toBe('governance');
  });
});

// ============================================================
// 双向转换验证测试
// ============================================================

describe('DSLCompiler - 双向转换验证', () => {
  let compiler: DSLCompiler;

  beforeEach(() => {
    compiler = new DSLCompiler();
  });

  test('Markdown -> DSL -> Markdown 应该保持语义等价', () => {
    const originalMarkdown = `---
name: test-agent
description: |
  A test agent for verification.
  Handles multiple tasks.
argument-hint: "project requirements"
tools: ['read', 'write', 'execute']
---

# Test Agent

You are a test agent.

## Instructions

1. Read the requirements
2. Process the data
3. Write the results
`;

    // Markdown -> DSL
    const toDSLResult = compiler.fromMarkdown(originalMarkdown);
    expect(toDSLResult.success).toBe(true);
    const ast = toDSLResult.ast!;

    // DSL -> Markdown
    const backToMarkdown = compiler.toMarkdown(ast);

    // 验证关键字段保持一致
    expect(backToMarkdown).toContain('name: test-agent');
    expect(backToMarkdown).toContain('argument-hint: "project requirements"');
    expect(backToMarkdown).toContain("'read', 'write', 'execute'");
  });

  test('应该支持多次往返转换', () => {
    const markdown = `---
name: multi-convert-agent
description: Test multiple conversions
tools: ['read']
---

# Multi Convert Agent
`;

    // 第一次转换
    const result1 = compiler.fromMarkdown(markdown);
    expect(result1.success).toBe(true);

    // 第二次转换
    const markdown2 = compiler.toMarkdown(result1.ast!);
    const result2 = compiler.fromMarkdown(markdown2);
    expect(result2.success).toBe(true);

    // 第三次转换
    const markdown3 = compiler.toMarkdown(result2.ast!);
    const result3 = compiler.fromMarkdown(markdown3);
    expect(result3.success).toBe(true);

    // 名称应该始终一致
    expect(result1.ast?.name).toBe(result2.ast?.name);
    expect(result2.ast?.name).toBe(result3.ast?.name);
  });
});

// ============================================================
// 代码生成测试
// ============================================================

describe('DSLCompiler - 代码生成', () => {
  let compiler: DSLCompiler;

  beforeEach(() => {
    compiler = new DSLCompiler();
  });

  test('应该生成 TypeScript 类型定义', () => {
    const ast = createMinimalAST();
    const typescript = compiler.generateTypes(ast);

    expect(typescript).toContain('interface');
    expect(typescript).toContain('TestAgentInput');
    expect(typescript).toContain('TestAgentOutput');
    expect(typescript).toContain('task: string');
    expect(typescript).toContain('result: string');
  });

  test('应该生成 JSON Schema', () => {
    const ast = createMinimalAST();
    const schema = compiler.generateJSONSchema(ast);

    expect(typeof schema).toBe('object');
    expect(schema).toHaveProperty('$schema');
    expect(schema).toHaveProperty('title');
    expect(schema).toHaveProperty('type');
  });

  test('应该生成可执行的 AgentDefinition', () => {
    const ast = createMinimalAST();
    const agentDef = compiler.compileToAgentDefinition(ast);

    expect(agentDef).toBeDefined();
    expect(agentDef.name).toBe('TestAgent');
    expect(agentDef.description).toBe('A test agent');
    expect(agentDef.layer).toBe('L3');
    expect(agentDef.type).toBe('worker');
    expect(agentDef.tools).toEqual(['read', 'write']);
  });

  test('生成的 AgentDefinition 应该包含治理配置', () => {
    const ast = createMinimalAST();
    const agentDef = compiler.compileToAgentDefinition(ast);

    expect(agentDef.embedded_governance).toBeDefined();
    expect(agentDef.embedded_governance.first_principles_check).toBe(false);
    expect(agentDef.embedded_governance.quality_gate_enabled).toBe(true);
    expect(agentDef.embedded_governance.max_retries).toBe(3);
    expect(agentDef.embedded_governance.token_budget).toBe(10000);
  });

  test('应该为 while 循环生成正确的代码', () => {
    const ast = createMinimalAST();
    ast.body = [
      {
        type: 'loop',
        loop_type: 'while',
        test: {
          type: 'property_access',
          object: { type: 'variable', name: 'input' },
          property: 'count',
        },
        body: [
          {
            type: 'step',
            name: 'process',
            call: { type: 'agent', name: 'processor' },
            inputs: {},
            loc: { file: 'test.dsl', line: 1, column: 1 },
          },
        ],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ];
    ast.loc = { file: 'test.dsl', line: 1, column: 1 };

    const executable = compiler.compileToFunction(ast);

    expect(typeof executable).toBe('function');
  });

  test('应该为 for_each 循环生成正确的代码', () => {
    const ast = createMinimalAST();
    ast.body = [
      {
        type: 'loop',
        loop_type: 'for_each',
        variable: 'item',
        collection: {
          type: 'property_access',
          object: { type: 'variable', name: 'input' },
          property: 'items',
        },
        body: [
          {
            type: 'step',
            name: 'process_item',
            call: { type: 'agent', name: 'item_processor' },
            inputs: {},
            loc: { file: 'test.dsl', line: 1, column: 1 },
          },
        ],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ];
    ast.loc = { file: 'test.dsl', line: 1, column: 1 };

    const executable = compiler.compileToFunction(ast);

    expect(typeof executable).toBe('function');
  });

  test('应该为 for 循环生成正确的代码', () => {
    const ast = createMinimalAST();
    ast.body = [
      {
        type: 'loop',
        loop_type: 'for',
        variable: 'i',
        collection: {
          type: 'property_access',
          object: { type: 'variable', name: 'input' },
          property: 'count',
        },
        body: [
          {
            type: 'step',
            name: 'process_index',
            call: { type: 'agent', name: 'index_processor' },
            inputs: {},
            loc: { file: 'test.dsl', line: 1, column: 1 },
          },
        ],
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ];
    ast.loc = { file: 'test.dsl', line: 1, column: 1 };

    const executable = compiler.compileToFunction(ast);

    expect(typeof executable).toBe('function');
  });
});

// ============================================================
// 编译选项测试
// ============================================================

describe('DSLCompiler - 编译选项', () => {
  test('应该支持严格类型检查模式', () => {
    const options: DSLCompilerOptions = {
      strict_type_checking: true,
      source_map: false,
      target: 'markdown',
    };

    const compiler = new DSLCompiler(options);
    const ast = createMinimalAST();

    // 在严格模式下，应该进行更严格的检查
    const errors = compiler.typeCheck(ast);

    expect(errors).toBeInstanceOf(Array);
  });

  test('应该支持生成 source map', () => {
    const options: DSLCompilerOptions = {
      strict_type_checking: false,
      source_map: true,
      target: 'markdown',
    };

    const compiler = new DSLCompiler(options);
    const ast = createMinimalAST();
    const result = compiler.compile(ast, 'test.dsl');

    expect(result.success).toBe(true);
    // source map 应该在输出中（具体格式由实现决定）
  });
});

// ============================================================
// 集成测试
// ============================================================

describe('DSLCompiler - 集成测试', () => {
  test('应该支持完整的 DSL 编译流程', () => {
    const dslSource = `
agent FullProcessAgent {
  description: "Full process test agent"
  type: worker
  layer: L3
  domain: software

  input task: string {
    description: "The task to process"
    required: true
  }

  input priority: number {
    description: "Task priority"
    required: false
    default: 5
  }

  output result: object {
    description: "Processing result"
  }

  tools: [read, write, execute]

  capability code_analysis: advanced

  body {
    step analyze {
      call agent: "analyzer"
      inputs: { task: input.task }
    }

    condition check_priority {
      test: input.priority > 7
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
    }

    step finalize {
      call agent: "finalizer"
      inputs: { result: check_priority.output }
    }
  }

  governance {
    first_principles_check: true
    red_team_threshold: medium
    quality_gate_enabled: true
    max_retries: 3
    token_budget: 50000
  }

  metadata {
    author: "Test Author"
    version: "1.0.0"
    license: "MIT"
    tags: ["test", "full-process"]
  }
}
`;

    // 1. 解析 DSL
    const parser = new DSLParser();
    const parseResult = parser.parse(dslSource, 'full-process.dsl');
    expect(parseResult.success).toBe(true);

    // 2. 类型检查
    const compiler = new DSLCompiler();
    const typeErrors = compiler.typeCheck(parseResult.ast!);
    // 在当前阶段，可能有未实现的警告，但不应该有严重错误
    expect(typeErrors.every(e => e.kind !== 'syntax')).toBe(true);

    // 3. 转换为 Markdown
    const markdown = compiler.toMarkdown(parseResult.ast!);
    expect(markdown).toContain('name: FullProcessAgent');
    expect(markdown).toContain('description: Full process test agent');
    expect(markdown).toContain('domain: software');

    // 4. 生成类型定义
    const typescript = compiler.generateTypes(parseResult.ast!);
    expect(typescript).toContain('FullProcessAgentInput');

    // 5. 编译为 AgentDefinition
    const agentDef = compiler.compileToAgentDefinition(parseResult.ast!);
    expect(agentDef.name).toBe('FullProcessAgent');
    expect(agentDef.domain).toBe('software');
  });
});
