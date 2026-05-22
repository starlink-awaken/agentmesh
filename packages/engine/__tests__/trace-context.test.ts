/**
 * Trace Context 单元测试
 *
 * 测试 Trace ID 分布式追踪系统的核心功能
 * 包括 TraceContext、Span 管理和 TraceTree 生成
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  TraceContextImpl,
  TraceContextManager,
} from '../src/trace-context.js';
import type {
  Span,
  SpanTags,
  TraceTreeNode,
  TraceMetrics,
} from '../src/trace-types.js';

describe('TraceContextImpl', () => {
  let context: TraceContextImpl;

  beforeEach(() => {
    context = new TraceContextImpl();
  });

  describe('基础功能', () => {
    it('应该创建唯一的 traceId 和 rootSpanId', () => {
      expect(context.traceId).toBeDefined();
      expect(context.rootSpanId).toBeDefined();
      expect(context.traceId.length).toBeGreaterThan(0);
      expect(context.rootSpanId.length).toBeGreaterThan(0);
      expect(context.traceId).not.toBe(context.rootSpanId);
    });

    it('应该接受自定义 traceId', () => {
      const customId = 'custom-trace-123';
      const customContext = new TraceContextImpl(customId);
      expect(customContext.traceId).toBe(customId);
    });

    it('应该在创建时自动生成 root span', () => {
      const spans = context.getSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].operationName).toBe('root');
      expect(spans[0].parentSpanId).toBeUndefined();
    });
  });

  describe('Span 创建', () => {
    it('应该创建子 span', () => {
      const parentSpan = context.createSpan('parent-operation');
      const childSpan = context.createSpan('child-operation', parentSpan.spanId);

      expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
      expect(childSpan.operationName).toBe('child-operation');
      expect(childSpan.status).toBe('pending');
    });

    it('应该创建带有标签的 span', () => {
      const tags: SpanTags = {
        agent: 'test-agent',
        layer: 'L1',
        retry_count: 3,
        success: true,
      };
      const span = context.createSpan('tagged-operation', undefined, tags);

      expect(span.tags).toEqual(tags);
      expect(span.tags.agent).toBe('test-agent');
    });

    it('应该生成唯一的 span ID', () => {
      const span1 = context.createSpan('operation-1');
      const span2 = context.createSpan('operation-2');

      expect(span1.spanId).not.toBe(span2.spanId);
    });
  });

  describe('Span 完成', () => {
    it('应该成功完成 span', async () => {
      const span = context.createSpan('test-operation');
      expect(span.endTime).toBeUndefined();

      // 等待至少 1ms 确保有时间间隔
      await new Promise(resolve => setTimeout(resolve, 1));
      context.finishSpan(span.spanId, 'success');

      const finishedSpan = context.spans.get(span.spanId);
      expect(finishedSpan?.endTime).toBeDefined();
      expect(finishedSpan?.duration).toBeDefined();
      expect(finishedSpan?.duration).toBeGreaterThanOrEqual(0);
      expect(finishedSpan?.status).toBe('success');
    });

    it('应该记录错误信息', () => {
      const span = context.createSpan('failing-operation');
      const errorMessage = 'Connection timeout';

      context.finishSpan(span.spanId, 'error', errorMessage);

      const finishedSpan = context.spans.get(span.spanId);
      expect(finishedSpan?.status).toBe('error');
      expect(finishedSpan?.error).toBe(errorMessage);
    });

    it('应该静默处理不存在的 span ID', () => {
      expect(() => {
        context.finishSpan('non-existent-id', 'success');
      }).not.toThrow();
    });
  });

  describe('Span 查询', () => {
    it('应该返回所有 spans', () => {
      context.createSpan('operation-1');
      context.createSpan('operation-2');
      context.createSpan('operation-3');

      const spans = context.getSpans();
      expect(spans.length).toBe(4); // 包括 root span
    });

    it('应该返回 root span', () => {
      const rootSpan = context.getRootSpan();
      expect(rootSpan).toBeDefined();
      expect(rootSpan?.operationName).toBe('root');
      expect(rootSpan?.spanId).toBe(context.rootSpanId);
    });
  });

  describe('Trace Tree', () => {
    it('应该生成正确的树形结构', () => {
      // 创建层级结构:
      // root
      //   ├── child1
      //   │   └── grandchild1
      //   └── child2

      const child1 = context.createSpan('child1', context.rootSpanId);
      const child2 = context.createSpan('child2', context.rootSpanId);
      const grandchild1 = context.createSpan('grandchild1', child1.spanId);

      // 完成 spans
      context.finishSpan(child1.spanId, 'success');
      context.finishSpan(child2.spanId, 'success');
      context.finishSpan(grandchild1.spanId, 'success');

      const tree = context.getTraceTree();

      expect(tree.span.operationName).toBe('root');
      expect(tree.depth).toBe(0);
      expect(tree.children.length).toBe(2);

      const child1Node = tree.children.find(n => n.span.operationName === 'child1');
      const child2Node = tree.children.find(n => n.span.operationName === 'child2');

      expect(child1Node).toBeDefined();
      expect(child2Node).toBeDefined();
      expect(child1Node?.depth).toBe(1);
      expect(child2Node?.depth).toBe(1);
      expect(child1Node?.children.length).toBe(1);
      expect(child1Node?.children[0].span.operationName).toBe('grandchild1');
    });

    it('应该正确计算深度', () => {
      // root -> level1 -> level2 -> level3
      const level1 = context.createSpan('level1', context.rootSpanId);
      const level2 = context.createSpan('level2', level1.spanId);
      const level3 = context.createSpan('level3', level2.spanId);

      const tree = context.getTraceTree();

      expect(tree.depth).toBe(0);
      expect(tree.children[0].depth).toBe(1);
      expect(tree.children[0].children[0].depth).toBe(2);
      expect(tree.children[0].children[0].children[0].depth).toBe(3);
    });
  });

  describe('Metrics', () => {
    it('应该计算正确的指标', async () => {
      const span1 = context.createSpan('fast-operation');
      const span2 = context.createSpan('slow-operation');
      const span3 = context.createSpan('error-operation');

      // 等待以确保有时间差
      await new Promise(resolve => setTimeout(resolve, 1));

      context.finishSpan(span1.spanId, 'success');
      context.finishSpan(span2.spanId, 'success');
      context.finishSpan(span3.spanId, 'error', 'Test error');

      const metrics = context.getMetrics();

      expect(metrics.totalSpans).toBe(4); // 包括 root span
      expect(metrics.errorCount).toBe(1);
      expect(metrics.totalDuration).toBeGreaterThanOrEqual(0);
      expect(metrics.slowestSpan.spanId).toBeDefined();
    });

    it('应该按操作名称统计 span 数量', () => {
      context.createSpan('agent:execute');
      context.createSpan('agent:execute');
      context.createSpan('orchestrator:start');
      context.createSpan('agent:execute');

      const metrics = context.getMetrics();

      expect(metrics.spanCountByOperation['agent:execute']).toBe(3);
      expect(metrics.spanCountByOperation['orchestrator:start']).toBe(1);
      expect(metrics.spanCountByOperation['root']).toBe(1);
    });

    it('应该识别最慢的 span', async () => {
      const fast = context.createSpan('fast');
      const slow = context.createSpan('slow');

      context.finishSpan(fast.spanId, 'success');
      // 模拟慢操作
      await new Promise(resolve => setTimeout(resolve, 10));
      context.finishSpan(slow.spanId, 'success');

      const metrics = context.getMetrics();

      expect(metrics.slowestSpan.spanId).toBe(slow.spanId);
    });
  });
});

describe('TraceContextManager', () => {
  let manager: TraceContextManager;

  beforeEach(() => {
    manager = new TraceContextManager();
  });

  it('应该创建和存储 trace context', () => {
    const context = manager.create();

    expect(context.traceId).toBeDefined();
    expect(manager.get(context.traceId)).toBe(context);
  });

  it('应该获取已存在的 context', () => {
    const context = manager.create('test-trace-id');
    const retrieved = manager.get('test-trace-id');

    expect(retrieved).toBe(context);
  });

  it('应该返回 undefined 对于不存在的 trace ID', () => {
    const retrieved = manager.get('non-existent');
    expect(retrieved).toBeUndefined();
  });

  it('应该删除 context', () => {
    const context = manager.create();
    const traceId = context.traceId;

    manager.delete(traceId);

    expect(manager.get(traceId)).toBeUndefined();
  });

  it('应该列出所有 contexts', () => {
    manager.create('trace-1');
    manager.create('trace-2');
    manager.create('trace-3');

    const all = manager.list();

    expect(all.length).toBe(3);
  });
});

describe('性能测试', () => {
  it('应该高效处理大量 spans (1000)', () => {
    const context = new TraceContextImpl();
    const startTime = Date.now();

    // 创建 1000 个 spans
    for (let i = 0; i < 1000; i++) {
      const span = context.createSpan(`operation-${i}`);
      context.finishSpan(span.spanId, 'success');
    }

    const elapsed = Date.now() - startTime;

    // 应该在合理时间内完成 (< 100ms)
    expect(elapsed).toBeLessThan(100);

    const metrics = context.getMetrics();
    expect(metrics.totalSpans).toBe(1001); // 1000 + root
  });

  it('应该高效生成树结构', () => {
    const context = new TraceContextImpl();

    // 创建深度为 50 的树
    let parentId = context.rootSpanId;
    for (let i = 0; i < 50; i++) {
      const span = context.createSpan(`level-${i}`, parentId);
      context.finishSpan(span.spanId, 'success');
      parentId = span.spanId;
    }

    const startTime = Date.now();
    const tree = context.getTraceTree();
    const elapsed = Date.now() - startTime;

    // 树生成应该很快 (< 10ms)
    expect(elapsed).toBeLessThan(10);
    expect(tree.span.operationName).toBe('root');
  });
});
