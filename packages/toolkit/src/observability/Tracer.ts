/**
 * Tracer - 分布式追踪
 *
 * 支持创建跨度、添加标签、注入上下文和追踪采样
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  TraceSpan,
  TraceContext,
  TracerConfig,
  SamplingDecision,
  OpenTelemetrySpan,
} from './types.js';
import { EventEmitter } from './EventEmitter.js';

/**
 * 生成随机 ID
 */
function generateId(length: number = 16): string {
  const chars = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < length; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Span - 追踪跨度类
 */
export class Span {
  private span: TraceSpan;
  private tracer: Tracer;

  constructor(tracer: Tracer, operationName: string, parentContext?: TraceContext) {
    const traceId = parentContext?.traceId ?? generateId(32);
    const spanId = generateId(16);

    this.span = {
      traceId,
      spanId,
      parentSpanId: parentContext?.spanId,
      operationName,
      startTime: Date.now(),
      tags: {},
      logs: [],
      status: 'unset',
    };

    this.tracer = tracer;

    // 触发 span 创建事件
    this.tracer.emit('spanStart', this.span);
  }

  /**
   * 获取上下文
   */
  getContext(): TraceContext {
    return {
      traceId: this.span.traceId,
      spanId: this.span.spanId,
      sampled: true,
    };
  }

  /**
   * 获取跨度数据
   */
  getSpan(): TraceSpan {
    return { ...this.span };
  }

  /**
   * 添加标签
   */
  addTag(key: string, value: string | number | boolean): this {
    this.span.tags = this.span.tags || {};
    this.span.tags[key] = value;
    return this;
  }

  /**
   * 批量添加标签
   */
  addTags(tags: Record<string, string | number | boolean>): this {
    this.span.tags = { ...this.span.tags, ...tags };
    return this;
  }

  /**
   * 记录日志事件
   */
  log(fields: Record<string, string | number | boolean>): this {
    this.span.logs = this.span.logs || [];
    this.span.logs.push({
      timestamp: Date.now(),
      fields,
    });
    return this;
  }

  /**
   * 设置状态
   */
  setStatus(status: 'ok' | 'error' | 'unset', message?: string): this {
    this.span.status = status;
    if (message) {
      this.span.tags = this.span.tags || {};
      this.span.tags['error.message'] = message;
    }
    return this;
  }

  /**
   * 结束跨度
   */
  end(endTime?: number): void {
    if (this.span.endTime !== undefined) {
      // 防止重复结束
      return;
    }

    this.span.endTime = endTime ?? Date.now();
    this.span.duration = this.span.endTime - this.span.startTime;

    // 触发 span 结束事件
    this.tracer.emit('spanEnd', this.span);

    // 添加到追踪器
    this.tracer.addSpan(this.span);
  }

  /**
   * 异步结束（用于 async/await）
   */
  async endAsync(): Promise<void> {
    this.end();
  }
}

/**
 * Tracer - 分布式追踪器
 */
export class Tracer extends EventEmitter {
  private config: Required<TracerConfig>;
  private spans: TraceSpan[] = [];
  private activeSpans: Map<string, Span> = new Map();

  constructor(config: TracerConfig) {
    super({ verbose: false });
    this.config = {
      serviceName: config.serviceName,
      sampleRate: config.sampleRate ?? 1.0,
      exportTimeout: config.exportTimeout ?? 5000,
      maxSpans: config.maxSpans ?? 1000,
    };
  }

  /**
   * 采样决策
   */
  private shouldSample(traceId: string): boolean {
    // 简单的基于 traceId 的确定性采样
    const hash = traceId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return (hash % 100) / 100 < this.config.sampleRate;
  }

  /**
   * 创建新跨度
   */
  createSpan(operationName: string, parentContext?: TraceContext): Span {
    // 采样决策
    const sampled = this.shouldSample(parentContext?.traceId ?? generateId(32));

    if (!sampled) {
      // 返回一个假的 span，不实际记录
      return new Span(this, operationName, { ...parentContext!, sampled: false });
    }

    const span = new Span(this, operationName, parentContext);
    this.activeSpans.set(span.getContext().spanId, span);
    return span;
  }

  /**
   * 注入上下文到载波
   */
  injectContext(carrier: Record<string, string>, context: TraceContext): Record<string, string> {
    carrier['traceparent'] = `00-${context.traceId}-${context.spanId}-${context.sampled ? '01' : '00'}`;
    return carrier;
  }

  /**
   * 从载波中提取上下文
   */
  extractContext(carrier: Record<string, string>): TraceContext | null {
    const traceparent = carrier['traceparent'];
    if (!traceparent) return null;

    const match = traceparent.match(/00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})/);
    if (!match) return null;

    return {
      traceId: match[1],
      spanId: match[2],
      sampled: match[3] === '01',
    };
  }

  /**
   * 添加完成的跨度
   */
  addSpan(span: TraceSpan): void {
    this.spans.push(span);

    // 限制跨度数量
    if (this.spans.length > this.config.maxSpans) {
      this.spans = this.spans.slice(-this.config.maxSpans);
    }

    // 触发添加事件
    this.emit('span', span);
  }

  /**
   * 获取所有跨度
   */
  getSpans(): TraceSpan[] {
    return [...this.spans];
  }

  /**
   * 获取活动跨度
   */
  getActiveSpans(): Span[] {
    return Array.from(this.activeSpans.values());
  }

  /**
   * 清除活动跨度
   */
  clearActiveSpan(spanId: string): void {
    this.activeSpans.delete(spanId);
  }

  /**
   * 获取追踪统计
   */
  getStats(): {
    totalSpans: number;
    activeSpans: number;
    errorCount: number;
    avgDuration: number;
  } {
    const errorCount = this.spans.filter((s) => s.status === 'error').length;
    const durations = this.spans.filter((s) => s.duration !== undefined).map((s) => s.duration!);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return {
      totalSpans: this.spans.length,
      activeSpans: this.activeSpans.size,
      errorCount,
      avgDuration,
    };
  }

  /**
   * 导出为 OpenTelemetry 格式
   */
  toOpenTelemetry(): OpenTelemetrySpan[] {
    return this.spans.map((span) => this.toOTSpan(span));
  }

  /**
   * 转换为 OpenTelemetry 格式
   */
  private toOTSpan(span: TraceSpan): OpenTelemetrySpan {
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      name: span.operationName,
      startTimeUnixNano: String(span.startTime * 1_000_000),
      endTimeUnixNano: span.endTime ? String(span.endTime * 1_000_000) : undefined,
      status: span.status === 'error'
        ? { code: 2, message: 'Error' }
        : span.status === 'ok'
          ? { code: 1 }
          : { code: 0 },
      attributes: span.tags,
      events: span.logs?.map((log) => ({
        name: 'log',
        timeUnixNano: String(log.timestamp * 1_000_000),
        attributes: log.fields,
      })),
    };
  }

  /**
   * 清除所有跨度
   */
  clear(): void {
    this.spans = [];
    this.activeSpans.clear();
    this.emit('clear');
  }
}

/**
 * 创建追踪器的便捷函数
 */
export function createTracer(config: TracerConfig): Tracer {
  return new Tracer(config);
}

/**
 * 默认追踪器实例
 */
let defaultTracer: Tracer | null = null;

/**
 * 获取默认追踪器
 */
export function getDefaultTracer(): Tracer {
  if (!defaultTracer) {
    defaultTracer = new Tracer({ serviceName: 'default' });
  }
  return defaultTracer;
}

/**
 * 设置默认追踪器
 */
export function setDefaultTracer(tracer: Tracer): void {
  defaultTracer = tracer;
}
