import { describe, test, expect, beforeEach } from 'bun:test';
import { MetricsCollector, createMetrics, metrics } from '../src/metrics.ts';

// ============================================================
// Construction & Factory Functions
// ============================================================

describe('Construction & Factory Functions', () => {
  test('createMetrics creates new MetricsCollector instance', () => {
    const m1 = createMetrics();
    const m2 = createMetrics();
    expect(m1).not.toBe(m2);
    expect(m1).toBeInstanceOf(MetricsCollector);
    expect(m2).toBeInstanceOf(MetricsCollector);
  });

  test('createMetrics with custom maxHistory', () => {
    const m = createMetrics(100);
    // Fill history beyond default 5000
    for (let i = 0; i < 150; i++) {
      m.increment('test');
    }
    const history = m.getHistory();
    expect(history.length).toBe(100);
  });

  test('global metrics singleton exists', () => {
    expect(metrics).toBeInstanceOf(MetricsCollector);
  });

  test('global metrics singleton has default maxHistory of 5000', () => {
    const m = createMetrics();
    for (let i = 0; i < 5100; i++) {
      m.increment('test');
    }
    expect(m.getHistory().length).toBeLessThanOrEqual(5000);
  });

  test('MetricsCollector constructor initializes empty state', () => {
    const m = createMetrics();
    expect(m.getCounter('nonexistent')).toBe(0);
    expect(m.getGauge('nonexistent')).toBe(0);
    expect(m.snapshot().counters).toEqual({});
  });
});

// ============================================================
// Counter Operations
// ============================================================

describe('Counter Operations', () => {
  let m: MetricsCollector;

  beforeEach(() => {
    m = createMetrics();
  });

  test('increment counter by default amount (1)', () => {
    m.increment('requests');
    expect(m.getCounter('requests')).toBe(1);
  });

  test('increment counter by custom amount', () => {
    m.increment('requests', undefined, 5);
    expect(m.getCounter('requests')).toBe(5);
  });

  test('multiple increments accumulate', () => {
    m.increment('requests');
    m.increment('requests');
    m.increment('requests');
    expect(m.getCounter('requests')).toBe(3);
  });

  test('increment with labels', () => {
    m.increment('requests', { method: 'GET' });
    m.increment('requests', { method: 'POST' });
    expect(m.getCounter('requests', { method: 'GET' })).toBe(1);
    expect(m.getCounter('requests', { method: 'POST' })).toBe(1);
  });

  test('decrement counter by default amount (1)', () => {
    m.increment('errors', undefined, 10);
    m.decrement('errors');
    expect(m.getCounter('errors')).toBe(9);
  });

  test('decrement counter by custom amount', () => {
    m.increment('errors', undefined, 10);
    m.decrement('errors', undefined, 3);
    expect(m.getCounter('errors')).toBe(7);
  });

  test('decrement below zero allowed (counter can go negative)', () => {
    m.decrement('errors', undefined, 5);
    expect(m.getCounter('errors')).toBe(-5);
  });

  test('getCounter returns 0 for nonexistent counter', () => {
    expect(m.getCounter('missing')).toBe(0);
  });

  test('counter operations with labels are isolated', () => {
    m.increment('requests', { status: '200' });
    m.increment('requests', { status: '404' });
    expect(m.getCounter('requests', { status: '200' })).toBe(1);
    expect(m.getCounter('requests', { status: '404' })).toBe(1);
    expect(m.getCounter('requests')).toBe(0); // No default labels counter
  });

  test('increment and decrement with same custom amount', () => {
    m.increment('balance', undefined, 100);
    m.decrement('balance', undefined, 30);
    m.increment('balance', undefined, 50);
    expect(m.getCounter('balance')).toBe(120);
  });
});

// ============================================================
// Gauge Operations
// ============================================================

describe('Gauge Operations', () => {
  let m: MetricsCollector;

  beforeEach(() => {
    m = createMetrics();
  });

  test('gauge sets a value', () => {
    m.gauge('temperature', 25.5);
    expect(m.getGauge('temperature')).toBe(25.5);
  });

  test('gauge overwrites previous value', () => {
    m.gauge('temperature', 25.5);
    m.gauge('temperature', 30.2);
    expect(m.getGauge('temperature')).toBe(30.2);
  });

  test('gauge supports negative values', () => {
    m.gauge('balance', -100);
    expect(m.getGauge('balance')).toBe(-100);
  });

  test('gauge supports fractional values', () => {
    m.gauge('cpu_usage', 0.75);
    expect(m.getGauge('cpu_usage')).toBeCloseTo(0.75, 5);
  });

  test('getGauge returns 0 for nonexistent gauge', () => {
    expect(m.getGauge('missing')).toBe(0);
  });

  test('gauge with labels', () => {
    m.gauge('memory', 512, { type: 'heap' });
    m.gauge('memory', 256, { type: 'stack' });
    expect(m.getGauge('memory', { type: 'heap' })).toBe(512);
    expect(m.getGauge('memory', { type: 'stack' })).toBe(256);
  });

  test('gauge and counter are isolated from each other', () => {
    m.increment('metric');
    m.gauge('metric', 100);
    expect(m.getCounter('metric')).toBe(1);
    expect(m.getGauge('metric')).toBe(100);
  });

  test('multiple gauges can exist independently', () => {
    m.gauge('cpu', 50);
    m.gauge('memory', 1024);
    m.gauge('disk', 500);
    expect(m.getGauge('cpu')).toBe(50);
    expect(m.getGauge('memory')).toBe(1024);
    expect(m.getGauge('disk')).toBe(500);
  });
});

// ============================================================
// Label Support & Key Formatting
// ============================================================

describe('Label Support & Key Formatting', () => {
  let m: MetricsCollector;

  beforeEach(() => {
    m = createMetrics();
  });

  test('labels are sorted alphabetically in key', () => {
    m.increment('metric', { zebra: '1', apple: '2' });
    const snapshot = m.snapshot();
    // Key should have labels sorted: apple=2,zebra=1
    expect('metric{apple=2,zebra=1}' in snapshot.counters).toBe(true);
  });

  test('different label order produces same key', () => {
    m.increment('metric', { a: '1', b: '2' });
    const snap1 = m.snapshot();

    m.reset();

    m.increment('metric', { b: '2', a: '1' });
    const snap2 = m.snapshot();

    expect(Object.keys(snap1.counters)).toEqual(Object.keys(snap2.counters));
  });

  test('empty labels object is treated as no labels', () => {
    m.increment('metric', {});
    expect(m.getCounter('metric')).toBe(1);
    expect(m.getCounter('metric', {})).toBe(1);
  });

  test('labels with multiple keys are formatted correctly', () => {
    m.observe('latency', 100, { method: 'GET', status: '200', region: 'us-east' });
    const snapshot = m.snapshot();
    const keys = Object.keys(snapshot.histograms);
    expect(keys.length).toBe(1);
    expect(keys[0]).toContain('method=GET');
    expect(keys[0]).toContain('status=200');
    expect(keys[0]).toContain('region=us-east');
  });

  test('metrics with different labels are isolated', () => {
    m.increment('requests', { status: '200' }, 5);
    m.increment('requests', { status: '404' }, 3);
    m.increment('requests', { status: '500' }, 1);

    expect(m.getCounter('requests', { status: '200' })).toBe(5);
    expect(m.getCounter('requests', { status: '404' })).toBe(3);
    expect(m.getCounter('requests', { status: '500' })).toBe(1);
  });

  test('metric without labels is separate from same metric with labels', () => {
    m.increment('requests');
    m.increment('requests', { status: '200' });
    expect(m.getCounter('requests')).toBe(1);
    expect(m.getCounter('requests', { status: '200' })).toBe(1);
  });
});

// ============================================================
// Timer Operations
// ============================================================

describe('Timer Operations', () => {
  let m: MetricsCollector;

  beforeEach(() => {
    m = createMetrics();
  });

  test('startTimer returns TimerHandle with stop method', () => {
    const handle = m.startTimer('operation');
    expect(handle).toHaveProperty('stop');
    expect(typeof handle.stop).toBe('function');
  });

  test('timer.stop() returns elapsed time in milliseconds', () => {
    const handle = m.startTimer('operation');
    // Sleep for ~10ms
    let start = performance.now();
    while (performance.now() - start < 10) {}
    const elapsed = handle.stop();
    expect(elapsed).toBeGreaterThanOrEqual(10);
    expect(elapsed).toBeLessThan(100); // Should be fast
  });

  test('timer records observation in snapshot', () => {
    const handle = m.startTimer('request');
    let start = performance.now();
    while (performance.now() - start < 5) {}
    handle.stop();

    const snapshot = m.snapshot();
    expect(snapshot.timers['request']).toBeDefined();
    expect(snapshot.timers['request'].count).toBe(1);
    expect(snapshot.timers['request'].total_ms).toBeGreaterThan(0);
  });

  test('multiple timer measurements accumulate', () => {
    for (let i = 0; i < 3; i++) {
      const handle = m.startTimer('request');
      let start = performance.now();
      while (performance.now() - start < 5) {}
      handle.stop();
    }

    const snapshot = m.snapshot();
    expect(snapshot.timers['request'].count).toBe(3);
  });

  test('recordTime manually records timer value', () => {
    m.recordTime('query', 25.5);
    m.recordTime('query', 30.2);
    const snapshot = m.snapshot();
    expect(snapshot.timers['query'].count).toBe(2);
    expect(snapshot.timers['query'].total_ms).toBeCloseTo(55.7, 1);
  });

  test('timer with labels', () => {
    m.recordTime('query', 10, { db: 'users' });
    m.recordTime('query', 20, { db: 'posts' });
    const snapshot = m.snapshot();
    expect(snapshot.timers['query{db=posts}'].count).toBe(1);
    expect(snapshot.timers['query{db=users}'].count).toBe(1);
  });

  test('timer calculates min and max correctly', () => {
    m.recordTime('latency', 5);
    m.recordTime('latency', 20);
    m.recordTime('latency', 15);
    const snapshot = m.snapshot();
    expect(snapshot.timers['latency'].min_ms).toBe(5);
    expect(snapshot.timers['latency'].max_ms).toBe(20);
  });

  test('timer calculates average correctly', () => {
    m.recordTime('latency', 10);
    m.recordTime('latency', 20);
    m.recordTime('latency', 30);
    const snapshot = m.snapshot();
    expect(snapshot.timers['latency'].avg_ms).toBe(20);
  });
});

// ============================================================
// Histogram Observations
// ============================================================

describe('Histogram Observations', () => {
  let m: MetricsCollector;

  beforeEach(() => {
    m = createMetrics();
  });

  test('observe records a single observation', () => {
    m.observe('response_size', 1024);
    const snapshot = m.snapshot();
    expect(snapshot.histograms['response_size']).toBeDefined();
    expect(snapshot.histograms['response_size'].count).toBe(1);
  });

  test('observe accumulates multiple observations', () => {
    m.observe('response_size', 100);
    m.observe('response_size', 200);
    m.observe('response_size', 300);
    const snapshot = m.snapshot();
    expect(snapshot.histograms['response_size'].count).toBe(3);
    expect(snapshot.histograms['response_size'].sum).toBe(600);
  });

  test('histogram calculates average correctly', () => {
    m.observe('values', 10);
    m.observe('values', 20);
    m.observe('values', 30);
    const snapshot = m.snapshot();
    expect(snapshot.histograms['values'].avg).toBe(20);
  });

  test('histogram calculates min and max', () => {
    m.observe('values', 5);
    m.observe('values', 100);
    m.observe('values', 50);
    const snapshot = m.snapshot();
    expect(snapshot.histograms['values'].min).toBe(5);
    expect(snapshot.histograms['values'].max).toBe(100);
  });

  test('histogram calculates p50 (median) correctly', () => {
    // Values: 1, 2, 3, 4, 5 -> median = 3
    [1, 2, 3, 4, 5].forEach((v) => m.observe('test', v));
    const snapshot = m.snapshot();
    expect(snapshot.histograms['test'].p50).toBe(3);
  });

  test('histogram calculates p95 correctly', () => {
    // Values: 1-100 -> p95 should be around 95
    for (let i = 1; i <= 100; i++) {
      m.observe('test', i);
    }
    const snapshot = m.snapshot();
    expect(snapshot.histograms['test'].p95).toBeGreaterThanOrEqual(94);
    expect(snapshot.histograms['test'].p95).toBeLessThanOrEqual(96);
  });

  test('histogram calculates p99 correctly', () => {
    // Values: 1-100 -> p99 should be around 99
    for (let i = 1; i <= 100; i++) {
      m.observe('test', i);
    }
    const snapshot = m.snapshot();
    expect(snapshot.histograms['test'].p99).toBeGreaterThanOrEqual(98);
    expect(snapshot.histograms['test'].p99).toBeLessThanOrEqual(100);
  });

  test('histogram with labels', () => {
    m.observe('latency', 10, { endpoint: '/api/users' });
    m.observe('latency', 20, { endpoint: '/api/posts' });
    const snapshot = m.snapshot();
    expect(snapshot.histograms['latency{endpoint=/api/posts}'].count).toBe(1);
    expect(snapshot.histograms['latency{endpoint=/api/users}'].count).toBe(1);
  });

  test('histogram with single observation has same p50, p95, p99', () => {
    m.observe('single', 42);
    const snapshot = m.snapshot();
    expect(snapshot.histograms['single'].p50).toBe(42);
    expect(snapshot.histograms['single'].p95).toBe(42);
    expect(snapshot.histograms['single'].p99).toBe(42);
  });

  test('histogram supports negative and fractional values', () => {
    m.observe('deltas', -10.5);
    m.observe('deltas', 5.25);
    m.observe('deltas', 20.75);
    const snapshot = m.snapshot();
    expect(snapshot.histograms['deltas'].min).toBe(-10.5);
    expect(snapshot.histograms['deltas'].max).toBe(20.75);
    expect(snapshot.histograms['deltas'].sum).toBeCloseTo(15.5, 5);
  });
});

// ============================================================
// Snapshot
// ============================================================

describe('Snapshot', () => {
  let m: MetricsCollector;

  beforeEach(() => {
    m = createMetrics();
  });

  test('snapshot returns MetricsSnapshot structure', () => {
    const snap = m.snapshot();
    expect(snap).toHaveProperty('counters');
    expect(snap).toHaveProperty('gauges');
    expect(snap).toHaveProperty('timers');
    expect(snap).toHaveProperty('histograms');
    expect(snap).toHaveProperty('timestamp');
  });

  test('snapshot timestamp is current', () => {
    const before = Date.now();
    const snap = m.snapshot();
    const after = Date.now();
    expect(snap.timestamp).toBeGreaterThanOrEqual(before);
    expect(snap.timestamp).toBeLessThanOrEqual(after);
  });

  test('snapshot includes all counter metrics', () => {
    m.increment('requests');
    m.increment('errors');
    const snap = m.snapshot();
    expect(snap.counters['requests']).toBe(1);
    expect(snap.counters['errors']).toBe(1);
  });

  test('snapshot includes all gauge metrics', () => {
    m.gauge('cpu', 50);
    m.gauge('memory', 2048);
    const snap = m.snapshot();
    expect(snap.gauges['cpu']).toBe(50);
    expect(snap.gauges['memory']).toBe(2048);
  });

  test('snapshot includes all timer metrics with stats', () => {
    m.recordTime('query', 10);
    m.recordTime('query', 20);
    const snap = m.snapshot();
    expect(snap.timers['query']).toBeDefined();
    expect(snap.timers['query'].count).toBe(2);
    expect(snap.timers['query'].total_ms).toBe(30);
    expect(snap.timers['query'].avg_ms).toBe(15);
    expect(snap.timers['query'].min_ms).toBe(10);
    expect(snap.timers['query'].max_ms).toBe(20);
  });

  test('snapshot includes all histogram metrics with percentiles', () => {
    for (let i = 1; i <= 10; i++) {
      m.observe('data', i);
    }
    const snap = m.snapshot();
    expect(snap.histograms['data']).toBeDefined();
    expect(snap.histograms['data']).toHaveProperty('p50');
    expect(snap.histograms['data']).toHaveProperty('p95');
    expect(snap.histograms['data']).toHaveProperty('p99');
  });

  test('snapshot does not modify internal state', () => {
    m.increment('counter');
    m.gauge('gauge', 100);
    m.recordTime('timer', 50);
    m.observe('histogram', 75);

    const snap1 = m.snapshot();
    const snap2 = m.snapshot();

    expect(snap1.counters['counter']).toBe(snap2.counters['counter']);
    expect(snap1.gauges['gauge']).toBe(snap2.gauges['gauge']);
  });

  test('snapshot with mixed metric types', () => {
    m.increment('requests', { status: '200' }, 100);
    m.gauge('uptime', 99.9);
    m.recordTime('latency', 45);
    m.recordTime('latency', 55);
    m.observe('request_size', 1024);
    m.observe('request_size', 2048);
    m.observe('request_size', 512);

    const snap = m.snapshot();

    expect(Object.keys(snap.counters).length).toBeGreaterThan(0);
    expect(Object.keys(snap.gauges).length).toBeGreaterThan(0);
    expect(Object.keys(snap.timers).length).toBeGreaterThan(0);
    expect(Object.keys(snap.histograms).length).toBeGreaterThan(0);
  });

  test('snapshot with empty metrics', () => {
    const snap = m.snapshot();
    expect(snap.counters).toEqual({});
    expect(snap.gauges).toEqual({});
    expect(snap.timers).toEqual({});
    expect(snap.histograms).toEqual({});
  });
});

// ============================================================
// History (FIFO Ordering & Limits)
// ============================================================

describe('History (FIFO Ordering & Limits)', () => {
  let m: MetricsCollector;

  beforeEach(() => {
    m = createMetrics();
  });

  test('getHistory returns all entries by default', () => {
    m.increment('counter');
    m.gauge('gauge', 10);
    m.recordTime('timer', 5);
    m.observe('histogram', 100);

    const history = m.getHistory();
    expect(history.length).toBe(4);
  });

  test('getHistory maintains FIFO order', () => {
    m.increment('first');
    m.increment('second');
    m.increment('third');

    const history = m.getHistory();
    expect(history[0].name).toBe('first');
    expect(history[1].name).toBe('second');
    expect(history[2].name).toBe('third');
  });

  test('getHistory with limit parameter returns last N entries', () => {
    for (let i = 0; i < 10; i++) {
      m.increment('metric');
    }

    const history = m.getHistory(5);
    expect(history.length).toBe(5);
  });

  test('getHistory limit larger than history returns all entries', () => {
    m.increment('a');
    m.increment('b');
    m.increment('c');

    const history = m.getHistory(100);
    expect(history.length).toBe(3);
  });

  test('getHistory entries have correct structure', () => {
    m.increment('requests', { status: '200' }, 1);

    const history = m.getHistory();
    expect(history[0]).toHaveProperty('name');
    expect(history[0]).toHaveProperty('type');
    expect(history[0]).toHaveProperty('value');
    expect(history[0]).toHaveProperty('labels');
    expect(history[0]).toHaveProperty('timestamp');

    expect(history[0].name).toBe('requests');
    expect(history[0].type).toBe('counter');
    expect(history[0].value).toBe(1);
    expect(history[0].labels).toEqual({ status: '200' });
  });

  test('history respects maxHistory constructor parameter', () => {
    const m2 = createMetrics(10);
    for (let i = 0; i < 25; i++) {
      m2.increment('test');
    }
    const history = m2.getHistory();
    expect(history.length).toBe(10);
  });

  test('history FIFO removes oldest entries when full', () => {
    const m2 = createMetrics(5);
    m2.increment('first');
    m2.increment('second');
    m2.increment('third');
    m2.increment('fourth');
    m2.increment('fifth');
    m2.increment('sixth'); // Should push out 'first'

    const history = m2.getHistory();
    expect(history.length).toBe(5);
    expect(history[0].name).toBe('second');
    expect(history[4].name).toBe('sixth');
  });

  test('history defaults to maxHistory of 5000', () => {
    // Record 5100 entries - should keep only last 5000
    for (let i = 0; i < 5100; i++) {
      m.increment('test');
    }
    const history = m.getHistory();
    expect(history.length).toBe(5000);
  });

  test('getHistory creates shallow copy of array', () => {
    m.increment('metric');
    const history1 = m.getHistory();
    const history2 = m.getHistory();

    expect(history1).not.toBe(history2); // Different array instances
    expect(history1.length).toBe(history2.length);
    expect(history1[0]).toBe(history2[0]); // Same entry objects (shallow copy)
  });

  test('history tracks different metric types', () => {
    m.increment('counter');
    m.gauge('gauge', 42);
    m.recordTime('timer', 100);
    m.observe('histogram', 500);

    const history = m.getHistory();
    expect(history.map((e) => e.type)).toEqual(['counter', 'gauge', 'timer', 'histogram']);
  });

  test('history with limit=0 returns empty array', () => {
    m.increment('test');
    const history = m.getHistory(0);
    expect(history.length).toBe(0);
  });
});

// ============================================================
// Reset
// ============================================================

describe('Reset', () => {
  let m: MetricsCollector;

  beforeEach(() => {
    m = createMetrics();
  });

  test('reset clears all counters', () => {
    m.increment('requests');
    m.increment('errors');
    m.reset();
    expect(m.getCounter('requests')).toBe(0);
    expect(m.getCounter('errors')).toBe(0);
  });

  test('reset clears all gauges', () => {
    m.gauge('cpu', 80);
    m.gauge('memory', 1024);
    m.reset();
    expect(m.getGauge('cpu')).toBe(0);
    expect(m.getGauge('memory')).toBe(0);
  });

  test('reset clears all timers', () => {
    m.recordTime('query', 50);
    m.reset();
    const snap = m.snapshot();
    expect(snap.timers).toEqual({});
  });

  test('reset clears all histograms', () => {
    m.observe('data', 100);
    m.reset();
    const snap = m.snapshot();
    expect(snap.histograms).toEqual({});
  });

  test('reset clears all history', () => {
    m.increment('test');
    m.gauge('test', 1);
    m.reset();
    expect(m.getHistory().length).toBe(0);
  });

  test('reset produces empty snapshot', () => {
    m.increment('counter');
    m.gauge('gauge', 100);
    m.recordTime('timer', 50);
    m.observe('histogram', 75);
    m.reset();

    const snap = m.snapshot();
    expect(snap.counters).toEqual({});
    expect(snap.gauges).toEqual({});
    expect(snap.timers).toEqual({});
    expect(snap.histograms).toEqual({});
  });

  test('metrics work normally after reset', () => {
    m.increment('counter');
    m.reset();
    m.increment('counter');
    expect(m.getCounter('counter')).toBe(1);
  });

  test('reset with labeled metrics', () => {
    m.increment('requests', { status: '200' });
    m.increment('requests', { status: '404' });
    m.reset();
    expect(m.getCounter('requests', { status: '200' })).toBe(0);
    expect(m.getCounter('requests', { status: '404' })).toBe(0);
  });
});

// ============================================================
// Singleton Behavior
// ============================================================

describe('Singleton Behavior', () => {
  test('global metrics singleton persists state', () => {
    const initial = metrics.getCounter('persistent_test');
    metrics.increment('persistent_test');
    const after = metrics.getCounter('persistent_test');
    expect(after).toBe(initial + 1);
  });

  test('multiple uses of global metrics reference same instance', () => {
    metrics.reset();
    metrics.increment('singleton');
    metrics.increment('singleton');
    // Access through import again
    expect(metrics.getCounter('singleton')).toBe(2);
  });

  test('createMetrics produces independent instances', () => {
    const m1 = createMetrics();
    const m2 = createMetrics();

    m1.increment('counter');
    m2.increment('counter');

    expect(m1.getCounter('counter')).toBe(1);
    expect(m2.getCounter('counter')).toBe(1);

    m1.increment('counter');
    expect(m1.getCounter('counter')).toBe(2);
    expect(m2.getCounter('counter')).toBe(1);
  });

  test('global metrics snapshot is independent from created instances', () => {
    metrics.reset();
    const m = createMetrics();

    metrics.increment('metric1');
    m.increment('metric2');

    const globalSnap = metrics.snapshot();
    const localSnap = m.snapshot();

    expect('metric1' in globalSnap.counters).toBe(true);
    expect('metric1' in localSnap.counters).toBe(false);
    expect('metric2' in globalSnap.counters).toBe(false);
    expect('metric2' in localSnap.counters).toBe(true);
  });
});

// ============================================================
// Integration Tests
// ============================================================

describe('Integration Tests', () => {
  let m: MetricsCollector;

  beforeEach(() => {
    m = createMetrics();
  });

  test('complete metrics lifecycle', () => {
    // Record various metrics
    m.increment('requests', { method: 'GET' }, 100);
    m.increment('errors', { code: '500' }, 5);
    m.gauge('uptime', 99.9);

    const handle = m.startTimer('operation');
    let start = performance.now();
    while (performance.now() - start < 5) {}
    handle.stop();

    m.observe('latency', 45);
    m.observe('latency', 55);

    // Verify snapshot
    const snap = m.snapshot();
    expect(Object.keys(snap.counters).length).toBe(2);
    expect(Object.keys(snap.gauges).length).toBe(1);
    expect(Object.keys(snap.timers).length).toBe(1);
    expect(Object.keys(snap.histograms).length).toBe(1);

    // Verify history
    const history = m.getHistory();
    expect(history.length).toBeGreaterThan(0);
  });

  test('metrics with complex label combinations', () => {
    const labels1 = { service: 'api', method: 'GET', status: '200', region: 'us-east' };
    const labels2 = { service: 'api', method: 'POST', status: '201', region: 'us-west' };

    m.recordTime('latency', 50, labels1);
    m.recordTime('latency', 75, labels2);

    const snap = m.snapshot();
    const keys = Object.keys(snap.timers);

    expect(keys.length).toBe(2);
    expect(keys.every((k) => k.includes('latency'))).toBe(true);
  });

  test('histogram percentiles with realistic data distribution', () => {
    // Simulating response times: most fast, few slow
    const times = [10, 12, 11, 13, 15, 14, 16, 18, 20, 100]; // 100 is outlier
    times.forEach((t) => m.observe('response_time', t));

    const snap = m.snapshot();
    const stats = snap.histograms['response_time'];

    expect(stats.p50).toBeLessThan(20); // Median should be low
    expect(stats.p95).toBeGreaterThan(stats.p50); // p95 higher than p50
    expect(stats.p99).toBeGreaterThanOrEqual(stats.p95); // p99 >= p95
    expect(stats.max).toBe(100); // Outlier recorded
  });

  test('concurrent metric operations maintain consistency', () => {
    for (let i = 0; i < 100; i++) {
      m.increment('counter');
      m.gauge('gauge', i);
      m.recordTime('timer', Math.random() * 100);
      m.observe('histogram', Math.random() * 1000);
    }

    const snap = m.snapshot();
    expect(snap.counters['counter']).toBe(100);
    expect(snap.gauges['gauge']).toBe(99);
    expect(snap.timers['timer'].count).toBe(100);
    expect(snap.histograms['histogram'].count).toBe(100);
  });
});
