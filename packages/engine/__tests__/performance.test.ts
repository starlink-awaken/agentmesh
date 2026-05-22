/**
 * Honeycomb 性能基准测试
 *
 * 为 P2 阶段核心组件建立性能基线，包括：
 * - Agent 执行性能（简单/中等/复杂）
 * - Skills 调用性能（无插件/有插件）
 * - Plugin 加载性能（小/中/大）
 * - DSL 编译性能（小/中/大）
 * - 内存使用监控
 *
 * 运行方式：bun test engine/tests/performance.test.ts
 *
 * 性能目标：
 * - Agent 简单: <100ms, 中等: <500ms, 复杂: <2000ms
 * - Skills 无插件: <50ms, 有插件: <200ms
 * - Plugin 小: <500ms, 中: <2000ms, 大: <5000ms
 * - DSL 小: <100ms, 中: <500ms, 大: <2000ms
 */

import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { AgentRunner, AgentPool } from '../src/agent-runner.js';
import { SkillRegistry, SkillExecutor } from '../src/workflow-skills.js';
import { PluginManager } from '../src/plugin-manager.js';
import { DSLCompiler } from '../src/dsl/compiler.js';
import { createLogger } from '../src/logger.js';
import { DEFAULT_ENGINE_CONFIG } from '../src/config-loader.js';
import type { AgentDefinition, ExecutionContext, PluginContext } from '../src/types.js';

// ============================================================================
// 性能测量工具类
// ============================================================================

/**
 * 性能测量器 - 记录执行时间并计算统计指标
 */
class PerformanceMeter {
  private measurements: number[] = [];

  /**
   * 测量函数执行时间
   */
  async measure<T>(fn: () => Promise<T> | T, label: string): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;

    this.measurements.push(duration);
    console.log(`  ⏱️  ${label}: ${duration.toFixed(2)}ms`);

    return result;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    if (this.measurements.length === 0) {
      return { count: 0, min: 0, max: 0, avg: 0, p95: 0, p99: 0 };
    }

    const sorted = [...this.measurements].sort((a, b) => a - b);
    const count = sorted.length;
    const min = sorted[0];
    const max = sorted[count - 1];
    const avg = sorted.reduce((a, b) => a + b, 0) / count;
    const p95 = sorted[Math.floor(count * 0.95)];
    const p99 = sorted[Math.floor(count * 0.99)];

    return { count, min, max, avg, p95, p99 };
  }

  /**
   * 打印统计报告
   */
  printStats(label: string) {
    const stats = this.getStats();
    console.log(`\n📊 ${label} 统计:`);
    console.log(`   样本数: ${stats.count}`);
    console.log(`   最小值: ${stats.min.toFixed(2)}ms`);
    console.log(`   最大值: ${stats.max.toFixed(2)}ms`);
    console.log(`   平均值: ${stats.avg.toFixed(2)}ms`);
    console.log(`   P95: ${stats.p95.toFixed(2)}ms`);
    console.log(`   P99: ${stats.p99.toFixed(2)}ms`);
  }

  /**
   * 重置测量数据
   */
  reset() {
    this.measurements = [];
  }
}

/**
 * 内存监控器 - 跟踪堆内存使用情况
 */
class MemoryMonitor {
  private initialMemory = 0;
  private measurements: { label: string; usage: number }[] = [];

  /**
   * 开始监控
   */
  start() {
    // @ts-ignore - Bun 的 process.memoryUsage API
    this.initialMemory = process.memoryUsage?.().heapUsed || 0;
  }

  /**
   * 记录当前内存使用
   */
  snapshot(label: string) {
    // @ts-ignore - Bun 的 process.memoryUsage API
    const current = process.memoryUsage?.().heapUsed || 0;
    const delta = current - this.initialMemory;
    const deltaMB = delta / (1024 * 1024);

    this.measurements.push({ label, usage: deltaMB });
    console.log(`  💾 ${label}: +${deltaMB.toFixed(2)}MB`);

    return deltaMB;
  }

  /**
   * 打印内存报告
   */
  printReport() {
    console.log('\n📊 内存使用报告:');
    for (const m of this.measurements) {
      console.log(`   ${m.label}: +${m.usage.toFixed(2)}MB`);
    }

    const max = Math.max(...this.measurements.map(m => m.usage));
    console.log(`   峰值内存增长: +${max.toFixed(2)}MB`);
  }

  /**
   * 重置监控数据
   */
  reset() {
    this.initialMemory = 0;
    this.measurements = [];
  }
}

// ============================================================================
// 测试数据与 Mock 实现
// ============================================================================

/**
 * 创建简单的 Agent 定义
 */
function createSimpleAgent(): AgentDefinition {
  return {
    name: 'simple-agent',
    type: 'worker',
    layer: 'L3',
    description: '简单的测试 Agent',
    prompt_path: '/tmp/simple.md',
    tools: [],
    capabilities: [],
    system_prompt: 'You are a helpful assistant.',
    // 添加必需的 embedded_governance 字段
    embedded_governance: {
      risk_level: 'low',
      max_retries: 1,
      timeout_ms: 5000,
      requires_approval: false,
    },
  };
}

/**
 * 创建中等复杂度的 Agent 定义
 */
function createMediumAgent(): AgentDefinition {
  return {
    name: 'medium-agent',
    type: 'worker',
    layer: 'L3',
    description: '中等复杂度的测试 Agent',
    prompt_path: '/tmp/medium.md',
    tools: ['read', 'write', 'bash'],
    capabilities: [
      { name: 'code-analysis', level: 'intermediate' },
      { name: 'file-operations', level: 'advanced' },
    ],
    system_prompt: 'You are an advanced assistant with multiple tools.',
    governance_rules: ['safety-check', 'resource-limit'],
    // 修复: 添加必需的 embedded_governance 字段
    // runAgent() 方法期望此字段存在，用于获取 max_retries 等配置
    embedded_governance: {
      risk_level: 'medium',
      max_retries: 2,
      timeout_ms: 10000,
      requires_approval: false,
    },
  };
}

/**
 * 创建复杂 Agent 定义
 */
function createComplexAgent(): AgentDefinition {
  return {
    name: 'complex-agent',
    type: 'structural',
    layer: 'L2',
    description: '复杂的测试 Agent，包含多种工具和能力',
    prompt_path: '/tmp/complex.md',
    tools: ['read', 'write', 'bash', 'search', 'browser', 'git'],
    capabilities: [
      { name: 'code-analysis', level: 'expert', dependencies: ['parsing'] },
      { name: 'parsing', level: 'expert' },
      { name: 'file-operations', level: 'expert' },
      { name: 'web-research', level: 'advanced' },
      { name: 'git-operations', level: 'advanced' },
    ],
    system_prompt: 'You are an expert assistant with comprehensive tools and capabilities.',
    governance_rules: ['safety-check', 'resource-limit', 'audit-log'],
    max_tokens: 100000,
    temperature: 0.7,
    // 修复: 添加必需的 embedded_governance 字段
    // runAgent() 方法期望此字段存在，用于获取 max_retries 等配置
    embedded_governance: {
      risk_level: 'high',
      max_retries: 3,
      timeout_ms: 30000,
      requires_approval: true,
    },
  };
}

/**
 * 创建测试用的 Skill
 * 返回符合 SkillConfig 接口的结构，包含必需的 metadata 字段
 */
function createTestSkill(name: string, complexity: 'simple' | 'medium' | 'complex') {
  // 修复: 返回完整的 SkillConfig 结构，包含必需的 metadata 字段
  // validateSkillConfig() 检查 config.metadata.skill_id 存在
  return {
    metadata: {
      skill_id: `test.${name}`,
      name: name,
      type: 'transformation' as const,
      version: { major: 1, minor: 0, patch: 0 },
      description: `Test skill - ${complexity}`,
      publisher: 'test',
      tags: ['test', complexity],
      license: 'MIT',
      dependencies: [],
      keywords: [complexity],
      created_at: Date.now(),
      updated_at: Date.now(),
    },
    execution_mode: 'sync' as const,
    inputs: [
      {
        name: 'input',
        type: 'string',
        description: 'Test input',
        required: true,
      },
    ],
    outputs: [
      {
        type: 'string',
        description: 'Test output',
      },
    ],
    agent_template: `Process {{input}} with ${complexity} complexity.`,
    tools: [],
    token_budget: complexity === 'simple' ? 1000 : complexity === 'medium' ? 3000 : 10000,
    timeout_ms: complexity === 'simple' ? 5000 : complexity === 'medium' ? 15000 : 30000,
  };
}

/**
 * 创建测试用的 Plugin
 * 修复: 返回符合 HoneycombPlugin 接口的对象，包含必需的 metadata 和方法
 */
function createTestPlugin(size: 'small' | 'medium' | 'large') {
  // 创建一个简单的 Plugin 类实现
  class TestPlugin implements HoneycombPlugin {
    metadata: PluginMetadata;
    // 添加便捷访问器: name 属性映射到 plugin_id
    // 这允许测试代码使用 plugin.name 代替 plugin.metadata.plugin_id
    get name(): string {
      return this.metadata.plugin_id;
    }
    initialized = false;
    started = false;

    constructor(metadata: PluginMetadata) {
      this.metadata = metadata;
    }

    async initialize(context: PluginContext): Promise<void> {
      this.initialized = true;
    }

    async start(): Promise<void> {
      this.started = true;
    }

    async stop(): Promise<void> {
      this.started = false;
    }

    async cleanup(): Promise<void> {
      // Empty
    }
  }

  const configs = {
    small: {
      plugin_id: 'test-plugin-small',
      name: 'Small Plugin',
      type: 'custom' as const,
      version: '1.0.0',
      honeycomb_version: '>=2.0.0',
      description: 'A small test plugin for performance testing',
    },
    medium: {
      plugin_id: 'test-plugin-medium',
      name: 'Medium Plugin',
      type: 'custom' as const,
      version: '1.0.0',
      honeycomb_version: '>=2.0.0',
      description: 'A medium test plugin for performance testing',
    },
    large: {
      plugin_id: 'test-plugin-large',
      name: 'Large Plugin',
      type: 'custom' as const,
      version: '1.0.0',
      honeycomb_version: '>=2.0.0',
      description: 'A large test plugin for performance testing',
    },
  };

  return new TestPlugin(configs[size]);
}

/**
 * 创建 AgentDSL AST（小型）
 * 用于性能基准测试，创建最小有效 AgentDSL 结构
 */
function createSmallDSL() {
  return {
    type: 'agent' as const,
    name: 'SmallTestAgent',
    description: 'A small test agent for performance testing',
    agent_type: 'worker' as const,
    layer: 'L3' as const,
    inputs: [
      {
        type: 'input' as const,
        name: 'input',
        data_type: { kind: 'string' as const },
        required: true,
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
    ],
    outputs: [
      {
        type: 'output' as const,
        name: 'output',
        data_type: { kind: 'string' as const },
        loc: { file: 'test.dsl', line: 2, column: 1 },
      },
    ],
    tools: [],
    capabilities: [],
    body: [
      {
        type: 'return' as const,
        value: {
          type: 'literal' as const,
          value: 'test',
          loc: { file: 'test.dsl', line: 3, column: 1 },
        },
        loc: { file: 'test.dsl', line: 3, column: 1 },
      },
    ],
    governance: {
      type: 'governance' as const,
      risk_level: 'low' as const,
      checkpoint_interval: 0,
      loc: { file: 'test.dsl', line: 1, column: 1 },
    },
    loc: { file: 'test.dsl', line: 1, column: 1 },
  };
}

/**
 * 创建 AgentDSL AST（中型）
 * 用于性能基准测试，创建中等复杂度的 AgentDSL 结构
 */
function createMediumDSL() {
  // 创建多个步骤以增加复杂度
  const steps = [];
  for (let i = 0; i < 5; i++) {
    steps.push({
      type: 'step' as const,
      name: `step${i}`,
      call: {
        type: 'agent' as const,
        name: `helper${i}`,
      },
      inputs: {
        param: {
          type: 'literal' as const,
          value: i,
          loc: { file: 'test.dsl', line: 10 + i, column: 1 },
        },
      },
      loc: { file: 'test.dsl', line: 10 + i, column: 1 },
    });
  }

  return {
    type: 'agent' as const,
    name: 'MediumTestAgent',
    description: 'A medium test agent for performance testing',
    agent_type: 'worker' as const,
    layer: 'L3' as const,
    inputs: [
      {
        type: 'input' as const,
        name: 'input',
        data_type: { kind: 'string' as const },
        required: true,
        loc: { file: 'test.dsl', line: 1, column: 1 },
      },
      {
        type: 'input' as const,
        name: 'config',
        data_type: { kind: 'any' as const },
        required: false,
        loc: { file: 'test.dsl', line: 2, column: 1 },
      },
    ],
    outputs: [
      {
        type: 'output' as const,
        name: 'output',
        data_type: { kind: 'string' as const },
        loc: { file: 'test.dsl', line: 3, column: 1 },
      },
    ],
    tools: [
      { type: 'tool' as const, name: 'read' },
      { type: 'tool' as const, name: 'write' },
    ],
    capabilities: [],
    body: steps,
    governance: {
      type: 'governance' as const,
      risk_level: 'medium' as const,
      checkpoint_interval: 5,
      loc: { file: 'test.dsl', line: 1, column: 1 },
    },
    loc: { file: 'test.dsl', line: 1, column: 1 },
  };
}

/**
 * 创建 AgentDSL AST（大型）
 * 用于性能基准测试，创建大型复杂的 AgentDSL 结构
 */
function createLargeDSL() {
  // 创建大量步骤以增加复杂度
  const steps = [];
  for (let i = 0; i < 20; i++) {
    steps.push({
      type: 'step' as const,
      name: `step${i}`,
      call: {
        type: 'agent' as const,
        name: `helper${i % 5}`, // 使用 5 个不同的 helper
      },
      inputs: {
        param: {
          type: 'literal' as const,
          value: i,
          loc: { file: 'test.dsl', line: 10 + i, column: 1 },
        },
        nested: {
          type: 'binary' as const,
          left: {
            type: 'literal' as const,
            value: i * 2,
            loc: { file: 'test.dsl', line: 11 + i, column: 1 },
          },
          operator: '+' as const,
          right: {
            type: 'literal' as const,
            value: 10,
            loc: { file: 'test.dsl', line: 11 + i, column: 1 },
          },
          loc: { file: 'test.dsl', line: 11 + i, column: 1 },
        },
      },
      loc: { file: 'test.dsl', line: 10 + i, column: 1 },
    });
  }

  // 创建多个输入输出
  const inputs = [];
  for (let i = 0; i < 10; i++) {
    inputs.push({
      type: 'input' as const,
      name: `input${i}`,
      data_type: { kind: 'string' as const },
      required: i < 5,
      loc: { file: 'test.dsl', line: 1 + i, column: 1 },
    });
  }

  const outputs = [];
  for (let i = 0; i < 5; i++) {
    outputs.push({
      type: 'output' as const,
      name: `output${i}`,
      data_type: { kind: 'any' as const },
      loc: { file: 'test.dsl', line: 20 + i, column: 1 },
    });
  }

  // 创建多个工具和能力
  const tools = [];
  for (let i = 0; i < 10; i++) {
    tools.push({ type: 'tool' as const, name: `tool${i}` });
  }

  const capabilities = [];
  for (let i = 0; i < 5; i++) {
    capabilities.push({
      type: 'capability' as const,
      name: `capability${i}`,
      params: {},
      loc: { file: 'test.dsl', line: 30 + i, column: 1 },
    });
  }

  return {
    type: 'agent' as const,
    name: 'LargeTestAgent',
    description: 'A large test agent for performance testing with many steps and configurations',
    agent_type: 'structural' as const,
    layer: 'L2' as const,
    domain: 'software',
    inputs,
    outputs,
    tools,
    capabilities,
    body: steps,
    governance: {
      type: 'governance' as const,
      risk_level: 'high' as const,
      checkpoint_interval: 3,
      requires_approval: true,
      loc: { file: 'test.dsl', line: 1, column: 1 },
    },
    metadata: {
      type: 'metadata' as const,
      author: 'test',
      version: '1.0.0',
      tags: ['performance', 'test', 'large'],
      loc: { file: 'test.dsl', line: 1, column: 1 },
    },
    loc: { file: 'test.dsl', line: 1, column: 1 },
  };
}

// ============================================================================
// 1. Agent 执行性能测试
// ============================================================================

describe('Agent 执行性能测试', () => {
  const perfMeter = new PerformanceMeter();
  const memoryMonitor = new MemoryMonitor();
  let agentRunner: AgentRunner;
  let agentPool: AgentPool;

  beforeAll(() => {
    console.log('\n🚀 初始化 Agent 执行性能测试...');
    agentRunner = new AgentRunner();
    agentPool = new AgentPool('./test-agents');
    memoryMonitor.start();
  });

  afterEach(() => {
    try {
      agentRunner?.dispose();
    } catch {
      // 忽略 dispose 错误
    }
  });

  test('简单 Agent 执行性能目标: <100ms', async () => {
    console.log('\n📝 测试简单 Agent 执行性能...');
    const agent = createSimpleAgent();
    const context: ExecutionContext = {
      project_id: 'test-project',
      phase: 'EXECUTION',
      inputs: { message: 'Hello' },
    };

    // 运行多次以获得稳定的测量
    for (let i = 0; i < 10; i++) {
      await perfMeter.measure(async () => {
        return agentRunner.runAgent(agent, context);
      }, `执行 ${i + 1}`);
    }

    const stats = perfMeter.getStats();
    console.log(`\n   平均: ${stats.avg.toFixed(2)}ms, P95: ${stats.p95.toFixed(2)}ms`);

    expect(stats.avg).toBeLessThan(100);
    expect(stats.p95).toBeLessThan(100);
  });

  test('中等 Agent 执行性能目标: <500ms', async () => {
    console.log('\n📝 测试中等 Agent 执行性能...');
    perfMeter.reset();

    const agent = createMediumAgent();
    const context: ExecutionContext = {
      project_id: 'test-project',
      phase: 'EXECUTION',
      inputs: { message: 'Hello', task: 'analyze' },
    };

    for (let i = 0; i < 10; i++) {
      await perfMeter.measure(async () => {
        return agentRunner.runAgent(agent, context);
      }, `执行 ${i + 1}`);
    }

    const stats = perfMeter.getStats();
    console.log(`\n   平均: ${stats.avg.toFixed(2)}ms, P95: ${stats.p95.toFixed(2)}ms`);

    expect(stats.avg).toBeLessThan(500);
    expect(stats.p95).toBeLessThan(500);

    memoryMonitor.snapshot('中等 Agent 执行');
  });

  test('复杂 Agent 执行性能目标: <2000ms', async () => {
    console.log('\n📝 测试复杂 Agent 执行性能...');
    perfMeter.reset();

    const agent = createComplexAgent();
    const context: ExecutionContext = {
      project_id: 'test-project',
      phase: 'EXECUTION',
      inputs: {
        message: 'Hello',
        task: 'comprehensive-analysis',
        options: { deep: true, verbose: true },
      },
    };

    for (let i = 0; i < 5; i++) {
      await perfMeter.measure(async () => {
        return agentRunner.runAgent(agent, context);
      }, `执行 ${i + 1}`);
    }

    const stats = perfMeter.getStats();
    console.log(`\n   平均: ${stats.avg.toFixed(2)}ms, P95: ${stats.p95.toFixed(2)}ms`);

    expect(stats.avg).toBeLessThan(2000);
    expect(stats.p95).toBeLessThan(2000);

    memoryMonitor.snapshot('复杂 Agent 执行');
  });

  afterAll(() => {
    perfMeter.printStats('Agent 执行');
    memoryMonitor.printReport();
  });
});

// ============================================================================
// 2. Skills 调用性能测试
// ============================================================================

describe('Skills 调用性能测试', () => {
  const perfMeter = new PerformanceMeter();
  const memoryMonitor = new MemoryMonitor();
  let skillRegistry: SkillRegistry;
  let skillExecutor: SkillExecutor;

  beforeAll(() => {
    console.log('\n🚀 初始化 Skills 调用性能测试...');
    skillRegistry = new SkillRegistry();
    skillExecutor = new SkillExecutor(skillRegistry);
    memoryMonitor.start();
  });

  test('无插件 Skill 调用性能目标: <50ms', async () => {
    console.log('\n📝 测试无插件 Skill 调用性能...');

    const skill = createTestSkill('no-plugin-skill', 'simple');
    skillRegistry.register(skill);

    const context = { input: 'test' };

    for (let i = 0; i < 20; i++) {
      await perfMeter.measure(async () => {
        return skillExecutor.execute(skill, context);
      }, `调用 ${i + 1}`);
    }

    const stats = perfMeter.getStats();
    console.log(`\n   平均: ${stats.avg.toFixed(2)}ms, P95: ${stats.p95.toFixed(2)}ms`);

    expect(stats.avg).toBeLessThan(50);
    expect(stats.p95).toBeLessThan(50);
  });

  test('有插件 Skill 调用性能目标: <200ms', async () => {
    console.log('\n📝 测试有插件 Skill 调用性能...');
    perfMeter.reset();

    // 模拟带插件的 Skill
    const pluginSkill = {
      ...createTestSkill('plugin-skill', 'medium'),
      // 添加插件相关的额外处理
      pluginHooks: ['before', 'after'],
    };

    skillRegistry.register(pluginSkill);

    const context = {
      input: 'test',
      pluginContext: { enabled: true },
    };

    for (let i = 0; i < 15; i++) {
      await perfMeter.measure(async () => {
        // 模拟插件钩子执行
        const beforeHook = async () => await new Promise(r => setTimeout(r, 5));
        const afterHook = async () => await new Promise(r => setTimeout(r, 5));

        await beforeHook();
        const result = await skillExecutor.execute(pluginSkill, context);
        await afterHook();

        return result;
      }, `调用 ${i + 1}`);
    }

    const stats = perfMeter.getStats();
    console.log(`\n   平均: ${stats.avg.toFixed(2)}ms, P95: ${stats.p95.toFixed(2)}ms`);

    expect(stats.avg).toBeLessThan(200);
    expect(stats.p95).toBeLessThan(200);

    memoryMonitor.snapshot('有插件 Skill 调用');
  });

  afterAll(() => {
    perfMeter.printStats('Skills 调用');
    memoryMonitor.printReport();
  });
});

// ============================================================================
// 3. Plugin 加载性能测试
// ============================================================================

/**
 * 创建测试用的 PluginContext
 * PluginManager 构造函数需要 PluginContext 参数，包含 logger 和 config
 */
function createTestPluginContext(): PluginContext {
  return {
    orchestrator: null,
    logger: createLogger({ level: 'warn' }), // 使用 warn 级别减少日志噪音
    config: DEFAULT_ENGINE_CONFIG,
    messageBus: null as any,
  };
}

describe('Plugin 加载性能测试', () => {
  const perfMeter = new PerformanceMeter();
  const memoryMonitor = new MemoryMonitor();
  let pluginManager: PluginManager;

  beforeAll(() => {
    console.log('\n🚀 初始化 Plugin 加载性能测试...');
    // 修复: PluginManager 需要 PluginContext 参数
    pluginManager = new PluginManager(createTestPluginContext());
    memoryMonitor.start();
  });

  test('小型 Plugin 加载性能目标: <500ms', async () => {
    console.log('\n📝 测试小型 Plugin 加载性能...');

    const plugin = createTestPlugin('small');

    await perfMeter.measure(async () => {
      await pluginManager.registerPlugin(plugin as any);
      await pluginManager.initializePlugin(plugin.name);
    }, '小型 Plugin 加载');

    const stats = perfMeter.getStats();
    console.log(`\n   加载时间: ${stats.max.toFixed(2)}ms`);

    expect(stats.max).toBeLessThan(500);

    memoryMonitor.snapshot('小型 Plugin 加载');
  });

  test('中型 Plugin 加载性能目标: <2000ms', async () => {
    console.log('\n📝 测试中型 Plugin 加载性能...');
    perfMeter.reset();

    const plugin = createTestPlugin('medium');

    await perfMeter.measure(async () => {
      await pluginManager.registerPlugin(plugin as any);
      await pluginManager.initializePlugin(plugin.name);
    }, '中型 Plugin 加载');

    const stats = perfMeter.getStats();
    console.log(`\n   加载时间: ${stats.max.toFixed(2)}ms`);

    expect(stats.max).toBeLessThan(2000);

    memoryMonitor.snapshot('中型 Plugin 加载');
  });

  test('大型 Plugin 加载性能目标: <5000ms', async () => {
    console.log('\n📝 测试大型 Plugin 加载性能...');
    perfMeter.reset();

    const plugin = createTestPlugin('large');

    await perfMeter.measure(async () => {
      await pluginManager.registerPlugin(plugin as any);
      await pluginManager.initializePlugin(plugin.name);
    }, '大型 Plugin 加载');

    const stats = perfMeter.getStats();
    console.log(`\n   加载时间: ${stats.max.toFixed(2)}ms`);

    expect(stats.max).toBeLessThan(5000);

    memoryMonitor.snapshot('大型 Plugin 加载');
  });

  afterAll(() => {
    perfMeter.printStats('Plugin 加载');
    memoryMonitor.printReport();
  });
});

// ============================================================================
// 4. DSL 编译性能测试
// ============================================================================

describe('DSL 编译性能测试', () => {
  const perfMeter = new PerformanceMeter();
  const memoryMonitor = new MemoryMonitor();
  let compiler: DSLCompiler;

  beforeAll(() => {
    console.log('\n🚀 初始化 DSL 编译性能测试...');
    compiler = new DSLCompiler();
    memoryMonitor.start();
  });

  test('小型 DSL 编译性能目标: <100ms', async () => {
    console.log('\n📝 测试小型 DSL 编译性能...');

    const ast = createSmallDSL();

    for (let i = 0; i < 20; i++) {
      await perfMeter.measure(async () => {
        compiler.typeCheck(ast);
        return compiler.compile(ast);
      }, `编译 ${i + 1}`);
    }

    const stats = perfMeter.getStats();
    console.log(`\n   平均: ${stats.avg.toFixed(2)}ms, P95: ${stats.p95.toFixed(2)}ms`);

    expect(stats.avg).toBeLessThan(100);
    expect(stats.p95).toBeLessThan(100);
  });

  test('中型 DSL 编译性能目标: <500ms', async () => {
    console.log('\n📝 测试中型 DSL 编译性能...');
    perfMeter.reset();

    const ast = createMediumDSL();

    for (let i = 0; i < 15; i++) {
      await perfMeter.measure(async () => {
        compiler.typeCheck(ast);
        return compiler.compile(ast);
      }, `编译 ${i + 1}`);
    }

    const stats = perfMeter.getStats();
    console.log(`\n   平均: ${stats.avg.toFixed(2)}ms, P95: ${stats.p95.toFixed(2)}ms`);

    expect(stats.avg).toBeLessThan(500);
    expect(stats.p95).toBeLessThan(500);

    memoryMonitor.snapshot('中型 DSL 编译');
  });

  test('大型 DSL 编译性能目标: <2000ms', async () => {
    console.log('\n📝 测试大型 DSL 编译性能...');
    perfMeter.reset();

    const ast = createLargeDSL();

    for (let i = 0; i < 5; i++) {
      await perfMeter.measure(async () => {
        compiler.typeCheck(ast);
        return compiler.compile(ast);
      }, `编译 ${i + 1}`);
    }

    const stats = perfMeter.getStats();
    console.log(`\n   平均: ${stats.avg.toFixed(2)}ms, P95: ${stats.p95.toFixed(2)}ms`);

    expect(stats.avg).toBeLessThan(2000);
    expect(stats.p95).toBeLessThan(2000);

    memoryMonitor.snapshot('大型 DSL 编译');
  });

  afterAll(() => {
    perfMeter.printStats('DSL 编译');
    memoryMonitor.printReport();
  });
});

// ============================================================================
// 5. 内存监控测试
// ============================================================================

describe('内存监控测试', () => {
  const memoryMonitor = new MemoryMonitor();
  let agentRunner: AgentRunner | null = null;

  beforeAll(() => {
    console.log('\n🚀 初始化内存监控测试...');
    memoryMonitor.start();
  });

  afterEach(() => {
    try {
      agentRunner?.dispose();
    } catch {
      // 忽略 dispose 错误
    }
  });

  test('Agent 执行内存使用监控', async () => {
    console.log('\n📝 监控 Agent 执行的内存使用...');

    agentRunner = new AgentRunner();
    const agent = createSimpleAgent();
    const context: ExecutionContext = {
      project_id: 'test-project',
      phase: 'EXECUTION',
      inputs: { message: 'Memory test' },
    };

    memoryMonitor.snapshot('Agent 执行前');

    // 执行多次以观察内存增长
    for (let i = 0; i < 10; i++) {
      await agentRunner.runAgent(agent, context);
    }

    const delta = memoryMonitor.snapshot('Agent 执行后');
    console.log(`\n   内存增长: +${delta.toFixed(2)}MB`);

    // 验证内存增长在合理范围内（<50MB）
    expect(delta).toBeLessThan(50);
  });

  test('Skills 调用内存使用监控', async () => {
    console.log('\n📝 监控 Skills 调用的内存使用...');
    memoryMonitor.reset();
    memoryMonitor.start();

    const skillRegistry = new SkillRegistry();
    const skillExecutor = new SkillExecutor(skillRegistry);
    const skill = createTestSkill('memory-test-skill', 'complex');
    skillRegistry.register(skill);

    memoryMonitor.snapshot('Skill 调用前');

    const context = { input: 'test' };
    for (let i = 0; i < 20; i++) {
      await skillExecutor.execute(skill, context);
    }

    const delta = memoryMonitor.snapshot('Skill 调用后');
    console.log(`\n   内存增长: +${delta.toFixed(2)}MB`);

    expect(delta).toBeLessThan(30);
  });

  test('DSL 编译内存使用监控', async () => {
    console.log('\n📝 监控 DSL 编译的内存使用...');
    memoryMonitor.reset();
    memoryMonitor.start();

    const compiler = new DSLCompiler();
    const ast = createLargeDSL();

    memoryMonitor.snapshot('DSL 编译前');

    for (let i = 0; i < 10; i++) {
      compiler.typeCheck(ast);
      compiler.compile(ast);
    }

    const delta = memoryMonitor.snapshot('DSL 编译后');
    console.log(`\n   内存增长: +${delta.toFixed(2)}MB`);

    expect(delta).toBeLessThan(50);
  });

  test('Plugin 加载内存使用监控', async () => {
    console.log('\n📝 监控 Plugin 加载的内存使用...');
    memoryMonitor.reset();
    memoryMonitor.start();

    // 修复: PluginManager 需要 PluginContext 参数
    const pluginManager = new PluginManager(createTestPluginContext());

    memoryMonitor.snapshot('Plugin 加载前');

    // 加载多个插件
    const plugins = [
      createTestPlugin('small'),
      createTestPlugin('medium'),
      createTestPlugin('large'),
    ];

    for (const plugin of plugins) {
      await pluginManager.registerPlugin(plugin as any);
      await pluginManager.initializePlugin(plugin.name);
    }

    const delta = memoryMonitor.snapshot('Plugin 加载后');
    console.log(`\n   内存增长: +${delta.toFixed(2)}MB`);

    // Plugin 加载可能使用较多内存，但应该在合理范围内
    expect(delta).toBeLessThan(100);
  });

  afterAll(() => {
    memoryMonitor.printReport();
  });
});

// ============================================================================
// 性能基准总结
// ============================================================================

describe('性能基准总结', () => {
  test('所有性能目标汇总', () => {
    console.log('\n' + '='.repeat(60));
    console.log('📊 Honeycomb P2 阶段性能基准目标汇总');
    console.log('='.repeat(60));

    console.log('\n🤖 Agent 执行性能:');
    console.log('   简单:  <100ms (平均 & P95)');
    console.log('   中等:  <500ms (平均 & P95)');
    console.log('   复杂:  <2000ms (平均 & P95)');

    console.log('\n🛠️  Skills 调用性能:');
    console.log('   无插件: <50ms (平均 & P95)');
    console.log('   有插件: <200ms (平均 & P95)');

    console.log('\n🔌 Plugin 加载性能:');
    console.log('   小型:  <500ms');
    console.log('   中型:  <2000ms');
    console.log('   大型:  <5000ms');

    console.log('\n📝 DSL 编译性能:');
    console.log('   小型:  <100ms (平均 & P95)');
    console.log('   中型:  <500ms (平均 & P95)');
    console.log('   大型:  <2000ms (平均 & P95)');

    console.log('\n💾 内存使用:');
    console.log('   Agent 执行:  <50MB 增长');
    console.log('   Skills 调用:  <30MB 增长');
    console.log('   DSL 编译:    <50MB 增长');
    console.log('   Plugin 加载:  <100MB 增长');

    console.log('\n' + '='.repeat(60));
    console.log('✅ 性能基准测试完成！');
    console.log('='.repeat(60) + '\n');

    expect(true).toBe(true); // 汇总测试总是通过
  });
});
