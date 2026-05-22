/**
 * P2 集成测试 - 场景3：DSL编译到Agent执行
 *
 * 测试完整的DSL编译流程：
 * - DSL源码 → 解析 → 类型检查 → 编译 → 生成Markdown
 * - DSL错误诊断
 * - Markdown到DSL的反向转换
 * - 生成TypeScript类型和JSON Schema
 *
 * @since P2.3
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { DSLCompiler } from '../../src/dsl/compiler.js';
import { DSLParser } from '../../src/dsl/parser.js';
import { TEST_DSL_SOURCE, SIMPLE_DSL_SOURCE, PerformanceMonitor } from './fixtures.js';

describe('P2 Integration - 场景3: DSL编译到Agent执行', () => {
  let perfMonitor: PerformanceMonitor;

  beforeEach(() => {
    perfMonitor = new PerformanceMonitor();
  });

  test('完整流程: DSL源码 → 解析 → 类型检查 → 编译 → 生成Markdown', async () => {
    // 1. 解析 DSL
    const { result: parseResult, metrics: parseMetrics } =
      await perfMonitor.measure('dsl:parse', () => {
        const parser = new DSLParser();
        return parser.parse(TEST_DSL_SOURCE, 'test-integration.dsl');
      });

    expect(parseMetrics.success).toBe(true);
    expect(parseResult.success).toBe(true);
    expect(parseResult.ast).toBeDefined();
    expect(parseResult.ast?.name).toBe('IntegrationTestAgent');

    // 2. 类型检查
    const { result: typeErrors, metrics: typeCheckMetrics } =
      await perfMonitor.measure('dsl:typecheck', () => {
        const compiler = new DSLCompiler();
        return compiler.typeCheck(parseResult.ast!);
      });

    expect(typeCheckMetrics.success).toBe(true);
    // 不应该有严重的类型错误
    expect(
      typeErrors.filter((e) => e.kind === 'syntax' || e.kind === 'type-mismatch')
        .length,
    ).toBe(0);

    // 3. 转换为 Markdown
    const { result: markdown, metrics: toMarkdownMetrics } =
      await perfMonitor.measure('dsl:tomarkdown', () => {
        const compiler = new DSLCompiler();
        return compiler.toMarkdown(parseResult.ast!);
      });

    expect(toMarkdownMetrics.success).toBe(true);
    expect(markdown).toContain('---');
    expect(markdown).toContain('name: IntegrationTestAgent');
    expect(markdown).toContain('description: Agent for testing P2 integration');

    // 4. 编译为 AgentDefinition
    const { result: agentDef, metrics: compileMetrics } =
      await perfMonitor.measure('dsl:compile', () => {
        const compiler = new DSLCompiler();
        return compiler.compileToAgentDefinition(parseResult.ast!);
      });

    expect(compileMetrics.success).toBe(true);
    expect(agentDef.name).toBe('IntegrationTestAgent');
    expect(agentDef.description).toBe('Agent for testing P2 integration');
    expect(agentDef.layer).toBe('L3');
    expect(agentDef.type).toBe('worker');
    expect(agentDef.domain).toBe('software');

    // 5. 验证治理配置
    expect(agentDef.embedded_governance).toBeDefined();
    expect(agentDef.embedded_governance.first_principles_check).toBe(false);
    expect(agentDef.embedded_governance.quality_gate_enabled).toBe(true);
    expect(agentDef.embedded_governance.max_retries).toBe(3);
    expect(agentDef.embedded_governance.token_budget).toBe(10000);

    // 6. 验证性能
    perfMonitor.assertPerformance('dsl:parse', 100, 1);
    perfMonitor.assertPerformance('dsl:typecheck', 50, 0.5);
    perfMonitor.assertPerformance('dsl:tomarkdown', 50, 0.5);
    perfMonitor.assertPerformance('dsl:compile', 50, 0.5);
  });

  test('DSL 错误诊断', async () => {
    // 包含错误的 DSL
    const invalidDSL = `
agent InvalidAgent {
  description: "Test error diagnostics"
  type: worker
  layer: L3

  input task: string { required: true }
  input task: number { required: true }  // 重复输入

  tools: [read, read]  // 重复工具

  body {
    step process {
      call agent: "self"
      inputs: { task: input.task }
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

    const parser = new DSLParser();
    const parseResult = parser.parse(invalidDSL, 'invalid.dsl');

    expect(parseResult.success).toBe(true);

    const compiler = new DSLCompiler();
    const errors = compiler.typeCheck(parseResult.ast!);

    // 应该检测到重复的输入和工具
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
  });

  test('Markdown 到 DSL 的反向转换', async () => {
    const markdown = `---
name: reverse-test-agent
description: |
  A multi-line description
  for testing reverse conversion
argument-hint: "project requirements"
tools: ['read', 'write', 'execute']
---

# Reverse Test Agent

You are a test agent.
`;

    const compiler = new DSLCompiler();
    const result = compiler.fromMarkdown(markdown, 'layer-3-execution/reverse-test.md');

    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();
    expect(result.ast?.name).toBe('reverse-test-agent');
    expect(result.ast?.layer).toBe('L3');
    expect(result.ast?.description).toContain('multi-line description');
  });

  test('生成 TypeScript 类型和 JSON Schema', async () => {
    const parser = new DSLParser();
    const parseResult = parser.parse(SIMPLE_DSL_SOURCE, 'simple.dsl');

    expect(parseResult.success).toBe(true);

    const compiler = new DSLCompiler();

    // 生成 TypeScript 类型
    const { result: typescript, metrics: tsMetrics } =
      await perfMonitor.measure('dsl:generate:typescript', () => {
        return compiler.generateTypes(parseResult.ast!);
      });

    expect(tsMetrics.success).toBe(true);
    expect(typescript).toContain('interface');
    expect(typescript).toContain('SimpleAgentInput');
    expect(typescript).toContain('SimpleAgentOutput');

    // 生成 JSON Schema
    const { result: jsonSchema, metrics: schemaMetrics } =
      await perfMonitor.measure('dsl:generate:schema', () => {
        return compiler.generateJSONSchema(parseResult.ast!);
      });

    expect(schemaMetrics.success).toBe(true);
    expect(typeof jsonSchema).toBe('object');
    expect(jsonSchema).toHaveProperty('$schema');
    expect(jsonSchema).toHaveProperty('title');
  });
});
