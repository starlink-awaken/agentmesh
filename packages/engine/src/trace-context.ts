/**
 * Trace Context 实现
 *
 * 提供 TraceContext 接口的完整实现，包括：
 * - Span 生命周期管理
 * - 树形结构构建
 * - 指标统计计算
 * - 多实例管理（TraceContextManager）
 */

import * as crypto from 'node:crypto';
import type {
  Span,
  SpanStatus,
  SpanTags,
  TraceContext,
  TraceTreeNode,
  TraceMetrics,
} from './trace-types.js';

// ============================================================
// TraceContextImpl
// ============================================================

/**
 * TraceContext 实现
 *
 * 管理单个追踪链路的所有 Spans，支持：
 * - 创建和完成 Span
 * - 构建树形结构
 * - 计算统计指标
 */
export class TraceContextImpl implements TraceContext {
  /** Trace ID（整个链路共享） */
  traceId: string;

  /** Root Span ID */
  rootSpanId: string;

  /** 所有 Span（按 spanId 索引） */
  spans: Map<string, Span>;

  /** 创建时间 */
  createdAt: number;

  /**
   * 构造函数
   *
   * @param traceId - 可选的自定义 Trace ID，不提供则自动生成
   */
  constructor(traceId?: string) {
    this.traceId = traceId ?? crypto.randomUUID();
    this.rootSpanId = crypto.randomUUID();
    this.spans = new Map();
    this.createdAt = Date.now();

    // 创建 root span（使用预设的 rootSpanId）
    const rootSpan: Span = {
      traceId: this.traceId,
      spanId: this.rootSpanId,
      operationName: 'root',
      startTime: Date.now(),
      tags: { source: 'orchestrator' },
      status: 'pending' as SpanStatus,
    };
    this.spans.set(this.rootSpanId, rootSpan);
  }

  /**
   * 创建子 Span
   *
   * @param operationName - 操作名称
   * @param parentSpanId - 父 Span ID（默认为 root span）
   * @param tags - 自定义标签
   * @returns 新创建的 Span
   */
  createSpan(operationName: string, parentSpanId?: string, tags?: SpanTags): Span {
    const spanId = crypto.randomUUID();
    const span: Span = {
      traceId: this.traceId,
      spanId,
      parentSpanId,
      operationName,
      startTime: Date.now(),
      tags: tags ?? {},
      status: 'pending' as SpanStatus,
    };

    this.spans.set(spanId, span);
    return span;
  }

  /**
   * 完成 Span
   *
   * @param spanId - Span ID
   * @param status - 完成状态
   * @param error - 错误信息（如果 status='error'）
   */
  finishSpan(spanId: string, status: SpanStatus, error?: string): void {
    const span = this.spans.get(spanId);
    if (!span) {
      return; // 静默忽略不存在的 span
    }

    const endTime = Date.now();
    span.endTime = endTime;
    span.duration = endTime - span.startTime;
    span.status = status;

    if (error) {
      span.error = error;
    }
  }

  /**
   * 获取所有 Spans
   *
   * @returns 所有 Spans 的数组
   */
  getSpans(): Span[] {
    return Array.from(this.spans.values());
  }

  /**
   * 获取根 Span
   *
   * @returns 根 Span，如果不存在则返回 undefined
   */
  getRootSpan(): Span | undefined {
    return this.spans.get(this.rootSpanId);
  }

  /**
   * 生成追踪树（用于可视化）
   *
   * @returns 树形结构的根节点
   */
  getTraceTree(): TraceTreeNode {
    const root = this.getRootSpan();
    if (!root) {
      // 如果 root span 不存在，创建一个空的树节点
      return {
        span: {
          traceId: this.traceId,
          spanId: 'unknown',
          operationName: 'unknown',
          startTime: this.createdAt,
          tags: {},
          status: 'pending',
        },
        children: [],
        depth: 0,
      };
    }

    return this.buildTree(root.spanId);
  }

  /**
   * 计算追踪指标
   *
   * @returns 追踪统计指标
   */
  getMetrics(): TraceMetrics {
    const spans = this.getSpans();
    const completedSpans = spans.filter((s) => s.endTime !== undefined);

    // 计算总持续时间（使用 root span 的持续时间）
    const rootSpan = this.getRootSpan();
    const totalDuration = rootSpan?.duration ?? 0;

    // 找出最慢的 span
    let slowestSpan = spans[0];
    for (const span of completedSpans) {
      if ((span.duration ?? 0) > (slowestSpan.duration ?? 0)) {
        slowestSpan = span;
      }
    }

    // 统计错误数量
    const errorCount = spans.filter((s) => s.status === 'error').length;

    // 按操作名称统计 span 数量
    const spanCountByOperation: Record<string, number> = {};
    for (const span of spans) {
      const opName = span.operationName;
      spanCountByOperation[opName] = (spanCountByOperation[opName] ?? 0) + 1;
    }

    return {
      totalSpans: spans.length,
      totalDuration,
      slowestSpan,
      errorCount,
      spanCountByOperation,
    };
  }

  /**
   * 递归构建树形结构
   *
   * @param spanId - 当前 Span ID
   * @param depth - 当前深度
   * @returns 树节点
   */
  private buildTree(spanId: string, depth = 0): TraceTreeNode {
    const span = this.spans.get(spanId);
    if (!span) {
      throw new Error(`Span not found: ${spanId}`);
    }

    // 找出所有子 span
    const childrenSpans = this.getSpans().filter((s) => s.parentSpanId === spanId);
    const children = childrenSpans.map((s) => this.buildTree(s.spanId, depth + 1));

    return {
      span,
      children,
      depth,
    };
  }
}

// ============================================================
// TraceContextManager
// ============================================================

/**
 * TraceContext 管理器
 *
 * 管理多个 TraceContext 实例的生命周期，提供：
 * - 创建和存储 context
 * - 按 traceId 查询
 * - 删除 context
 * - 列出所有 context
 */
export class TraceContextManager {
  /** 存储所有 TraceContext（按 traceId 索引） */
  private contexts: Map<string, TraceContext>;

  constructor() {
    this.contexts = new Map();
  }

  /**
   * 创建新的 TraceContext
   *
   * @param traceId - 可选的自定义 Trace ID
   * @returns 新创建的 TraceContext
   */
  create(traceId?: string): TraceContext {
    const context = new TraceContextImpl(traceId);
    this.contexts.set(context.traceId, context);
    return context;
  }

  /**
   * 获取指定 Trace ID 的 Context
   *
   * @param traceId - Trace ID
   * @returns TraceContext，如果不存在则返回 undefined
   */
  get(traceId: string): TraceContext | undefined {
    return this.contexts.get(traceId);
  }

  /**
   * 删除指定 Trace ID 的 Context
   *
   * @param traceId - Trace ID
   */
  delete(traceId: string): void {
    this.contexts.delete(traceId);
  }

  /**
   * 列出所有 TraceContext
   *
   * @returns 所有 TraceContext 的数组
   */
  list(): TraceContext[] {
    return Array.from(this.contexts.values());
  }

  /**
   * 获取 Context 数量
   *
   * @returns 当前存储的 Context 数量
   */
  size(): number {
    return this.contexts.size;
  }

  /**
   * 清空所有 Context
   */
  clear(): void {
    this.contexts.clear();
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建新的 TraceContext
 *
 * @param traceId - 可选的自定义 Trace ID
 * @returns 新创建的 TraceContext
 */
export function createTraceContext(traceId?: string): TraceContext {
  return new TraceContextImpl(traceId);
}

/**
 * 创建 TraceContextManager
 *
 * @returns 新创建的 TraceContextManager
 */
export function createTraceContextManager(): TraceContextManager {
  return new TraceContextManager();
}
