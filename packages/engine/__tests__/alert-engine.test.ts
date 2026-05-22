/**
 * AlertEngine Test Suite
 *
 * 测试 AlertEngine 的完整功能：
 * 1. 阈值检测规则
 * 2. 趋势检测规则
 * 3. 异常检测规则
 * 4. 告警去重和聚合
 * 5. 通知系统（console, webhook）
 * 6. 与 MetricsCollector 集成
 * 7. 预设规则模板
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  AlertEngine,
  AlertRule,
  AlertEvent,
  AlertSeverity,
  AlertCondition,
  NotificationChannel,
  NotificationConfig,
  TrendRule,
  AnomalyRule,
  RuleTemplate,
  AlertAggregation,
  AlertFingerprint
} from '../src/observability.js';
import { MetricsCollector } from '../src/metrics.js';

// ============================================================
// 测试辅助函数
// ============================================================

function createTestEngine(): AlertEngine {
  return new AlertEngine({
    enableDeduplication: true,
    aggregationWindowMs: 5000,
    maxHistorySize: 1000
  });
}

function waitForMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// 阈值检测规则测试
// ============================================================

describe('AlertEngine - 阈值检测规则', () => {
  let engine: AlertEngine;

  beforeEach(() => {
    engine = createTestEngine();
  });

  afterEach(() => {
    engine.reset();
  });

  it('应该创建阈值规则并正确触发', () => {
    const rule = engine.addThresholdRule({
      name: 'high-cpu-usage',
      metricName: 'cpu.usage',
      condition: 'gt',
      threshold: 80,
      severity: 'warning'
    });

    expect(rule.id).toBeDefined();
    expect(rule.name).toBe('high-cpu-usage');
    expect(rule.enabled).toBe(true);
  });

  it('应该触发大于阈值条件的告警', () => {
    engine.addThresholdRule({
      name: 'memory-high',
      metricName: 'memory.usage',
      condition: 'gt',
      threshold: 90,
      severity: 'critical'
    });

    const events = engine.evaluate('memory.usage', 95);

    expect(events.length).toBe(1);
    expect(events[0].severity).toBe('critical');
    expect(events[0].metric_value).toBe(95);
  });

  it('应该触发小于阈值条件的告警', () => {
    engine.addThresholdRule({
      name: 'disk-low',
      metricName: 'disk.free',
      condition: 'lt',
      threshold: 10,
      severity: 'warning'
    });

    const events = engine.evaluate('disk.free', 5);

    expect(events.length).toBe(1);
    expect(events[0].message).toContain('disk.free = 5 < 10');
  });

  it('应该正确处理所有条件操作符', () => {
    const cases: Array<{
      condition: AlertCondition;
      threshold: number;
      value: number;
      shouldFire: boolean;
    }> = [
      { condition: 'gt', threshold: 10, value: 15, shouldFire: true },
      { condition: 'gt', threshold: 10, value: 10, shouldFire: false },
      { condition: 'gte', threshold: 10, value: 10, shouldFire: true },
      { condition: 'lt', threshold: 10, value: 5, shouldFire: true },
      { condition: 'lt', threshold: 10, value: 10, shouldFire: false },
      { condition: 'lte', threshold: 10, value: 10, shouldFire: true },
      { condition: 'eq', threshold: 10, value: 10, shouldFire: true },
      { condition: 'neq', threshold: 10, value: 5, shouldFire: true },
    ];

    for (const { condition, threshold, value, shouldFire } of cases) {
      engine.reset();
      engine.addThresholdRule({
        name: `test-${condition}`,
        metricName: 'test.metric',
        condition,
        threshold,
        severity: 'info'
      });

      const events = engine.evaluate('test.metric', value);
      expect(events.length).toBe(shouldFire ? 1 : 0);
    }
  });

  it('应该遵守冷却期限制', async () => {
    engine.addThresholdRule({
      name: 'rapid-fire',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'warning',
      cooldownMs: 100
    });

    // 第一次触发
    let events = engine.evaluate('test.metric', 15);
    expect(events.length).toBe(1);

    // 冷却期内再次评估，不应触发
    events = engine.evaluate('test.metric', 20);
    expect(events.length).toBe(0);

    // 等待冷却期结束
    await waitForMs(150);

    // 冷却期结束后应再次触发
    events = engine.evaluate('test.metric', 25);
    expect(events.length).toBe(1);
  });

  it('应该记录规则触发次数', () => {
    const rule = engine.addThresholdRule({
      name: 'counter-test',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'info',
      cooldownMs: 0
    });

    expect(rule.fire_count).toBe(0);

    engine.evaluate('test.metric', 15);
    expect(engine.getRule(rule.id)?.fire_count).toBe(1);

    engine.evaluate('test.metric', 20);
    expect(engine.getRule(rule.id)?.fire_count).toBe(2);
  });
});

// ============================================================
// 趋势检测规则测试
// ============================================================

describe('AlertEngine - 趋势检测规则', () => {
  let engine: AlertEngine;

  beforeEach(() => {
    engine = createTestEngine();
  });

  afterEach(() => {
    engine.reset();
  });

  it('应该创建趋势检测规则', () => {
    const rule = engine.addTrendRule({
      name: 'increasing-error-rate',
      metricName: 'errors.count',
      trend: 'increasing',
      windowMs: 60000,
      minSamples: 3,
      thresholdPercent: 50,
      severity: 'warning'
    });

    expect(rule.type).toBe('trend');
    expect(rule.metric_name).toBe('errors.count');
  });

  it('应该检测上升趋势', () => {
    engine.addTrendRule({
      name: 'cpu-increasing',
      metricName: 'cpu.usage',
      trend: 'increasing',
      windowMs: 1000,
      minSamples: 3,
      thresholdPercent: 20,
      severity: 'warning'
    });

    // 提交递增的值
    engine.evaluateWithHistory('cpu.usage', 30);
    engine.evaluateWithHistory('cpu.usage', 40);
    engine.evaluateWithHistory('cpu.usage', 55); // 55 比 30 增加了 > 20%

    // 评估趋势
    const events = engine.evaluateTrends('cpu.usage');
    // 应该检测到上升趋势
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].message).toContain('increasing');
  });

  it('应该检测下降趋势', () => {
    engine.addTrendRule({
      name: 'memory-decreasing',
      metricName: 'memory.free',
      trend: 'decreasing',
      windowMs: 1000,
      minSamples: 3,
      thresholdPercent: 30,
      severity: 'warning'
    });

    // 提交递减的值
    engine.evaluateWithHistory('memory.free', 100);
    engine.evaluateWithHistory('memory.free', 80);
    engine.evaluateWithHistory('memory.free', 50); // 50 比 100 减少了 > 30%

    const events = engine.evaluateTrends('memory.free');
    expect(events.length).toBeGreaterThan(0);
  });

  it('应该满足最小样本数要求才触发', () => {
    engine.addTrendRule({
      name: 'minimum-samples',
      metricName: 'test.metric',
      trend: 'increasing',
      windowMs: 1000,
      minSamples: 5,
      thresholdPercent: 10,
      severity: 'info'
    });

    // 只提交 3 个样本
    engine.evaluateWithHistory('test.metric', 10);
    engine.evaluateWithHistory('test.metric', 15);
    engine.evaluateWithHistory('test.metric', 20);

    const events = engine.evaluateTrends('test.metric');
    // 样本不足，不应触发
    expect(events.length).toBe(0);
  });
});

// ============================================================
// 异常检测规则测试
// ============================================================

describe('AlertEngine - 异常检测规则', () => {
  let engine: AlertEngine;

  beforeEach(() => {
    engine = createTestEngine();
  });

  afterEach(() => {
    engine.reset();
  });

  it('应该创建异常检测规则', () => {
    const rule = engine.addAnomalyRule({
      name: 'latency-spike',
      metricName: 'request.latency',
      method: 'stddev',
      threshold: 3, // 3-sigma
      windowMs: 60000,
      minSamples: 10,
      severity: 'warning'
    });

    expect(rule.type).toBe('anomaly');
    expect(rule.method).toBe('stddev');
  });

  it('应该使用标准差检测异常', () => {
    engine.addAnomalyRule({
      name: 'value-anomaly',
      metricName: 'test.value',
      method: 'stddev',
      threshold: 2,
      windowMs: 1000,
      minSamples: 5,
      severity: 'warning'
    });

    // 提交正常范围内的值
    const normalValues = [10, 11, 10, 12, 9, 10, 11, 10];
    for (const v of normalValues) {
      engine.evaluateWithHistory('test.value', v);
    }

    // 提交异常值（远大于标准差）
    const eventsBefore = engine.evaluateAnomalies('test.value');
    engine.evaluateWithHistory('test.value', 50);
    const eventsAfter = engine.evaluateAnomalies('test.value');

    // 应该检测到异常
    expect(eventsAfter.length).toBeGreaterThan(eventsBefore.length);
  });

  it('应该使用 IQR 方法检测异常', () => {
    engine.addAnomalyRule({
      name: 'iqr-anomaly',
      metricName: 'test.metric',
      method: 'iqr',
      threshold: 1.5,
      windowMs: 1000,
      minSamples: 5,
      severity: 'info'
    });

    // 提交一组值
    const values = [10, 12, 11, 13, 10, 14, 11, 12, 10, 50];
    for (const v of values) {
      engine.evaluateWithHistory('test.metric', v);
    }

    const events = engine.evaluateAnomalies('test.metric');
    expect(events.length).toBeGreaterThan(0);
  });

  it('应该使用移动平均检测异常', () => {
    engine.addAnomalyRule({
      name: 'moving-avg-anomaly',
      metricName: 'test.metric',
      method: 'moving_average',
      threshold: 50, // 偏离移动平均 50%
      windowMs: 1000,
      minSamples: 3,
      severity: 'warning'
    });

    // 建立基线
    engine.evaluateWithHistory('test.metric', 100);
    engine.evaluateWithHistory('test.metric', 102);
    engine.evaluateWithHistory('test.metric', 98);
    engine.evaluateWithHistory('test.metric', 101);

    // 提交偏离较大的值
    engine.evaluateWithHistory('test.metric', 200);

    const events = engine.evaluateAnomalies('test.metric');
    expect(events.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 告警去重和聚合测试
// ============================================================

describe('AlertEngine - 告警去重和聚合', () => {
  let engine: AlertEngine;

  beforeEach(() => {
    engine = createTestEngine();
  });

  afterEach(() => {
    engine.reset();
  });

  it('应该为告警事件生成指纹', () => {
    const event: AlertEvent = {
      rule_id: 'rule-1',
      rule_name: 'test-rule',
      severity: 'warning',
      metric_value: 100,
      threshold: 90,
      message: 'Test alert',
      timestamp: Date.now()
    };

    const fp1 = engine.createFingerprint(event);
    const fp2 = engine.createFingerprint(event);

    expect(fp1).toBe(fp2);
  });

  it('应该根据标签生成不同的指纹', () => {
    const baseEvent: AlertEvent = {
      rule_id: 'rule-1',
      rule_name: 'test-rule',
      severity: 'warning',
      metric_value: 100,
      threshold: 90,
      message: 'Test alert',
      timestamp: Date.now()
    };

    const event1 = { ...baseEvent };
    const event2 = { ...baseEvent, metric_value: 105 }; // 值不同

    const fp1 = engine.createFingerprint(event1, { host: 'server1' });
    const fp2 = engine.createFingerprint(event2, { host: 'server2' });

    expect(fp1).not.toBe(fp2);
  });

  it('应该聚合时间窗口内的相似告警', () => {
    engine.addThresholdRule({
      name: 'aggregate-test',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'warning',
      cooldownMs: 0
    });

    // 触发多次告警
    engine.evaluate('test.metric', 15);
    engine.evaluate('test.metric', 16);
    engine.evaluate('test.metric', 17);

    const aggregated = engine.getAggregatedAlerts();

    expect(aggregated.length).toBeGreaterThan(0);
    expect(aggregated[0].count).toBeGreaterThan(0);
  });

  it('应该限制聚合窗口内的告警数量', () => {
    const engine = new AlertEngine({
      enableDeduplication: true,
      aggregationWindowMs: 100,
      maxAggregatedCount: 2
    });

    engine.addThresholdRule({
      name: 'limit-test',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'info',
      cooldownMs: 0
    });

    // 触发多次告警
    for (let i = 0; i < 5; i++) {
      engine.evaluate('test.metric', 15 + i);
    }

    const aggregated = engine.getAggregatedAlerts();
    expect(aggregated.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 通知系统测试
// ============================================================

describe('AlertEngine - 通知系统', () => {
  let engine: AlertEngine;
  let consoleOutput: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  beforeEach(() => {
    engine = createTestEngine();
    consoleOutput = [];

    // Mock console
    console.log = (...args) => consoleOutput.push(args.join(' '));
    console.error = (...args) => consoleOutput.push(`ERROR: ${args.join(' ')}`);
  });

  afterEach(() => {
    engine.reset();
    console.log = originalLog;
    console.error = originalError;
  });

  it('应该配置控制台通知', () => {
    const config: NotificationConfig = {
      type: 'console',
      enabled: true,
      filter: { minSeverity: 'warning' }
    };

    engine.addNotificationChannel(config);

    const channels = engine.getNotificationChannels();
    expect(channels.length).toBe(1);
    expect(channels[0].type).toBe('console');
  });

  it('应该根据严重级别过滤通知', () => {
    engine.addNotificationChannel({
      type: 'console',
      enabled: true,
      filter: { minSeverity: 'error' }
    });

    engine.addThresholdRule({
      name: 'warning-test',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'warning',
      cooldownMs: 0
    });

    engine.evaluate('test.metric', 15);

    // warning 级别不应触发通知（minSeverity 是 error）
    expect(consoleOutput.length).toBe(0);
  });

  it('应该输出格式化的告警消息', () => {
    engine.addNotificationChannel({
      type: 'console',
      enabled: true
    });

    engine.addThresholdRule({
      name: 'formatted-alert',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'critical',
      cooldownMs: 0
    });

    engine.evaluate('test.metric', 15);

    expect(consoleOutput.length).toBeGreaterThan(0);
    expect(consoleOutput.some(s => s.includes('CRITICAL'))).toBe(true);
    expect(consoleOutput.some(s => s.includes('formatted-alert'))).toBe(true);
  });

  it('应该支持批量通知', () => {
    const batchNotifications: AlertEvent[] = [];

    engine.addNotificationChannel({
      type: 'callback',
      enabled: true,
      handler: (events) => {
        batchNotifications.push(...events);
      }
    });

    engine.addThresholdRule({
      name: 'batch-test',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'info',
      cooldownMs: 0
    });

    engine.evaluate('test.metric', 15);
    engine.evaluate('test.metric', 16);
    engine.evaluate('test.metric', 17);

    engine.flushNotifications();

    expect(batchNotifications.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 与 MetricsCollector 集成测试
// ============================================================

describe('AlertEngine - MetricsCollector 集成', () => {
  let engine: AlertEngine;
  let metrics: MetricsCollector;

  beforeEach(() => {
    engine = createTestEngine();
    metrics = new MetricsCollector(100);
  });

  afterEach(() => {
    engine.reset();
    metrics.reset();
  });

  it('应该从 MetricsCollector 读取指标并评估', () => {
    engine.addThresholdRule({
      name: 'metric-integration',
      metricName: 'requests.total',
      condition: 'gt',
      threshold: 100,
      severity: 'warning'
    });

    // 通过 MetricsCollector 记录指标
    metrics.increment('requests.total', {}, 150);

    // 从 MetricsCollector 评估
    const snapshot = metrics.snapshot();
    const events = engine.evaluateFromSnapshot(snapshot);

    expect(events.length).toBe(1);
    expect(events[0].metric_value).toBe(150);
  });

  it('应该支持带标签的指标评估', () => {
    engine.addThresholdRule({
      name: 'labeled-metric',
      metricName: 'response_time',
      condition: 'gt',
      threshold: 1000,
      severity: 'warning'
    });

    metrics.gauge('response_time{endpoint=/api/users}', 1500);
    metrics.gauge('response_time{endpoint=/api/posts}', 500);

    const snapshot = metrics.snapshot();
    const events = engine.evaluateFromSnapshot(snapshot);

    // 应该只有一个告警（/api/users 超过阈值）
    expect(events.length).toBe(1);
  });

  it('应该定期轮询 MetricsCollector', async () => {
    let evaluationCount = 0;

    engine.onEvaluation(() => {
      evaluationCount++;
    });

    // Add a rule that will fire
    engine.addThresholdRule({
      name: 'polling-test',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 50,
      severity: 'info',
      cooldownMs: 0  // No cooldown so it fires every time
    });

    engine.startPolling(metrics, 50); // 每 50ms 轮询一次（降低间隔）

    metrics.gauge('test.metric', 100);

    await waitForMs(250); // 等待约 5 次轮询（50ms * 5 = 250ms）

    engine.stopPolling();

    // 至少应该触发 3 次评估（50ms * 3 = 150ms，250ms 内应该有 4-5 次）
    expect(evaluationCount).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================
// 预设规则模板测试
// ============================================================

describe('AlertEngine - 预设规则模板', () => {
  let engine: AlertEngine;

  beforeEach(() => {
    engine = createTestEngine();
  });

  afterEach(() => {
    engine.reset();
  });

  it('应该提供 Token 使用量超限模板', () => {
    const template = engine.getTemplate('token-over-limit');
    expect(template).toBeDefined();
    expect(template.name).toBe('Token Usage Over Limit');

    const rule = engine.applyTemplate('token-over-limit', {
      threshold: 100000
    });

    expect(rule.metric_name).toBe('tokens.used');
    expect(rule.threshold).toBe(100000);
  });

  it('应该提供 Agent 执行时间过长模板', () => {
    const template = engine.getTemplate('agent-slow');
    expect(template).toBeDefined();

    const rule = engine.applyTemplate('agent-slow', {
      threshold: 30000
    });

    expect(rule.metric_name).toBe('agent.duration_ms');
    expect(rule.threshold).toBe(30000);
  });

  it('应该提供项目阶段卡住模板', () => {
    const rule = engine.applyTemplate('phase-stuck', {
      thresholdMinutes: 30
    });

    expect(rule.metric_name).toBe('phase.duration_minutes');
  });

  it('应该提供检查点失败模板', () => {
    const rule = engine.applyTemplate('checkpoint-failed', {});

    expect(rule.metric_name).toBe('checkpoint.failures');
    expect(rule.condition).toBe('gt');
  });

  it('应该列出所有可用模板', () => {
    const templates = engine.listTemplates();

    expect(templates.length).toBeGreaterThan(0);
    expect(templates.some(t => t.id === 'token-over-limit')).toBe(true);
    expect(templates.some(t => t.id === 'agent-slow')).toBe(true);
  });

  it('应该支持自定义模板', () => {
    const customTemplate: RuleTemplate = {
      id: 'custom-metric',
      name: 'Custom Metric Alert',
      description: 'Custom alert for specific metrics',
      type: 'threshold',
      defaultSeverity: 'info',
      params: [
        { name: 'metricName', type: 'string', required: true },
        { name: 'threshold', type: 'number', required: true }
      ]
    };

    engine.addTemplate(customTemplate);

    const rule = engine.applyTemplate('custom-metric', {
      metricName: 'custom.value',
      threshold: 50
    });

    expect(rule.metric_name).toBe('custom.value');
    expect(rule.threshold).toBe(50);
  });
});

// ============================================================
// 告警历史和查询测试
// ============================================================

describe('AlertEngine - 告警历史和查询', () => {
  let engine: AlertEngine;

  beforeEach(() => {
    engine = createTestEngine();
  });

  afterEach(() => {
    engine.reset();
  });

  it('应该记录告警历史', () => {
    engine.addThresholdRule({
      name: 'history-test',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'warning',
      cooldownMs: 0
    });

    engine.evaluate('test.metric', 15);
    engine.evaluate('test.metric', 16);
    engine.evaluate('test.metric', 17);

    const history = engine.getAlertHistory();

    expect(history.length).toBe(3);
  });

  it('应该限制历史记录数量', () => {
    engine.addThresholdRule({
      name: 'limit-test',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'info',
      cooldownMs: 0
    });

    // 触发多次告警
    for (let i = 0; i < 100; i++) {
      engine.evaluate('test.metric', 15 + i);
    }

    const limited = engine.getAlertHistory(10);
    expect(limited.length).toBe(10);
  });

  it('应该按严重级别过滤告警', () => {
    engine.addThresholdRule({
      name: 'critical-rule',
      metricName: 'critical.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'critical',
      cooldownMs: 0
    });

    engine.addThresholdRule({
      name: 'info-rule',
      metricName: 'info.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'info',
      cooldownMs: 0
    });

    engine.evaluate('critical.metric', 15);
    engine.evaluate('info.metric', 15);

    const criticalAlerts = engine.getAlertHistoryBySeverity('critical');
    const infoAlerts = engine.getAlertHistoryBySeverity('info');

    expect(criticalAlerts.length).toBe(1);
    expect(infoAlerts.length).toBe(1);
  });

  it('应该按时间范围查询告警', () => {
    engine.addThresholdRule({
      name: 'time-range-test',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'info',
      cooldownMs: 0
    });

    const now = Date.now();

    engine.evaluate('test.metric', 15);

    const recent = engine.getAlertHistoryByTimeRange(now - 1000, now + 1000);
    expect(recent.length).toBe(1);

    const old = engine.getAlertHistoryByTimeRange(now - 10000, now - 5000);
    expect(old.length).toBe(0);
  });

  it('应该获取告警统计', () => {
    engine.addThresholdRule({
      name: 'stats-test',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'warning',
      cooldownMs: 0
    });

    for (let i = 0; i < 5; i++) {
      engine.evaluate('test.metric', 15 + i);
    }

    const stats = engine.getStats();

    expect(stats.totalAlerts).toBe(5);
    expect(stats.bySeverity.warning).toBe(5);
    expect(stats.rulesEvaluated).toBeGreaterThan(0);
  });
});

// ============================================================
// 规则管理测试
// ============================================================

describe('AlertEngine - 规则管理', () => {
  let engine: AlertEngine;

  beforeEach(() => {
    engine = createTestEngine();
  });

  afterEach(() => {
    engine.reset();
  });

  it('应该启用和禁用规则', () => {
    const rule = engine.addThresholdRule({
      name: 'toggle-test',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'info'
    });

    expect(rule.enabled).toBe(true);

    engine.disableRule(rule.id);
    expect(engine.getRule(rule.id)?.enabled).toBe(false);

    engine.enableRule(rule.id);
    expect(engine.getRule(rule.id)?.enabled).toBe(true);
  });

  it('禁用的规则不应触发告警', () => {
    const rule = engine.addThresholdRule({
      name: 'disabled-test',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'info'
    });

    engine.disableRule(rule.id);

    const events = engine.evaluate('test.metric', 15);
    expect(events.length).toBe(0);
  });

  it('应该删除规则', () => {
    const rule = engine.addThresholdRule({
      name: 'delete-test',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'info'
    });

    expect(engine.getRule(rule.id)).toBeDefined();

    engine.removeRule(rule.id);
    expect(engine.getRule(rule.id)).toBeUndefined();
  });

  it('应该按条件列出规则', () => {
    engine.addThresholdRule({
      name: 'rule-1',
      metricName: 'metric.1',
      condition: 'gt',
      threshold: 10,
      severity: 'info'
    });

    engine.addThresholdRule({
      name: 'rule-2',
      metricName: 'metric.2',
      condition: 'gt',
      threshold: 10,
      severity: 'warning'
    });

    engine.addThresholdRule({
      name: 'rule-3',
      metricName: 'metric.3',
      condition: 'gt',
      threshold: 10,
      severity: 'info'
    });

    const infoRules = engine.listRulesBySeverity('info');
    expect(infoRules.length).toBe(2);

    const allRules = engine.listRules();
    expect(allRules.length).toBe(3);
  });

  it('应该更新规则配置', () => {
    const rule = engine.addThresholdRule({
      name: 'update-test',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'info'
    });

    engine.updateRule(rule.id, {
      threshold: 20,
      severity: 'critical'
    });

    const updated = engine.getRule(rule.id);
    expect(updated?.threshold).toBe(20);
    expect(updated?.severity).toBe('critical');
  });

  it('应该支持规则分组', () => {
    engine.addThresholdRule({
      name: 'rule-1',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'info',
      group: 'performance'
    });

    engine.addThresholdRule({
      name: 'rule-2',
      metricName: 'test.metric',
      condition: 'gt',
      threshold: 10,
      severity: 'info',
      group: 'availability'
    });

    const perfRules = engine.listRulesByGroup('performance');
    const availRules = engine.listRulesByGroup('availability');

    expect(perfRules.length).toBe(1);
    expect(availRules.length).toBe(1);
  });
});
