/**
 * Metrics - 指标系统
 *
 * 支持 Counter、Gauge、Histogram 指标和聚合统计
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  CounterMetric,
  GaugeMetric,
  HistogramMetric,
  Metric,
  MetricName,
  MetricsConfig,
} from './types.js';
import { EventEmitter } from './EventEmitter.js';

/**
 * Default histogram buckets
 */
const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * Counter - 计数器
 */
export class Counter {
  private name: MetricName;
  private value: number = 0;
  private labels: Record<string, string>;
  private labelsKey: string;

  constructor(name: MetricName, labels: Record<string, string> = {}) {
    this.name = name;
    this.labels = labels;
    this.labelsKey = JSON.stringify(labels);
  }

  /**
   * 增加计数
   */
  inc(value: number = 1): void {
    this.value += value;
  }

  /**
   * 重置计数
   */
  reset(): void {
    this.value = 0;
  }

  /**
   * 获取当前值
   */
  getValue(): number {
    return this.value;
  }

  /**
   * 获取标签
   */
  getLabels(): Record<string, string> {
    return { ...this.labels };
  }

  /**
   * 获取指标数据
   */
  getMetric(): CounterMetric {
    return {
      type: 'counter',
      name: this.name,
      value: this.value,
      labels: this.labels,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Gauge - 仪表
 */
export class Gauge {
  private name: MetricName;
  private value: number = 0;
  private labels: Record<string, string>;

  constructor(name: MetricName, labels: Record<string, string> = {}) {
    this.name = name;
    this.labels = labels;
  }

  /**
   * 设置值
   */
  set(value: number): void {
    this.value = value;
  }

  /**
   * 增加值
   */
  inc(value: number = 1): void {
    this.value += value;
  }

  /**
   * 减少值
   */
  dec(value: number = 1): void {
    this.value -= value;
  }

  /**
   * 获取当前值
   */
  getValue(): number {
    return this.value;
  }

  /**
   * 获取标签
   */
  getLabels(): Record<string, string> {
    return { ...this.labels };
  }

  /**
   * 获取指标数据
   */
  getMetric(): GaugeMetric {
    return {
      type: 'gauge',
      name: this.name,
      value: this.value,
      labels: this.labels,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Histogram - 直方图
 */
export class Histogram {
  private name: MetricName;
  private values: number[] = [];
  private buckets: number[];
  private labels: Record<string, string>;
  private count: number = 0;
  private sum: number = 0;
  private min: number = Infinity;
  private max: number = -Infinity;

  constructor(name: MetricName, buckets: number[] = DEFAULT_BUCKETS, labels: Record<string, string> = {}) {
    this.name = name;
    this.buckets = [...buckets].sort((a, b) => a - b);
    this.labels = labels;
  }

  /**
   * 记录值
   */
  observe(value: number): void {
    this.values.push(value);
    this.count++;
    this.sum += value;
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);
  }

  /**
   * 重置直方图
   */
  reset(): void {
    this.values = [];
    this.count = 0;
    this.sum = 0;
    this.min = Infinity;
    this.max = -Infinity;
  }

  /**
   * 获取观测值数量
   */
  getCount(): number {
    return this.count;
  }

  /**
   * 获取总和
   */
  getSum(): number {
    return this.sum;
  }

  /**
   * 获取平均值
   */
  getMean(): number {
    return this.count > 0 ? this.sum / this.count : 0;
  }

  /**
   * 获取标签
   */
  getLabels(): Record<string, string> {
    return { ...this.labels };
  }

  /**
   * 获取分位数
   */
  quantile(q: number): number {
    if (this.values.length === 0) return 0;

    const sorted = [...this.values].sort((a, b) => a - b);
    const index = Math.ceil(q * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * 获取桶计数
   */
  getBucketCounts(): Record<number, number> {
    const result: Record<number, number> = {};

    for (const bucket of this.buckets) {
      result[bucket] = this.values.filter((v) => v <= bucket).length;
    }

    return result;
  }

  /**
   * 获取指标数据
   */
  getMetric(): HistogramMetric {
    return {
      type: 'histogram',
      name: this.name,
      values: [...this.values],
      buckets: this.buckets,
      count: this.count,
      sum: this.sum,
      min: this.min === Infinity ? 0 : this.min,
      max: this.max === Infinity ? 0 : this.max,
      labels: this.labels,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Metrics - 指标系统主类
 */
export class Metrics extends EventEmitter {
  private config: Required<MetricsConfig>;
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();

  constructor(config: MetricsConfig = {}) {
    super();
    this.config = {
      enabled: config.enabled ?? true,
      prefix: config.prefix ?? '',
      defaultLabels: config.defaultLabels ?? {},
      histogramBuckets: config.histogramBuckets ?? DEFAULT_BUCKETS,
    };
  }

  /**
   * 生成带前缀和标签的键
   */
  private getKey(name: MetricName, labels: Record<string, string> = {}): string {
    const fullLabels = { ...this.config.defaultLabels, ...labels };
    const labelsKey = Object.entries(fullLabels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${this.config.prefix}${name}{${labelsKey}}`;
  }

  /**
   * 获取或创建 Counter
   */
  getCounter(name: MetricName, labels: Record<string, string> = {}): Counter {
    const key = this.getKey(name, labels);
    let counter = this.counters.get(key);

    if (!counter) {
      counter = new Counter(name, { ...this.config.defaultLabels, ...labels });
      this.counters.set(key, counter);
    }

    return counter;
  }

  /**
   * 获取或创建 Gauge
   */
  getGauge(name: MetricName, labels: Record<string, string> = {}): Gauge {
    const key = this.getKey(name, labels);
    let gauge = this.gauges.get(key);

    if (!gauge) {
      gauge = new Gauge(name, { ...this.config.defaultLabels, ...labels });
      this.gauges.set(key, gauge);
    }

    return gauge;
  }

  /**
   * 获取或创建 Histogram
   */
  getHistogram(name: MetricName, labels: Record<string, string> = {}): Histogram {
    const key = this.getKey(name, labels);
    let histogram = this.histograms.get(key);

    if (!histogram) {
      histogram = new Histogram(
        name,
        this.config.histogramBuckets,
        { ...this.config.defaultLabels, ...labels }
      );
      this.histograms.set(key, histogram);
    }

    return histogram;
  }

  /**
   * 创建 Counter 的便捷方法
   */
  counter(name: MetricName, labels?: Record<string, string>): Counter {
    return this.getCounter(name, labels);
  }

  /**
   * 创建 Gauge 的便捷方法
   */
  gauge(name: MetricName, labels?: Record<string, string>): Gauge {
    return this.getGauge(name, labels);
  }

  /**
   * 创建 Histogram 的便捷方法
   */
  histogram(name: MetricName, labels?: Record<string, string>): Histogram {
    return this.getHistogram(name, labels);
  }

  /**
   * 获取所有指标
   */
  getAllMetrics(): Metric[] {
    const metrics: Metric[] = [];

    for (const counter of this.counters.values()) {
      metrics.push(counter.getMetric());
    }

    for (const gauge of this.gauges.values()) {
      metrics.push(gauge.getMetric());
    }

    for (const histogram of this.histograms.values()) {
      metrics.push(histogram.getMetric());
    }

    return metrics;
  }

  /**
   * 重置所有指标
   */
  reset(): void {
    for (const counter of this.counters.values()) {
      counter.reset();
    }

    for (const histogram of this.histograms.values()) {
      histogram.reset();
    }

    this.emit('reset');
  }

  /**
   * 导出为 Prometheus 格式
   */
  toPrometheus(): string {
    const lines: string[] = [];

    // Counters
    for (const counter of this.counters.values()) {
      const metric = counter.getMetric();
      const labels = Object.entries(metric.labels || {})
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      const labelStr = labels ? `{${labels}}` : '';
      lines.push(`# TYPE ${metric.name} counter`);
      lines.push(`${metric.name}${labelStr} ${metric.value}`);
    }

    // Gauges
    for (const gauge of this.gauges.values()) {
      const metric = gauge.getMetric();
      const labels = Object.entries(metric.labels || {})
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      const labelStr = labels ? `{${labels}}` : '';
      lines.push(`# TYPE ${metric.name} gauge`);
      lines.push(`${metric.name}${labelStr} ${metric.value}`);
    }

    // Histograms
    for (const histogram of this.histograms.values()) {
      const metric = histogram.getMetric();
      const labels = Object.entries(metric.labels || {})
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      const labelStr = labels ? `{${labels}}` : '';

      lines.push(`# TYPE ${metric.name} histogram`);

      // Sum and Count
      lines.push(`${metric.name}_sum${labelStr} ${metric.sum}`);
      lines.push(`${metric.name}_count${labelStr} ${metric.count}`);

      // Buckets
      if (metric.buckets) {
        const bucketCounts = histogram.getBucketCounts();
        for (const bucket of metric.buckets) {
          const bucketLabel = bucket === Infinity ? '+Inf' : bucket.toString();
          lines.push(`${metric.name}_bucket{${labels ? labels + ',' : ''}le="${bucketLabel}"} ${bucketCounts[bucket] ?? 0}`);
        }
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * 获取指标统计信息
   */
  getStats(): {
    counters: number;
    gauges: number;
    histograms: number;
  } {
    return {
      counters: this.counters.size,
      gauges: this.gauges.size,
      histograms: this.histograms.size,
    };
  }
}

/**
 * 创建指标系统的便捷函数
 */
export function createMetrics(config?: MetricsConfig): Metrics {
  return new Metrics(config);
}

/**
 * 默认指标实例
 */
let defaultMetrics: Metrics | null = null;

/**
 * 获取默认指标实例
 */
export function getDefaultMetrics(): Metrics {
  if (!defaultMetrics) {
    defaultMetrics = new Metrics();
  }
  return defaultMetrics;
}

/**
 * 设置默认指标实例
 */
export function setDefaultMetrics(metrics: Metrics): void {
  defaultMetrics = metrics;
}
