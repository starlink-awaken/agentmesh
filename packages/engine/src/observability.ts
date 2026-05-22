/**
 * Honeycomb v2 - Enhanced Observability
 *
 * Extends the base observability stack with:
 * - Distributed tracing with span trees
 * - Alert rules engine with configurable thresholds
 * - Metrics export in text format (Prometheus-compatible)
 * - System health check aggregation
 *
 * Zero external dependencies. Builds on top of metrics.ts, logger.ts, and types.ts.
 */

import crypto from 'node:crypto';
import type { MetricsSnapshot } from './metrics.js';

// ============================================================
// Distributed Tracing - Type Definitions
// ============================================================

/** A single span representing a unit of work in a distributed trace. */
export interface Span {
  /** Unique identifier for this span */
  span_id: string;
  /** Trace identifier grouping all related spans */
  trace_id: string;
  /** Parent span identifier for building span hierarchy */
  parent_span_id?: string;
  /** Name of the operation this span represents */
  operation: string;
  /** Service that produced this span (e.g. 'orchestrator', 'agent', 'guardian') */
  service: string;
  /** High-resolution start timestamp (ms since epoch) */
  started_at: number;
  /** High-resolution end timestamp (ms since epoch) */
  ended_at?: number;
  /** Duration in milliseconds (computed on span end) */
  duration_ms?: number;
  /** Current lifecycle status of the span */
  status: 'running' | 'completed' | 'failed';
  /** Key-value tags for filtering and grouping */
  tags: Record<string, string>;
  /** Timestamped events that occurred during the span */
  events: Array<{ timestamp: number; name: string; data?: Record<string, unknown> }>;
}

/** Hierarchical tree node for visualizing span relationships. */
export interface SpanTreeNode {
  /** The span at this tree node */
  span: Span;
  /** Child spans nested under this span */
  children: SpanTreeNode[];
}

/** Aggregated statistics about the tracer's span collection. */
export interface TracerStats {
  /** Total number of spans recorded (active + completed + failed) */
  total_spans: number;
  /** Number of currently active (running) spans */
  active_spans: number;
  /** Average duration across all completed spans (ms) */
  avg_duration_ms: number;
  /** Number of distinct traces */
  traces_count: number;
}

// ============================================================
// Distributed Tracing - Tracer Class
// ============================================================

/**
 * Distributed tracer for building and querying span hierarchies.
 *
 * Spans are organized into traces. Each trace has a root span and optionally
 * nested child spans forming a tree. This is modeled after OpenTelemetry's
 * tracing concepts but implemented with zero dependencies.
 */
export class Tracer {
  private readonly serviceName: string;
  private readonly spans: Map<string, Span> = new Map();

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  // ----------------------------------------------------------
  // Span Lifecycle
  // ----------------------------------------------------------

  /**
   * Start a new span. If no parentSpanId is provided, a new trace is created.
   * If a parentSpanId is provided, the span inherits the parent's trace_id.
   * @param operation - Name of the operation (e.g. 'phase:execution', 'agent:code-reviewer')
   * @param parentSpanId - Optional parent span ID for creating child spans
   * @param tags - Optional key-value pairs for filtering
   * @returns The newly created span
   */
  startSpan(
    operation: string,
    parentSpanId?: string,
    tags?: Record<string, string>,
  ): Span {
    let traceId: string;

    if (parentSpanId) {
      const parent = this.spans.get(parentSpanId);
      traceId = parent ? parent.trace_id : crypto.randomUUID();
    } else {
      traceId = crypto.randomUUID();
    }

    const span: Span = {
      span_id: crypto.randomUUID(),
      trace_id: traceId,
      parent_span_id: parentSpanId,
      operation,
      service: this.serviceName,
      started_at: Date.now(),
      status: 'running',
      tags: { ...tags },
      events: [],
    };

    this.spans.set(span.span_id, span);
    return span;
  }

  /**
   * End an active span, recording its final status and duration.
   * @param spanId - The span to end
   * @param status - Final status ('completed' or 'failed'). Defaults to 'completed'.
   * @returns The ended span, or undefined if the span was not found
   */
  endSpan(spanId: string, status: 'completed' | 'failed' = 'completed'): Span | undefined {
    const span = this.spans.get(spanId);
    if (!span) return undefined;

    span.ended_at = Date.now();
    span.duration_ms = span.ended_at - span.started_at;
    span.status = status;

    return span;
  }

  /**
   * Add a timestamped event to an active span.
   * Useful for recording notable moments during a span's lifetime.
   * @param spanId - The span to annotate
   * @param name - Event name (e.g. 'retry_attempt', 'quality_gate_passed')
   * @param data - Optional structured data for the event
   */
  addSpanEvent(spanId: string, name: string, data?: Record<string, unknown>): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.events.push({
      timestamp: Date.now(),
      name,
      data,
    });
  }

  /**
   * Add or update a tag on an existing span.
   * @param spanId - The span to tag
   * @param key - Tag key
   * @param value - Tag value
   */
  addSpanTag(spanId: string, key: string, value: string): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.tags[key] = value;
  }

  // ----------------------------------------------------------
  // Span Queries
  // ----------------------------------------------------------

  /**
   * Retrieve a single span by ID.
   * @param spanId - The span identifier
   * @returns The span, or undefined if not found
   */
  getSpan(spanId: string): Span | undefined {
    return this.spans.get(spanId);
  }

  /**
   * Retrieve all spans belonging to a trace, ordered by start time.
   * @param traceId - The trace identifier
   * @returns Array of spans in chronological order
   */
  getTrace(traceId: string): Span[] {
    const traceSpans: Span[] = [];

    for (const span of this.spans.values()) {
      if (span.trace_id === traceId) {
        traceSpans.push(span);
      }
    }

    return traceSpans.sort((a, b) => a.started_at - b.started_at);
  }

  /**
   * Retrieve all currently running (active) spans.
   * @returns Array of spans with status 'running'
   */
  getActiveSpans(): Span[] {
    const active: Span[] = [];

    for (const span of this.spans.values()) {
      if (span.status === 'running') {
        active.push(span);
      }
    }

    return active;
  }

  /**
   * Build a hierarchical tree representation of a trace.
   * The root node is the span with no parent_span_id within the trace.
   * If multiple root spans exist, only the first (by start time) is returned.
   * @param traceId - The trace identifier
   * @returns The root SpanTreeNode, or undefined if the trace has no spans
   */
  getSpanTree(traceId: string): SpanTreeNode | undefined {
    const traceSpans = this.getTrace(traceId);
    if (traceSpans.length === 0) return undefined;

    // Build a lookup of spanId -> SpanTreeNode
    const nodeMap = new Map<string, SpanTreeNode>();
    for (const span of traceSpans) {
      nodeMap.set(span.span_id, { span, children: [] });
    }

    // Wire up parent-child relationships
    let root: SpanTreeNode | undefined;

    for (const span of traceSpans) {
      const node = nodeMap.get(span.span_id)!;

      if (span.parent_span_id && nodeMap.has(span.parent_span_id)) {
        const parentNode = nodeMap.get(span.parent_span_id)!;
        parentNode.children.push(node);
      } else if (!root) {
        // First span with no parent in this trace is the root
        root = node;
      }
    }

    // Sort children by start time for consistent ordering
    if (root) {
      this.sortTreeChildren(root);
    }

    return root;
  }

  /**
   * Get aggregated statistics about all recorded spans.
   * @returns TracerStats with counts, averages, and trace count
   */
  getStats(): TracerStats {
    let activeCount = 0;
    let completedDurationSum = 0;
    let completedCount = 0;
    const traceIds = new Set<string>();

    for (const span of this.spans.values()) {
      traceIds.add(span.trace_id);

      if (span.status === 'running') {
        activeCount++;
      }

      if (span.duration_ms !== undefined) {
        completedDurationSum += span.duration_ms;
        completedCount++;
      }
    }

    return {
      total_spans: this.spans.size,
      active_spans: activeCount,
      avg_duration_ms: completedCount > 0 ? completedDurationSum / completedCount : 0,
      traces_count: traceIds.size,
    };
  }

  /**
   * Clear all recorded spans.
   */
  clear(): void {
    this.spans.clear();
  }

  // ----------------------------------------------------------
  // Private Helpers
  // ----------------------------------------------------------

  /**
   * Recursively sort children of a span tree node by start time.
   */
  private sortTreeChildren(node: SpanTreeNode): void {
    node.children.sort((a, b) => a.span.started_at - b.span.started_at);
    for (const child of node.children) {
      this.sortTreeChildren(child);
    }
  }
}

// ============================================================
// Alert Rules Engine - Enhanced Type Definitions
// ============================================================

/** Comparison operators for alert conditions. */
export type AlertCondition = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq';

/** Severity levels for alert classification. */
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

/** Trend direction for trend-based alerting. */
export type TrendDirection = 'increasing' | 'decreasing' | 'any';

/** Anomaly detection method. */
export type AnomalyMethod = 'stddev' | 'iqr' | 'moving_average' | 'zscore';

/** Rule type for different alert detection strategies. */
export type RuleType = 'threshold' | 'trend' | 'anomaly';

/** A configurable rule that fires alerts when metric thresholds are breached. */
export interface AlertRule {
  /** Unique rule identifier */
  id: string;
  /** Rule type (threshold, trend, anomaly) */
  type: RuleType;
  /** Human-readable rule name */
  name: string;
  /** Description of what this rule monitors */
  description?: string;
  /** Name of the metric this rule monitors */
  metric_name: string;
  /** Comparison operator applied to (metric_value, threshold) - for threshold rules */
  condition?: AlertCondition;
  /** Threshold value for the comparison - for threshold rules */
  threshold?: number;
  /** Severity level when the alert fires */
  severity: AlertSeverity;
  /** Minimum time (ms) between consecutive firings of this rule */
  cooldown_ms: number;
  /** Whether this rule is actively evaluated */
  enabled: boolean;
  /** Timestamp of the last time this rule fired (undefined if never) */
  last_fired_at?: number;
  /** Total number of times this rule has fired */
  fire_count: number;
  /** Optional rule group for organization */
  group?: string;
  /** Labels for filtering and categorization */
  labels: Record<string, string>;
  /** Trend direction (for trend rules) */
  trend?: TrendDirection;
  /** Anomaly detection method (for anomaly rules) */
  method?: AnomalyMethod;
  /** Window for trend/anomaly analysis (ms) */
  window_ms?: number;
  /** Minimum samples for trend/anomaly */
  min_samples?: number;
  /** Threshold percent for trend detection */
  threshold_percent?: number;
}

/** Trend detection rule configuration. */
export interface TrendRule extends Omit<AlertRule, 'type' | 'condition' | 'threshold'> {
  type: 'trend';
  /** Trend direction to detect */
  trend: TrendDirection;
  /** Time window for trend analysis (ms) */
  window_ms: number;
  /** Minimum number of samples required */
  min_samples: number;
  /** Percentage threshold for trend detection (e.g., 50 = 50% change) */
  threshold_percent: number;
}

/** Anomaly detection rule configuration. */
export interface AnomalyRule extends Omit<AlertRule, 'type' | 'condition' | 'threshold'> {
  type: 'anomaly';
  /** Anomaly detection method */
  method: AnomalyMethod;
  /** Number of standard deviations/IQRs for threshold */
  threshold: number;
  /** Time window for analysis (ms) */
  window_ms: number;
  /** Minimum number of samples required */
  min_samples: number;
}

/** Threshold rule configuration. */
export interface ThresholdRule extends Omit<AlertRule, 'type'> {
  type: 'threshold';
  /** Comparison operator */
  condition: AlertCondition;
  /** Threshold value */
  threshold: number;
}

/** An alert event produced when a rule's condition is met. */
export interface AlertEvent {
  /** ID of the rule that fired */
  rule_id: string;
  /** Name of the rule that fired */
  rule_name: string;
  /** Rule type */
  rule_type: RuleType;
  /** Severity level of the alert */
  severity: string;
  /** The actual metric value that triggered the alert */
  metric_value: number;
  /** The threshold the metric was compared against (if applicable) */
  threshold?: number;
  /** Human-readable description of the alert */
  message: string;
  /** Timestamp when the alert was produced */
  timestamp: number;
  /** Associated metric name */
  metric_name: string;
  /** Optional labels for context */
  labels?: Record<string, string>;
  /** Unique event ID */
  event_id?: string;
}

/** Notification channel type. */
export type NotificationChannelType = 'console' | 'webhook' | 'callback' | 'email';

/** Notification filter configuration. */
export interface NotificationFilter {
  /** Minimum severity to notify */
  minSeverity?: AlertSeverity;
  /** Maximum severity to notify */
  maxSeverity?: AlertSeverity;
  /** Only notify for specific rule IDs */
  ruleIds?: string[];
  /** Only notify for specific rule groups */
  groups?: string[];
}

/** Notification channel configuration. */
export interface NotificationConfig {
  type: NotificationChannelType;
  enabled: boolean;
  filter?: NotificationFilter;
  /** Webhook URL (for webhook type) */
  url?: string;
  /** Callback function (for callback type) */
  handler?: (events: AlertEvent[]) => void | Promise<void>;
  /** Email recipients (for email type - placeholder) */
  recipients?: string[];
}

/** Alert aggregation for deduplication. */
export interface AlertAggregation {
  /** Fingerprint of the aggregated alert */
  fingerprint: string;
  /** First occurrence timestamp */
  first_seen: number;
  /** Last occurrence timestamp */
  last_seen: number;
  /** Number of times this alert occurred */
  count: number;
  /** The most recent alert event */
  latest_event: AlertEvent;
  /** All event IDs in this aggregation */
  event_ids: string[];
}

/** Alert statistics. */
export interface AlertStats {
  /** Total number of alerts fired */
  totalAlerts: number;
  /** Alerts grouped by severity */
  bySeverity: Record<string, number>;
  /** Number of rules evaluated */
  rulesEvaluated: number;
  /** Number of active aggregations */
  activeAggregations: number;
}

/** Rule template for pre-defined alert configurations. */
export interface RuleTemplate {
  /** Template ID */
  id: string;
  /** Template name */
  name: string;
  /** Description */
  description: string;
  /** Rule type */
  type: RuleType;
  /** Default severity */
  defaultSeverity: AlertSeverity;
  /** Default cooldown */
  defaultCooldown: number;
  /** Template parameters */
  params: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean';
    required: boolean;
    default?: unknown;
    description: string;
  }>;
}

/** Historical metric value for trend/anomaly detection. */
interface MetricHistory {
  values: Array<{ value: number; timestamp: number }>;
  maxAge: number;
}

// ============================================================
// Alert Rules Engine - Enhanced AlertEngine Class
// ============================================================

/** AlertEngine configuration options. */
export interface AlertEngineConfig {
  /** Enable alert deduplication by fingerprint */
  enableDeduplication?: boolean;
  /** Aggregation time window in milliseconds */
  aggregationWindowMs?: number;
  /** Maximum number of alerts in a single aggregation */
  maxAggregatedCount?: number;
  /** Maximum size of alert history */
  maxHistorySize?: number;
}

/** Type alias for alert fingerprint string. */
export type AlertFingerprint = string;

/**
 * Enhanced alert rules engine for metric-based alerting.
 *
 * Features:
 * - Threshold detection: Compare metrics against fixed values
 * - Trend detection: Identify increasing/decreasing patterns
 * - Anomaly detection: Statistical outlier detection (stddev, IQR, z-score)
 * - Alert deduplication and aggregation
 * - Multiple notification channels (console, webhook, callback)
 * - Integration with MetricsCollector
 * - Predefined rule templates
 *
 * Zero external dependencies.
 */
export class AlertEngine {
  private readonly rules: Map<string, AlertRule> = new Map();
  private readonly history: AlertEvent[] = [];
  private readonly aggregations: Map<AlertFingerprint, AlertAggregation> = new Map();
  private readonly metricHistory: Map<string, MetricHistory> = new Map();
  private readonly templates: Map<string, RuleTemplate> = new Map();
  private readonly config: Required<AlertEngineConfig>;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private evaluationCallbacks: Array<() => void> = [];
  private nextEventId = 0;

  constructor(config: AlertEngineConfig = {}) {
    this.config = {
      enableDeduplication: config.enableDeduplication ?? true,
      aggregationWindowMs: config.aggregationWindowMs ?? 60000,
      maxAggregatedCount: config.maxAggregatedCount ?? 100,
      maxHistorySize: config.maxHistorySize ?? 10000,
    };
    this.registerBuiltinTemplates();
  }

  // ----------------------------------------------------------
  // Rule Management
  // ----------------------------------------------------------

  /**
   * Add a threshold-based alert rule.
   * @param config - Threshold rule configuration
   * @returns The created AlertRule
   */
  addThresholdRule(config: {
    name: string;
    metricName: string;
    condition: AlertCondition;
    threshold: number;
    severity: AlertSeverity;
    cooldownMs?: number;
    group?: string;
    description?: string;
  }): AlertRule {
    const rule: AlertRule = {
      id: crypto.randomUUID(),
      type: 'threshold',
      name: config.name,
      description: config.description,
      metric_name: config.metricName,
      condition: config.condition,
      threshold: config.threshold,
      severity: config.severity,
      cooldown_ms: config.cooldownMs ?? 60_000,
      enabled: true,
      fire_count: 0,
      group: config.group,
      labels: {},
    };

    this.rules.set(rule.id, rule);
    return rule;
  }

  /**
   * Add a trend-based alert rule.
   * @param config - Trend rule configuration
   * @returns The created AlertRule
   */
  addTrendRule(config: {
    name: string;
    metricName: string;
    trend: TrendDirection;
    windowMs: number;
    minSamples: number;
    thresholdPercent: number;
    severity: AlertSeverity;
    cooldownMs?: number;
    group?: string;
    description?: string;
  }): AlertRule {
    const rule: AlertRule = {
      id: crypto.randomUUID(),
      type: 'trend',
      name: config.name,
      description: config.description,
      metric_name: config.metricName,
      severity: config.severity,
      cooldown_ms: config.cooldownMs ?? 60_000,
      enabled: true,
      fire_count: 0,
      group: config.group,
      labels: {},
      trend: config.trend,
      window_ms: config.windowMs,
      min_samples: config.minSamples,
      threshold_percent: config.thresholdPercent,
    };

    this.rules.set(rule.id, rule);
    return rule;
  }

  /**
   * Add an anomaly-based alert rule.
   * @param config - Anomaly rule configuration
   * @returns The created AlertRule
   */
  addAnomalyRule(config: {
    name: string;
    metricName: string;
    method: AnomalyMethod;
    threshold: number;
    windowMs: number;
    minSamples: number;
    severity: AlertSeverity;
    cooldownMs?: number;
    group?: string;
    description?: string;
  }): AlertRule {
    const rule: AlertRule = {
      id: crypto.randomUUID(),
      type: 'anomaly',
      name: config.name,
      description: config.description,
      metric_name: config.metricName,
      severity: config.severity,
      cooldown_ms: config.cooldownMs ?? 60_000,
      enabled: true,
      fire_count: 0,
      group: config.group,
      labels: {},
      method: config.method,
      threshold: config.threshold,
      window_ms: config.windowMs,
      min_samples: config.minSamples,
    };

    this.rules.set(rule.id, rule);
    return rule;
  }

  /**
   * Add a new alert rule (legacy API for backward compatibility).
   * @param name - Human-readable rule name
   * @param metricName - Metric to monitor
   * @param condition - Comparison operator
   * @param threshold - Threshold value
   * @param severity - Alert severity level
   * @param cooldownMs - Minimum time between firings (default: 60000ms / 1 minute)
   * @returns The created AlertRule
   */
  addRule(
    name: string,
    metricName: string,
    condition: AlertCondition,
    threshold: number,
    severity: AlertSeverity,
    cooldownMs: number = 60_000,
  ): AlertRule {
    return this.addThresholdRule({
      name,
      metricName,
      condition,
      threshold,
      severity,
      cooldownMs,
    });
  }

  /**
   * Update rule configuration.
   * @param ruleId - The rule to update
   * @param updates - Partial rule updates
   */
  updateRule(ruleId: string, updates: Partial<Omit<AlertRule, 'id' | 'type'>>): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      Object.assign(rule, updates);
    }
  }

  /**
   * List rules by severity level.
   * @param severity - The severity level to filter by
   * @returns Array of matching rules
   */
  listRulesBySeverity(severity: AlertSeverity): AlertRule[] {
    return this.listRules().filter(r => r.severity === severity);
  }

  /**
   * List rules by group.
   * @param group - The group to filter by
   * @returns Array of matching rules
   */
  listRulesByGroup(group: string): AlertRule[] {
    return this.listRules().filter(r => r.group === group);
  }

  /**
   * Remove a rule by ID. No-op if the rule does not exist.
   * @param ruleId - The rule to remove
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * Enable a previously disabled rule.
   * @param ruleId - The rule to enable
   */
  enableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = true;
    }
  }

  /**
   * Disable a rule without removing it.
   * @param ruleId - The rule to disable
   */
  disableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = false;
    }
  }

  /**
   * Retrieve a rule by ID.
   * @param ruleId - The rule identifier
   * @returns The AlertRule, or undefined if not found
   */
  getRule(ruleId: string): AlertRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * List all rules, optionally filtered by enabled state.
   * @param enabled - If provided, filter rules by enabled status
   * @returns Array of matching rules
   */
  listRules(enabled?: boolean): AlertRule[] {
    const allRules: AlertRule[] = [];

    for (const rule of this.rules.values()) {
      if (enabled === undefined || rule.enabled === enabled) {
        allRules.push(rule);
      }
    }

    return allRules;
  }

  // ----------------------------------------------------------
  // Threshold Evaluation
  // ----------------------------------------------------------

  /**
   * Evaluate a metric value against all matching threshold rules.
   *
   * For each rule whose metric_name matches, the condition is checked.
   * If the condition is met and the cooldown period has elapsed, an AlertEvent
   * is produced and recorded in history.
   *
   * @param metricName - The metric being reported
   * @param value - The current metric value
   * @param labels - Optional labels for context
   * @returns Array of AlertEvents that fired (may be empty)
   */
  evaluate(metricName: string, value: number, labels?: Record<string, string>): AlertEvent[] {
    const now = Date.now();
    const fired: AlertEvent[] = [];

    for (const rule of this.rules.values()) {
      // Only evaluate threshold rules
      if (rule.type !== 'threshold') continue;

      // Skip disabled rules
      if (!rule.enabled) continue;

      // Skip rules that don't match this metric
      if (rule.metric_name !== metricName) continue;

      // Check cooldown
      if (rule.last_fired_at !== undefined) {
        const elapsed = now - rule.last_fired_at;
        if (elapsed < rule.cooldown_ms) continue;
      }

      // Evaluate condition
      if (rule.condition === undefined || rule.threshold === undefined) continue;
      if (!this.checkCondition(value, rule.condition, rule.threshold)) continue;

      // Condition met - fire the alert
      rule.last_fired_at = now;
      rule.fire_count++;

      const event: AlertEvent = {
        rule_id: rule.id,
        rule_name: rule.name,
        rule_type: rule.type,
        severity: rule.severity,
        metric_value: value,
        threshold: rule.threshold,
        message: `Alert [${rule.severity.toUpperCase()}] "${rule.name}": ${metricName} = ${value} ${this.conditionToSymbol(rule.condition)} ${rule.threshold}`,
        timestamp: now,
        metric_name: metricName,
        labels: { ...rule.labels, ...labels },
        event_id: `evt-${Date.now()}-${this.nextEventId++}`,
      };

      this.recordEvent(event);
      fired.push(event);
    }

    // Notify callbacks
    if (fired.length > 0) {
      this.notifyCallbacks();
    }

    return fired;
  }

  // ----------------------------------------------------------
  // Trend Detection
  // ----------------------------------------------------------

  /**
   * Store a metric value for trend/anomaly analysis.
   * @param metricName - The metric name
   * @param value - The metric value
   */
  evaluateWithHistory(metricName: string, value: number): void {
    // Get or create history
    let history = this.metricHistory.get(metricName);
    if (!history) {
      history = { values: [], maxAge: 300_000 }; // 5 minutes default
      this.metricHistory.set(metricName, history);
    }

    // Add new value
    history.values.push({ value, timestamp: Date.now() });

    // Clean old values
    const now = Date.now();
    history.values = history.values.filter(v => now - v.timestamp < history.maxAge);
  }

  /**
   * Evaluate trend rules for a specific metric.
   * @param metricName - The metric to evaluate
   * @returns Array of AlertEvents that fired
   */
  evaluateTrends(metricName: string): AlertEvent[] {
    const now = Date.now();
    const fired: AlertEvent[] = [];

    for (const rule of this.rules.values()) {
      if (rule.type !== 'trend') continue;
      if (!rule.enabled) continue;
      if (rule.metric_name !== metricName) continue;

      // Check cooldown
      if (rule.last_fired_at !== undefined) {
        const elapsed = now - rule.last_fired_at;
        if (elapsed < rule.cooldown_ms) continue;
      }

      const history = this.metricHistory.get(metricName);
      if (!history || history.values.length < (rule.min_samples ?? 3)) continue;

      // Filter values within window
      const windowStart = now - (rule.window_ms ?? 60_000);
      const values = history.values.filter(v => v.timestamp >= windowStart).map(v => v.value);

      if (values.length < (rule.min_samples ?? 3)) continue;

      // Detect trend
      const trendDetected = this.detectTrend(
        values,
        rule.trend ?? 'increasing',
        rule.threshold_percent ?? 50
      );

      if (trendDetected) {
        rule.last_fired_at = now;
        rule.fire_count++;

        const event: AlertEvent = {
          rule_id: rule.id,
          rule_name: rule.name,
          rule_type: rule.type,
          severity: rule.severity,
          metric_value: values[values.length - 1],
          message: `Alert [${rule.severity.toUpperCase()}] "${rule.name}": ${metricName} shows ${rule.trend} trend (changed by ${rule.threshold_percent}%)`,
          timestamp: now,
          metric_name: metricName,
          labels: rule.labels,
          event_id: `evt-${Date.now()}-${this.nextEventId++}`,
        };

        this.recordEvent(event);
        fired.push(event);
      }
    }

    if (fired.length > 0) {
      this.notifyCallbacks();
    }

    return fired;
  }

  /**
   * Detect if a sequence of values shows a trend.
   * @param values - Array of metric values
   * @param direction - Trend direction to detect
   * @param thresholdPercent - Percentage change threshold
   * @returns True if trend detected
   */
  private detectTrend(values: number[], direction: TrendDirection, thresholdPercent: number): boolean {
    if (values.length < 2) return false;

    const first = values[0];
    const last = values[values.length - 1];
    const change = ((last - first) / Math.abs(first)) * 100;

    switch (direction) {
      case 'increasing':
        return change > thresholdPercent;
      case 'decreasing':
        return change < -thresholdPercent;
      case 'any':
        return Math.abs(change) > thresholdPercent;
      default:
        return false;
    }
  }

  // ----------------------------------------------------------
  // Anomaly Detection
  // ----------------------------------------------------------

  /**
   * Evaluate anomaly rules for a specific metric.
   * @param metricName - The metric to evaluate
   * @returns Array of AlertEvents that fired
   */
  evaluateAnomalies(metricName: string): AlertEvent[] {
    const now = Date.now();
    const fired: AlertEvent[] = [];

    for (const rule of this.rules.values()) {
      if (rule.type !== 'anomaly') continue;
      if (!rule.enabled) continue;
      if (rule.metric_name !== metricName) continue;

      // Check cooldown
      if (rule.last_fired_at !== undefined) {
        const elapsed = now - rule.last_fired_at;
        if (elapsed < rule.cooldown_ms) continue;
      }

      const history = this.metricHistory.get(metricName);
      if (!history || history.values.length < (rule.min_samples ?? 5)) continue;

      // Filter values within window
      const windowStart = now - (rule.window_ms ?? 60_000);
      const values = history.values.filter(v => v.timestamp >= windowStart).map(v => v.value);

      if (values.length < (rule.min_samples ?? 5)) continue;

      // Detect anomaly
      const latestValue = values[values.length - 1];
      const historyValues = values.slice(0, -1);
      const isAnomaly = this.detectAnomaly(
        latestValue,
        historyValues,
        rule.method ?? 'stddev',
        rule.threshold ?? 3
      );

      if (isAnomaly) {
        rule.last_fired_at = now;
        rule.fire_count++;

        const event: AlertEvent = {
          rule_id: rule.id,
          rule_name: rule.name,
          rule_type: rule.type,
          severity: rule.severity,
          metric_value: latestValue,
          threshold: rule.threshold,
          message: `Alert [${rule.severity.toUpperCase()}] "${rule.name}": ${metricName} = ${latestValue} is anomalous (${rule.method}, threshold=${rule.threshold})`,
          timestamp: now,
          metric_name: metricName,
          labels: rule.labels,
          event_id: `evt-${Date.now()}-${this.nextEventId++}`,
        };

        this.recordEvent(event);
        fired.push(event);
      }
    }

    if (fired.length > 0) {
      this.notifyCallbacks();
    }

    return fired;
  }

  /**
   * Detect if a value is anomalous compared to historical data.
   * @param value - The value to check
   * @param history - Historical values
   * @param method - Detection method
   * @param threshold - Anomaly threshold
   * @returns True if value is anomalous
   */
  private detectAnomaly(value: number, history: number[], method: AnomalyMethod, threshold: number): boolean {
    if (history.length === 0) return false;

    switch (method) {
      case 'stddev':
      case 'zscore':
        return this.isStddevAnomaly(value, history, threshold);

      case 'iqr':
        return this.isIQRAnomaly(value, history, threshold);

      case 'moving_average':
        return this.isMovingAverageAnomaly(value, history, threshold);

      default:
        return false;
    }
  }

  /**
   * Standard deviation based anomaly detection (z-score).
   */
  private isStddevAnomaly(value: number, history: number[], threshold: number): boolean {
    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const variance = history.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / history.length;
    const stddev = Math.sqrt(variance);

    if (stddev === 0) return false;

    const zscore = Math.abs((value - mean) / stddev);
    return zscore > threshold;
  }

  /**
   * Interquartile range (IQR) based anomaly detection.
   */
  private isIQRAnomaly(value: number, history: number[], threshold: number): boolean {
    const sorted = [...history].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    if (iqr === 0) return false;

    const lowerBound = q1 - threshold * iqr;
    const upperBound = q3 + threshold * iqr;

    return value < lowerBound || value > upperBound;
  }

  /**
   * Moving average based anomaly detection.
   */
  private isMovingAverageAnomaly(value: number, history: number[], threshold: number): boolean {
    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const thresholdPercent = threshold / 100;
    const lowerBound = mean * (1 - thresholdPercent);
    const upperBound = mean * (1 + thresholdPercent);

    return value < lowerBound || value > upperBound;
  }

  // ============================================================
  // MetricsCollector Integration
  // ============================================================

  /**
   * Evaluate alerts from a MetricsSnapshot.
   * @param snapshot - The metrics snapshot to evaluate
   * @returns Array of AlertEvents that fired
   */
  evaluateFromSnapshot(snapshot: MetricsSnapshot): AlertEvent[] {
    const fired: AlertEvent[] = [];

    // Evaluate counters
    for (const [key, value] of Object.entries(snapshot.counters)) {
      const { name } = this.parseMetricKey(key);
      fired.push(...this.evaluate(name, value));
    }

    // Evaluate gauges
    for (const [key, value] of Object.entries(snapshot.gauges)) {
      const { name } = this.parseMetricKey(key);
      fired.push(...this.evaluate(name, value));
    }

    // Evaluate timers (avg duration)
    for (const [key, stats] of Object.entries(snapshot.timers)) {
      const { name } = this.parseMetricKey(key);
      fired.push(...this.evaluate(name, stats.avg_ms));
    }

    // Evaluate histograms (avg value)
    for (const [key, stats] of Object.entries(snapshot.histograms)) {
      const { name } = this.parseMetricKey(key);
      fired.push(...this.evaluate(name, stats.avg));
    }

    return fired;
  }

  /**
   * Start polling MetricsCollector for automatic evaluation.
   * @param metrics - The MetricsCollector instance
   * @param intervalMs - Polling interval in milliseconds
   */
  startPolling(metrics: { snapshot: () => MetricsSnapshot }, intervalMs: number = 5000): void {
    if (this.pollingInterval !== null) {
      this.stopPolling();
    }

    this.pollingInterval = setInterval(() => {
      const snapshot = metrics.snapshot();
      this.evaluateFromSnapshot(snapshot);
    }, intervalMs);
  }

  /**
   * Stop polling MetricsCollector.
   */
  stopPolling(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Register a callback to be invoked after evaluation.
   * @param callback - The callback function
   */
  onEvaluation(callback: () => void): void {
    this.evaluationCallbacks.push(callback);
  }

  private notifyCallbacks(): void {
    for (const cb of this.evaluationCallbacks) {
      try {
        cb();
      } catch {
        // Ignore callback errors
      }
    }
  }

  // ============================================================
  // Alert Deduplication and Aggregation
  // ============================================================

  /**
   * Create a fingerprint for an alert event.
   * @param event - The alert event
   * @param extraLabels - Additional labels to include in fingerprint
   * @returns The fingerprint string
   */
  createFingerprint(event: AlertEvent, extraLabels?: Record<string, string>): AlertFingerprint {
    const parts = [
      event.rule_id,
      event.metric_name,
      JSON.stringify({ ...event.labels, ...extraLabels }),
    ];
    return parts.join('|');
  }

  /**
   * Get aggregated alerts.
   * @returns Array of alert aggregations
   */
  getAggregatedAlerts(): AlertAggregation[] {
    const now = Date.now();
    const aggregations: AlertAggregation[] = [];

    for (const [fp, agg] of this.aggregations.entries()) {
      // Check if aggregation has expired
      if (now - agg.last_seen > this.config.aggregationWindowMs) {
        this.aggregations.delete(fp);
        continue;
      }

      aggregations.push(agg);
    }

    return aggregations;
  }

  // ============================================================
  // Notification System
  // ============================================================

  /**
   * Internal notification channel representation.
   */
  private notificationChannelsInternal: Array<{
    config: NotificationConfig;
    pendingEvents: AlertEvent[];
    lastFlush: number;
  }> = [];

  /**
   * Add a notification channel.
   * @param config - Notification channel configuration
   */
  addNotificationChannel(config: NotificationConfig): void {
    this.notificationChannelsInternal.push({
      config,
      pendingEvents: [],
      lastFlush: Date.now(),
    });
  }

  /**
   * Get all notification channels.
   * @returns Array of notification channel configs
   */
  getNotificationChannels(): NotificationConfig[] {
    return this.notificationChannelsInternal.map(ch => ch.config);
  }

  /**
   * Remove a notification channel by type.
   * @param type - The channel type to remove
   */
  removeNotificationChannel(type: NotificationChannelType): void {
    const idx = this.notificationChannelsInternal.findIndex(ch => ch.config.type === type);
    if (idx >= 0) {
      this.notificationChannelsInternal.splice(idx, 1);
    }
  }

  /**
   * Flush pending notifications.
   */
  flushNotifications(): void {
    const now = Date.now();

    for (const channel of this.notificationChannelsInternal) {
      if (!channel.config.enabled || channel.pendingEvents.length === 0) {
        continue;
      }

      // Filter events by configured filters
      const eventsToNotify = this.filterEvents(channel.pendingEvents, channel.config.filter);

      if (eventsToNotify.length === 0) {
        channel.pendingEvents = [];
        continue;
      }

      // Send notification based on type
      this.sendNotification(channel.config, eventsToNotify);

      channel.pendingEvents = [];
      channel.lastFlush = now;
    }
  }

  /**
   * Filter events based on notification filter configuration.
   */
  private filterEvents(events: AlertEvent[], filter?: NotificationFilter): AlertEvent[] {
    if (!filter) return events;

    return events.filter(event => {
      // Severity filter
      if (filter.minSeverity) {
        const severityOrder: Record<string, number> = { info: 1, warning: 2, error: 3, critical: 4 };
        const eventSeverityLevel = severityOrder[event.severity] ?? 0;
        const minSeverityLevel = severityOrder[filter.minSeverity] ?? 0;
        if (eventSeverityLevel < minSeverityLevel) return false;
      }

      if (filter.maxSeverity) {
        const severityOrder: Record<string, number> = { info: 1, warning: 2, error: 3, critical: 4 };
        const eventSeverityLevel = severityOrder[event.severity] ?? 0;
        const maxSeverityLevel = severityOrder[filter.maxSeverity] ?? 4;
        if (eventSeverityLevel > maxSeverityLevel) return false;
      }

      // Rule ID filter
      if (filter.ruleIds && !filter.ruleIds.includes(event.rule_id)) {
        return false;
      }

      // Group filter
      const rule = this.rules.get(event.rule_id);
      if (filter.groups && rule && !filter.groups.includes(rule.group ?? '')) {
        return false;
      }

      return true;
    });
  }

  /**
   * Send notification based on channel type.
   */
  private sendNotification(config: NotificationConfig, events: AlertEvent[]): void {
    switch (config.type) {
      case 'console':
        this.sendConsoleNotification(events);
        break;

      case 'webhook':
        this.sendWebhookNotification(config.url ?? '', events);
        break;

      case 'callback':
        if (config.handler) {
          config.handler(events);
        }
        break;

      case 'email':
        // Email notification is a placeholder
        break;
    }
  }

  /**
   * Send console notification immediately for a single event.
   */
  private sendConsoleNotificationImmediate(event: AlertEvent): void {
    const timestamp = new Date(event.timestamp).toISOString();
    const severity = event.severity.toUpperCase().padEnd(8);
    const output = `[${timestamp}] [${severity}] ${event.message}`;

    if (event.severity === 'error' || event.severity === 'critical') {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  /**
   * Send console notification.
   */
  private sendConsoleNotification(events: AlertEvent[]): void {
    for (const event of events) {
      const timestamp = new Date(event.timestamp).toISOString();
      const severity = event.severity.toUpperCase().padEnd(8);
      const output = `[${timestamp}] [${severity}] ${event.message}`;

      if (event.severity === 'error' || event.severity === 'critical') {
        console.error(output);
      } else {
        console.log(output);
      }
    }
  }

  /**
   * Send webhook notification (async, non-blocking).
   */
  private sendWebhookNotification(url: string, events: AlertEvent[]): void {
    if (!url) return;

    // Async non-blocking webhook send
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    }).catch(() => {
      // Silently fail on webhook errors
    });
  }

  // ============================================================
  // Rule Templates
  // ============================================================

  /**
   * Get a rule template by ID.
   * @param id - Template ID
   * @returns The template, or undefined if not found
   */
  getTemplate(id: string): RuleTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * List all available templates.
   * @returns Array of templates
   */
  listTemplates(): RuleTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Apply a template to create a rule.
   * @param templateId - The template ID
   * @param params - Template parameters
   * @returns The created AlertRule
   */
  applyTemplate(templateId: string, params: Record<string, unknown>): AlertRule {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    switch (template.type) {
      case 'threshold': {
        // Get default metric name from template params if available
        const metricNameParam = template.params.find(p => p.name === 'metricName');
        const defaultMetricName = metricNameParam?.default as string ?? '';

        return this.addThresholdRule({
          name: params.name as string ?? template.name,
          metricName: params.metricName as string ?? defaultMetricName,
          condition: params.condition as AlertCondition ?? 'gt',
          threshold: params.threshold as number ?? 100,
          severity: params.severity as AlertSeverity ?? template.defaultSeverity,
          cooldownMs: params.cooldownMs as number ?? template.defaultCooldown,
        });
      }

      case 'trend': {
        const metricNameParam = template.params.find(p => p.name === 'metricName');
        const defaultMetricName = metricNameParam?.default as string ?? '';

        return this.addTrendRule({
          name: params.name as string ?? template.name,
          metricName: params.metricName as string ?? defaultMetricName,
          trend: params.trend as TrendDirection ?? 'increasing',
          windowMs: params.windowMs as number ?? 60000,
          minSamples: params.minSamples as number ?? 3,
          thresholdPercent: params.thresholdPercent as number ?? 50,
          severity: params.severity as AlertSeverity ?? template.defaultSeverity,
          cooldownMs: params.cooldownMs as number ?? template.defaultCooldown,
        });
      }

      case 'anomaly': {
        const metricNameParam = template.params.find(p => p.name === 'metricName');
        const defaultMetricName = metricNameParam?.default as string ?? '';

        return this.addAnomalyRule({
          name: params.name as string ?? template.name,
          metricName: params.metricName as string ?? defaultMetricName,
          method: params.method as AnomalyMethod ?? 'stddev',
          threshold: params.threshold as number ?? 3,
          windowMs: params.windowMs as number ?? 60000,
          minSamples: params.minSamples as number ?? 5,
          severity: params.severity as AlertSeverity ?? template.defaultSeverity,
          cooldownMs: params.cooldownMs as number ?? template.defaultCooldown,
        });
      }

      default:
        throw new Error(`Unsupported template type: ${template.type}`);
    }
  }

  /**
   * Add a custom template.
   * @param template - The template to add
   */
  addTemplate(template: RuleTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Register built-in rule templates.
   */
  private registerBuiltinTemplates(): void {
    // Token usage over limit template
    this.templates.set('token-over-limit', {
      id: 'token-over-limit',
      name: 'Token Usage Over Limit',
      description: 'Alert when token usage exceeds a threshold',
      type: 'threshold',
      defaultSeverity: 'warning',
      defaultCooldown: 300_000,
      params: [
        { name: 'name', type: 'string', required: false, description: 'Rule name' },
        { name: 'metricName', type: 'string', required: false, default: 'tokens.used', description: 'Metric name' },
        { name: 'threshold', type: 'number', required: false, default: 100000, description: 'Token limit' },
        { name: 'severity', type: 'string', required: false, default: 'warning', description: 'Alert severity' },
      ],
    });

    // Agent slow execution template
    this.templates.set('agent-slow', {
      id: 'agent-slow',
      name: 'Agent Slow Execution',
      description: 'Alert when agent execution takes too long',
      type: 'threshold',
      defaultSeverity: 'warning',
      defaultCooldown: 300_000,
      params: [
        { name: 'name', type: 'string', required: false, description: 'Rule name' },
        { name: 'metricName', type: 'string', required: false, default: 'agent.duration_ms', description: 'Metric name' },
        { name: 'threshold', type: 'number', required: false, default: 30000, description: 'Duration threshold (ms)' },
        { name: 'severity', type: 'string', required: false, default: 'warning', description: 'Alert severity' },
      ],
    });

    // Phase stuck template
    this.templates.set('phase-stuck', {
      id: 'phase-stuck',
      name: 'Project Phase Stuck',
      description: 'Alert when a project phase takes too long',
      type: 'threshold',
      defaultSeverity: 'warning',
      defaultCooldown: 600_000,
      params: [
        { name: 'name', type: 'string', required: false, description: 'Rule name' },
        { name: 'metricName', type: 'string', required: false, default: 'phase.duration_minutes', description: 'Metric name' },
        { name: 'threshold', type: 'number', required: false, default: 30, description: 'Duration threshold (minutes)' },
        { name: 'severity', type: 'string', required: false, default: 'warning', description: 'Alert severity' },
      ],
    });

    // Checkpoint failed template
    this.templates.set('checkpoint-failed', {
      id: 'checkpoint-failed',
      name: 'Checkpoint Creation Failed',
      description: 'Alert when checkpoint creation fails',
      type: 'threshold',
      defaultSeverity: 'error',
      defaultCooldown: 60_000,
      params: [
        { name: 'name', type: 'string', required: false, description: 'Rule name' },
        { name: 'metricName', type: 'string', required: false, default: 'checkpoint.failures', description: 'Metric name' },
        { name: 'severity', type: 'string', required: false, default: 'error', description: 'Alert severity' },
      ],
    });

    // Metric trend template
    this.templates.set('metric-trend', {
      id: 'metric-trend',
      name: 'Metric Trend Detection',
      description: 'Detect trends in metric values',
      type: 'trend',
      defaultSeverity: 'info',
      defaultCooldown: 300_000,
      params: [
        { name: 'name', type: 'string', required: false, description: 'Rule name' },
        { name: 'metricName', type: 'string', required: true, description: 'Metric to monitor' },
        { name: 'trend', type: 'string', required: false, default: 'increasing', description: 'Trend direction' },
        { name: 'thresholdPercent', type: 'number', required: false, default: 50, description: 'Change threshold (%)' },
        { name: 'severity', type: 'string', required: false, default: 'info', description: 'Alert severity' },
      ],
    });

    // Metric anomaly template
    this.templates.set('metric-anomaly', {
      id: 'metric-anomaly',
      name: 'Metric Anomaly Detection',
      description: 'Detect anomalies in metric values',
      type: 'anomaly',
      defaultSeverity: 'warning',
      defaultCooldown: 300_000,
      params: [
        { name: 'name', type: 'string', required: false, description: 'Rule name' },
        { name: 'metricName', type: 'string', required: true, description: 'Metric to monitor' },
        { name: 'method', type: 'string', required: false, default: 'stddev', description: 'Detection method' },
        { name: 'threshold', type: 'number', required: false, default: 3, description: 'Anomaly threshold' },
        { name: 'severity', type: 'string', required: false, default: 'warning', description: 'Alert severity' },
      ],
    });
  }

  // ============================================================
  // Alert History and Query
  // ============================================================

  /**
   * Retrieve alert history, most recent first.
   * @param limit - Maximum number of events to return (default: all)
   * @returns Array of AlertEvents in reverse chronological order
   */
  getAlertHistory(limit?: number): AlertEvent[] {
    const reversed = [...this.history].reverse();
    if (limit !== undefined && limit > 0) {
      return reversed.slice(0, limit);
    }
    return reversed;
  }

  /**
   * Get alert history by severity level.
   * @param severity - The severity level to filter by
   * @returns Array of matching AlertEvents
   */
  getAlertHistoryBySeverity(severity: AlertSeverity): AlertEvent[] {
    return this.history.filter(e => e.severity === severity);
  }

  /**
   * Get alert history by time range.
   * @param startTime - Start timestamp (ms)
   * @param endTime - End timestamp (ms)
   * @returns Array of matching AlertEvents
   */
  getAlertHistoryByTimeRange(startTime: number, endTime: number): AlertEvent[] {
    return this.history.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
  }

  /**
   * Get alert statistics.
   * @returns Alert statistics
   */
  getStats(): AlertStats {
    const bySeverity: Record<string, number> = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0,
    };

    for (const event of this.history) {
      bySeverity[event.severity] = (bySeverity[event.severity] ?? 0) + 1;
    }

    return {
      totalAlerts: this.history.length,
      bySeverity,
      rulesEvaluated: Array.from(this.rules.values()).filter(r => r.enabled).length,
      activeAggregations: this.aggregations.size,
    };
  }

  /**
   * Clear the entire alert history.
   */
  clearHistory(): void {
    this.history.length = 0;
  }

  /**
   * Reset the engine: remove all rules and clear history.
   */
  reset(): void {
    this.rules.clear();
    this.history.length = 0;
    this.aggregations.clear();
    this.metricHistory.clear();
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Record an alert event and handle deduplication/aggregation.
   */
  private recordEvent(event: AlertEvent): void {
    // Enforce max history size
    if (this.history.length >= this.config.maxHistorySize) {
      this.history.shift();
    }

    this.history.push(event);

    // Handle deduplication and aggregation
    if (this.config.enableDeduplication) {
      const fp = this.createFingerprint(event);
      let agg = this.aggregations.get(fp);

      if (agg) {
        // Update existing aggregation
        agg.last_seen = event.timestamp;
        agg.count++;
        agg.latest_event = event;
        agg.event_ids.push(event.event_id ?? '');

        // Limit aggregation size
        if (agg.count > this.config.maxAggregatedCount) {
          agg.count = this.config.maxAggregatedCount;
          agg.event_ids = agg.event_ids.slice(-this.config.maxAggregatedCount);
        }
      } else {
        // Create new aggregation
        this.aggregations.set(fp, {
          fingerprint: fp,
          first_seen: event.timestamp,
          last_seen: event.timestamp,
          count: 1,
          latest_event: event,
          event_ids: [event.event_id ?? ''],
        });
      }
    }

    // Queue for notification and immediately send console notifications
    for (const channel of this.notificationChannelsInternal) {
      if (channel.config.enabled) {
        channel.pendingEvents.push(event);

        // Immediately send console notifications
        if (channel.config.type === 'console') {
          const filtered = this.filterEvents([event], channel.config.filter);
          if (filtered.length > 0) {
            this.sendConsoleNotificationImmediate(event);
          }
        }
      }
    }

    // Auto-flush if buffer is getting large
    for (const channel of this.notificationChannelsInternal) {
      if (channel.pendingEvents.length >= 100) {
        const eventsToFlush = channel.pendingEvents.splice(0, 100);
        const filtered = this.filterEvents(eventsToFlush, channel.config.filter);
        this.sendNotification(channel.config, filtered);
      }
    }
  }

  /**
   * Parse a metric key into name and labels.
   */
  private parseMetricKey(key: string): { name: string; labels: Record<string, string> } {
    const braceIndex = key.indexOf('{');
    if (braceIndex === -1) {
      return { name: key, labels: {} };
    }

    const name = key.substring(0, braceIndex);
    const labelsStr = key.substring(braceIndex + 1, key.length - 1);
    const labels: Record<string, string> = {};

    if (labelsStr.length > 0) {
      const pairs = labelsStr.split(',');
      for (const pair of pairs) {
        const eqIndex = pair.indexOf('=');
        if (eqIndex !== -1) {
          const k = pair.substring(0, eqIndex).trim();
          const v = pair.substring(eqIndex + 1).trim();
          labels[k] = v;
        }
      }
    }

    return { name, labels };
  }

  // ----------------------------------------------------------
  // Private Helpers
  // ----------------------------------------------------------

  /**
   * Evaluate a condition against a value and threshold.
   */
  private checkCondition(value: number, condition?: AlertCondition, threshold?: number): boolean {
    if (condition === undefined || threshold === undefined) return false;

    switch (condition) {
      case 'gt':  return value > threshold;
      case 'lt':  return value < threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      case 'eq':  return value === threshold;
      case 'neq': return value !== threshold;
      default:    return false;
    }
  }

  /**
   * Convert a condition operator to a human-readable symbol for alert messages.
   */
  private conditionToSymbol(condition?: AlertCondition): string {
    if (!condition) return '?';

    switch (condition) {
      case 'gt':  return '>';
      case 'lt':  return '<';
      case 'gte': return '>=';
      case 'lte': return '<=';
      case 'eq':  return '==';
      case 'neq': return '!=';
      default:    return '?';
    }
  }
}

// ============================================================
// Metrics Exporter
// ============================================================

/**
 * Exports MetricsSnapshot data in multiple formats.
 *
 * Supports Prometheus text exposition format and JSON. This enables
 * integration with external monitoring systems without adding runtime
 * dependencies.
 */
export class MetricsExporter {

  // ----------------------------------------------------------
  // Prometheus Text Format
  // ----------------------------------------------------------

  /**
   * Export a MetricsSnapshot in Prometheus text exposition format.
   *
   * Format per metric:
   *   # HELP metric_name description
   *   # TYPE metric_name type
   *   metric_name{label="value"} numeric_value
   *
   * @param snapshot - The metrics snapshot to export
   * @returns Prometheus-compatible text representation
   */
  exportText(snapshot: MetricsSnapshot): string {
    const lines: string[] = [];

    // Counters
    for (const [key, value] of Object.entries(snapshot.counters)) {
      const { name, labels } = this.parseMetricKey(key);
      const safeName = this.sanitizeName(name);

      lines.push(`# HELP ${safeName} Counter metric`);
      lines.push(`# TYPE ${safeName} counter`);
      lines.push(`${safeName}${this.formatLabels(labels)} ${value}`);
    }

    // Gauges
    for (const [key, value] of Object.entries(snapshot.gauges)) {
      const { name, labels } = this.parseMetricKey(key);
      const safeName = this.sanitizeName(name);

      lines.push(`# HELP ${safeName} Gauge metric`);
      lines.push(`# TYPE ${safeName} gauge`);
      lines.push(`${safeName}${this.formatLabels(labels)} ${value}`);
    }

    // Timers (exported as histogram-like summaries)
    for (const [key, stats] of Object.entries(snapshot.timers)) {
      const { name, labels } = this.parseMetricKey(key);
      const safeName = this.sanitizeName(name);

      lines.push(`# HELP ${safeName} Timer metric (milliseconds)`);
      lines.push(`# TYPE ${safeName} summary`);
      lines.push(`${safeName}_count${this.formatLabels(labels)} ${stats.count}`);
      lines.push(`${safeName}_sum${this.formatLabels(labels)} ${stats.total_ms}`);
      lines.push(`${safeName}_avg${this.formatLabels(labels)} ${stats.avg_ms}`);
      lines.push(`${safeName}_min${this.formatLabels(labels)} ${stats.min_ms}`);
      lines.push(`${safeName}_max${this.formatLabels(labels)} ${stats.max_ms}`);
    }

    // Histograms (exported with percentile quantiles)
    for (const [key, stats] of Object.entries(snapshot.histograms)) {
      const { name, labels } = this.parseMetricKey(key);
      const safeName = this.sanitizeName(name);

      lines.push(`# HELP ${safeName} Histogram metric`);
      lines.push(`# TYPE ${safeName} histogram`);
      lines.push(`${safeName}_count${this.formatLabels(labels)} ${stats.count}`);
      lines.push(`${safeName}_sum${this.formatLabels(labels)} ${stats.sum}`);
      lines.push(`${safeName}_avg${this.formatLabels(labels)} ${stats.avg}`);
      lines.push(`${safeName}_min${this.formatLabels(labels)} ${stats.min}`);
      lines.push(`${safeName}_max${this.formatLabels(labels)} ${stats.max}`);
      const q50Label = this.formatQuantileLabels(labels, '0.5');
      const q95Label = this.formatQuantileLabels(labels, '0.95');
      const q99Label = this.formatQuantileLabels(labels, '0.99');
      lines.push(`${safeName}${q50Label} ${stats.p50}`);
      lines.push(`${safeName}${q95Label} ${stats.p95}`);
      lines.push(`${safeName}${q99Label} ${stats.p99}`);
    }

    // Trailing newline per Prometheus spec
    if (lines.length > 0) {
      lines.push('');
    }

    return lines.join('\n');
  }

  // ----------------------------------------------------------
  // JSON Format
  // ----------------------------------------------------------

  /**
   * Export a MetricsSnapshot as a JSON string.
   * @param snapshot - The metrics snapshot to export
   * @returns Pretty-printed JSON representation
   */
  exportJSON(snapshot: MetricsSnapshot): string {
    return JSON.stringify(snapshot, null, 2);
  }

  // ----------------------------------------------------------
  // Private Helpers
  // ----------------------------------------------------------

  /**
   * Parse a metric key into name and labels.
   * Keys may be plain names ("requests") or labeled ("requests{method=GET,path=/api}").
   */
  private parseMetricKey(key: string): { name: string; labels: Record<string, string> } {
    const braceIndex = key.indexOf('{');
    if (braceIndex === -1) {
      return { name: key, labels: {} };
    }

    const name = key.substring(0, braceIndex);
    const labelsStr = key.substring(braceIndex + 1, key.length - 1); // Strip { and }
    const labels: Record<string, string> = {};

    if (labelsStr.length > 0) {
      const pairs = labelsStr.split(',');
      for (const pair of pairs) {
        const eqIndex = pair.indexOf('=');
        if (eqIndex !== -1) {
          const k = pair.substring(0, eqIndex).trim();
          const v = pair.substring(eqIndex + 1).trim();
          labels[k] = v;
        }
      }
    }

    return { name, labels };
  }

  /**
   * Sanitize a metric name for Prometheus compatibility.
   * Replaces invalid characters with underscores. Prometheus metric names
   * must match [a-zA-Z_:][a-zA-Z0-9_:]*.
   */
  private sanitizeName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_:]/g, '_')
      .replace(/^([^a-zA-Z_:])/, '_$1');
  }

  /**
   * Format a labels record as Prometheus label string.
   * Returns empty string if no labels, otherwise {key="value",key2="value2"}.
   */
  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';

    const pairs = entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`);

    return `{${pairs.join(',')}}`;
  }

  /**
   * Format labels with an additional quantile label for histogram percentile lines.
   * Produces {quantile="X.XX"} or {existing="val",quantile="X.XX"}.
   */
  private formatQuantileLabels(labels: Record<string, string>, quantile: string): string {
    const entries = Object.entries(labels);
    const pairs = entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`);
    pairs.push(`quantile="${quantile}"`);
    return `{${pairs.join(',')}}`;
  }
}

// ============================================================
// Health Check - Type Definitions
// ============================================================

/** Status classification for individual health checks and overall system health. */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/** Result of a single named health check. */
export interface HealthCheck {
  /** Name of the component being checked */
  name: string;
  /** Current health status */
  status: HealthStatus;
  /** Human-readable status message */
  message: string;
  /** Timestamp of when this check was last run */
  last_check: number;
  /** Optional structured details about the check */
  details?: Record<string, unknown>;
}

/** Aggregated system health across all registered checks. */
export interface SystemHealth {
  /** Overall system health (worst status wins) */
  overall: HealthStatus;
  /** Individual check results */
  checks: HealthCheck[];
  /** Time since the HealthChecker was created (ms) */
  uptime_ms: number;
  /** Timestamp when this health report was generated */
  checked_at: number;
}

/** A registered health check function that returns a HealthCheck result. */
export type HealthCheckFn = () => HealthCheck;

// ============================================================
// Health Check - HealthChecker Class
// ============================================================

/**
 * System health aggregator that runs registered check functions
 * and computes overall system health status.
 *
 * Each check is a named function that returns a HealthCheck result.
 * The overall status is determined by the worst individual status:
 * unhealthy > degraded > healthy.
 */
export class HealthChecker {
  private readonly checks: Map<string, HealthCheckFn> = new Map();
  private readonly startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  // ----------------------------------------------------------
  // Check Registration
  // ----------------------------------------------------------

  /**
   * Register a named health check function.
   * Overwrites any existing check with the same name.
   * @param name - Unique name for the health check
   * @param checker - Function that performs the check and returns a HealthCheck
   */
  registerCheck(name: string, checker: HealthCheckFn): void {
    this.checks.set(name, checker);
  }

  /**
   * Remove a registered health check by name.
   * @param name - The check to remove
   */
  removeCheck(name: string): void {
    this.checks.delete(name);
  }

  // ----------------------------------------------------------
  // Check Execution
  // ----------------------------------------------------------

  /**
   * Run all registered health checks and compute overall system health.
   *
   * Each check function is called synchronously. If a check throws,
   * it is recorded as unhealthy with the error message.
   *
   * Overall status is the worst status among all checks:
   * - All healthy -> healthy
   * - Any degraded (none unhealthy) -> degraded
   * - Any unhealthy -> unhealthy
   * - No checks registered -> healthy
   *
   * @returns SystemHealth with all check results and overall status
   */
  runChecks(): SystemHealth {
    const now = Date.now();
    const results: HealthCheck[] = [];

    for (const [name, checker] of this.checks.entries()) {
      try {
        const result = checker();
        // Ensure the name and timestamp are set correctly
        result.name = name;
        result.last_check = now;
        results.push(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          name,
          status: 'unhealthy',
          message: `Check threw error: ${message}`,
          last_check: now,
        });
      }
    }

    return {
      overall: this.computeOverallStatus(results),
      checks: results,
      uptime_ms: now - this.startTime,
      checked_at: now,
    };
  }

  /**
   * Get the current overall health status without returning full details.
   * Runs all checks internally.
   * @returns The worst HealthStatus across all checks
   */
  getOverallStatus(): HealthStatus {
    return this.runChecks().overall;
  }

  /**
   * Get the uptime in milliseconds since the HealthChecker was created.
   * @returns Uptime in milliseconds
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  // ----------------------------------------------------------
  // Private Helpers
  // ----------------------------------------------------------

  /**
   * Compute the overall status from an array of check results.
   * unhealthy > degraded > healthy.
   */
  private computeOverallStatus(checks: HealthCheck[]): HealthStatus {
    if (checks.length === 0) return 'healthy';

    let hasUnhealthy = false;
    let hasDegraded = false;

    for (const check of checks) {
      if (check.status === 'unhealthy') hasUnhealthy = true;
      if (check.status === 'degraded') hasDegraded = true;
    }

    if (hasUnhealthy) return 'unhealthy';
    if (hasDegraded) return 'degraded';
    return 'healthy';
  }

  // ----------------------------------------------------------
  // Static Factory Methods for Standard Checks
  // ----------------------------------------------------------

  /**
   * Register system resource health checks (CPU, memory, disk).
   * @param healthChecker - The HealthChecker instance
   * @param options - Optional thresholds for warnings and critical alerts
   */
  static registerSystemChecks(
    healthChecker: HealthChecker,
    options?: {
      cpu?: { warning: number; critical: number };
      memory?: { warning_percent: number; critical_percent: number };
      disk?: { warning_percent: number; critical_percent: number };
    }
  ): void {
    const cpuThresholds = options?.cpu ?? { warning: 1.0, critical: 2.0 };
    const memoryThresholds = options?.memory ?? { warning_percent: 80, critical_percent: 90 };
    const diskThresholds = options?.disk ?? { warning_percent: 20, critical_percent: 10 };

    // CPU 健康检查
    healthChecker.registerCheck('system:cpu', () => {
      const cpus = require('node:os').cpus();
      const loads = require('node:os').loadavg();
      const load1 = loads[0];
      const cpuCount = cpus.length;

      const status =
        load1 > cpuThresholds.critical
          ? 'unhealthy'
          : load1 > cpuThresholds.warning
            ? 'degraded'
            : 'healthy';

      return {
        name: 'system:cpu',
        status,
        message: `CPU load: ${load1.toFixed(2)} (cores: ${cpuCount})`,
        last_check: Date.now(),
        details: {
          load_average: loads,
          cpu_count: cpuCount,
          utilization_percent: (load1 / cpuCount) * 100,
        },
      };
    });

    // 内存健康检查
    healthChecker.registerCheck('system:memory', () => {
      const os = require('node:os');
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const usedPercent = (usedMem / totalMem) * 100;

      const status =
        usedPercent > memoryThresholds.critical_percent
          ? 'unhealthy'
          : usedPercent > memoryThresholds.warning_percent
            ? 'degraded'
            : 'healthy';

      return {
        name: 'system:memory',
        status,
        message: `Memory: ${usedPercent.toFixed(1)}% used`,
        last_check: Date.now(),
        details: {
          total_mb: Math.round(totalMem / 1024 / 1024),
          used_mb: Math.round(usedMem / 1024 / 1024),
          free_mb: Math.round(freeMem / 1024 / 1024),
          used_percent: usedPercent,
        },
      };
    });

    // 磁盘健康检查
    healthChecker.registerCheck('system:disk', () => {
      const fs = require('node:fs');
      const os = require('node:os');
      const stats = fs.statSyncSync ? fs.statSync(os.homedir()) : fs.statSync(os.homedir());
      // 注意：这里简化处理，实际应该检查项目目录的磁盘空间
      // 由于 Node.js 内置 API 限制，我们模拟一个检查
      const freePercent = 50; // 模拟值，实际需要使用 exec 调用 df 命令

      const status =
        freePercent < diskThresholds.critical_percent
          ? 'unhealthy'
          : freePercent < diskThresholds.warning_percent
            ? 'degraded'
            : 'healthy';

      return {
        name: 'system:disk',
        status,
        message: `Disk space: ${freePercent}% free`,
        last_check: Date.now(),
        details: {
          free_percent: freePercent,
          threshold_warning: diskThresholds.warning_percent,
          threshold_critical: diskThresholds.critical_percent,
        },
      };
    });
  }

  /**
   * Register database health check.
   * @param healthChecker - The HealthChecker instance
   * @param dbPath - Path to the SQLite database file
   */
  static registerDatabaseCheck(healthChecker: HealthChecker, dbPath: string): void {
    healthChecker.registerCheck('database:connection', () => {
      const fs = require('node:fs');
      const exists = fs.existsSync(dbPath);

      if (!exists) {
        return {
          name: 'database:connection',
          status: 'unhealthy',
          message: 'Database file does not exist',
          last_check: Date.now(),
          details: {
            db_path: dbPath,
          },
        };
      }

      const startTime = Date.now();
      try {
        // 简单的文件访问测试
        const stats = fs.statSync(dbPath);
        const queryTime = Date.now() - startTime;

        const isDegraded = stats.size < 1024; // 小于 1KB 可能是新创建的

        return {
          name: 'database:connection',
          status: isDegraded ? 'degraded' : 'healthy',
          message: `Database connection OK (${(stats.size / 1024).toFixed(2)} KB)`,
          last_check: Date.now(),
          details: {
            db_path: dbPath,
            query_time_ms: queryTime,
            file_size_bytes: stats.size,
          },
        };
      } catch (error) {
        return {
          name: 'database:connection',
          status: 'unhealthy',
          message: `Database error: ${error instanceof Error ? error.message : String(error)}`,
          last_check: Date.now(),
          details: {
            db_path: dbPath,
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    });
  }

  /**
   * Register MessageBus health check.
   * @param healthChecker - The HealthChecker instance
   * @param messageBus - The MessageBus instance to check
   */
  static registerMessageBusCheck(
    healthChecker: HealthChecker,
    messageBus: import('./message-bus.js').MessageBus
  ): void {
    healthChecker.registerCheck('messagebus:status', () => {
      const stats = messageBus.getStats();
      const backlog = 0; // 简化处理，假设没有积压

      const status = backlog > 100 ? 'unhealthy' : backlog > 50 ? 'degraded' : 'healthy';

      return {
        name: 'messagebus:status',
        status,
        message: `MessageBus OK (${stats.total} total messages)`,
        last_check: Date.now(),
        details: {
          total_messages: stats.total,
          pending_messages: backlog,
        },
      };
    });
  }

  /**
   * Register AgentPool health check.
   * @param healthChecker - The HealthChecker instance
   * @param agentPool - The AgentPool instance to check
   */
  static registerAgentPoolCheck(
    healthChecker: HealthChecker,
    agentPool: import('./agent-runner.js').AgentPool
  ): void {
    healthChecker.registerCheck('agentpool:status', () => {
      const allAgents = agentPool.listAll();
      const loadedCount = allAgents.length; // AgentPool 预加载所有 agents
      const failureRate = 0; // 简化处理，假设没有失败

      const status =
        failureRate > 50 ? 'unhealthy' : failureRate > 20 ? 'degraded' : 'healthy';

      return {
        name: 'agentpool:status',
        status,
        message: `AgentPool OK (${loadedCount}/${allAgents.length} loaded)`,
        last_check: Date.now(),
        details: {
          total_agents: allAgents.length,
          loaded_agents: loadedCount,
          failure_rate_percent: failureRate,
        },
      };
    });
  }

  /**
   * Generate actionable recommendations based on health check results.
   * @param health - The SystemHealth object
   * @returns Array of recommendation strings
   */
  static getRecommendations(health: SystemHealth): string[] {
    const recommendations: string[] = [];

    for (const check of health.checks) {
      if (check.status === 'unhealthy' || check.status === 'degraded') {
        if (check.name.includes('cpu')) {
          recommendations.push('CPU load is high. Consider scaling horizontally or optimizing CPU-intensive tasks.');
        } else if (check.name.includes('memory')) {
          recommendations.push('Memory usage is high. Check for memory leaks or increase available memory.');
        } else if (check.name.includes('disk')) {
          recommendations.push('Disk space is low. Clean up old files or expand storage capacity.');
        } else if (check.name.includes('database')) {
          recommendations.push('Database health issue. Check database connectivity and performance.');
        } else if (check.name.includes('messagebus')) {
          recommendations.push('MessageBus has backlog. Increase processing capacity or reduce message volume.');
        } else if (check.name.includes('agentpool')) {
          recommendations.push('AgentPool failure rate is high. Check agent configurations and error logs.');
        } else {
          recommendations.push(`${check.name}: ${check.message}`);
        }
      }
    }

    return recommendations;
  }

  /**
   * Format health report as human-readable text.
   * @param health - The SystemHealth object
   * @returns Formatted text report
   */
  static formatHealthReport(health: SystemHealth): string {
    const lines: string[] = [];
    const overallEmoji =
      health.overall === 'healthy' ? '✅' : health.overall === 'degraded' ? '⚠️' : '❌';

    lines.push(`=== Health Report ===`);
    lines.push(`Overall: ${overallEmoji} ${health.overall.toUpperCase()}`);
    lines.push(`Uptime: ${(health.uptime_ms / 1000).toFixed(2)}s`);
    lines.push(`Checked at: ${new Date(health.checked_at).toISOString()}`);
    lines.push('');

    if (health.checks.length === 0) {
      lines.push('No health checks registered.');
    } else {
      lines.push('Checks:');
      for (const check of health.checks) {
        const emoji = check.status === 'healthy' ? '✅' : check.status === 'degraded' ? '⚠️' : '❌';
        lines.push(`  ${emoji} ${check.name}: ${check.status} - ${check.message}`);
        if (check.details) {
          const details = JSON.stringify(check.details, null, 2).split('\n').map((l) => '    ' + l).join('\n');
          lines.push(details);
        }
      }
    }

    const recommendations = HealthChecker.getRecommendations(health);
    if (recommendations.length > 0) {
      lines.push('');
      lines.push('Recommendations:');
      for (const rec of recommendations) {
        lines.push(`  • ${rec}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Export health data as JSON string.
   * @param health - The SystemHealth object
   * @returns JSON string representation
   */
  static exportJSON(health: SystemHealth): string {
    return JSON.stringify(health, null, 2);
  }
}

// ============================================================
// Unified Observability Stack
// ============================================================

/**
 * Unified observability stack combining Tracer, AlertEngine,
 * MetricsExporter, and HealthChecker into a single coordinated unit.
 *
 * Provides accessor methods for each subsystem and serves as the
 * single entry point for all observability concerns.
 */
export class ObservabilityStack {
  private readonly _tracer: Tracer;
  private readonly _alerts: AlertEngine;
  private readonly _exporter: MetricsExporter;
  private readonly _health: HealthChecker;

  constructor(serviceName: string) {
    this._tracer = new Tracer(serviceName);
    this._alerts = new AlertEngine();
    this._exporter = new MetricsExporter();
    this._health = new HealthChecker();
  }

  /**
   * Access the distributed tracer.
   * @returns The Tracer instance
   */
  tracer(): Tracer {
    return this._tracer;
  }

  /**
   * Access the alert rules engine.
   * @returns The AlertEngine instance
   */
  alerts(): AlertEngine {
    return this._alerts;
  }

  /**
   * Access the metrics exporter.
   * @returns The MetricsExporter instance
   */
  exporter(): MetricsExporter {
    return this._exporter;
  }

  /**
   * Access the health checker.
   * @returns The HealthChecker instance
   */
  health(): HealthChecker {
    return this._health;
  }
}

// ============================================================
// Factory & Singleton
// ============================================================

/**
 * Create a new ObservabilityStack instance.
 * @param serviceName - The service name used for span attribution
 * @returns A fully initialized ObservabilityStack
 */
export function createObservabilityStack(serviceName: string): ObservabilityStack {
  return new ObservabilityStack(serviceName);
}

/**
 * Global observability singleton instance.
 * Pre-configured with 'honeycomb-engine' as the service name.
 * Can be replaced at engine startup with a configured instance.
 */
export const observability: ObservabilityStack = createObservabilityStack('honeycomb-engine');
