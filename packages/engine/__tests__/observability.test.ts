/**
 * Honeycomb v2 - Observability System Tests
 *
 * Tests for the observability stack including:
 * - Distributed Tracing (Tracer)
 * - Alert Rules Engine (AlertEngine)
 * - Metrics Exporter (MetricsExporter)
 * - Health Checker (HealthChecker)
 * - Unified Observability Stack (ObservabilityStack)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  Tracer,
  AlertEngine,
  MetricsExporter,
  HealthChecker,
  ObservabilityStack,
  createObservabilityStack,
  observability,
  type Span,
  type AlertRule,
  type AlertEvent,
  type NotificationConfig,
  type RuleTemplate,
  type HealthCheck,
  type SystemHealth,
  type AlertCondition,
  type AlertSeverity,
  type TrendDirection,
  type AnomalyMethod,
} from '../src/observability.js';
import type { MetricsSnapshot } from '../src/metrics.js';

// ============================================================
// Tracer Tests
// ============================================================

describe('Tracer', () => {
  let tracer: Tracer;

  beforeEach(() => {
    tracer = new Tracer('test-service');
  });

  describe('Span Lifecycle', () => {
    it('should create a new root span', () => {
      const span = tracer.startSpan('test-operation');

      expect(span.span_id).toBeTruthy();
      expect(span.trace_id).toBeTruthy();
      expect(span.operation).toBe('test-operation');
      expect(span.service).toBe('test-service');
      expect(span.status).toBe('running');
      expect(span.started_at).toBeLessThanOrEqual(Date.now());
    });

    it('should create child spans with parent reference', () => {
      const parent = tracer.startSpan('parent-operation');
      const child = tracer.startSpan('child-operation', parent.span_id);

      expect(child.parent_span_id).toBe(parent.span_id);
      expect(child.trace_id).toBe(parent.trace_id);
    });

    it('should end a span with completed status', () => {
      const span = tracer.startSpan('test-op');

      // Wait to ensure duration > 0
      const startTime = Date.now();
      while (Date.now() === startTime) {
        // spin until time advances
      }

      const ended = tracer.endSpan(span.span_id, 'completed');

      expect(ended).toBeDefined();
      expect(ended!.status).toBe('completed');
      expect(ended!.duration_ms).toBeGreaterThanOrEqual(0);
      expect(ended!.ended_at).toBeGreaterThanOrEqual(ended!.started_at);
    });

    it('should end a span with failed status', () => {
      const span = tracer.startSpan('test-op');
      const ended = tracer.endSpan(span.span_id, 'failed');

      expect(ended!.status).toBe('failed');
    });

    it('should return undefined when ending non-existent span', () => {
      const result = tracer.endSpan('non-existent');
      expect(result).toBeUndefined();
    });

    it('should add events to spans', () => {
      const span = tracer.startSpan('test-op');
      tracer.addSpanEvent(span.span_id, 'event-name', { data: 'value' });

      const retrieved = tracer.getSpan(span.span_id);
      expect(retrieved?.events).toHaveLength(1);
      expect(retrieved?.events[0].name).toBe('event-name');
    });

    it('should add tags to spans', () => {
      const span = tracer.startSpan('test-op');
      tracer.addSpanTag(span.span_id, 'key', 'value');

      const retrieved = tracer.getSpan(span.span_id);
      expect(retrieved?.tags.key).toBe('value');
    });
  });

  describe('Span Queries', () => {
    it('should retrieve a span by ID', () => {
      const span = tracer.startSpan('test-op');
      const retrieved = tracer.getSpan(span.span_id);

      expect(retrieved).toEqual(span);
    });

    it('should return undefined for non-existent span', () => {
      const retrieved = tracer.getSpan('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('should retrieve all spans in a trace', () => {
      const parent = tracer.startSpan('parent');
      const child1 = tracer.startSpan('child1', parent.span_id);
      const child2 = tracer.startSpan('child2', parent.span_id);

      const traceSpans = tracer.getTrace(parent.trace_id);

      expect(traceSpans).toHaveLength(3);
      expect(traceSpans.map(s => s.span_id)).toContain(parent.span_id);
      expect(traceSpans.map(s => s.span_id)).toContain(child1.span_id);
      expect(traceSpans.map(s => s.span_id)).toContain(child2.span_id);
    });

    it('should return empty array for non-existent trace', () => {
      const traceSpans = tracer.getTrace('non-existent-trace-id');
      expect(traceSpans).toEqual([]);
    });

    it('should retrieve active spans', () => {
      const active1 = tracer.startSpan('active1');
      const active2 = tracer.startSpan('active2');
      tracer.endSpan(active1.span_id);

      const activeSpans = tracer.getActiveSpans();

      expect(activeSpans).toHaveLength(1);
      expect(activeSpans[0].span_id).toBe(active2.span_id);
    });

    it('should build span tree for a trace', () => {
      const parent = tracer.startSpan('parent');
      const child1 = tracer.startSpan('child1', parent.span_id);
      const child2 = tracer.startSpan('child2', parent.span_id);
      const grandchild = tracer.startSpan('grandchild', child1.span_id);

      const tree = tracer.getSpanTree(parent.trace_id);

      expect(tree).toBeDefined();
      expect(tree!.span.span_id).toBe(parent.span_id);
      expect(tree!.children.length).toBe(2);
      expect(tree!.children[0].span.span_id).toBe(child1.span_id);
      expect(tree!.children[0].children[0].span.span_id).toBe(grandchild.span_id);
    });

    it('should return undefined for trace with no spans', () => {
      const tree = tracer.getSpanTree('empty-trace');
      expect(tree).toBeUndefined();
    });
  });

  describe('Statistics', () => {
    it('should calculate accurate stats', () => {
      const span1 = tracer.startSpan('span1');

      // Wait to ensure duration > 0
      const startTime = Date.now();
      while (Date.now() === startTime) {
        // spin until time advances
      }

      tracer.endSpan(span1.span_id);
      const span2 = tracer.startSpan('span2');

      const stats = tracer.getStats();

      expect(stats.total_spans).toBe(2);
      expect(stats.active_spans).toBe(1);
      expect(stats.traces_count).toBe(2);
      expect(stats.avg_duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero completed spans', () => {
      tracer.startSpan('active');
      const stats = tracer.getStats();

      expect(stats.avg_duration_ms).toBe(0);
    });
  });

  describe('Clear', () => {
    it('should clear all spans', () => {
      tracer.startSpan('span1');
      tracer.startSpan('span2');
      expect(tracer.getStats().total_spans).toBe(2);

      tracer.clear();
      expect(tracer.getStats().total_spans).toBe(0);
    });
  });
});

// ============================================================
// AlertEngine Tests
// ============================================================

describe('AlertEngine', () => {
  let engine: AlertEngine;

  beforeEach(() => {
    engine = new AlertEngine();
  });

  describe('Rule Management', () => {
    it('should add threshold rule', () => {
      const rule = engine.addThresholdRule({
        name: 'test-rule',
        metricName: 'test.metric',
        condition: 'gt',
        threshold: 100,
        severity: 'warning',
      });

      expect(rule.id).toBeTruthy();
      expect(rule.type).toBe('threshold');
      expect(rule.name).toBe('test-rule');
      expect(rule.metric_name).toBe('test.metric');
      expect(rule.condition).toBe('gt');
      expect(rule.threshold).toBe(100);
      expect(rule.enabled).toBe(true);
    });

    it('should add trend rule', () => {
      const rule = engine.addTrendRule({
        name: 'trend-rule',
        metricName: 'test.metric',
        trend: 'increasing',
        windowMs: 60000,
        minSamples: 3,
        thresholdPercent: 50,
        severity: 'info',
      });

      expect(rule.type).toBe('trend');
      expect(rule.trend).toBe('increasing');
      expect(rule.window_ms).toBe(60000);
    });

    it('should add anomaly rule', () => {
      const rule = engine.addAnomalyRule({
        name: 'anomaly-rule',
        metricName: 'test.metric',
        method: 'stddev',
        threshold: 3,
        windowMs: 60000,
        minSamples: 5,
        severity: 'error',
      });

      expect(rule.type).toBe('anomaly');
      expect(rule.method).toBe('stddev');
    });

    it('should use legacy addRule method', () => {
      const rule = engine.addRule(
        'legacy-rule',
        'legacy.metric',
        'lt',
        50,
        'critical',
        30000
      );

      expect(rule.type).toBe('threshold');
      expect(rule.name).toBe('legacy-rule');
      expect(rule.cooldown_ms).toBe(30000);
    });

    it('should update existing rule', () => {
      const rule = engine.addThresholdRule({
        name: 'test-rule',
        metricName: 'test.metric',
        condition: 'gt',
        threshold: 100,
        severity: 'warning',
      });

      engine.updateRule(rule.id, { severity: 'critical', enabled: false });

      const updated = engine.getRule(rule.id);
      expect(updated?.severity).toBe('critical');
      expect(updated?.enabled).toBe(false);
    });

    it('should list all rules', () => {
      engine.addThresholdRule({
        name: 'rule1',
        metricName: 'm1',
        condition: 'gt',
        threshold: 1,
        severity: 'info',
      });
      engine.addThresholdRule({
        name: 'rule2',
        metricName: 'm2',
        condition: 'lt',
        threshold: 2,
        severity: 'warning',
      });

      const rules = engine.listRules();
      expect(rules).toHaveLength(2);
    });

    it('should filter rules by enabled status', () => {
      const rule1 = engine.addThresholdRule({
        name: 'rule1',
        metricName: 'm1',
        condition: 'gt',
        threshold: 1,
        severity: 'info',
      });
      engine.disableRule(rule1.id);

      const enabledRules = engine.listRules(true);
      const disabledRules = engine.listRules(false);

      expect(enabledRules).toHaveLength(0);
      expect(disabledRules).toHaveLength(1);
    });

    it('should list rules by severity', () => {
      engine.addThresholdRule({
        name: 'rule1',
        metricName: 'm1',
        condition: 'gt',
        threshold: 1,
        severity: 'warning',
      });
      engine.addThresholdRule({
        name: 'rule2',
        metricName: 'm2',
        condition: 'lt',
        threshold: 2,
        severity: 'critical',
      });

      const critical = engine.listRulesBySeverity('critical');
      const warning = engine.listRulesBySeverity('warning');

      expect(critical).toHaveLength(1);
      expect(warning).toHaveLength(1);
    });

    it('should list rules by group', () => {
      engine.addThresholdRule({
        name: 'rule1',
        metricName: 'm1',
        condition: 'gt',
        threshold: 1,
        severity: 'warning',
        group: 'group-a',
      });

      const groupA = engine.listRulesByGroup('group-a');
      const groupB = engine.listRulesByGroup('group-b');

      expect(groupA).toHaveLength(1);
      expect(groupB).toHaveLength(0);
    });

    it('should enable and disable rules', () => {
      const rule = engine.addThresholdRule({
        name: 'test',
        metricName: 'm',
        condition: 'gt',
        threshold: 1,
        severity: 'warning',
      });

      engine.disableRule(rule.id);
      expect(engine.getRule(rule.id)?.enabled).toBe(false);

      engine.enableRule(rule.id);
      expect(engine.getRule(rule.id)?.enabled).toBe(true);
    });

    it('should remove rules', () => {
      const rule = engine.addThresholdRule({
        name: 'test',
        metricName: 'm',
        condition: 'gt',
        threshold: 1,
        severity: 'warning',
      });

      engine.removeRule(rule.id);
      expect(engine.getRule(rule.id)).toBeUndefined();
    });
  });

  describe('Threshold Evaluation', () => {
    it('should fire alert when condition is met', () => {
      engine.addThresholdRule({
        name: 'test-rule',
        metricName: 'test.metric',
        condition: 'gt',
        threshold: 100,
        severity: 'warning',
      });

      const events = engine.evaluate('test.metric', 150);

      expect(events).toHaveLength(1);
      expect(events[0].metric_value).toBe(150);
      expect(events[0].severity).toBe('warning');
    });

    it('should not fire alert when condition is not met', () => {
      engine.addThresholdRule({
        name: 'test-rule',
        metricName: 'test.metric',
        condition: 'gt',
        threshold: 100,
        severity: 'warning',
      });

      const events = engine.evaluate('test.metric', 50);
      expect(events).toHaveLength(0);
    });

    it('should respect cooldown period', () => {
      engine.addThresholdRule({
        name: 'test-rule',
        metricName: 'test.metric',
        condition: 'gt',
        threshold: 100,
        severity: 'warning',
        cooldownMs: 1000,
      });

      engine.evaluate('test.metric', 150); // First fire
      const events = engine.evaluate('test.metric', 150); // Should be cooled down

      expect(events).toHaveLength(0);
    });

    it('should evaluate all comparison conditions', () => {
      const conditions: AlertCondition[] = ['gt', 'lt', 'gte', 'lte', 'eq', 'neq'];

      for (const cond of conditions) {
        const ruleName = `test-${cond}`;
        engine.addThresholdRule({
          name: ruleName,
          metricName: `test.${cond}`,
          condition: cond,
          threshold: 100,
          severity: 'info',
        });
      }

      expect(engine.evaluate('test.gt', 150)).toHaveLength(1);
      expect(engine.evaluate('test.lt', 50)).toHaveLength(1);
      expect(engine.evaluate('test.gte', 100)).toHaveLength(1);
      expect(engine.evaluate('test.lte', 100)).toHaveLength(1);
      expect(engine.evaluate('test.eq', 100)).toHaveLength(1);
      expect(engine.evaluate('test.neq', 50)).toHaveLength(1);
    });

    it('should only evaluate threshold rules', () => {
      engine.addTrendRule({
        name: 'trend-only',
        metricName: 'trend.metric',
        trend: 'increasing',
        windowMs: 60000,
        minSamples: 3,
        thresholdPercent: 50,
        severity: 'info',
      });

      const events = engine.evaluate('trend.metric', 100);
      expect(events).toHaveLength(0); // Trend rules not evaluated by evaluate()
    });

    it('should skip disabled rules', () => {
      const rule = engine.addThresholdRule({
        name: 'disabled-rule',
        metricName: 'test.metric',
        condition: 'gt',
        threshold: 100,
        severity: 'warning',
      });

      engine.disableRule(rule.id);
      const events = engine.evaluate('test.metric', 150);

      expect(events).toHaveLength(0);
    });
  });

  describe('Trend Detection', () => {
    it('should detect increasing trend', () => {
      engine.addTrendRule({
        name: 'increasing-rule',
        metricName: 'test.metric',
        trend: 'increasing',
        windowMs: 10000,
        minSamples: 3,
        thresholdPercent: 10,
        severity: 'warning',
      });

      // Add increasing values
      engine.evaluateWithHistory('test.metric', 100);
      engine.evaluateWithHistory('test.metric', 110);
      engine.evaluateWithHistory('test.metric', 120);

      const events = engine.evaluateTrends('test.metric');
      expect(events.length).toBeGreaterThan(0);
    });

    it('should detect decreasing trend', () => {
      engine.addTrendRule({
        name: 'decreasing-rule',
        metricName: 'test.metric',
        trend: 'decreasing',
        windowMs: 10000,
        minSamples: 3,
        thresholdPercent: 10,
        severity: 'warning',
      });

      engine.evaluateWithHistory('test.metric', 100);
      engine.evaluateWithHistory('test.metric', 90);
      engine.evaluateWithHistory('test.metric', 80);

      const events = engine.evaluateTrends('test.metric');
      expect(events.length).toBeGreaterThan(0);
    });

    it('should require minimum samples', () => {
      engine.addTrendRule({
        name: 'trend-rule',
        metricName: 'test.metric',
        trend: 'increasing',
        windowMs: 10000,
        minSamples: 5,
        thresholdPercent: 50,
        severity: 'warning',
      });

      engine.evaluateWithHistory('test.metric', 100);
      engine.evaluateWithHistory('test.metric', 110);

      const events = engine.evaluateTrends('test.metric');
      expect(events).toHaveLength(0);
    });
  });

  describe('Anomaly Detection', () => {
    it('should detect stddev anomalies', () => {
      engine.addAnomalyRule({
        name: 'anomaly-rule',
        metricName: 'test.metric',
        method: 'stddev',
        threshold: 2,
        windowMs: 10000,
        minSamples: 3,
        severity: 'warning',
      });

      // Add normal values
      engine.evaluateWithHistory('test.metric', 100);
      engine.evaluateWithHistory('test.metric', 102);
      engine.evaluateWithHistory('test.metric', 98);
      engine.evaluateWithHistory('test.metric', 101);

      // Add anomalous value
      engine.evaluateWithHistory('test.metric', 200);

      const events = engine.evaluateAnomalies('test.metric');
      expect(events.length).toBeGreaterThan(0);
    });

    it('should detect IQR anomalies', () => {
      engine.addAnomalyRule({
        name: 'iqr-rule',
        metricName: 'test.metric',
        method: 'iqr',
        threshold: 1.5,
        windowMs: 10000,
        minSamples: 4,
        severity: 'warning',
      });

      engine.evaluateWithHistory('test.metric', 10);
      engine.evaluateWithHistory('test.metric', 20);
      engine.evaluateWithHistory('test.metric', 30);
      engine.evaluateWithHistory('test.metric', 40);
      engine.evaluateWithHistory('test.metric', 100);

      const events = engine.evaluateAnomalies('test.metric');
      expect(events.length).toBeGreaterThan(0);
    });

    it('should detect moving average anomalies', () => {
      engine.addAnomalyRule({
        name: 'ma-rule',
        metricName: 'test.metric',
        method: 'moving_average',
        threshold: 20,
        windowMs: 10000,
        minSamples: 3,
        severity: 'warning',
      });

      engine.evaluateWithHistory('test.metric', 100);
      engine.evaluateWithHistory('test.metric', 102);
      engine.evaluateWithHistory('test.metric', 98);

      // 50% deviation from mean (~100)
      engine.evaluateWithHistory('test.metric', 150);

      const events = engine.evaluateAnomalies('test.metric');
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('Metrics Integration', () => {
    it('should evaluate from MetricsSnapshot', () => {
      engine.addThresholdRule({
        name: 'counter-rule',
        metricName: 'requests',
        condition: 'gt',
        threshold: 1000,
        severity: 'warning',
      });

      const snapshot: MetricsSnapshot = {
        counters: { 'requests': 1500 },
        gauges: {},
        timers: {},
        histograms: {},
      };

      const events = engine.evaluateFromSnapshot(snapshot);
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('Notification Channels', () => {
    it('should add notification channel', () => {
      const config: NotificationConfig = {
        type: 'console',
        enabled: true,
      };

      engine.addNotificationChannel(config);

      const channels = engine.getNotificationChannels();
      expect(channels).toHaveLength(1);
      expect(channels[0].type).toBe('console');
    });

    it('should remove notification channel by type', () => {
      engine.addNotificationChannel({ type: 'console', enabled: true });
      engine.addNotificationChannel({ type: 'webhook', enabled: true, url: 'http://example.com' });

      engine.removeNotificationChannel('console');

      const channels = engine.getNotificationChannels();
      expect(channels).toHaveLength(1);
      expect(channels[0].type).toBe('webhook');
    });

    it('should flush notifications', () => {
      let callbackCalled = false;
      engine.addNotificationChannel({
        type: 'callback',
        enabled: true,
        handler: () => { callbackCalled = true; },
      });

      engine.addThresholdRule({
        name: 'test',
        metricName: 'test',
        condition: 'gt',
        threshold: 0,
        severity: 'info',
      });

      engine.evaluate('test', 1);
      engine.flushNotifications();

      expect(callbackCalled).toBe(true);
    });
  });

  describe('Alert History and Query', () => {
    it('should track alert history', () => {
      engine.addThresholdRule({
        name: 'test',
        metricName: 'test',
        condition: 'gt',
        threshold: 0,
        severity: 'info',
      });

      engine.evaluate('test', 1);

      const history = engine.getAlertHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it('should limit history size', () => {
      engine.addThresholdRule({
        name: 'test',
        metricName: 'test',
        condition: 'gt',
        threshold: 0,
        severity: 'info',
      });

      engine.evaluate('test', 1);
      engine.evaluate('test', 2);

      const limited = engine.getAlertHistory(1);
      expect(limited.length).toBe(1);
    });

    it('should filter history by severity', () => {
      engine.addThresholdRule({
        name: 'info-rule',
        metricName: 'test',
        condition: 'gt',
        threshold: 0,
        severity: 'info',
      });

      engine.evaluate('test', 1);

      const infoAlerts = engine.getAlertHistoryBySeverity('info');
      const warningAlerts = engine.getAlertHistoryBySeverity('warning');

      expect(infoAlerts.length).toBeGreaterThan(0);
      expect(warningAlerts).toHaveLength(0);
    });

    it('should get alert stats', () => {
      engine.addThresholdRule({
        name: 'test',
        metricName: 'test',
        condition: 'gt',
        threshold: 0,
        severity: 'warning',
      });

      engine.evaluate('test', 1);

      const stats = engine.getStats();
      expect(stats.totalAlerts).toBeGreaterThan(0);
      expect(stats.bySeverity.warning).toBeGreaterThan(0);
    });
  });

  describe('Alert Aggregation', () => {
    it('should create fingerprint for alerts', () => {
      const event: AlertEvent = {
        rule_id: 'rule-1',
        rule_name: 'Test Rule',
        rule_type: 'threshold',
        severity: 'warning',
        metric_value: 100,
        threshold: 50,
        message: 'Test alert',
        timestamp: Date.now(),
        metric_name: 'test.metric',
        labels: { key: 'value' },
        event_id: 'evt-1',
      };

      const fp = engine.createFingerprint(event);
      expect(fp).toBeTruthy();
      expect(fp).toContain('rule-1');
    });
  });

  describe('Rule Templates', () => {
    it('should list built-in templates', () => {
      const templates = engine.listTemplates();

      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some(t => t.id === 'token-over-limit')).toBe(true);
      expect(templates.some(t => t.id === 'agent-slow')).toBe(true);
      expect(templates.some(t => t.id === 'phase-stuck')).toBe(true);
    });

    it('should get template by ID', () => {
      const template = engine.getTemplate('token-over-limit');

      expect(template).toBeDefined();
      expect(template?.id).toBe('token-over-limit');
      expect(template?.type).toBe('threshold');
    });

    it('should apply threshold template', () => {
      const rule = engine.applyTemplate('token-over-limit', {
        threshold: 50000,
        severity: 'warning',
      });

      expect(rule.type).toBe('threshold');
      expect(rule.metric_name).toBe('tokens.used');
    });

    it('should apply trend template', () => {
      const rule = engine.applyTemplate('metric-trend', {
        metricName: 'cpu.usage',
        trend: 'increasing',
      });

      expect(rule.type).toBe('trend');
      expect(rule.metric_name).toBe('cpu.usage');
    });

    it('should apply anomaly template', () => {
      const rule = engine.applyTemplate('metric-anomaly', {
        metricName: 'latency',
        method: 'stddev',
        threshold: 3,
      });

      expect(rule.type).toBe('anomaly');
      expect(rule.metric_name).toBe('latency');
    });

    it('should throw on invalid template ID', () => {
      expect(() => {
        engine.applyTemplate('non-existent', {});
      }).toThrow();
    });

    it('should add custom template', () => {
      const customTemplate: RuleTemplate = {
        id: 'custom-template',
        name: 'Custom Template',
        description: 'Custom',
        type: 'threshold',
        defaultSeverity: 'info',
        defaultCooldown: 60000,
        params: [
          { name: 'metricName', type: 'string', required: true, description: 'Metric' },
        ],
      };

      engine.addTemplate(customTemplate);

      const retrieved = engine.getTemplate('custom-template');
      expect(retrieved).toBeDefined();
    });
  });

  describe('Reset', () => {
    it('should reset engine state', () => {
      engine.addThresholdRule({
        name: 'test',
        metricName: 'test',
        condition: 'gt',
        threshold: 0,
        severity: 'info',
      });

      engine.evaluate('test', 1);
      expect(engine.getStats().totalAlerts).toBeGreaterThan(0);

      engine.reset();

      expect(engine.listRules().length).toBe(0);
      expect(engine.getStats().totalAlerts).toBe(0);
    });

    it('should clear alert history', () => {
      engine.addThresholdRule({
        name: 'test',
        metricName: 'test',
        condition: 'gt',
        threshold: 0,
        severity: 'info',
      });

      engine.evaluate('test', 1);
      expect(engine.getStats().totalAlerts).toBeGreaterThan(0);

      engine.clearHistory();

      expect(engine.getStats().totalAlerts).toBe(0);
    });
  });
});

// ============================================================
// MetricsExporter Tests
// ============================================================

describe('MetricsExporter', () => {
  let exporter: MetricsExporter;

  beforeEach(() => {
    exporter = new MetricsExporter();
  });

  describe('Text Export', () => {
    it('should export counters in Prometheus format', () => {
      const snapshot: MetricsSnapshot = {
        counters: { 'http_requests_total': 1234 },
        gauges: {},
        timers: {},
        histograms: {},
      };

      const text = exporter.exportText(snapshot);

      expect(text).toContain('# HELP http_requests_total Counter metric');
      expect(text).toContain('# TYPE http_requests_total counter');
      expect(text).toContain('http_requests_total 1234');
    });

    it('should export gauges', () => {
      const snapshot: MetricsSnapshot = {
        counters: {},
        gauges: { 'temperature_celsius': 22.5 },
        timers: {},
        histograms: {},
      };

      const text = exporter.exportText(snapshot);

      expect(text).toContain('# TYPE temperature_celsius gauge');
      expect(text).toContain('temperature_celsius 22.5');
    });

    it('should export timers as summaries', () => {
      const snapshot: MetricsSnapshot = {
        counters: {},
        gauges: {},
        timers: {
          'request_duration_ms': {
            count: 100,
            total_ms: 5000,
            min_ms: 10,
            max_ms: 200,
            avg_ms: 50,
          },
        },
        histograms: {},
      };

      const text = exporter.exportText(snapshot);

      expect(text).toContain('_count');
      expect(text).toContain('_sum');
      expect(text).toContain('_avg');
      expect(text).toContain('_min');
      expect(text).toContain('_max');
    });

    it('should export histograms with quantiles', () => {
      const snapshot: MetricsSnapshot = {
        counters: {},
        gauges: {},
        timers: {},
        histograms: {
          'response_size_bytes': {
            count: 1000,
            sum: 500000,
            min: 100,
            max: 10000,
            avg: 500,
            p50: 450,
            p95: 800,
            p99: 1500,
          },
        },
      };

      const text = exporter.exportText(snapshot);

      expect(text).toContain('{quantile="0.5"}');
      expect(text).toContain('{quantile="0.95"}');
      expect(text).toContain('{quantile="0.99"}');
    });

    it('should handle labeled metrics', () => {
      const snapshot: MetricsSnapshot = {
        counters: { 'http_requests{method="GET",path="/api"}': 10 },
        gauges: {},
        timers: {},
        histograms: {},
      };

      const text = exporter.exportText(snapshot);

      // Labels are sorted alphabetically
      expect(text).toContain('{method=');
      expect(text).toContain('path=');
    });
  });

  describe('JSON Export', () => {
    it('should export as JSON', () => {
      const snapshot: MetricsSnapshot = {
        counters: { 'test': 1 },
        gauges: { 'gauge': 2.5 },
        timers: {},
        histograms: {},
      };

      const json = exporter.exportJSON(snapshot);

      expect(json).toContain('"test":');
      expect(json).toContain('"gauge":');
    });
  });
});

// ============================================================
// HealthChecker Tests
// ============================================================

describe('HealthChecker', () => {
  let checker: HealthChecker;

  beforeEach(() => {
    checker = new HealthChecker();
  });

  describe('Check Registration', () => {
    it('should register health check function', () => {
      checker.registerCheck('test-check', () => ({
        name: 'test-check',
        status: 'healthy',
        message: 'All good',
        last_check: Date.now(),
      }));

      const health = checker.runChecks();
      expect(health.checks).toHaveLength(1);
      expect(health.checks[0].name).toBe('test-check');
    });

    it('should remove health check', () => {
      checker.registerCheck('temp', () => ({
        name: 'temp',
        status: 'healthy',
        message: 'OK',
        last_check: Date.now(),
      }));

      checker.removeCheck('temp');

      const health = checker.runChecks();
      expect(health.checks).toHaveLength(0);
    });
  });

  describe('Health Evaluation', () => {
    it('should compute overall status as healthy', () => {
      checker.registerCheck('check1', () => ({
        name: 'check1',
        status: 'healthy',
        message: 'OK',
        last_check: Date.now(),
      }));
      checker.registerCheck('check2', () => ({
        name: 'check2',
        status: 'healthy',
        message: 'OK',
        last_check: Date.now(),
      }));

      const health = checker.runChecks();
      expect(health.overall).toBe('healthy');
    });

    it('should compute overall status as degraded', () => {
      checker.registerCheck('check1', () => ({
        name: 'check1',
        status: 'healthy',
        message: 'OK',
        last_check: Date.now(),
      }));
      checker.registerCheck('check2', () => ({
        name: 'check2',
        status: 'degraded',
        message: 'Slow',
        last_check: Date.now(),
      }));

      const health = checker.runChecks();
      expect(health.overall).toBe('degraded');
    });

    it('should compute overall status as unhealthy', () => {
      checker.registerCheck('check1', () => ({
        name: 'check1',
        status: 'healthy',
        message: 'OK',
        last_check: Date.now(),
      }));
      checker.registerCheck('check2', () => ({
        name: 'check2',
        status: 'unhealthy',
        message: 'Failed',
        last_check: Date.now(),
      }));

      const health = checker.runChecks();
      expect(health.overall).toBe('unhealthy');
    });

    it('should handle throwing check functions', () => {
      checker.registerCheck('failing-check', () => {
        throw new Error('Check failed');
      });

      const health = checker.runChecks();
      const failingCheck = health.checks.find(c => c.name === 'failing-check');

      expect(failingCheck?.status).toBe('unhealthy');
      expect(failingCheck?.message).toContain('Check failed');
    });

    it('should return healthy for no checks', () => {
      const health = checker.runChecks();
      expect(health.overall).toBe('healthy');
    });
  });

  describe('Uptime', () => {
    it('should track uptime', () => {
      const uptime = checker.getUptime();
      expect(uptime).toBeGreaterThanOrEqual(0);

      const health = checker.runChecks();
      expect(health.uptime_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Static Factory Methods', () => {
    it('should register system checks', () => {
      HealthChecker.registerSystemChecks(checker);

      const health = checker.runChecks();

      expect(health.checks.length).toBeGreaterThan(0);
      expect(health.checks.some(c => c.name.includes('cpu'))).toBe(true);
      expect(health.checks.some(c => c.name.includes('memory'))).toBe(true);
      expect(health.checks.some(c => c.name.includes('disk'))).toBe(true);
    });

    it('should register database check', () => {
      const fs = require('node:fs');
      const testDb = '/tmp/test-health-check.db';

      try {
        // Create test database file
        fs.writeFileSync(testDb, 'test');

        HealthChecker.registerDatabaseCheck(checker, testDb);

        const health = checker.runChecks();

        expect(health.checks.some(c => c.name === 'database:connection')).toBe(true);
      } finally {
        if (fs.existsSync(testDb)) {
          fs.unlinkSync(testDb);
        }
      }
    });
  });

  describe('Output Formatting', () => {
    it('should format health report', () => {
      checker.registerCheck('test', () => ({
        name: 'test',
        status: 'healthy',
        message: 'OK',
        last_check: Date.now(),
      }));

      const health = checker.runChecks();
      const report = HealthChecker.formatHealthReport(health);

      expect(report).toContain('Health Report');
      expect(report).toContain('Overall:');
      expect(report).toContain('test:');
    });

    it('should export health as JSON', () => {
      checker.registerCheck('test', () => ({
        name: 'test',
        status: 'healthy',
        message: 'OK',
        last_check: Date.now(),
      }));

      const health = checker.runChecks();
      const json = HealthChecker.exportJSON(health);

      expect(json).toContain('"overall"');
      expect(json).toContain('"checks"');
    });

    it('should provide recommendations', () => {
      checker.registerCheck('cpu', () => ({
        name: 'cpu:load',
        status: 'unhealthy',
        message: 'CPU overloaded',
        last_check: Date.now(),
      }));

      const health = checker.runChecks();
      const recommendations = HealthChecker.getRecommendations(health);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0]).toContain('CPU');
    });
  });
});

// ============================================================
// ObservabilityStack Tests
// ============================================================

describe('ObservabilityStack', () => {
  let stack: ObservabilityStack;

  beforeEach(() => {
    stack = createObservabilityStack('test-service');
  });

  it('should provide access to tracer', () => {
    const tracer = stack.tracer();
    expect(tracer).toBeInstanceOf(Tracer);
    expect(tracer.serviceName).toBe('test-service');
  });

  it('should provide access to alerts', () => {
    const alerts = stack.alerts();
    expect(alerts).toBeInstanceOf(AlertEngine);
  });

  it('should provide access to exporter', () => {
    const exporter = stack.exporter();
    expect(exporter).toBeInstanceOf(MetricsExporter);
  });

  it('should provide access to health checker', () => {
    const health = stack.health();
    expect(health).toBeInstanceOf(HealthChecker);
  });
});

describe('Observability Singleton', () => {
  it('should provide singleton instance', () => {
    expect(observability).toBeInstanceOf(ObservabilityStack);
  });
});
