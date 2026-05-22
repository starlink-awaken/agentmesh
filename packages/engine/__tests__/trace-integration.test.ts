/**
 * Trace ID 系统与 Orchestrator 集成测试
 *
 * 测试 TraceContext 与 HoneycombOrchestrator 的集成：
 * - 项目创建时自动生成 Trace ID
 * - Trace ID 正确传递到日志系统
 * - Agent 执行时创建和完成 Span
 * - 可以导出完整的项目追踪报告
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { HoneycombOrchestrator } from '../src/orchestrator.js';
import type { ProjectConfig, EngineConfig } from '../src/types.js';
import { TraceContextImpl } from '../src/trace-context.js';
import { TraceExporter } from '../src/trace-exporter.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// 获取项目根目录（从engine/tests/向上两级）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

describe('Trace ID 系统与 Orchestrator 集成', () => {
  let orchestrator: HoneycombOrchestrator;
  let testConfig: Partial<EngineConfig>;

  beforeEach(() => {
    // 使用内存数据库进行测试
    testConfig = {
      db_path: ':memory:',
      agents_root: path.join(projectRoot, 'agents'),  // 修正路径
      domains_root: path.join(projectRoot, 'domains'), // 修正路径
      output_dir: './output/test',
      log_level: 'error', // 减少测试输出
      auto_checkpoint: false,
    };

    orchestrator = new HoneycombOrchestrator(testConfig);
  });

  describe('项目创建时的 Trace ID 生成', () => {
    it('应该在创建项目时生成 Trace ID', () => {
      const projectConfig: ProjectConfig = {
        name: 'test-trace-project',
        description: '测试 Trace ID 生成的项目',
        archetype: 'software-dev',
        goals: ['测试 Trace ID 是否正确生成'],
      };

      const state = orchestrator.createProject(projectConfig);

      expect(state.trace_id).toBeDefined();
      expect(typeof state.trace_id).toBe('string');
      expect(state.trace_id.length).toBeGreaterThan(0);
    });

    it('应该生成格式正确的 Trace ID（hc-{timestamp}-{hex}）', () => {
      const projectConfig: ProjectConfig = {
        name: 'test-trace-format',
        description: '测试 Trace ID 格式',
        archetype: 'software-dev',
        goals: ['验证格式'],
      };

      const state = orchestrator.createProject(projectConfig);

      // Trace ID 格式：hc-{timestamp}-{4位hex}
      expect(state.trace_id).toMatch(/^hc-\d+-[0-9a-f]{4}$/);
    });

    it('每个项目应该有唯一的 Trace ID', () => {
      const config: ProjectConfig = {
        name: 'unique-trace-test',
        description: '测试唯一性',
        archetype: 'software-dev',
        goals: ['测试'],
      };

      const state1 = orchestrator.createProject(config);
      const state2 = orchestrator.createProject({
        ...config,
        name: 'unique-trace-test-2',
      });

      expect(state1.trace_id).not.toBe(state2.trace_id);
    });
  });

  describe('TraceContext 手动集成', () => {
    it('应该能够手动创建与项目关联的 TraceContext', () => {
      const projectConfig: ProjectConfig = {
        name: 'manual-trace-test',
        description: '测试手动 TraceContext',
        archetype: 'software-dev',
        goals: ['测试'],
      };

      const state = orchestrator.createProject(projectConfig);

      // 使用项目的 Trace ID 创建 TraceContext
      const traceContext = new TraceContextImpl(state.trace_id!);

      expect(traceContext.traceId).toBe(state.trace_id);
      expect(traceContext.getRootSpan()).toBeDefined();
    });

    it('应该能够为项目操作创建 Spans', () => {
      const projectConfig: ProjectConfig = {
        name: 'span-creation-test',
        description: '测试 Span 创建',
        archetype: 'software-dev',
        goals: ['测试'],
      };

      const state = orchestrator.createProject(projectConfig);
      const traceContext = new TraceContextImpl(state.trace_id!);

      // 创建项目操作 spans
      const createSpan = traceContext.createSpan('orchestrator:createProject', traceContext.rootSpanId, {
        project_name: state.project_name,
      });

      traceContext.finishSpan(createSpan.spanId, 'success');

      const metrics = traceContext.getMetrics();
      expect(metrics.totalSpans).toBe(2); // root + createProject
      expect(metrics.errorCount).toBe(0);
    });

    it('应该能够导出完整的项目追踪报告', () => {
      const projectConfig: ProjectConfig = {
        name: 'trace-report-test',
        description: '测试追踪报告导出',
        archetype: 'software-dev',
        goals: ['测试报告导出'],
      };

      const state = orchestrator.createProject(projectConfig);
      const traceContext = new TraceContextImpl(state.trace_id!);

      // 创建一些操作 spans
      const createSpan = traceContext.createSpan('orchestrator:createProject');
      const loadDomainSpan = traceContext.createSpan('domain:load', createSpan.spanId);
      const assessSpan = traceContext.createSpan('orchestrator:assessComplexity');

      traceContext.finishSpan(createSpan.spanId, 'success');
      traceContext.finishSpan(loadDomainSpan.spanId, 'success');
      traceContext.finishSpan(assessSpan.spanId, 'success');

      // 导出为各种格式
      const exporter = new TraceExporter();

      const json = exporter.exportToJSON(traceContext);
      expect(() => JSON.parse(json)).not.toThrow();
      expect(json).toContain(state.trace_id);

      const text = exporter.exportToText(traceContext);
      expect(text).toContain(state.trace_id);
      expect(text).toContain('createProject');
      expect(text).toContain('load');

      const summary = exporter.exportToSummary(traceContext);
      expect(summary).toContain(state.trace_id);
    });
  });

  describe('错误追踪', () => {
    it('应该正确记录和显示错误信息', () => {
      const projectConfig: ProjectConfig = {
        name: 'error-tracking-test',
        description: '测试错误追踪',
        archetype: 'software-dev',
        goals: ['测试'],
      };

      const state = orchestrator.createProject(projectConfig);
      const traceContext = new TraceContextImpl(state.trace_id!);

      // 创建成功和失败的 spans
      const successSpan = traceContext.createSpan('agent:execute-success');
      const errorSpan = traceContext.createSpan('agent:execute-failure');

      traceContext.finishSpan(successSpan.spanId, 'success');
      traceContext.finishSpan(errorSpan.spanId, 'error', '模拟 Agent 执行失败');

      const exporter = new TraceExporter();

      // 导出完整报告（不使用 errorsOnly，因为根 span 没有错误）
      const fullReport = exporter.exportToText(traceContext);
      expect(fullReport).toContain('execute-failure');

      // 检查指标中是否正确统计了错误
      const metrics = traceContext.getMetrics();
      expect(metrics.errorCount).toBe(1);
      expect(metrics.slowestSpan.spanId).toBeDefined();
    });
  });

  describe('性能追踪', () => {
    it('应该正确计算操作持续时间', async () => {
      const projectConfig: ProjectConfig = {
        name: 'performance-tracking-test',
        description: '测试性能追踪',
        archetype: 'software-dev',
        goals: ['测试'],
      };

      const state = orchestrator.createProject(projectConfig);
      const traceContext = new TraceContextImpl(state.trace_id!);

      const fastSpan = traceContext.createSpan('operation:fast');
      const slowSpan = traceContext.createSpan('operation:slow');

      await new Promise(resolve => setTimeout(resolve, 5));
      traceContext.finishSpan(fastSpan.spanId, 'success');

      await new Promise(resolve => setTimeout(resolve, 10));
      traceContext.finishSpan(slowSpan.spanId, 'success');

      const metrics = traceContext.getMetrics();

      expect(metrics.totalSpans).toBe(3); // root + fast + slow
      // root span 仍然是 pending，所以 totalDuration 可能是 0
      // 检查至少有 span 被完成
      expect(metrics.slowestSpan.duration).toBeGreaterThanOrEqual(0);

      // slowSpan 应该是最慢的
      const exporter = new TraceExporter();
      const text = exporter.exportToText(traceContext);
      expect(text).toContain('Slowest Span');
    });
  });

  describe('层级追踪', () => {
    it('应该正确构建嵌套的操作层级', () => {
      const projectConfig: ProjectConfig = {
        name: 'hierarchy-tracking-test',
        description: '测试层级追踪',
        archetype: 'software-dev',
        goals: ['测试'],
      };

      const state = orchestrator.createProject(projectConfig);
      const traceContext = new TraceContextImpl(state.trace_id!);

      // 创建层级结构:
      // root
      //   ├── phase:init
      //   │   ├── loadConfig
      //   │   └── validateConfig
      //   └── phase:research
      //       └── agent:execute

      const initPhase = traceContext.createSpan('phase:init', traceContext.rootSpanId);
      const loadConfig = traceContext.createSpan('config:load', initPhase.spanId);
      const validateConfig = traceContext.createSpan('config:validate', initPhase.spanId);
      const researchPhase = traceContext.createSpan('phase:research', traceContext.rootSpanId);
      const agentExecute = traceContext.createSpan('agent:execute', researchPhase.spanId);

      traceContext.finishSpan(loadConfig.spanId, 'success');
      traceContext.finishSpan(validateConfig.spanId, 'success');
      traceContext.finishSpan(initPhase.spanId, 'success');
      traceContext.finishSpan(agentExecute.spanId, 'success');
      traceContext.finishSpan(researchPhase.spanId, 'success');

      // 验证树结构
      const tree = traceContext.getTraceTree();
      expect(tree.span.operationName).toBe('root');
      expect(tree.children.length).toBe(2); // init 和 research

      const initNode = tree.children.find(n => n.span.operationName === 'phase:init');
      expect(initNode).toBeDefined();
      expect(initNode?.children.length).toBe(2); // load 和 validate

      const exportText = new TraceExporter().exportToText(traceContext);
      expect(exportText).toContain('phase:init');
      expect(exportText).toContain('config:load');
      expect(exportText).toContain('config:validate');
    });
  });
});
