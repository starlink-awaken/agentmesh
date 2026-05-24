/**
 * Unified Tracing Types
 * 
 * 跨 TS/Python 的统一 trace 上下文定义
 * 为整个 Workspace 提供请求追踪能力
 */

export interface TraceContext {
  /** 全局唯一 trace ID: tt-YYYYMMDD-HHMMSS-{service}-{phase}{span} */
  trace_id: string;
  /** 父 span ID，用于 span 链 */
  parent_id: string;
  /** 当前服务名 */
  service: string;
  /** 当前阶段 (可选) */
  phase: string;
  /** 开始时间 (epoch ms) */
  started_at: number;
  /** 自定义标签 */
  tags: Record<string, string>;
}

export interface Span {
  /** span 标识 */
  id: string;
  /** span 类型 */
  type: 'entry' | 'internal' | 'exit';
  /** 操作名 */
  name: string;
  /** 开始时间 */
  started_at: number;
  /** 结束时间 */
  ended_at?: number;
  /** 持续时间 (ms) */
  duration_ms?: number;
  /** 执行状态 */
  status: 'pending' | 'success' | 'error';
  /** 错误信息 */
  error?: string;
  /** 事件列表 */
  events: SpanEvent[];
  /** 子 span */
  children: Span[];
}

export interface SpanEvent {
  /** 事件名 */
  name: string;
  /** 事件时间戳 */
  timestamp: number;
  /** 事件载荷 */
  payload?: unknown;
}

export interface TraceConfig {
  /** 是否启用 tracing */
  enabled: boolean;
  /** 默认超时 (ms) */
  defaultTimeoutMs: number;
  /** Phase 执行超时 (ms) */
  phaseTimeoutMs: number;
  /** 模型调用超时 (ms) */
  modelTimeoutMs: number;
  /** 输出格式 */
  outputFormat: 'console' | 'json' | 'otel';
}

export interface TraceRecord {
  /** trace ID */
  trace_id: string;
  /** spans 列表 */
  spans: Span[];
  /** 摘要 */
  summary: {
    total_duration_ms: number;
    status: 'success' | 'partial' | 'failed';
    error_count: number;
  };
  /** 时间戳 */
  timestamp: string;
}

export interface TimeoutError {
  span_id: string;
  timeout_ms: number;
  message: string;
}

/**
 * 便捷函数：创建新的 TraceContext
 */
export function createTraceContext(options: {
  service: string;
  phase?: string;
  parent_id?: string;
}): TraceContext {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
  const random = Math.random().toString(36).substring(2, 6);
  
  return {
    trace_id: `tt-${dateStr}-${timeStr}-${options.service}${options.phase ? '-' + options.phase : ''}-${random}`,
    parent_id: options.parent_id || '',
    service: options.service,
    phase: options.phase || '',
    started_at: now.getTime(),
    tags: {},
  };
}

/**
 * 便捷函数：创建 entry span
 */
export function createEntrySpan(name: string, trace_ctx: TraceContext): Span {
  return {
    id: `${trace_ctx.trace_id}-${name}`,
    type: 'entry',
    name,
    started_at: Date.now(),
    status: 'pending',
    events: [],
    children: [],
  };
}

/**
 * 便捷函数：创建 internal span
 */
export function createInternalSpan(name: string, parent: Span): Span {
  return {
    id: `${parent.id}-${name}`,
    type: 'internal',
    name,
    started_at: Date.now(),
    status: 'pending',
    events: [],
    children: [],
  };
}