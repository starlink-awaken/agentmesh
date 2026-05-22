/**
 * Observability Types - 可观测性类型定义
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * LogLevel - 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * LogEntry - 日志条目
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  context?: string;
  traceId?: string;
  spanId?: string;
}

/**
 * LogOutput - 日志输出目标
 */
export type LogOutput = 'console' | 'file' | 'both';

/**
 * LoggerConfig - 日志配置
 */
export interface LoggerConfig {
  level?: LogLevel;
  output?: LogOutput;
  filePath?: string;
  maxFileSize?: number;
  maxFiles?: number;
  enableColors?: boolean;
  enableTimestamp?: boolean;
  format?: 'json' | 'text';
}

/**
 * MetricName - 指标名称
 */
export type MetricName =
  | 'request.count'
  | 'request.duration'
  | 'request.error'
  | 'cpu.usage'
  | 'memory.usage'
  | 'disk.usage'
  | 'custom';

/**
 * MetricValue - 指标值
 */
export type MetricValue = number;

/**
 * MetricType - 指标类型
 */
export type MetricType = 'counter' | 'gauge' | 'histogram';

/**
 * CounterMetric - 计数器指标
 */
export interface CounterMetric {
  type: 'counter';
  name: MetricName;
  value: number;
  labels?: Record<string, string>;
  timestamp: string;
}

/**
 * GaugeMetric - 仪表指标
 */
export interface GaugeMetric {
  type: 'gauge';
  name: MetricName;
  value: number;
  labels?: Record<string, string>;
  timestamp: string;
}

/**
 * HistogramMetric - 直方图指标
 */
export interface HistogramMetric {
  type: 'histogram';
  name: MetricName;
  values: number[];
  buckets?: number[];
  count: number;
  sum: number;
  min: number;
  max: number;
  labels?: Record<string, string>;
  timestamp: string;
}

/**
 * Metric - 统一指标类型
 */
export type Metric = CounterMetric | GaugeMetric | HistogramMetric;

/**
 * MetricsConfig - 指标配置
 */
export interface MetricsConfig {
  enabled?: boolean;
  prefix?: string;
  defaultLabels?: Record<string, string>;
  histogramBuckets?: number[];
}

/**
 * TraceSpan - 追踪跨度
 */
export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags?: Record<string, string | number | boolean>;
  logs?: SpanLog[];
  status?: 'ok' | 'error' | 'unset';
}

/**
 * SpanLog - 跨度日志
 */
export interface SpanLog {
  timestamp: number;
  fields: Record<string, string | number | boolean>;
}

/**
 * TraceContext - 追踪上下文
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

/**
 * TracerConfig - 追踪配置
 */
export interface TracerConfig {
  serviceName: string;
  sampleRate?: number;
  exportTimeout?: number;
  maxSpans?: number;
}

/**
 * SamplingDecision - 采样决策
 */
export type SamplingDecision = 'record' | 'drop' | 'record_and_sample';

/**
 * HealthStatus - 健康状态
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * HealthCheckResult - 健康检查结果
 */
export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message?: string;
  timestamp: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

/**
 * HealthCheck - 健康检查函数
 */
export type HealthCheck = () => Promise<HealthCheckResult> | HealthCheckResult;

/**
 * HealthCheckConfig - 健康检查配置
 */
export interface HealthCheckConfig {
  checks: Record<string, HealthCheck>;
  interval?: number;
  timeout?: number;
}

/**
 * HealthCheckRegistration - 健康检查注册信息
 */
export interface HealthCheckRegistration {
  name: string;
  check: HealthCheck;
  critical: boolean;
}

/**
 * EventType - 事件类型
 */
export type EventType = string | symbol;

/**
 * EventListener - 事件监听器
 */
export interface EventListener {
  handler: (...args: any[]) => void;
  once: boolean;
  priority?: number;
}

/**
 * EventEmitterOptions - 事件发射器选项
 */
export interface EventEmitterOptions {
  maxListeners?: number;
  verbose?: boolean;
}

/**
 * OpenTelemetrySpan - OpenTelemetry 格式跨度（用于导出）
 */
export interface OpenTelemetrySpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  status?: {
    code: number;
    message?: string;
  };
  attributes?: Record<string, string | number | boolean>;
  events?: {
    name: string;
    timeUnixNano: string;
    attributes?: Record<string, string | number | boolean>;
  }[];
}

/**
 * OpenTelemetryMetric - OpenTelemetry 格式指标（用于导出）
 */
export interface OpenTelemetryMetric {
  name: string;
  description?: string;
  unit?: string;
  data: {
    dataPoints: {
      timeUnixNano: string;
      value: number;
      attributes?: Record<string, string>;
    }[];
  };
}
