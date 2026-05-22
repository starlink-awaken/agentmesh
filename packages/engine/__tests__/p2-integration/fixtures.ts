/**
 * P2 集成测试 - 共享 Fixtures 和辅助函数
 *
 * @since P2.3
 */

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  SkillConfig,
  SkillExecutionRequest,
  SkillExecutionResult,
} from '../../src/workflow-skills-types.js';
import type {
  HoneycombPlugin,
  PluginContext,
  PluginMetadata,
} from '../../src/plugin-types.js';

// ============================================================
// 测试 Fixtures 和辅助函数
// ============================================================

/**
 * 设置临时测试目录
 */
export function setupTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'hc-p2-integration-'));
  return tempDir;
}

/**
 * 清理临时目录
 */
export function cleanupTempDir(tempDir: string): void {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * 创建测试 Agent 定义文件
 */
export function createTestAgentFile(
  dir: string,
  name: string,
  content: string,
): string {
  const agentPath = join(dir, `${name}.md`);
  writeFileSync(agentPath, content);
  return agentPath;
}

/**
 * 创建测试 Skill
 */
export function createTestSkill(skillId: string = 'test.skill.analyze'): SkillConfig {
  return {
    metadata: {
      skill_id: skillId,
      name: 'Test Analyze Skill',
      type: 'analysis',
      version: { major: 1, minor: 0, patch: 0 },
      description: 'A test skill for integration testing',
      publisher: 'test',
      tags: ['test', 'analyze'],
      license: 'MIT',
      dependencies: [],
      keywords: ['test', 'analyze'],
      created_at: Date.now(),
      updated_at: Date.now(),
    },
    execution_mode: 'sync',
    inputs: [
      {
        name: 'data',
        type: 'string',
        description: 'Data to analyze',
        required: true,
      },
    ],
    outputs: [
      {
        type: 'object',
        description: 'Analysis result',
      },
    ],
    agent_template: `Analyze the following data: {{data}}`,
    tools: [],
    token_budget: 1000,
    timeout_ms: 5000,
  };
}

/**
 * 创建测试 Plugin
 */
export class TestIntegrationPlugin implements HoneycombPlugin {
  metadata: PluginMetadata = {
    plugin_id: 'test-integration-plugin',
    name: 'Test Integration Plugin',
    type: 'agent',
    version: '1.0.0',
    honeycomb_version: '>=2.0.0',
    description: 'A test plugin for P2 integration testing',
    permissions: ['read:agents', 'write:agents'],
  };

  callLog: string[] = [];
  initialized = false;
  started = false;

  async initialize(context: PluginContext): Promise<void> {
    this.initialized = true;
    this.callLog.push('initialize');
  }

  async start(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Plugin not initialized');
    }
    this.started = true;
    this.callLog.push('start');
  }

  async stop(): Promise<void> {
    this.started = false;
    this.callLog.push('stop');
  }

  async handle(method: string, params: unknown): Promise<unknown> {
    this.callLog.push(`handle:${method}`);

    switch (method) {
      case 'transform':
        if (typeof params === 'string') {
          return { transformed: params.toUpperCase(), original: params };
        }
        throw new Error('transform expects a string');
      case 'calculate':
        if (typeof params === 'number') {
          return { result: params * 2, original: params };
        }
        throw new Error('calculate expects a number');
      case 'batch-process':
        if (Array.isArray(params)) {
          return {
            processed: params.map((p: unknown) =>
              typeof p === 'string' ? p.toUpperCase() : p,
            ),
            count: params.length,
          };
        }
        throw new Error('batch-process expects an array');
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  async cleanup(): Promise<void> {
    this.callLog.push('cleanup');
  }
}

/**
 * 测试 DSL 源码示例
 */
export const TEST_DSL_SOURCE = `
agent IntegrationTestAgent {
  description: "Agent for testing P2 integration"
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

  capability code_analysis: intermediate

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
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: true
    max_retries: 3
    token_budget: 10000
  }

  metadata {
    author: "Test Suite"
    version: "1.0.0"
    license: "MIT"
    tags: ["test", "integration"]
  }
}
`;

/**
 * 简化的 DSL 源码（用于快速测试）
 */
export const SIMPLE_DSL_SOURCE = `
agent SimpleAgent {
  description: "A simple test agent"
  type: worker
  layer: L3

  input data: string {
    required: true
  }

  output result: string

  tools: [read]

  body {
    step process {
      call agent: "self"
      inputs: { data: input.data }
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
// 性能测量辅助类
// ============================================================

export interface PerformanceMetrics {
  name: string;
  duration_ms: number;
  memory_mb: number;
  success: boolean;
  details?: Record<string, unknown>;
}

export class PerformanceMonitor {
  private measurements: PerformanceMetrics[] = [];

  /**
   * 测量函数执行性能
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T> | T,
    details?: Record<string, unknown>,
  ): Promise<{ result: T; metrics: PerformanceMetrics }> {
    const memBefore = process.memoryUsage();
    const start = performance.now();

    try {
      const result = await fn();
      const end = performance.now();
      const memAfter = process.memoryUsage();

      const metrics: PerformanceMetrics = {
        name,
        duration_ms: end - start,
        memory_mb: (memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024),
        success: true,
        details,
      };

      this.measurements.push(metrics);
      return { result, metrics };
    } catch (error) {
      const end = performance.now();
      const memAfter = process.memoryUsage();

      const metrics: PerformanceMetrics = {
        name,
        duration_ms: end - start,
        memory_mb: (memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024),
        success: false,
        details,
      };

      this.measurements.push(metrics);
      throw error;
    }
  }

  /**
   * 获取所有测量结果
   */
  getMeasurements(): PerformanceMetrics[] {
    return [...this.measurements];
  }

  /**
   * 获取性能报告
   */
  getReport(): string {
    let report = '\n=== Performance Report ===\n';

    for (const m of this.measurements) {
      report += `\n${m.name}:\n`;
      report += `  Duration: ${m.duration_ms.toFixed(2)}ms\n`;
      report += `  Memory: ${m.memory_mb.toFixed(2)}MB\n`;
      report += `  Status: ${m.success ? 'SUCCESS' : 'FAILED'}\n`;
      if (m.details) {
        report += `  Details: ${JSON.stringify(m.details)}\n`;
      }
    }

    return report;
  }

  /**
   * 断言性能在预期范围内
   */
  assertPerformance(
    name: string,
    maxDurationMs: number,
    maxMemoryMb: number,
  ): void {
    const m = this.measurements.find((m) => m.name === name);
    expect(m).toBeDefined();

    if (m) {
      expect(m.success).toBe(true);
      expect(m.duration_ms).toBeLessThan(maxDurationMs);
      expect(m.memory_mb).toBeLessThan(maxMemoryMb);
    }
  }

  clear(): void {
    this.measurements = [];
  }
}
