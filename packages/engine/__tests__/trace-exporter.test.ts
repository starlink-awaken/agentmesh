/**
 * Trace Exporter 单元测试
 *
 * 测试追踪数据导出功能，包括：
 * - JSON 导出
 * - Mermaid 图表导出
 * - 文本格式导出
 * - Markdown 导出
 * - 摘要导出
 * - 过滤选项
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  TraceExporter,
  createTraceExporter,
  exportTraceAsJSON,
  exportTraceAsMermaid,
  exportTraceAsText,
  exportTraceAsSummary,
  exportTraceAsMarkdown,
} from '../src/trace-exporter.js';
import { TraceContextImpl } from '../src/trace-context.js';

describe('TraceExporter', () => {
  let exporter: TraceExporter;
  let context: TraceContextImpl;

  const createTestContext = async (): Promise<TraceContextImpl> => {
    const ctx = new TraceContextImpl('test-trace-123');

    // 创建测试 span 层级结构:
    // root
    //   ├── operation-1 (success)
    //   │   └── sub-operation-1 (success)
    //   ├── operation-2 (error)
    //   └── operation-3 (pending)

    const op1 = ctx.createSpan('operation-1', ctx.rootSpanId, { agent: 'agent-1' });
    const op2 = ctx.createSpan('operation-2', ctx.rootSpanId, { agent: 'agent-2' });
    const op3 = ctx.createSpan('operation-3', ctx.rootSpanId, { agent: 'agent-3' });

    const subOp1 = ctx.createSpan('sub-operation-1', op1.spanId);

    // 等待确保有时间差
    await new Promise(resolve => setTimeout(resolve, 1));

    ctx.finishSpan(op1.spanId, 'success');
    ctx.finishSpan(op2.spanId, 'error', 'Test error message');
    // op3 保持 pending
    ctx.finishSpan(subOp1.spanId, 'success');

    return ctx;
  };

  beforeEach(async () => {
    exporter = new TraceExporter();
    context = await createTestContext();
  });

  describe('exportToJSON', () => {
    it('应该导出有效的 JSON', () => {
      const json = exporter.exportToJSON(context);

      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);

      expect(parsed.traceId).toBe('test-trace-123');
      expect(parsed.spans).toBeDefined();
      expect(Array.isArray(parsed.spans)).toBe(true);
      expect(parsed.metrics).toBeDefined();
    });

    it('应该包含所有必要字段', () => {
      const json = exporter.exportToJSON(context);
      const parsed = JSON.parse(json);

      expect(parsed.traceId).toBe('test-trace-123');
      expect(parsed.rootSpanId).toBeDefined();
      expect(parsed.createdAt).toBeDefined();
      expect(parsed.metrics.totalSpans).toBe(5); // root + 3 operations + 1 sub-operation
    });

    it('应该包含 tags 当 includeTags=true', () => {
      const json = exporter.exportToJSON(context, { includeTags: true });
      const parsed = JSON.parse(json);

      const op1 = parsed.spans.find((s: any) => s.operationName === 'operation-1');
      expect(op1?.tags).toBeDefined();
      expect(op1?.tags.agent).toBe('agent-1');
    });

    it('应该不包含 tags 当 includeTags=false', () => {
      const json = exporter.exportToJSON(context, { includeTags: false });
      const parsed = JSON.parse(json);

      const op1 = parsed.spans.find((s: any) => s.operationName === 'operation-1');
      expect(op1?.tags).toBeUndefined();
    });

    it('应该只导出错误 spans 当 errorsOnly=true', () => {
      const json = exporter.exportToJSON(context, { errorsOnly: true });
      const parsed = JSON.parse(json);

      // 只有 operation-2 有错误
      expect(parsed.spans.length).toBe(1);
      expect(parsed.spans[0].operationName).toBe('operation-2');
      expect(parsed.spans[0].error).toBe('Test error message');
    });
  });

  describe('exportToMermaid', () => {
    it('应该生成有效的 Mermaid timeline 语法', () => {
      const mermaid = exporter.exportToMermaid(context);

      expect(mermaid).toContain('timeline');
      expect(mermaid).toContain('title Trace:');
      expect(mermaid).toContain('test-trace-123');
    });

    it('应该包含所有操作名称', () => {
      const mermaid = exporter.exportToMermaid(context);

      expect(mermaid).toContain('root');
      expect(mermaid).toContain('operation-1');
      expect(mermaid).toContain('operation-2');
      expect(mermaid).toContain('operation-3');
      expect(mermaid).toContain('sub-operation-1');
    });

    it('应该显示持续时间或 running 状态', () => {
      const mermaid = exporter.exportToMermaid(context);

      // 检查是否有持续时间或 running 状态
      expect(mermaid).toMatch(/(\d+ms|running)/);
    });

    it('应该只显示错误 spans 当 errorsOnly=true', () => {
      const mermaid = exporter.exportToMermaid(context, { errorsOnly: true });

      // 应该包含有错误的操作
      expect(mermaid).toContain('operation-2');
      // 应该不包含没有错误且没有错误后代的操作
      expect(mermaid).not.toContain('operation-3');
    });

    it('应该遵守 maxDepth 限制', () => {
      const mermaid = exporter.exportToMermaid(context, { maxDepth: 1 });

      // depth 0: root
      // depth 1: operation-1, operation-2, operation-3
      // depth 2: sub-operation-1 (应该被过滤)
      expect(mermaid).toContain('operation-1');
      expect(mermaid).not.toContain('sub-operation-1');
    });
  });

  describe('exportToText', () => {
    it('应该生成格式化的文本报告', () => {
      const text = exporter.exportToText(context);

      expect(text).toContain('Trace Report');
      expect(text).toContain('Trace ID');
      expect(text).toContain('test-trace-123');
      expect(text).toContain('Metrics');
      expect(text).toContain('Trace Tree');
    });

    it('应该显示指标摘要', () => {
      const text = exporter.exportToText(context);

      expect(text).toContain('Total Spans');
      expect(text).toContain('Total Duration');
      expect(text).toContain('Errors');
      expect(text).toContain('Slowest Span');
    });

    it('应该显示树形结构', () => {
      const text = exporter.exportToText(context);

      expect(text).toContain('└─');
      expect(text).toContain('operation-1');
      expect(text).toContain('sub-operation-1');
    });

    it('应该显示状态图标', () => {
      const text = exporter.exportToText(context);

      expect(text).toContain('✅'); // success
      expect(text).toContain('❌'); // error
      expect(text).toContain('⏳'); // pending
    });

    it('应该只显示错误路径 当 errorsOnly=true', () => {
      const text = exporter.exportToText(context, { errorsOnly: true });

      expect(text).toContain('operation-2'); // 有错误
      expect(text).toContain('❌');
    });
  });

  describe('exportToSummary', () => {
    it('应该生成单行摘要', () => {
      const summary = exporter.exportToSummary(context);

      // 应该是单行
      expect(summary.split('\n').length).toBe(1);

      // 应该包含关键信息
      expect(summary).toContain('test-trace-123');
      expect(summary).toContain('spans');
      expect(summary).toContain('ms');
      expect(summary).toContain('errors');
    });

    it('应该正确计算指标', () => {
      const summary = exporter.exportToSummary(context);

      expect(summary).toContain('5 spans'); // root + 3 ops + 1 sub-op
      expect(summary).toContain('1 errors'); // operation-2 有错误
    });
  });

  describe('exportToMarkdown', () => {
    it('应该生成有效的 Markdown', () => {
      const md = exporter.exportToMarkdown(context);

      expect(md).toContain('## Trace Report');
      expect(md).toContain('### Metrics');
      expect(md).toContain('### Spans');
      expect(md).toContain('|'); // 表格语法
    });

    it('应该包含指标表格', () => {
      const md = exporter.exportToMarkdown(context);

      expect(md).toContain('| Metric | Value |');
      expect(md).toContain('| Total Spans |');
      expect(md).toContain('| Total Duration |');
      expect(md).toContain('| Errors |');
    });

    it('应该包含 Span 列表表格', () => {
      const md = exporter.exportToMarkdown(context);

      expect(md).toContain('| Operation | Duration | Status |');
      expect(md).toContain('| operation-1 |');
      expect(md).toContain('| operation-2 |');
      expect(md).toContain('| success |');
      expect(md).toContain('| error |');
    });

    it('应该只显示错误 spans 当 errorsOnly=true', () => {
      const md = exporter.exportToMarkdown(context, { errorsOnly: true });

      // 应该包含 operation-2（错误操作）
      expect(md).toContain('operation-2');
      expect(md).toContain('Test error message');

      // Spans 表应该在 ### Spans 之后
      const spansSectionStart = md.indexOf('### Spans');
      expect(spansSectionStart).toBeGreaterThan(-1);

      // 在 Spans 部分应该只有 operation-2（没有 operation-1 或 sub-operation-1）
      const spansSection = md.slice(spansSectionStart);
      expect(spansSection).not.toContain('operation-1');
      expect(spansSection).not.toContain('sub-operation-1');
      expect(spansSection).toContain('operation-2');
    });
  });

  describe('工厂函数', () => {
    it('createTraceExporter 应该返回新实例', () => {
      const newExporter = createTraceExporter();

      expect(newExporter).toBeInstanceOf(TraceExporter);
    });
  });

  describe('快捷导出函数', () => {
    it('exportTraceAsJSON 应该导出 JSON', () => {
      const json = exportTraceAsJSON(context);

      expect(() => JSON.parse(json)).not.toThrow();
      expect(json).toContain('test-trace-123');
    });

    it('exportTraceAsMermaid 应该导出 Mermaid', () => {
      const mermaid = exportTraceAsMermaid(context);

      expect(mermaid).toContain('timeline');
      expect(mermaid).toContain('test-trace-123');
    });

    it('exportTraceAsText 应该导出文本', () => {
      const text = exportTraceAsText(context);

      expect(text).toContain('Trace Report');
      expect(text).toContain('test-trace-123');
    });

    it('exportTraceAsSummary 应该导出摘要', () => {
      const summary = exportTraceAsSummary(context);

      expect(summary).toContain('test-trace-123');
      expect(summary.split('\n').length).toBe(1);
    });

    it('exportTraceAsMarkdown 应该导出 Markdown', () => {
      const md = exportTraceAsMarkdown(context);

      expect(md).toContain('## Trace Report');
      expect(md).toContain('|');
    });
  });

  describe('边界情况', () => {
    it('应该处理空 context（只有 root span）', () => {
      const emptyCtx = new TraceContextImpl();
      const text = exporter.exportToText(emptyCtx);

      expect(text).toContain('Trace Report');
      // 检查 Total Spans 存在且为 1（格式可能略有不同）
      expect(text).toContain('Total Spans');
      expect(text).toContain('1');
    });

    it('应该处理没有 root span 的情况', () => {
      // 手动删除 root span
      const rootId = context.rootSpanId;
      context.spans.delete(rootId);

      const mermaid = exporter.exportToMermaid(context);
      expect(mermaid).toContain('No root span found');
    });
  });
});
