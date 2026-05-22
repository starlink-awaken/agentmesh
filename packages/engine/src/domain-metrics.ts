/**
 * Honeycomb v2 - Domain Success Metrics
 *
 * Defines and tracks domain-specific success criteria for each project archetype.
 * Provides automated measurement collection, threshold checking, and quality report generation.
 * Each archetype has a default metric profile that can be customized per-project.
 */

import type { ProjectArchetype } from './types.js';

// ============================================================
// Type Definitions
// ============================================================

/** Definition of a single domain-specific metric */
export interface MetricDefinition {
  name: string;
  description: string;
  unit: string; // 'percentage', 'score', 'count', 'ratio', 'boolean'
  target: number; // Target threshold value
  weight: number; // Weight in overall score calculation (0-1)
  direction: 'higher-is-better' | 'lower-is-better';
}

/** A recorded measurement for a specific metric */
export interface MetricMeasurement {
  metric_name: string;
  value: number;
  timestamp: number;
  passed: boolean; // Whether value meets the target threshold
  details?: string;
}

/** Collection of metric definitions for a specific archetype */
export interface DomainMetricProfile {
  archetype: ProjectArchetype;
  metrics: MetricDefinition[];
}

/** Complete quality assessment report for a project */
export interface QualityReport {
  project_id: string;
  archetype: ProjectArchetype;
  generated_at: number;
  overall_score: number; // Weighted average, 0-100
  passed: boolean; // Whether overall score meets minimum threshold (70)
  metrics: Array<{
    definition: MetricDefinition;
    measurement: MetricMeasurement | null;
    status: 'passed' | 'failed' | 'not-measured';
  }>;
  summary: string;
}

/** Result of a threshold check for a single metric */
interface ThresholdCheckResult {
  passed: boolean;
  target: number;
  direction: string;
}

// ============================================================
// Constants
// ============================================================

/** Minimum overall score required for a project to pass */
const MINIMUM_PASS_SCORE = 70;

// ============================================================
// Default Metric Profiles
// ============================================================

/**
 * Build the default metric profiles for all five project archetypes.
 * Returns a fresh map each time to support independent instances.
 */
function buildDefaultProfiles(): Map<ProjectArchetype, DomainMetricProfile> {
  const profiles = new Map<ProjectArchetype, DomainMetricProfile>();

  // -- software-dev --
  profiles.set('software-dev', {
    archetype: 'software-dev',
    metrics: [
      {
        name: 'code_coverage',
        description: 'Percentage of code covered by automated tests',
        unit: 'percentage',
        target: 80,
        weight: 0.25,
        direction: 'higher-is-better',
      },
      {
        name: 'bug_density',
        description: 'Number of bugs per thousand lines of code',
        unit: 'ratio',
        target: 0.5,
        weight: 0.2,
        direction: 'lower-is-better',
      },
      {
        name: 'api_consistency',
        description: 'Percentage of API endpoints following design standards',
        unit: 'percentage',
        target: 100,
        weight: 0.15,
        direction: 'higher-is-better',
      },
      {
        name: 'deploy_success',
        description: 'Deployment success rate over recent releases',
        unit: 'percentage',
        target: 99,
        weight: 0.2,
        direction: 'higher-is-better',
      },
      {
        name: 'test_pass_rate',
        description: 'Percentage of tests passing in the test suite',
        unit: 'percentage',
        target: 95,
        weight: 0.2,
        direction: 'higher-is-better',
      },
    ],
  });

  // -- creative-writing --
  profiles.set('creative-writing', {
    archetype: 'creative-writing',
    metrics: [
      {
        name: 'plot_coherence',
        description: 'Logical consistency and flow of the plot (1-10 scale)',
        unit: 'score',
        target: 8,
        weight: 0.25,
        direction: 'higher-is-better',
      },
      {
        name: 'character_consistency',
        description: 'Consistency of character behavior and voice (1-10 scale)',
        unit: 'score',
        target: 9,
        weight: 0.25,
        direction: 'higher-is-better',
      },
      {
        name: 'reader_retention',
        description: 'Estimated reader engagement and retention rate',
        unit: 'percentage',
        target: 80,
        weight: 0.2,
        direction: 'higher-is-better',
      },
      {
        name: 'style_unity',
        description: 'Consistency of writing style throughout the work (1-10 scale)',
        unit: 'score',
        target: 7,
        weight: 0.15,
        direction: 'higher-is-better',
      },
      {
        name: 'pacing_score',
        description: 'Quality of narrative pacing (1-10 scale)',
        unit: 'score',
        target: 7,
        weight: 0.15,
        direction: 'higher-is-better',
      },
    ],
  });

  // -- visual-production --
  profiles.set('visual-production', {
    archetype: 'visual-production',
    metrics: [
      {
        name: 'art_consistency',
        description: 'Visual style consistency across all assets (1-10 scale)',
        unit: 'score',
        target: 9,
        weight: 0.3,
        direction: 'higher-is-better',
      },
      {
        name: 'narrative_flow',
        description: 'Quality of visual storytelling flow (1-10 scale)',
        unit: 'score',
        target: 8,
        weight: 0.25,
        direction: 'higher-is-better',
      },
      {
        name: 'visual_impact',
        description: 'Overall visual impact and engagement (1-10 scale)',
        unit: 'score',
        target: 8,
        weight: 0.25,
        direction: 'higher-is-better',
      },
      {
        name: 'style_unity',
        description: 'Coherence of artistic style across the production (1-10 scale)',
        unit: 'score',
        target: 8,
        weight: 0.2,
        direction: 'higher-is-better',
      },
    ],
  });

  // -- document-processing --
  profiles.set('document-processing', {
    archetype: 'document-processing',
    metrics: [
      {
        name: 'content_accuracy',
        description: 'Accuracy of extracted or generated content',
        unit: 'percentage',
        target: 99,
        weight: 0.3,
        direction: 'higher-is-better',
      },
      {
        name: 'format_compliance',
        description: 'Adherence to required output format standards',
        unit: 'percentage',
        target: 100,
        weight: 0.25,
        direction: 'higher-is-better',
      },
      {
        name: 'terminology_consistency',
        description: 'Consistency of terminology usage across documents',
        unit: 'percentage',
        target: 95,
        weight: 0.2,
        direction: 'higher-is-better',
      },
      {
        name: 'audit_completeness',
        description: 'Completeness of audit trail and traceability',
        unit: 'percentage',
        target: 100,
        weight: 0.25,
        direction: 'higher-is-better',
      },
    ],
  });

  // -- custom --
  profiles.set('custom', {
    archetype: 'custom',
    metrics: [
      {
        name: 'delivery_completeness',
        description: 'Percentage of deliverables completed successfully',
        unit: 'percentage',
        target: 90,
        weight: 0.6,
        direction: 'higher-is-better',
      },
      {
        name: 'quality_score',
        description: 'Overall quality assessment (1-10 scale)',
        unit: 'score',
        target: 7,
        weight: 0.4,
        direction: 'higher-is-better',
      },
    ],
  });

  return profiles;
}

// ============================================================
// DomainMetrics Class
// ============================================================

export class DomainMetrics {
  /** Metric profiles keyed by archetype */
  private profiles: Map<ProjectArchetype, DomainMetricProfile>;

  /** Measurements keyed by project_id -> metric_name -> MetricMeasurement[] */
  private measurements: Map<string, Map<string, MetricMeasurement[]>>;

  constructor() {
    this.profiles = buildDefaultProfiles();
    this.measurements = new Map();
  }

  // ----------------------------------------------------------
  // Profile Management
  // ----------------------------------------------------------

  /**
   * Get the metric profile for a given archetype.
   * Returns undefined if the archetype has no registered profile.
   */
  getProfile(archetype: ProjectArchetype): DomainMetricProfile | undefined {
    return this.profiles.get(archetype);
  }

  /**
   * Set (replace) the metric definitions for a given archetype.
   * Creates the profile if it does not exist; overwrites if it does.
   */
  setProfile(archetype: ProjectArchetype, metrics: MetricDefinition[]): void {
    this.profiles.set(archetype, { archetype, metrics: [...metrics] });
  }

  /**
   * Append a single metric definition to an existing archetype profile.
   * If the archetype profile does not exist, creates it with just this metric.
   */
  addMetric(archetype: ProjectArchetype, metric: MetricDefinition): void {
    const existing = this.profiles.get(archetype);
    if (existing) {
      existing.metrics.push({ ...metric });
    } else {
      this.profiles.set(archetype, { archetype, metrics: [{ ...metric }] });
    }
  }

  // ----------------------------------------------------------
  // Measurement Recording
  // ----------------------------------------------------------

  /**
   * Record a measurement for a specific metric on a project.
   * Automatically determines pass/fail by checking the metric's threshold
   * across all known profiles. Returns the created measurement.
   */
  recordMeasurement(
    projectId: string,
    metricName: string,
    value: number,
    details?: string,
  ): MetricMeasurement {
    const passed = this.evaluatePassFail(metricName, value);

    const measurement: MetricMeasurement = {
      metric_name: metricName,
      value,
      timestamp: Date.now(),
      passed,
      details,
    };

    // Get or create project measurement map
    let projectMap = this.measurements.get(projectId);
    if (!projectMap) {
      projectMap = new Map();
      this.measurements.set(projectId, projectMap);
    }

    // Get or create metric measurement array
    let metricMeasurements = projectMap.get(metricName);
    if (!metricMeasurements) {
      metricMeasurements = [];
      projectMap.set(metricName, metricMeasurements);
    }

    metricMeasurements.push(measurement);
    return measurement;
  }

  // ----------------------------------------------------------
  // Measurement Retrieval
  // ----------------------------------------------------------

  /**
   * Get all measurements for a project, optionally filtered by metric name.
   * Returns an empty array if the project or metric has no measurements.
   */
  getMeasurements(projectId: string, metricName?: string): MetricMeasurement[] {
    const projectMap = this.measurements.get(projectId);
    if (!projectMap) {
      return [];
    }

    if (metricName !== undefined) {
      return projectMap.get(metricName) ?? [];
    }

    // Return all measurements for the project
    const all: MetricMeasurement[] = [];
    for (const measurements of projectMap.values()) {
      all.push(...measurements);
    }
    return all;
  }

  /**
   * Get the most recent measurement for a specific metric on a project.
   * Returns undefined if no measurements exist.
   */
  getLatestMeasurement(
    projectId: string,
    metricName: string,
  ): MetricMeasurement | undefined {
    const measurements = this.getMeasurements(projectId, metricName);
    if (measurements.length === 0) {
      return undefined;
    }
    return measurements[measurements.length - 1];
  }

  // ----------------------------------------------------------
  // Threshold Checking
  // ----------------------------------------------------------

  /**
   * Check whether a value passes the threshold for a named metric
   * within a specific archetype profile.
   * Returns pass/fail result along with target and direction info.
   */
  checkThreshold(
    metricName: string,
    value: number,
    archetype: ProjectArchetype,
  ): ThresholdCheckResult {
    const profile = this.profiles.get(archetype);
    if (!profile) {
      return { passed: true, target: 0, direction: 'higher-is-better' };
    }

    const definition = profile.metrics.find((m) => m.name === metricName);
    if (!definition) {
      return { passed: true, target: 0, direction: 'higher-is-better' };
    }

    const passed =
      definition.direction === 'higher-is-better'
        ? value >= definition.target
        : value <= definition.target;

    return {
      passed,
      target: definition.target,
      direction: definition.direction,
    };
  }

  // ----------------------------------------------------------
  // Report Generation
  // ----------------------------------------------------------

  /**
   * Generate a comprehensive quality report for a project under a given archetype.
   * Collects the latest measurement for each metric in the profile, calculates
   * a weighted overall score, and determines pass/fail status.
   */
  generateReport(projectId: string, archetype: ProjectArchetype): QualityReport {
    const profile = this.profiles.get(archetype);
    const metricDefinitions = profile?.metrics ?? [];

    const reportMetrics: QualityReport['metrics'] = [];
    let weightedSum = 0;
    let totalMeasuredWeight = 0;

    for (const definition of metricDefinitions) {
      const latest = this.getLatestMeasurement(projectId, definition.name);

      if (!latest) {
        reportMetrics.push({
          definition,
          measurement: null,
          status: 'not-measured',
        });
        continue;
      }

      const passed =
        definition.direction === 'higher-is-better'
          ? latest.value >= definition.target
          : latest.value <= definition.target;

      reportMetrics.push({
        definition,
        measurement: latest,
        status: passed ? 'passed' : 'failed',
      });

      // Calculate normalized score for this metric (0-100 scale)
      const normalizedScore = this.normalizeScore(
        latest.value,
        definition.target,
        definition.direction,
      );

      weightedSum += normalizedScore * definition.weight;
      totalMeasuredWeight += definition.weight;
    }

    const overallScore =
      totalMeasuredWeight > 0
        ? weightedSum / totalMeasuredWeight
        : 0;

    const passedCount = reportMetrics.filter((m) => m.status === 'passed').length;
    const failedCount = reportMetrics.filter((m) => m.status === 'failed').length;
    const notMeasuredCount = reportMetrics.filter((m) => m.status === 'not-measured').length;
    const totalCount = reportMetrics.length;

    const summary = this.buildSummary(
      archetype,
      overallScore,
      passedCount,
      failedCount,
      notMeasuredCount,
      totalCount,
    );

    return {
      project_id: projectId,
      archetype,
      generated_at: Date.now(),
      overall_score: overallScore,
      passed: overallScore >= MINIMUM_PASS_SCORE,
      metrics: reportMetrics,
      summary,
    };
  }

  /**
   * Quick overall score check for a project under a given archetype.
   * Equivalent to generateReport().overall_score but without building the full report.
   */
  getOverallScore(projectId: string, archetype: ProjectArchetype): number {
    const profile = this.profiles.get(archetype);
    if (!profile) {
      return 0;
    }

    let weightedSum = 0;
    let totalMeasuredWeight = 0;

    for (const definition of profile.metrics) {
      const latest = this.getLatestMeasurement(projectId, definition.name);
      if (!latest) {
        continue;
      }

      const normalizedScore = this.normalizeScore(
        latest.value,
        definition.target,
        definition.direction,
      );

      weightedSum += normalizedScore * definition.weight;
      totalMeasuredWeight += definition.weight;
    }

    return totalMeasuredWeight > 0 ? weightedSum / totalMeasuredWeight : 0;
  }

  // ----------------------------------------------------------
  // Cleanup Operations
  // ----------------------------------------------------------

  /**
   * Remove all recorded measurements for a specific project.
   */
  clearMeasurements(projectId: string): void {
    this.measurements.delete(projectId);
  }

  /**
   * Reset the entire DomainMetrics instance to its initial state.
   * Clears all measurements and restores default profiles.
   */
  reset(): void {
    this.measurements.clear();
    this.profiles = buildDefaultProfiles();
  }

  // ----------------------------------------------------------
  // Private Helpers
  // ----------------------------------------------------------

  /**
   * Evaluate whether a value passes the threshold for a named metric.
   * Searches across all registered profiles to find the metric definition.
   * Returns true if the metric is not found in any profile (unknown metrics pass by default).
   */
  private evaluatePassFail(metricName: string, value: number): boolean {
    for (const profile of this.profiles.values()) {
      const definition = profile.metrics.find((m) => m.name === metricName);
      if (definition) {
        return definition.direction === 'higher-is-better'
          ? value >= definition.target
          : value <= definition.target;
      }
    }
    // Unknown metric: pass by default
    return true;
  }

  /**
   * Normalize a metric value to a 0-100 score.
   *
   * For higher-is-better metrics:
   *   score = min(100, (value / target) * 100)
   *
   * For lower-is-better metrics:
   *   If target is 0: score is 100 when value is 0, otherwise scales down
   *   If target > 0: score = min(100, max(0, (1 - (value - target) / target) * 100))
   */
  private normalizeScore(
    value: number,
    target: number,
    direction: 'higher-is-better' | 'lower-is-better',
  ): number {
    if (direction === 'higher-is-better') {
      if (target === 0) {
        return value >= 0 ? 100 : 0;
      }
      return Math.min(100, (value / target) * 100);
    }

    // lower-is-better
    if (target === 0) {
      return value === 0 ? 100 : Math.max(0, 100 - value * 100);
    }
    // When value <= target, the metric passes. Score scales from 100 (at 0) down.
    // score = max(0, min(100, (1 - value / (2 * target)) * 100))
    // This gives 100 when value=0, ~50 when value=target, 0 when value=2*target
    // But for simpler pass/fail scoring:
    // At target: score = 100 (just passing)
    // Below target: score > 100 (cap at 100)
    // Above target: score < 100
    const ratio = value / target;
    if (ratio <= 1) {
      // Value is at or below target (good for lower-is-better)
      return 100;
    }
    // Value exceeds target -- score decreases linearly
    // At 2x target, score = 0
    return Math.max(0, (2 - ratio) * 100);
  }

  /**
   * Build a human-readable summary string for a quality report.
   */
  private buildSummary(
    archetype: ProjectArchetype,
    overallScore: number,
    passedCount: number,
    failedCount: number,
    notMeasuredCount: number,
    totalCount: number,
  ): string {
    const measuredCount = passedCount + failedCount;
    const scoreStr = overallScore.toFixed(1);
    const passedOverall = overallScore >= MINIMUM_PASS_SCORE;

    const parts: string[] = [];
    parts.push(`Quality report for archetype "${archetype}": overall score ${scoreStr}/100.`);

    if (measuredCount === 0) {
      parts.push(`No metrics have been measured yet (0/${totalCount}).`);
    } else {
      parts.push(
        `${measuredCount}/${totalCount} metrics measured: ${passedCount} passed, ${failedCount} failed.`,
      );
    }

    if (notMeasuredCount > 0 && measuredCount > 0) {
      parts.push(`${notMeasuredCount} metric(s) still awaiting measurement.`);
    }

    parts.push(passedOverall ? 'Status: PASSED.' : 'Status: FAILED.');

    return parts.join(' ');
  }
}

// ============================================================
// Factory & Global Instance
// ============================================================

/**
 * Create a new DomainMetrics instance with default profiles.
 */
export function createDomainMetrics(): DomainMetrics {
  return new DomainMetrics();
}

/**
 * Global DomainMetrics singleton instance.
 * Can be replaced at engine startup with a configured instance.
 */
export const domainMetrics: DomainMetrics = createDomainMetrics();
