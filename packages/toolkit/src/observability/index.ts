/**
 * Observability 模块 - 统一导出
 *
 * 可观测性系统：日志、指标、追踪、健康检查
 *
 * @author PAI
 * @version 1.0.0
 */

// EventEmitter
export { EventEmitter, createEventEmitter } from './EventEmitter.js';

// Logger
export { Logger, createLogger, getDefaultLogger, setDefaultLogger } from './Logger.js';

// Metrics
export {
  Counter,
  Gauge,
  Histogram,
  Metrics,
  createMetrics,
  getDefaultMetrics,
  setDefaultMetrics,
} from './Metrics.js';

// Tracer
export { Span, Tracer, createTracer, getDefaultTracer, setDefaultTracer } from './Tracer.js';

// HealthCheck
export {
  HealthChecker,
  createHealthCheck,
  getDefaultHealthCheck,
  setDefaultHealthCheck,
  createMemoryHealthCheck,
  createCpuHealthCheck,
  createEventLoopHealthCheck,
} from './HealthCheck.js';

// Types
export type {
  LogLevel,
  LogEntry,
  LogOutput,
  LoggerConfig,
  MetricName,
  MetricValue,
  MetricType,
  CounterMetric,
  GaugeMetric,
  HistogramMetric,
  Metric,
  MetricsConfig,
  TraceSpan,
  SpanLog,
  TraceContext,
  TracerConfig,
  SamplingDecision,
  HealthStatus,
  HealthCheckResult,
  HealthCheck,
  HealthCheckConfig,
  HealthCheckRegistration,
  EventType,
  EventListener,
  EventEmitterOptions,
  OpenTelemetrySpan,
  OpenTelemetryMetric,
} from './types.js';
