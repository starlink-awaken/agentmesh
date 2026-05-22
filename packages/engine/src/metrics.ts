/**
 * Honeycomb v2 - 指标收集系统
 *
 * 提供内存中的计数器、仪表、计时器和直方图指标收集。
 * 无外部依赖。支持带标签的指标、计时器观察和快照。
 * 维护所有指标条目的 FIFO 历史记录（最多 5000 条）。
 *
 * @since v2.0.0
 */

// ============================================================
// Type Definitions
// ============================================================

export type MetricType = 'counter' | 'gauge' | 'timer' | 'histogram';

export interface MetricEntry {
  name: string;
  type: MetricType;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export interface TimerHandle {
  stop: () => number; // Returns elapsed ms
}

export interface MetricsSnapshot {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  timers: Record<
    string,
    { count: number; total_ms: number; avg_ms: number; min_ms: number; max_ms: number }
  >;
  histograms: Record<
    string,
    {
      count: number;
      sum: number;
      avg: number;
      min: number;
      max: number;
      p50: number;
      p95: number;
      p99: number;
    }
  >;
  timestamp: number;
}

// ============================================================
// Internal Data Structures
// ============================================================

interface CounterData {
  value: number;
}

interface GaugeData {
  value: number;
}

interface TimerData {
  observations: number[]; // Individual timer measurements in ms
}

interface HistogramData {
  observations: number[]; // Individual observations
}

// ============================================================
// Metrics Collector Class
// ============================================================

export class MetricsCollector {
  private readonly counters: Map<string, CounterData> = new Map();
  private readonly gauges: Map<string, GaugeData> = new Map();
  private readonly timers: Map<string, TimerData> = new Map();
  private readonly histograms: Map<string, HistogramData> = new Map();
  private readonly history: MetricEntry[] = [];
  private readonly maxHistory: number;

  constructor(maxHistory: number = 5000) {
    this.maxHistory = maxHistory;
  }

  // ----------------------------------------------------------
  // Counter Operations
  // ----------------------------------------------------------

  /**
   * Increment a counter by the given amount (default 1).
   */
  increment(name: string, labels?: Record<string, string>, amount: number = 1): void {
    const key = this.formatKey(name, labels);
    const current = this.counters.get(key) ?? { value: 0 };
    current.value += amount;
    this.counters.set(key, current);
    this.recordEntry(name, 'counter', current.value, labels);
  }

  /**
   * Decrement a counter by the given amount (default 1).
   */
  decrement(name: string, labels?: Record<string, string>, amount: number = 1): void {
    const key = this.formatKey(name, labels);
    const current = this.counters.get(key) ?? { value: 0 };
    current.value -= amount;
    this.counters.set(key, current);
    this.recordEntry(name, 'counter', current.value, labels);
  }

  /**
   * Get the current value of a counter.
   */
  getCounter(name: string, labels?: Record<string, string>): number {
    const key = this.formatKey(name, labels);
    return this.counters.get(key)?.value ?? 0;
  }

  // ----------------------------------------------------------
  // Gauge Operations
  // ----------------------------------------------------------

  /**
   * Set a gauge value. Overwrites previous value.
   */
  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.formatKey(name, labels);
    this.gauges.set(key, { value });
    this.recordEntry(name, 'gauge', value, labels);
  }

  /**
   * Get the current value of a gauge.
   */
  getGauge(name: string, labels?: Record<string, string>): number {
    const key = this.formatKey(name, labels);
    return this.gauges.get(key)?.value ?? 0;
  }

  // ----------------------------------------------------------
  // Timer Operations
  // ----------------------------------------------------------

  /**
   * Start a timer and return a handle with a stop() method.
   * Call stop() to record the elapsed time.
   */
  startTimer(name: string, labels?: Record<string, string>): TimerHandle {
    const startTime = performance.now();

    return {
      stop: () => {
        const endTime = performance.now();
        const durationMs = endTime - startTime;
        this.recordTime(name, durationMs, labels);
        return durationMs;
      },
    };
  }

  /**
   * Record a timer value directly (in milliseconds).
   */
  recordTime(name: string, durationMs: number, labels?: Record<string, string>): void {
    const key = this.formatKey(name, labels);
    let data = this.timers.get(key);
    if (!data) {
      data = { observations: [] };
      this.timers.set(key, data);
    }
    data.observations.push(durationMs);
    this.recordEntry(name, 'timer', durationMs, labels);
  }

  // ----------------------------------------------------------
  // Histogram Operations
  // ----------------------------------------------------------

  /**
   * Observe a value in a histogram.
   */
  observe(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.formatKey(name, labels);
    let data = this.histograms.get(key);
    if (!data) {
      data = { observations: [] };
      this.histograms.set(key, data);
    }
    data.observations.push(value);
    this.recordEntry(name, 'histogram', value, labels);
  }

  // ----------------------------------------------------------
  // Snapshot & Export
  // ----------------------------------------------------------

  /**
   * Export a snapshot of all current metrics with aggregated statistics.
   */
  snapshot(): MetricsSnapshot {
    const snap: MetricsSnapshot = {
      counters: {},
      gauges: {},
      timers: {},
      histograms: {},
      timestamp: Date.now(),
    };

    // Counters: extract simple values
    Array.from(this.counters.entries()).forEach(([key, data]) => {
      snap.counters[key] = data.value;
    });

    // Gauges: extract simple values
    Array.from(this.gauges.entries()).forEach(([key, data]) => {
      snap.gauges[key] = data.value;
    });

    // Timers: calculate stats from observations
    Array.from(this.timers.entries()).forEach(([key, data]) => {
      snap.timers[key] = this.calculateTimerStats(data.observations);
    });

    // Histograms: calculate stats from observations
    Array.from(this.histograms.entries()).forEach(([key, data]) => {
      snap.histograms[key] = this.calculateHistogramStats(data.observations);
    });

    return snap;
  }

  /**
   * Get recent metric entries from FIFO history.
   * If limit is not provided or is greater than history length, returns all entries.
   */
  getHistory(limit?: number): MetricEntry[] {
    if (limit === undefined) {
      return [...this.history];
    }
    const start = Math.max(0, this.history.length - limit);
    return this.history.slice(start);
  }

  /**
   * Clear all metrics and history.
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.timers.clear();
    this.histograms.clear();
    this.history.length = 0;
  }

  // ----------------------------------------------------------
  // Private Helpers
  // ----------------------------------------------------------

  /**
   * Format a metric key from name and optional labels.
   * Format: name{label1=val1,label2=val2,...}
   */
  private formatKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelPairs = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelPairs}}`;
  }

  /**
   * Record a metric entry in the FIFO history.
   */
  private recordEntry(
    name: string,
    type: MetricType,
    value: number,
    labels?: Record<string, string>,
  ): void {
    const entry: MetricEntry = {
      name,
      type,
      value,
      labels: labels ?? {},
      timestamp: Date.now(),
    };

    this.history.push(entry);

    // Maintain max history size (FIFO: remove oldest if full)
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Calculate timer statistics from an array of observations (in ms).
   */
  private calculateTimerStats(
    observations: number[],
  ): MetricsSnapshot['timers'][string] {
    if (observations.length === 0) {
      return {
        count: 0,
        total_ms: 0,
        avg_ms: 0,
        min_ms: 0,
        max_ms: 0,
      };
    }

    const count = observations.length;
    const total_ms = observations.reduce((a, b) => a + b, 0);
    const avg_ms = total_ms / count;
    const min_ms = Math.min(...observations);
    const max_ms = Math.max(...observations);

    return {
      count,
      total_ms,
      avg_ms,
      min_ms,
      max_ms,
    };
  }

  /**
   * Calculate histogram statistics including percentiles (p50, p95, p99).
   */
  private calculateHistogramStats(
    observations: number[],
  ): MetricsSnapshot['histograms'][string] {
    if (observations.length === 0) {
      return {
        count: 0,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    const count = observations.length;
    const sum = observations.reduce((a, b) => a + b, 0);
    const avg = sum / count;
    const min = Math.min(...observations);
    const max = Math.max(...observations);

    // Sort for percentile calculation
    const sorted = [...observations].sort((a, b) => a - b);

    // Percentile calculation: p50 = 50th percentile, p95 = 95th percentile, p99 = 99th percentile
    // Using linear interpolation method
    const getPercentile = (p: number): number => {
      const index = (p / 100) * (count - 1);
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const weight = index - lower;

      if (lower === upper) {
        return sorted[lower];
      }

      return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    };

    return {
      count,
      sum,
      avg,
      min,
      max,
      p50: getPercentile(50),
      p95: getPercentile(95),
      p99: getPercentile(99),
    };
  }
}

// ============================================================
// Factory & Global Instance
// ============================================================

/**
 * Create a new MetricsCollector instance.
 */
export function createMetrics(maxHistory?: number): MetricsCollector {
  return new MetricsCollector(maxHistory);
}

/**
 * Global metrics singleton instance.
 * Can be replaced at engine startup with a configured instance.
 */
export const metrics: MetricsCollector = createMetrics();
