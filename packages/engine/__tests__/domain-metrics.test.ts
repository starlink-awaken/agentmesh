import { describe, test, expect, beforeEach } from 'bun:test';
import {
  DomainMetrics,
  createDomainMetrics,
  domainMetrics,
  type MetricDefinition,
  type MetricMeasurement,
  type DomainMetricProfile,
  type QualityReport,
} from '../src/domain-metrics.ts';

// ============================================================
// Construction & Factory Functions
// ============================================================

describe('Construction & Factory Functions', () => {
  test('createDomainMetrics creates new DomainMetrics instance', () => {
    const dm1 = createDomainMetrics();
    const dm2 = createDomainMetrics();
    expect(dm1).not.toBe(dm2);
    expect(dm1).toBeInstanceOf(DomainMetrics);
    expect(dm2).toBeInstanceOf(DomainMetrics);
  });

  test('global domainMetrics singleton exists', () => {
    expect(domainMetrics).toBeInstanceOf(DomainMetrics);
  });

  test('constructor initializes default profiles for all 5 archetypes', () => {
    const dm = createDomainMetrics();
    expect(dm.getProfile('software-dev')).toBeDefined();
    expect(dm.getProfile('creative-writing')).toBeDefined();
    expect(dm.getProfile('visual-production')).toBeDefined();
    expect(dm.getProfile('document-processing')).toBeDefined();
    expect(dm.getProfile('custom')).toBeDefined();
  });

  test('constructor profiles have correct archetype labels', () => {
    const dm = createDomainMetrics();
    expect(dm.getProfile('software-dev')!.archetype).toBe('software-dev');
    expect(dm.getProfile('creative-writing')!.archetype).toBe('creative-writing');
    expect(dm.getProfile('visual-production')!.archetype).toBe('visual-production');
    expect(dm.getProfile('document-processing')!.archetype).toBe('document-processing');
    expect(dm.getProfile('custom')!.archetype).toBe('custom');
  });
});

// ============================================================
// Default Profile Definitions
// ============================================================

describe('Default Profile Definitions', () => {
  let dm: DomainMetrics;

  beforeEach(() => {
    dm = createDomainMetrics();
  });

  test('software-dev profile has 5 metrics', () => {
    const profile = dm.getProfile('software-dev')!;
    expect(profile.metrics.length).toBe(5);
  });

  test('software-dev profile contains expected metric names', () => {
    const profile = dm.getProfile('software-dev')!;
    const names = profile.metrics.map((m) => m.name);
    expect(names).toContain('code_coverage');
    expect(names).toContain('bug_density');
    expect(names).toContain('api_consistency');
    expect(names).toContain('deploy_success');
    expect(names).toContain('test_pass_rate');
  });

  test('software-dev code_coverage has target 80', () => {
    const profile = dm.getProfile('software-dev')!;
    const metric = profile.metrics.find((m) => m.name === 'code_coverage')!;
    expect(metric.target).toBe(80);
    expect(metric.direction).toBe('higher-is-better');
    expect(metric.unit).toBe('percentage');
  });

  test('software-dev bug_density has target 0.5 and lower-is-better', () => {
    const profile = dm.getProfile('software-dev')!;
    const metric = profile.metrics.find((m) => m.name === 'bug_density')!;
    expect(metric.target).toBe(0.5);
    expect(metric.direction).toBe('lower-is-better');
  });

  test('creative-writing profile has 5 metrics', () => {
    const profile = dm.getProfile('creative-writing')!;
    expect(profile.metrics.length).toBe(5);
  });

  test('creative-writing profile contains expected metric names', () => {
    const profile = dm.getProfile('creative-writing')!;
    const names = profile.metrics.map((m) => m.name);
    expect(names).toContain('plot_coherence');
    expect(names).toContain('character_consistency');
    expect(names).toContain('reader_retention');
    expect(names).toContain('style_unity');
    expect(names).toContain('pacing_score');
  });

  test('creative-writing plot_coherence has target 8', () => {
    const profile = dm.getProfile('creative-writing')!;
    const metric = profile.metrics.find((m) => m.name === 'plot_coherence')!;
    expect(metric.target).toBe(8);
    expect(metric.unit).toBe('score');
  });

  test('creative-writing character_consistency has target 9', () => {
    const profile = dm.getProfile('creative-writing')!;
    const metric = profile.metrics.find((m) => m.name === 'character_consistency')!;
    expect(metric.target).toBe(9);
  });

  test('visual-production profile has 4 metrics', () => {
    const profile = dm.getProfile('visual-production')!;
    expect(profile.metrics.length).toBe(4);
  });

  test('visual-production profile contains expected metric names', () => {
    const profile = dm.getProfile('visual-production')!;
    const names = profile.metrics.map((m) => m.name);
    expect(names).toContain('art_consistency');
    expect(names).toContain('narrative_flow');
    expect(names).toContain('visual_impact');
    expect(names).toContain('style_unity');
  });

  test('document-processing profile has 4 metrics', () => {
    const profile = dm.getProfile('document-processing')!;
    expect(profile.metrics.length).toBe(4);
  });

  test('document-processing profile contains expected metric names', () => {
    const profile = dm.getProfile('document-processing')!;
    const names = profile.metrics.map((m) => m.name);
    expect(names).toContain('content_accuracy');
    expect(names).toContain('format_compliance');
    expect(names).toContain('terminology_consistency');
    expect(names).toContain('audit_completeness');
  });

  test('document-processing content_accuracy has target 99', () => {
    const profile = dm.getProfile('document-processing')!;
    const metric = profile.metrics.find((m) => m.name === 'content_accuracy')!;
    expect(metric.target).toBe(99);
  });

  test('custom profile has 2 metrics', () => {
    const profile = dm.getProfile('custom')!;
    expect(profile.metrics.length).toBe(2);
  });

  test('custom profile contains expected metric names', () => {
    const profile = dm.getProfile('custom')!;
    const names = profile.metrics.map((m) => m.name);
    expect(names).toContain('delivery_completeness');
    expect(names).toContain('quality_score');
  });

  test('all metric weights sum to approximately 1.0 per profile', () => {
    const archetypes = [
      'software-dev',
      'creative-writing',
      'visual-production',
      'document-processing',
      'custom',
    ] as const;

    for (const archetype of archetypes) {
      const profile = dm.getProfile(archetype)!;
      const totalWeight = profile.metrics.reduce((sum, m) => sum + m.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 2);
    }
  });

  test('all metrics have valid direction values', () => {
    const archetypes = [
      'software-dev',
      'creative-writing',
      'visual-production',
      'document-processing',
      'custom',
    ] as const;

    for (const archetype of archetypes) {
      const profile = dm.getProfile(archetype)!;
      for (const metric of profile.metrics) {
        expect(['higher-is-better', 'lower-is-better']).toContain(metric.direction);
      }
    }
  });

  test('all metrics have non-empty name and description', () => {
    const archetypes = [
      'software-dev',
      'creative-writing',
      'visual-production',
      'document-processing',
      'custom',
    ] as const;

    for (const archetype of archetypes) {
      const profile = dm.getProfile(archetype)!;
      for (const metric of profile.metrics) {
        expect(metric.name.length).toBeGreaterThan(0);
        expect(metric.description.length).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================================
// Profile Management
// ============================================================

describe('Profile Management', () => {
  let dm: DomainMetrics;

  beforeEach(() => {
    dm = createDomainMetrics();
  });

  test('getProfile returns undefined for unknown archetype', () => {
    const result = dm.getProfile('nonexistent' as any);
    expect(result).toBeUndefined();
  });

  test('setProfile creates a custom profile', () => {
    const customMetrics: MetricDefinition[] = [
      {
        name: 'custom_metric',
        description: 'A custom test metric',
        unit: 'percentage',
        target: 75,
        weight: 1.0,
        direction: 'higher-is-better',
      },
    ];
    dm.setProfile('custom', customMetrics);

    const profile = dm.getProfile('custom')!;
    expect(profile.metrics.length).toBe(1);
    expect(profile.metrics[0].name).toBe('custom_metric');
    expect(profile.metrics[0].target).toBe(75);
  });

  test('setProfile overwrites existing profile metrics', () => {
    const originalProfile = dm.getProfile('software-dev')!;
    const originalCount = originalProfile.metrics.length;

    dm.setProfile('software-dev', [
      {
        name: 'single_metric',
        description: 'Only one metric',
        unit: 'count',
        target: 10,
        weight: 1.0,
        direction: 'higher-is-better',
      },
    ]);

    const updatedProfile = dm.getProfile('software-dev')!;
    expect(updatedProfile.metrics.length).toBe(1);
    expect(updatedProfile.metrics.length).not.toBe(originalCount);
    expect(updatedProfile.metrics[0].name).toBe('single_metric');
  });

  test('addMetric appends a metric to existing profile', () => {
    const originalCount = dm.getProfile('software-dev')!.metrics.length;

    dm.addMetric('software-dev', {
      name: 'new_metric',
      description: 'A new metric',
      unit: 'ratio',
      target: 0.9,
      weight: 0.1,
      direction: 'higher-is-better',
    });

    const updated = dm.getProfile('software-dev')!;
    expect(updated.metrics.length).toBe(originalCount + 1);
    expect(updated.metrics[updated.metrics.length - 1].name).toBe('new_metric');
  });

  test('addMetric creates profile if archetype not found', () => {
    // After reset, adding to a fresh archetype
    dm.addMetric('custom', {
      name: 'fresh_metric',
      description: 'Fresh metric',
      unit: 'score',
      target: 5,
      weight: 1.0,
      direction: 'higher-is-better',
    });

    const profile = dm.getProfile('custom')!;
    expect(profile.metrics.some((m) => m.name === 'fresh_metric')).toBe(true);
  });
});

// ============================================================
// Measurement Recording
// ============================================================

describe('Measurement Recording', () => {
  let dm: DomainMetrics;

  beforeEach(() => {
    dm = createDomainMetrics();
  });

  test('recordMeasurement returns MetricMeasurement with correct fields', () => {
    const result = dm.recordMeasurement('proj-1', 'code_coverage', 85);
    expect(result.metric_name).toBe('code_coverage');
    expect(result.value).toBe(85);
    expect(result.timestamp).toBeGreaterThan(0);
    expect(typeof result.passed).toBe('boolean');
  });

  test('recordMeasurement stores details when provided', () => {
    const result = dm.recordMeasurement('proj-1', 'code_coverage', 85, 'Unit tests only');
    expect(result.details).toBe('Unit tests only');
  });

  test('recordMeasurement without details has undefined details', () => {
    const result = dm.recordMeasurement('proj-1', 'code_coverage', 85);
    expect(result.details).toBeUndefined();
  });

  test('recordMeasurement passes when value meets higher-is-better target', () => {
    // code_coverage target is 80, direction is higher-is-better
    const result = dm.recordMeasurement('proj-1', 'code_coverage', 85);
    expect(result.passed).toBe(true);
  });

  test('recordMeasurement passes when value equals higher-is-better target', () => {
    const result = dm.recordMeasurement('proj-1', 'code_coverage', 80);
    expect(result.passed).toBe(true);
  });

  test('recordMeasurement fails when value below higher-is-better target', () => {
    const result = dm.recordMeasurement('proj-1', 'code_coverage', 60);
    expect(result.passed).toBe(false);
  });

  test('recordMeasurement passes when value meets lower-is-better target', () => {
    // bug_density target is 0.5, direction is lower-is-better
    const result = dm.recordMeasurement('proj-1', 'bug_density', 0.3);
    expect(result.passed).toBe(true);
  });

  test('recordMeasurement passes when value equals lower-is-better target', () => {
    const result = dm.recordMeasurement('proj-1', 'bug_density', 0.5);
    expect(result.passed).toBe(true);
  });

  test('recordMeasurement fails when value above lower-is-better target', () => {
    const result = dm.recordMeasurement('proj-1', 'bug_density', 1.2);
    expect(result.passed).toBe(false);
  });

  test('recordMeasurement for unknown metric defaults to passed=true', () => {
    const result = dm.recordMeasurement('proj-1', 'unknown_metric', 42);
    expect(result.passed).toBe(true);
  });

  test('multiple measurements for same project and metric accumulate', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 60);
    dm.recordMeasurement('proj-1', 'code_coverage', 70);
    dm.recordMeasurement('proj-1', 'code_coverage', 85);

    const measurements = dm.getMeasurements('proj-1', 'code_coverage');
    expect(measurements.length).toBe(3);
    expect(measurements[0].value).toBe(60);
    expect(measurements[2].value).toBe(85);
  });

  test('measurements for different projects are isolated', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 85);
    dm.recordMeasurement('proj-2', 'code_coverage', 60);

    expect(dm.getMeasurements('proj-1', 'code_coverage').length).toBe(1);
    expect(dm.getMeasurements('proj-2', 'code_coverage').length).toBe(1);
    expect(dm.getMeasurements('proj-1', 'code_coverage')[0].value).toBe(85);
    expect(dm.getMeasurements('proj-2', 'code_coverage')[0].value).toBe(60);
  });
});

// ============================================================
// Measurement Retrieval
// ============================================================

describe('Measurement Retrieval', () => {
  let dm: DomainMetrics;

  beforeEach(() => {
    dm = createDomainMetrics();
  });

  test('getMeasurements returns empty array for unknown project', () => {
    const result = dm.getMeasurements('nonexistent');
    expect(result).toEqual([]);
  });

  test('getMeasurements returns empty array for unknown metric name', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 85);
    const result = dm.getMeasurements('proj-1', 'unknown');
    expect(result).toEqual([]);
  });

  test('getMeasurements without metricName returns all measurements for project', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 85);
    dm.recordMeasurement('proj-1', 'bug_density', 0.3);
    dm.recordMeasurement('proj-1', 'test_pass_rate', 95);

    const result = dm.getMeasurements('proj-1');
    expect(result.length).toBe(3);
  });

  test('getMeasurements with metricName filters by that metric', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 85);
    dm.recordMeasurement('proj-1', 'bug_density', 0.3);
    dm.recordMeasurement('proj-1', 'code_coverage', 90);

    const result = dm.getMeasurements('proj-1', 'code_coverage');
    expect(result.length).toBe(2);
    expect(result.every((m) => m.metric_name === 'code_coverage')).toBe(true);
  });

  test('getLatestMeasurement returns most recent measurement', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 60);
    dm.recordMeasurement('proj-1', 'code_coverage', 70);
    dm.recordMeasurement('proj-1', 'code_coverage', 85);

    const latest = dm.getLatestMeasurement('proj-1', 'code_coverage');
    expect(latest).toBeDefined();
    expect(latest!.value).toBe(85);
  });

  test('getLatestMeasurement returns undefined for unknown project', () => {
    const latest = dm.getLatestMeasurement('nonexistent', 'code_coverage');
    expect(latest).toBeUndefined();
  });

  test('getLatestMeasurement returns undefined for unknown metric', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 85);
    const latest = dm.getLatestMeasurement('proj-1', 'unknown');
    expect(latest).toBeUndefined();
  });
});

// ============================================================
// Threshold Checking
// ============================================================

describe('Threshold Checking', () => {
  let dm: DomainMetrics;

  beforeEach(() => {
    dm = createDomainMetrics();
  });

  test('checkThreshold returns passed=true when higher-is-better value meets target', () => {
    const result = dm.checkThreshold('code_coverage', 85, 'software-dev');
    expect(result.passed).toBe(true);
    expect(result.target).toBe(80);
    expect(result.direction).toBe('higher-is-better');
  });

  test('checkThreshold returns passed=false when higher-is-better value below target', () => {
    const result = dm.checkThreshold('code_coverage', 50, 'software-dev');
    expect(result.passed).toBe(false);
  });

  test('checkThreshold returns passed=true when lower-is-better value meets target', () => {
    const result = dm.checkThreshold('bug_density', 0.3, 'software-dev');
    expect(result.passed).toBe(true);
    expect(result.target).toBe(0.5);
    expect(result.direction).toBe('lower-is-better');
  });

  test('checkThreshold returns passed=false when lower-is-better value above target', () => {
    const result = dm.checkThreshold('bug_density', 1.0, 'software-dev');
    expect(result.passed).toBe(false);
  });

  test('checkThreshold with unknown metric returns passed=true with target 0', () => {
    const result = dm.checkThreshold('unknown_metric', 42, 'software-dev');
    expect(result.passed).toBe(true);
    expect(result.target).toBe(0);
    expect(result.direction).toBe('higher-is-better');
  });

  test('checkThreshold with unknown archetype returns passed=true with target 0', () => {
    const result = dm.checkThreshold('code_coverage', 85, 'nonexistent' as any);
    expect(result.passed).toBe(true);
    expect(result.target).toBe(0);
  });

  test('checkThreshold boundary: value equals target for higher-is-better', () => {
    const result = dm.checkThreshold('code_coverage', 80, 'software-dev');
    expect(result.passed).toBe(true);
  });

  test('checkThreshold boundary: value equals target for lower-is-better', () => {
    const result = dm.checkThreshold('bug_density', 0.5, 'software-dev');
    expect(result.passed).toBe(true);
  });
});

// ============================================================
// Quality Report Generation
// ============================================================

describe('Quality Report Generation', () => {
  let dm: DomainMetrics;

  beforeEach(() => {
    dm = createDomainMetrics();
  });

  test('generateReport returns QualityReport with correct structure', () => {
    const report = dm.generateReport('proj-1', 'software-dev');
    expect(report).toHaveProperty('project_id');
    expect(report).toHaveProperty('archetype');
    expect(report).toHaveProperty('generated_at');
    expect(report).toHaveProperty('overall_score');
    expect(report).toHaveProperty('passed');
    expect(report).toHaveProperty('metrics');
    expect(report).toHaveProperty('summary');
  });

  test('generateReport has correct project_id and archetype', () => {
    const report = dm.generateReport('proj-1', 'software-dev');
    expect(report.project_id).toBe('proj-1');
    expect(report.archetype).toBe('software-dev');
  });

  test('generateReport generated_at is current timestamp', () => {
    const before = Date.now();
    const report = dm.generateReport('proj-1', 'software-dev');
    const after = Date.now();
    expect(report.generated_at).toBeGreaterThanOrEqual(before);
    expect(report.generated_at).toBeLessThanOrEqual(after);
  });

  test('generateReport includes all metrics from profile', () => {
    const report = dm.generateReport('proj-1', 'software-dev');
    expect(report.metrics.length).toBe(5); // software-dev has 5 metrics
  });

  test('generateReport metrics have not-measured status when no measurements exist', () => {
    const report = dm.generateReport('proj-1', 'software-dev');
    for (const metric of report.metrics) {
      expect(metric.status).toBe('not-measured');
      expect(metric.measurement).toBeNull();
    }
  });

  test('generateReport metrics show passed status when measurement meets target', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 90);
    const report = dm.generateReport('proj-1', 'software-dev');
    const coverageMetric = report.metrics.find((m) => m.definition.name === 'code_coverage')!;
    expect(coverageMetric.status).toBe('passed');
    expect(coverageMetric.measurement).not.toBeNull();
    expect(coverageMetric.measurement!.value).toBe(90);
  });

  test('generateReport metrics show failed status when measurement misses target', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 50);
    const report = dm.generateReport('proj-1', 'software-dev');
    const coverageMetric = report.metrics.find((m) => m.definition.name === 'code_coverage')!;
    expect(coverageMetric.status).toBe('failed');
  });

  test('generateReport uses latest measurement for each metric', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 50);
    dm.recordMeasurement('proj-1', 'code_coverage', 90);
    const report = dm.generateReport('proj-1', 'software-dev');
    const coverageMetric = report.metrics.find((m) => m.definition.name === 'code_coverage')!;
    expect(coverageMetric.measurement!.value).toBe(90);
    expect(coverageMetric.status).toBe('passed');
  });

  test('generateReport overall_score is 0 when no measurements exist', () => {
    const report = dm.generateReport('proj-1', 'software-dev');
    expect(report.overall_score).toBe(0);
  });

  test('generateReport overall_score is weighted average of measured metrics', () => {
    // Set a simple profile with known weights
    dm.setProfile('custom', [
      {
        name: 'metric_a',
        description: 'Metric A',
        unit: 'percentage',
        target: 100,
        weight: 0.5,
        direction: 'higher-is-better',
      },
      {
        name: 'metric_b',
        description: 'Metric B',
        unit: 'percentage',
        target: 100,
        weight: 0.5,
        direction: 'higher-is-better',
      },
    ]);

    dm.recordMeasurement('proj-1', 'metric_a', 80);
    dm.recordMeasurement('proj-1', 'metric_b', 60);

    const report = dm.generateReport('proj-1', 'custom');
    // Weighted average: (80*0.5 + 60*0.5) / (0.5+0.5) = 70
    expect(report.overall_score).toBeCloseTo(70, 1);
  });

  test('generateReport overall_score handles lower-is-better metrics', () => {
    dm.setProfile('custom', [
      {
        name: 'errors',
        description: 'Error count',
        unit: 'count',
        target: 0,
        weight: 1.0,
        direction: 'lower-is-better',
      },
    ]);

    // For lower-is-better: score = max(0, (1 - value/target) * 100) but target is 0
    // When target is 0 and value is 0, score should be 100
    dm.recordMeasurement('proj-1', 'errors', 0);
    const report = dm.generateReport('proj-1', 'custom');
    expect(report.overall_score).toBe(100);
  });

  test('generateReport passed is true when overall_score >= 70', () => {
    dm.setProfile('custom', [
      {
        name: 'metric',
        description: 'Test metric',
        unit: 'percentage',
        target: 100,
        weight: 1.0,
        direction: 'higher-is-better',
      },
    ]);

    dm.recordMeasurement('proj-1', 'metric', 75);
    const report = dm.generateReport('proj-1', 'custom');
    expect(report.passed).toBe(true);
  });

  test('generateReport passed is false when overall_score < 70', () => {
    dm.setProfile('custom', [
      {
        name: 'metric',
        description: 'Test metric',
        unit: 'percentage',
        target: 100,
        weight: 1.0,
        direction: 'higher-is-better',
      },
    ]);

    dm.recordMeasurement('proj-1', 'metric', 30);
    const report = dm.generateReport('proj-1', 'custom');
    expect(report.passed).toBe(false);
  });

  test('generateReport summary is a non-empty string', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 85);
    const report = dm.generateReport('proj-1', 'software-dev');
    expect(typeof report.summary).toBe('string');
    expect(report.summary.length).toBeGreaterThan(0);
  });

  test('generateReport for creative-writing archetype', () => {
    dm.recordMeasurement('proj-1', 'plot_coherence', 9);
    dm.recordMeasurement('proj-1', 'character_consistency', 9);
    dm.recordMeasurement('proj-1', 'reader_retention', 85);
    dm.recordMeasurement('proj-1', 'style_unity', 8);
    dm.recordMeasurement('proj-1', 'pacing_score', 7);

    const report = dm.generateReport('proj-1', 'creative-writing');
    expect(report.metrics.length).toBe(5);
    expect(report.overall_score).toBeGreaterThan(0);

    const passedCount = report.metrics.filter((m) => m.status === 'passed').length;
    expect(passedCount).toBe(5);
  });
});

// ============================================================
// Overall Score (Quick Check)
// ============================================================

describe('Overall Score (Quick Check)', () => {
  let dm: DomainMetrics;

  beforeEach(() => {
    dm = createDomainMetrics();
  });

  test('getOverallScore returns 0 when no measurements exist', () => {
    const score = dm.getOverallScore('proj-1', 'software-dev');
    expect(score).toBe(0);
  });

  test('getOverallScore returns same value as generateReport overall_score', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 85);
    dm.recordMeasurement('proj-1', 'test_pass_rate', 95);

    const score = dm.getOverallScore('proj-1', 'software-dev');
    const report = dm.generateReport('proj-1', 'software-dev');
    expect(score).toBeCloseTo(report.overall_score, 5);
  });

  test('getOverallScore with all metrics measured at target values', () => {
    dm.setProfile('custom', [
      {
        name: 'metric',
        description: 'Test',
        unit: 'percentage',
        target: 80,
        weight: 1.0,
        direction: 'higher-is-better',
      },
    ]);

    dm.recordMeasurement('proj-1', 'metric', 80);
    const score = dm.getOverallScore('proj-1', 'custom');
    expect(score).toBeGreaterThan(0);
  });
});

// ============================================================
// Clear & Reset Operations
// ============================================================

describe('Clear & Reset Operations', () => {
  let dm: DomainMetrics;

  beforeEach(() => {
    dm = createDomainMetrics();
  });

  test('clearMeasurements removes all measurements for a project', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 85);
    dm.recordMeasurement('proj-1', 'bug_density', 0.3);
    dm.clearMeasurements('proj-1');

    const measurements = dm.getMeasurements('proj-1');
    expect(measurements).toEqual([]);
  });

  test('clearMeasurements does not affect other projects', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 85);
    dm.recordMeasurement('proj-2', 'code_coverage', 90);
    dm.clearMeasurements('proj-1');

    expect(dm.getMeasurements('proj-1')).toEqual([]);
    expect(dm.getMeasurements('proj-2').length).toBe(1);
  });

  test('clearMeasurements for nonexistent project does not throw', () => {
    expect(() => dm.clearMeasurements('nonexistent')).not.toThrow();
  });

  test('reset clears all measurements and restores default profiles', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 85);
    dm.recordMeasurement('proj-2', 'plot_coherence', 9);
    dm.setProfile('custom', [
      {
        name: 'altered',
        description: 'Altered',
        unit: 'count',
        target: 1,
        weight: 1.0,
        direction: 'higher-is-better',
      },
    ]);

    dm.reset();

    // Measurements cleared
    expect(dm.getMeasurements('proj-1')).toEqual([]);
    expect(dm.getMeasurements('proj-2')).toEqual([]);

    // Default profiles restored
    expect(dm.getProfile('software-dev')!.metrics.length).toBe(5);
    expect(dm.getProfile('custom')!.metrics.length).toBe(2);
    expect(dm.getProfile('custom')!.metrics[0].name).toBe('delivery_completeness');
  });

  test('reset allows fresh operation afterwards', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 85);
    dm.reset();
    dm.recordMeasurement('proj-1', 'code_coverage', 90);

    const measurements = dm.getMeasurements('proj-1', 'code_coverage');
    expect(measurements.length).toBe(1);
    expect(measurements[0].value).toBe(90);
  });
});

// ============================================================
// Singleton Behavior
// ============================================================

describe('Singleton Behavior', () => {
  test('global domainMetrics singleton persists state within test', () => {
    domainMetrics.recordMeasurement('singleton-test', 'code_coverage', 85);
    const measurements = domainMetrics.getMeasurements('singleton-test', 'code_coverage');
    expect(measurements.length).toBeGreaterThanOrEqual(1);
    // Clean up
    domainMetrics.clearMeasurements('singleton-test');
  });

  test('createDomainMetrics produces independent instances', () => {
    const dm1 = createDomainMetrics();
    const dm2 = createDomainMetrics();

    dm1.recordMeasurement('proj', 'code_coverage', 85);
    dm2.recordMeasurement('proj', 'code_coverage', 60);

    expect(dm1.getMeasurements('proj', 'code_coverage')[0].value).toBe(85);
    expect(dm2.getMeasurements('proj', 'code_coverage')[0].value).toBe(60);
  });
});

// ============================================================
// Integration Tests
// ============================================================

describe('Integration Tests', () => {
  let dm: DomainMetrics;

  beforeEach(() => {
    dm = createDomainMetrics();
  });

  test('complete lifecycle: record measurements and generate report', () => {
    // Record all software-dev metrics with passing values
    dm.recordMeasurement('proj-1', 'code_coverage', 90);
    dm.recordMeasurement('proj-1', 'bug_density', 0.2);
    dm.recordMeasurement('proj-1', 'api_consistency', 100);
    dm.recordMeasurement('proj-1', 'deploy_success', 99.5);
    dm.recordMeasurement('proj-1', 'test_pass_rate', 98);

    const report = dm.generateReport('proj-1', 'software-dev');

    expect(report.metrics.length).toBe(5);
    expect(report.metrics.every((m) => m.status === 'passed')).toBe(true);
    expect(report.overall_score).toBeGreaterThan(0);
    expect(report.passed).toBe(true);
    expect(report.summary.length).toBeGreaterThan(0);
  });

  test('partial measurements: only some metrics measured', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 90);
    dm.recordMeasurement('proj-1', 'test_pass_rate', 98);

    const report = dm.generateReport('proj-1', 'software-dev');

    const measured = report.metrics.filter((m) => m.status !== 'not-measured');
    const notMeasured = report.metrics.filter((m) => m.status === 'not-measured');

    expect(measured.length).toBe(2);
    expect(notMeasured.length).toBe(3);
  });

  test('failing project: all metrics below targets', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 30);
    dm.recordMeasurement('proj-1', 'bug_density', 5.0);
    dm.recordMeasurement('proj-1', 'api_consistency', 50);
    dm.recordMeasurement('proj-1', 'deploy_success', 60);
    dm.recordMeasurement('proj-1', 'test_pass_rate', 40);

    const report = dm.generateReport('proj-1', 'software-dev');

    expect(report.metrics.every((m) => m.status === 'failed')).toBe(true);
    expect(report.passed).toBe(false);
  });

  test('progress tracking: measurements improve over time', () => {
    // First round: low scores
    dm.recordMeasurement('proj-1', 'code_coverage', 30);
    let report1 = dm.generateReport('proj-1', 'software-dev');
    const score1 = report1.overall_score;

    // Second round: improved scores
    dm.recordMeasurement('proj-1', 'code_coverage', 90);
    let report2 = dm.generateReport('proj-1', 'software-dev');
    const score2 = report2.overall_score;

    expect(score2).toBeGreaterThan(score1);
  });

  test('multi-project tracking with different archetypes', () => {
    dm.recordMeasurement('sw-proj', 'code_coverage', 85);
    dm.recordMeasurement('cw-proj', 'plot_coherence', 9);

    const swReport = dm.generateReport('sw-proj', 'software-dev');
    const cwReport = dm.generateReport('cw-proj', 'creative-writing');

    expect(swReport.archetype).toBe('software-dev');
    expect(cwReport.archetype).toBe('creative-writing');
    expect(swReport.metrics.length).toBe(5);
    expect(cwReport.metrics.length).toBe(5);
  });

  test('custom profile workflow: define then measure', () => {
    dm.setProfile('custom', [
      {
        name: 'compliance_rate',
        description: 'Regulatory compliance rate',
        unit: 'percentage',
        target: 95,
        weight: 0.6,
        direction: 'higher-is-better',
      },
      {
        name: 'defect_count',
        description: 'Known defects',
        unit: 'count',
        target: 5,
        weight: 0.4,
        direction: 'lower-is-better',
      },
    ]);

    dm.recordMeasurement('proj-custom', 'compliance_rate', 98);
    dm.recordMeasurement('proj-custom', 'defect_count', 2);

    const report = dm.generateReport('proj-custom', 'custom');
    expect(report.metrics.length).toBe(2);
    expect(report.metrics.every((m) => m.status === 'passed')).toBe(true);
    expect(report.overall_score).toBeGreaterThan(0);
  });

  test('clear and re-measure produces clean report', () => {
    dm.recordMeasurement('proj-1', 'code_coverage', 50);
    dm.clearMeasurements('proj-1');
    dm.recordMeasurement('proj-1', 'code_coverage', 95);

    const report = dm.generateReport('proj-1', 'software-dev');
    const coverageMetric = report.metrics.find((m) => m.definition.name === 'code_coverage')!;
    expect(coverageMetric.measurement!.value).toBe(95);
    expect(coverageMetric.status).toBe('passed');
  });
});
