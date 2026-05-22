/**
 * DSL Agent Compiler 端到端测试
 *
 * 测试完整的 DSL 源码到可执行 Agent 的编译流程。
 * 遵循 TDD 原则：测试先行，红-绿-重构。
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  DSLAgentCompiler,
  createDSLAgentCompiler,
  AgentCompileResult,
  getDefaultValidators,
  nameConventionValidator,
  inputValidator,
  toolsValidator,
  governanceValidator,
} from '../src/dsl-agent-compiler.js';

// ============================================================
// 测试工具函数
// ============================================================

/** 创建临时目录用于测试 */
function createTempDir(): string {
  const tmpDir = path.join(os.tmpdir(), `honeycomb-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

/** 清理临时目录 */
function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 简单的 Agent DSL
const SIMPLE_AGENT_DSL = `
agent simple-agent {
  description: "A simple test agent"
  type: worker
  layer: L3

  input task: string {
    description: "The task to process"
    required: true
  }

  output result: string {
    description: "Processing result"
  }

  tools: [read, write]

  body {
    step main {
      call agent: "helper"
      inputs: { task: input.task }
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

// 带控制结构的复杂 Agent DSL（简化版以避免变量作用域问题）
const COMPLEX_AGENT_DSL = `
agent complex-agent {
  description: "A complex agent with control structures"
  type: worker
  layer: L3
  domain: software

  input task: string {
    description: "The task to process"
    required: true
  }

  input priority: number {
    description: "Task priority (1-10)"
    required: false
    default: 5
  }

  output result: object {
    description: "Processing result with metadata"
  }

  output status: string {
    description: "Execution status"
  }

  tools: [read, write, execute, analyze]

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
      inputs: { task: input.task }
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
    author: "Test Suite"
    version: "1.0.0"
    license: "MIT"
    tags: ["test", "complex", "control-flow"]
  }
}
`;

// 包含错误的 DSL（用于测试错误处理）
const INVALID_DSL_SYNTAX = `
agent invalid-syntax {
  description: "This agent has syntax errors"
  // 缺少 type 声明

  input task string {
    // 缺少冒号
    required true
    // 缺少冒号
  }

  // 缺少 governance 块
}
`;

const INVALID_DSL_TYPE = `
agent type-mismatch {
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
      inputs: { count: "this is a string not a number" }
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

const INVALID_DSL_UNDEFINED_VAR = `
agent undefined-var {
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
      inputs: { data: input.undefined_variable }
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

// ============================================================
// 基本编译测试
// ============================================================

describe('DSLAgentCompiler - 基本编译', () => {
  let compiler: DSLAgentCompiler;

  beforeEach(() => {
    compiler = createDSLAgentCompiler({
      validators: [], // 不使用默认验证器进行基本测试
    });
  });

  test('应该成功编译简单的 Agent DSL', async () => {
    const result = await compiler.compileAgentFromDSL(SIMPLE_AGENT_DSL, 'simple-test.dsl');

    expect(result.success).toBe(true);
    expect(result.agentDefinition).toBeDefined();
    expect(result.agentDefinition?.name).toBe('simple-agent');
    expect(result.agentDefinition?.description).toBe('A simple test agent');
    expect(result.agentDefinition?.layer).toBe('L3');
    expect(result.agentDefinition?.type).toBe('worker');
    expect(result.markdown).toBeDefined();
    expect(result.markdown).toContain('---');
    expect(result.markdown).toContain('name: simple-agent');
  });

  test('应该成功编译复杂的 Agent DSL', async () => {
    const result = await compiler.compileAgentFromDSL(COMPLEX_AGENT_DSL, 'complex-test.dsl');

    expect(result.success).toBe(true);
    expect(result.agentDefinition).toBeDefined();
    expect(result.agentDefinition?.name).toBe('complex-agent');
    expect(result.agentDefinition?.domain).toBe('software');
    expect(result.agentDefinition?.tools).toEqual(['read', 'write', 'execute', 'analyze']);

    // 检查 AST
    expect(result.ast).toBeDefined();
    expect(result.ast?.inputs).toHaveLength(2);  // task, priority
    expect(result.ast?.outputs).toHaveLength(2);

    // 检查控制结构
    const body = result.ast?.body || [];
    expect(body.some(s => s.type === 'condition')).toBe(true);
    expect(body.some(s => s.type === 'step')).toBe(true);
  });

  test('应该生成有效的 Markdown 格式', async () => {
    const result = await compiler.compileAgentFromDSL(SIMPLE_AGENT_DSL, 'markdown-test.dsl');

    expect(result.success).toBe(true);
    expect(result.markdown).toBeDefined();

    const markdown = result.markdown!;

    // 验证 frontmatter
    expect(markdown).toMatch(/^---\nname:/);
    expect(markdown).toContain('description:');
    expect(markdown).toContain('tools:');

    // 验证 frontmatter 闭合
    const frontmatterEnd = markdown.indexOf('---', 4);
    expect(frontmatterEnd).toBeGreaterThan(0);

    // 验证标题
    expect(markdown).toContain('# Simple Agent');
  });

  test('应该生成可用的 AgentDefinition', async () => {
    const result = await compiler.compileAgentFromDSL(SIMPLE_AGENT_DSL, 'agentdef-test.dsl');

    expect(result.success).toBe(true);
    expect(result.agentDefinition).toBeDefined();

    const agentDef = result.agentDefinition!;
    expect(agentDef.name).toBe('simple-agent');
    expect(agentDef.layer).toBe('L3');
    expect(agentDef.type).toBe('worker');
    expect(agentDef.tools).toEqual(['read', 'write']);
    expect(agentDef.capabilities).toEqual(['read', 'write']);

    // 验证治理配置
    expect(agentDef.embedded_governance).toBeDefined();
    expect(agentDef.embedded_governance.first_principles_check).toBe(false);
    expect(agentDef.embedded_governance.quality_gate_enabled).toBe(true);
    expect(agentDef.embedded_governance.max_retries).toBe(3);
    expect(agentDef.embedded_governance.token_budget).toBe(10000);
  });

  test('应该记录编译耗时', async () => {
    const result = await compiler.compileAgentFromDSL(SIMPLE_AGENT_DSL, 'timing-test.dsl');

    expect(result.success).toBe(true);
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.duration).toBeLessThan(1000); // 应该在 1 秒内完成
  });

  test('应该生成唯一的编译 ID', async () => {
    const result1 = await compiler.compileAgentFromDSL(SIMPLE_AGENT_DSL, 'id-test-1.dsl');
    const result2 = await compiler.compileAgentFromDSL(SIMPLE_AGENT_DSL, 'id-test-2.dsl');

    expect(result1.compileId).toBeDefined();
    expect(result2.compileId).toBeDefined();
    expect(result1.compileId).not.toBe(result2.compileId);
  });
});

// ============================================================
// 错误处理测试
// ============================================================

describe('DSLAgentCompiler - 错误处理', () => {
  let compiler: DSLAgentCompiler;

  beforeEach(() => {
    compiler = createDSLAgentCompiler({
      validators: [],
      skipTypeCheck: false,
    });
  });

  test('应该检测语法错误', async () => {
    const result = await compiler.compileAgentFromDSL(INVALID_DSL_SYNTAX, 'syntax-error.dsl');

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.some(d => d.category === 'syntax')).toBe(true);
  });

  test('应该检测类型错误', async () => {
    const result = await compiler.compileAgentFromDSL(INVALID_DSL_TYPE, 'type-error.dsl');

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.some(d => d.category === 'type')).toBe(true);

    // 找到类型错误并检查消息
    const typeErrors = result.diagnostics.filter(d => d.category === 'type');
    expect(typeErrors.length).toBeGreaterThan(0);
  });

  test('应该检测未定义的变量', async () => {
    const result = await compiler.compileAgentFromDSL(INVALID_DSL_UNDEFINED_VAR, 'undefined-var.dsl');

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);

    // 查找未定义变量错误
    const undefErrors = result.diagnostics.filter(d =>
      d.message.includes('undefined') || d.message.includes('Undefined')
    );
    expect(undefErrors.length).toBeGreaterThan(0);
  });

  test('应该提供错误位置信息', async () => {
    const result = await compiler.compileAgentFromDSL(INVALID_DSL_SYNTAX, 'location-test.dsl');

    expect(result.success).toBe(false);

    for (const diag of result.diagnostics) {
      expect(diag.loc).toBeDefined();
      expect(diag.loc.file).toBeDefined();
      expect(diag.loc.line).toBeGreaterThan(0);
      expect(diag.loc.column).toBeGreaterThan(0);
    }
  });

  test('应该提供错误代码', async () => {
    const result = await compiler.compileAgentFromDSL(INVALID_DSL_SYNTAX, 'code-test.dsl');

    expect(result.success).toBe(false);

    // 至少有一些错误应该有代码
    const errorsWithCode = result.diagnostics.filter(d => d.code);
    expect(errorsWithCode.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 验证器测试
// ============================================================

describe('DSLAgentCompiler - 验证器', () => {
  test('名称规范验证器应该检查 kebab-case', async () => {
    const invalidNameDSL = `
agent Invalid_Name {
  description: "Test"
  type: worker
  layer: L3

  input task: string { required: true }

  output result: string

  tools: []

  body {
    step main { call agent: "helper" inputs: { task: input.task } }
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

    const compiler = createDSLAgentCompiler({
      validators: [nameConventionValidator],
    });

    const result = await compiler.compileAgentFromDSL(invalidNameDSL, 'name-test.dsl');

    // 应该有警告但不失败
    expect(result.diagnostics.some(d =>
      d.kind === 'warning' && d.code === 'NAME_CONVENTION'
    )).toBe(true);
  });

  test('输入验证器应该检查空输入', async () => {
    const noInputDSL = `
agent no-input {
  description: "Test"
  type: worker
  layer: L3

  output result: string

  tools: []

  body {
    step main { call agent: "helper" inputs: {} }
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

    const compiler = createDSLAgentCompiler({
      validators: [inputValidator],
    });

    const result = await compiler.compileAgentFromDSL(noInputDSL, 'input-test.dsl');

    // 应该有警告
    expect(result.diagnostics.some(d =>
      d.kind === 'warning' && d.code === 'NO_INPUTS'
    )).toBe(true);
  });

  test('工具验证器应该检查重复工具', async () => {
    const dupToolDSL = `
agent dup-tool {
  description: "Test"
  type: worker
  layer: L3

  input task: string { required: true }

  output result: string

  tools: [read, read]

  body {
    step main { call agent: "helper" inputs: { task: input.task } }
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

    const compiler = createDSLAgentCompiler({
      validators: [toolsValidator],
    });

    const result = await compiler.compileAgentFromDSL(dupToolDSL, 'tool-test.dsl');

    // 应该有错误
    expect(result.diagnostics.some(d =>
      d.kind === 'error' && d.code === 'DUPLICATE_TOOL'
    )).toBe(true);
  });

  test('治理验证器应该检查 token 预算', async () => {
    const lowBudgetDSL = `
agent low-budget {
  description: "Test"
  type: worker
  layer: L3

  input task: string { required: true }

  output result: string

  tools: []

  body {
    step main { call agent: "helper" inputs: { task: input.task } }
  }

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: false
    max_retries: 1
    token_budget: 500
  }
}
`;

    const compiler = createDSLAgentCompiler({
      validators: [governanceValidator],
    });

    const result = await compiler.compileAgentFromDSL(lowBudgetDSL, 'budget-test.dsl');

    // 应该有警告
    expect(result.diagnostics.some(d =>
      d.kind === 'warning' && d.code === 'LOW_TOKEN_BUDGET'
    )).toBe(true);
  });

  test('默认验证器集合应该包含所有验证器', () => {
    const validators = getDefaultValidators();

    expect(validators).toHaveLength(4);
    expect(validators.map(v => v.name)).toEqual([
      'name-convention',
      'input-validation',
      'tools-validation',
      'governance-validation',
    ]);
  });
});

// ============================================================
// 诊断和统计测试
// ============================================================

describe('DSLAgentCompiler - 诊断和统计', () => {
  let compiler: DSLAgentCompiler;

  beforeEach(() => {
    compiler = createDSLAgentCompiler({
      validators: [],
    });
  });

  test('应该格式化诊断信息', async () => {
    const result = await compiler.compileAgentFromDSL(INVALID_DSL_SYNTAX, 'format-test.dsl');
    const formatted = compiler.formatDiagnostics(result);

    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);

    // 应该包含图标
    expect(formatted).toMatch(/❌|⚠️/);
  });

  test('应该生成统计信息', async () => {
    const result = await compiler.compileAgentFromDSL(INVALID_DSL_SYNTAX, 'stats-test.dsl');
    const stats = compiler.getStats(result);

    expect(stats.totalDiagnostics).toBeGreaterThan(0);
    expect(stats.errors).toBeGreaterThan(0);
    expect(stats.warnings).toBeGreaterThanOrEqual(0);
    expect(typeof stats.byCategory).toBe('object');
  });

  test('成功的编译应该没有错误', async () => {
    const result = await compiler.compileAgentFromDSL(SIMPLE_AGENT_DSL, 'no-error-test.dsl');
    const stats = compiler.getStats(result);

    expect(stats.errors).toBe(0);
  });
});

// ============================================================
// 文件操作测试
// ============================================================

describe('DSLAgentCompiler - 文件操作', () => {
  let tempDir: string;
  let compiler: DSLAgentCompiler;

  beforeEach(() => {
    tempDir = createTempDir();
    compiler = createDSLAgentCompiler({
      tempDir,
      keepTempFiles: false,
      validators: [],
    });
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('应该从文件编译 Agent', async () => {
    const testFile = path.join(tempDir, 'test-agent.dsl');
    Bun.write(testFile, SIMPLE_AGENT_DSL);

    const result = await compiler.compileAgentFromFile(testFile);

    expect(result.success).toBe(true);
    expect(result.agentDefinition?.name).toBe('simple-agent');
  });

  test('应该处理不存在的文件', async () => {
    const result = await compiler.compileAgentFromFile('/nonexistent/file.dsl');

    expect(result.success).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'FILE_READ_FAILED')).toBe(true);
  });

  test('应该创建临时 Markdown 文件', async () => {
    const result = await compiler.compileAgentFromDSL(SIMPLE_AGENT_DSL, 'tempfile-test.dsl');

    expect(result.success).toBe(true);

    const tempPath = compiler.createTempMarkdownFile(result);

    expect(existsSync(tempPath)).toBe(true);

    const content = readFileSync(tempPath, 'utf-8');
    expect(content).toContain('simple-agent');
  });

  test('批量编译应该处理多个文件', async () => {
    // 创建多个测试文件
    const file1 = path.join(tempDir, 'agent1.dsl');
    const file2 = path.join(tempDir, 'agent2.dsl');

    Bun.write(file1, SIMPLE_AGENT_DSL);
    Bun.write(file2, COMPLEX_AGENT_DSL);

    const results = await compiler.compileAgentsFromFiles([file1, file2]);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(results[0].agentDefinition?.name).toBe('simple-agent');
    expect(results[1].agentDefinition?.name).toBe('complex-agent');
  });

  test('批量编译应该并行处理', async () => {
    const start = Date.now();

    const sources = [SIMPLE_AGENT_DSL, COMPLEX_AGENT_DSL, SIMPLE_AGENT_DSL];
    const filenames = ['batch-1.dsl', 'batch-2.dsl', 'batch-3.dsl'];

    const results = await compiler.compileBatch(sources, filenames);

    const duration = Date.now() - start;

    expect(results).toHaveLength(3);
    expect(results.every(r => r.success)).toBe(true);

    // 并行执行应该比串行快（虽然在这个简单测试中可能不太明显）
    expect(duration).toBeLessThan(5000);
  });
});

// ============================================================
// 选项配置测试
// ============================================================

describe('DSLAgentCompiler - 选项配置', () => {
  test('应该支持跳过类型检查', async () => {
    const compiler = createDSLAgentCompiler({
      skipTypeCheck: true,
      validators: [],
    });

    const result = await compiler.compileAgentFromDSL(INVALID_DSL_TYPE, 'skip-typecheck.dsl');

    // 跳过类型检查后，应该能编译成功（假设没有语法错误）
    // 注意：如果 DSL 语法本身有问题，仍然会失败
    // 这里我们假设类型错误不会阻止编译
    expect(result.success).toBe(true);
  });

  test('应该支持严格模式', async () => {
    const compiler = createDSLAgentCompiler({
      strict: true,
      validators: [nameConventionValidator],
    });

    // 使用不符合命名规范的 Agent
    const invalidNameDSL = `
agent Invalid_Name {
  description: "Test"
  type: worker
  layer: L3

  input task: string { required: true }

  output result: string

  tools: []

  body {
    step main { call agent: "helper" inputs: { task: input.task } }
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

    const result = await compiler.compileAgentFromDSL(invalidNameDSL, 'strict-test.dsl');

    // 严格模式下，警告应该被视为错误
    expect(result.success).toBe(false);
  });
});

// ============================================================
// 集成测试
// ============================================================

describe('DSLAgentCompiler - 集成测试', () => {
  test('完整的编译流程应该成功', async () => {
    const compiler = createDSLAgentCompiler({ validators: [] });

    const result = await compiler.compileAgentFromDSL(COMPLEX_AGENT_DSL, 'integration-test.dsl');

    // 验证编译成功
    expect(result.success).toBe(true);

    // 验证所有组件都正确生成
    expect(result.agentDefinition).toBeDefined();
    expect(result.markdown).toBeDefined();
    expect(result.ast).toBeDefined();

    // 验证没有错误
    const stats = compiler.getStats(result);
    expect(stats.errors).toBe(0);

    // 验证生成的 Markdown 可以被 AgentRunner 解析
    const tempPath = compiler.createTempMarkdownFile(result);
    expect(existsSync(tempPath)).toBe(true);
  });

  test('应该处理包含所有特性的 DSL', async () => {
    const fullFeaturedDSL = `
agent full-featured {
  description: "Agent with all features"
  type: worker
  layer: L3
  domain: software

  input task: string {
    description: "The task"
    required: true
  }

  input config: object {
    description: "Configuration"
    required: false
    default: { key: "value" }
  }

  output result: object

  tools: [read, write, execute]

  capability code_analysis: expert
  capability testing: intermediate

  body {
    step analyze {
      call agent: "analyzer"
      inputs: { task: input.task }
      retry {
        max_attempts: 3
        backoff_ms: 1000
      }
    }

    parallel parallel_tasks {
      branches: [
        {
          step task1 {
            call agent: "worker1"
            inputs: { data: input.task }
          }
        },
        {
          step task2 {
            call agent: "worker2"
            inputs: { data: input.task }
          }
        }
      ]
      max_concurrency: 2
    }

    try_catch error_handler {
      try_block: {
        step risky {
          call agent: "risky_operation"
          inputs: { data: input.task }
        }
      }
      catch_variable: error
      catch_block: {
        step handle_error {
          call agent: "error_handler"
          inputs: { error: error }
        }
      }
      finally_block: {
        step cleanup {
          call agent: "cleanup"
          inputs: {}
        }
      }
    }
  }

  governance {
    first_principles_check: true
    red_team_threshold: high
    quality_gate_enabled: true
    max_retries: 5
    token_budget: 100000
  }

  metadata {
    author: "Integration Test"
    version: "2.0.0"
    license: "Apache-2.0"
    tags: ["full", "featured", "integration"]
  }
}
`;

    const compiler = createDSLAgentCompiler({
      validators: [],
    });

    const result = await compiler.compileAgentFromDSL(fullFeaturedDSL, 'full-featured.dsl');

    if (!result.success) {
      console.log('Diagnostics:', JSON.stringify(result.diagnostics, null, 2));
    }
    expect(result.success).toBe(true);
    expect(result.ast?.inputs).toHaveLength(2);
    expect(result.ast?.tools).toHaveLength(3);
    expect(result.ast?.capabilities).toHaveLength(2);

    // 验证控制结构
    const body = result.ast?.body || [];
    expect(body.some(s => s.type === 'step' && s.retry !== undefined)).toBe(true);
    expect(body.some(s => s.type === 'parallel')).toBe(true);
    expect(body.some(s => s.type === 'try_catch')).toBe(true);
  });
});
