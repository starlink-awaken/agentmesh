/**
 * Trace ID 系统类型定义
 *
 * 定义分布式追踪系统的核心数据结构，包括：
 * - Span：单个操作的追踪记录
 * - TraceContext：完整的追踪上下文
 * - TraceTreeNode：用于可视化的树形节点
 * - TraceMetrics：追踪统计指标
 */

// ============================================================
// Span 相关类型
// ============================================================

/**
 * Span 标签类型
 * 支持字符串、数字和布尔值
 */
export type SpanTags = Record<string, string | number | boolean>;

/**
 * Span 状态
 */
export type SpanStatus = 'pending' | 'success' | 'error';

/**
 * Span - 追踪中的单个操作记录
 *
 * 每个 Span 代表一个操作的时间范围和元数据。
 * 多个 Span 通过 parentSpanId 形成树形结构。
 */
export interface Span {
  /** Trace ID（整个链路共享） */
  traceId: string;

  /** Span ID（当前操作唯一标识） */
  spanId: string;

  /** 父 Span ID（用于构建树形结构） */
  parentSpanId?: string;

  /** 操作名称（如 "orchestrator:startProject", "agent:execute"） */
  operationName: string;

  /** 开始时间（毫秒时间戳） */
  startTime: number;

  /** 结束时间（毫秒时间戳） */
  endTime?: number;

  /** 持续时间（毫秒） */
  duration?: number;

  /** 标签（自定义属性） */
  tags: SpanTags;

  /** 状态 */
  status: SpanStatus;

  /** 错误信息（如果 status='error'） */
  error?: string;
}

// ============================================================
// TraceContext 相关类型
// ============================================================

/**
 * 追踪树节点（用于可视化）
 */
export interface TraceTreeNode {
  /** 当前节点的 Span */
  span: Span;

  /** 子节点列表 */
  children: TraceTreeNode[];

  /** 树的深度（从根节点 0 开始） */
  depth: number;
}

/**
 * 追踪指标统计
 */
export interface TraceMetrics {
  /** Span 总数 */
  totalSpans: number;

  /** 总持续时间（根 Span 的持续时间） */
  totalDuration: number;

  /** 最慢的 Span */
  slowestSpan: Span;

  /** 错误数量 */
  errorCount: number;

  /** 按操作名称统计的 Span 数量 */
  spanCountByOperation: Record<string, number>;
}

/**
 * TraceContext - 追踪上下文接口
 *
 * 管理一个完整追踪链路的所有 Spans，提供：
 * - Span 创建和完成
 * - Span 查询
 * - 树形结构生成
 * - 指标计算
 */
export interface TraceContext {
  /** Trace ID（整个链路共享） */
  traceId: string;

  /** Root Span ID */
  rootSpanId: string;

  /** 所有 Span（按 spanId 索引） */
  spans: Map<string, Span>;

  /** 创建时间 */
  createdAt: number;

  /**
   * 创建子 Span
   *
   * @param operationName - 操作名称
   * @param parentSpanId - 父 Span ID（默认为 root span）
   * @param tags - 自定义标签
   * @returns 新创建的 Span
   */
  createSpan(operationName: string, parentSpanId?: string, tags?: SpanTags): Span;

  /**
   * 完成 Span
   *
   * @param spanId - Span ID
   * @param status - 完成状态
   * @param error - 错误信息（如果 status='error'）
   */
  finishSpan(spanId: string, status: SpanStatus, error?: string): void;

  /**
   * 获取所有 Spans
   *
   * @returns 所有 Spans 的数组
   */
  getSpans(): Span[];

  /**
   * 获取根 Span
   *
   * @returns 根 Span，如果不存在则返回 undefined
   */
  getRootSpan(): Span | undefined;

  /**
   * 生成追踪树（用于可视化）
   *
   * @returns 树形结构的根节点
   */
  getTraceTree(): TraceTreeNode;

  /**
   * 计算追踪指标
   *
   * @returns 追踪统计指标
   */
  getMetrics(): TraceMetrics;
}

// ============================================================
// TraceExporter 相关类型
// ============================================================

/**
 * 导出格式类型
 */
export type ExportFormat = 'json' | 'mermaid' | 'text';

/**
 * 导出选项
 */
export interface ExportOptions {
  /** 是否包含标签详情 */
  includeTags?: boolean;

  /** 是否只显示错误 Span */
  errorsOnly?: boolean;

  /** 最大深度（0 表示无限制） */
  maxDepth?: number;
}
