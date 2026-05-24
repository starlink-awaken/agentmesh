/**
 * Unified Tracer - 统一追踪器
 * 
 * 提供 entry/internal span 管理
 * 支持超时控制、事件记录、自动完成
 */
import {
  type TraceContext,
  type Span,
  type SpanEvent,
  type TraceConfig,
  type TraceRecord,
  type TimeoutError,
  createTraceContext as newTraceContext,
  createEntrySpan as entrySpan,
  createInternalSpan as internalSpan,
} from '@agentmesh/core-types';

const DEFAULT_CONFIG: TraceConfig = {
  enabled: true,
  defaultTimeoutMs: 30000,
  phaseTimeoutMs: 300000,
  modelTimeoutMs: 60000,
  outputFormat: 'console',
};

/**
 * Tracer - 主追踪器类
 * 管理当前 trace context 和 span 层级
 */
export class Tracer {
  private context: TraceContext | null = null;
  private rootSpan: Span | null = null;
  private activeSpans: Span[] = [];
  private config: TraceConfig;

  constructor(config: Partial<TraceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 启动新的 trace session
   */
  startTrace(service: string, phase?: string): TraceContext {
    this.context = newTraceContext({ service, phase });
    this.rootSpan = entrySpan('root', this.context);
    this.activeSpans = [this.rootSpan];
    return this.context;
  }

  /**
   * 获取当前 context
   */
  getContext(): TraceContext | null {
    return this.context;
  }

  /**
   * 设置外部传入的 context (如从 HTTP header 解析)
   */
  setContext(ctx: TraceContext): void {
    this.context = ctx;
    // 重置 span 链
    this.rootSpan = entrySpan('resume', ctx);
    this.activeSpans = [this.rootSpan];
  }

  /**
   * 从 HTTP headers 解析 trace context
   */
  static fromHeaders(headers: Record<string, string>, service: string): TraceContext | null {
    const traceId = headers['x-trace-id'] || headers['X-Trace-ID'];
    if (!traceId) return null;

    return {
      trace_id: traceId,
      parent_id: headers['x-parent-id'] || '',
      service,
      phase: headers['x-trace-phase'] || '',
      started_at: Date.now(),
      tags: {},
    };
  }

  /**
   * 转换为 HTTP headers
   */
  toHeaders(): Record<string, string> {
    if (!this.context) return {};
    return {
      'X-Trace-ID': this.context.trace_id,
      'X-Parent-ID': this.activeSpans.length > 0 ? this.activeSpans[this.activeSpans.length - 1].id : '',
      'X-Trace-Phase': this.context.phase || '',
    };
  }

  /**
   * 启动 entry span (顶层操作)
   */
  startEntrySpan(name: string): Span {
    // 如果没有 context，创建新的
    if (!this.context) {
      throw new Error('No trace context. Call startTrace() first.');
    }

    const span: Span = {
      id: `${this.context.trace_id}-${name}`,
      type: 'entry',
      name,
      started_at: Date.now(),
      status: 'pending',
      events: [],
      children: [],
    };

    if (this.rootSpan) {
      this.rootSpan.children.push(span);
    }
    this.activeSpans.push(span);
    return span;
  }

  /**
   * 启动 internal span (嵌套操作)
   */
  startInternalSpan(name: string): Span {
    if (!this.context) {
      throw new Error('No trace context. Call startTrace() first.');
    }

    const parent = this.getActiveSpan();
    const span: Span = {
      id: parent ? `${parent.id}-${name}` : `${this.context.trace_id}-${name}`,
      type: 'internal',
      name,
      started_at: Date.now(),
      status: 'pending',
      events: [],
      children: [],
    };

    if (parent) {
      parent.children.push(span);
    }
    this.activeSpans.push(span);
    return span;
  }

  /**
   * 获取当前活跃的 span
   */
  getActiveSpan(): Span | null {
    return this.activeSpans.length > 0 ? this.activeSpans[this.activeSpans.length - 1] : null;
  }

  /**
   * 完成 span
   */
  finishSpan(span: Span, status: 'success' | 'error' = 'success', error?: string): void {
    span.ended_at = Date.now();
    span.duration_ms = span.ended_at - span.started_at;
    span.status = status;
    span.error = error;

    // 弹出活跃栈
    const idx = this.activeSpans.findIndex(s => s.id === span.id);
    if (idx >= 0) {
      this.activeSpans.splice(idx, 1);
    }
  }

  /**
   * 记录事件到当前 span
   */
  recordEvent(name: string, payload?: unknown): void {
    const span = this.getActiveSpan();
    if (!span) return;

    span.events.push({
      name,
      timestamp: Date.now(),
      payload,
    });
  }

  /**
   * 带超时的执行包装
   */
  async withTimeout<T>(
    span: Span,
    timeoutMs: number,
    fn: () => Promise<T>
  ): Promise<T> {
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            const err: TimeoutError = {
              span_id: span.id,
              timeout_ms: timeoutMs,
              message: `Operation ${span.name} timed out after ${timeoutMs}ms`,
            };
            reject(err);
          }, timeoutMs)
        ),
      ]);
    } finally {
      this.finishSpan(span);
    }
  }

  /**
   * 带捕获的执行包装 (自动完成 span)
   */
  async withSpan<T>(
    span: Span,
    fn: () => Promise<T>
  ): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      this.finishSpan(span, 'error', err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      // 确保 span 完成
      if (span.status === 'pending') {
        span.ended_at = Date.now();
        span.duration_ms = span.ended_at - span.started_at;
      }
    }
  }

  /**
   * 生成 trace record (用于输出)
   */
  getTraceRecord(): TraceRecord | null {
    if (!this.context || !this.rootSpan) return null;

    // 递归计算状态
    const errors = this.collectErrors(this.rootSpan);

    return {
      trace_id: this.context.trace_id,
      spans: this.flattenSpans(this.rootSpan),
      summary: {
        total_duration_ms: this.rootSpan.duration_ms || 0,
        status: errors > 0 ? 'failed' : 'success',
        error_count: errors,
      },
      timestamp: new Date().toISOString(),
    };
  }

  private flattenSpans(root: Span): Span[] {
    const result: Span[] = [root];
    for (const child of root.children || []) {
      result.push(...this.flattenSpans(child));
    }
    return result;
  }

  private collectErrors(span: Span): number {
    let count = span.status === 'error' ? 1 : 0;
    for (const child of span.children || []) {
      count += this.collectErrors(child);
    }
    return count;
  }

  /**
   * 输出到 console
   */
  log(): void {
    const record = this.getTraceRecord();
    if (!record) return;

    console.log('[Trace]', JSON.stringify(record, null, 2));
  }
}

/**
 * 全局 tracer 实例
 */
export const tracer = new Tracer();

/**
 * 创建带超时的执行包装
 */
export async function withSpanAndTimeout<T>(
  span: Span,
  operationName: string,
  timeoutMs: number,
  fn: () => Promise<T>
): Promise<T> {
  return tracer.withTimeout(span, timeoutMs, fn);
}

/**
 * 从 headers 启动 trace
 */
export function traceFromHeaders(headers: Record<string, string>, service: string): TraceContext | null {
  return Tracer.fromHeaders(headers, service);
}