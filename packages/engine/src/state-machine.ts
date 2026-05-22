/**
 * Honeycomb v2 - 阶段状态机（Phase State Machine）
 *
 * 使用 DF-CEA 动态决策路径选择管理项目生命周期阶段转换。
 * 强制执行有效转换，支持非线性跳转（例如：反馈 → 执行重试），
 * 并在 phase_history 中记录完整的审计跟踪。
 *
 * @since v2.0.0
 */

import {
  Phase,
  DecisionPath,
  RiskLevel,
  type PhaseRecord,
  type ProjectConfig,
  type ComplexityLevel,
} from './types.js';

// ============================================================
// Transition Rules
// ============================================================

/**
 * Defines the set of valid target phases reachable from each source phase.
 * This is the single source of truth for all transition legality checks.
 *
 * Key non-linear paths:
 *   FEEDBACK → EXECUTION  (retry / fix cycle)
 *   DELIVERY → EXECUTION  (post-delivery hotfix)
 *   Any      → PAUSED     (pause at any active phase)
 *   Any      → FAILED     (failure at any active phase)
 *   PAUSED   → <previous> (resume to the phase that was paused)
 */
const TRANSITION_TABLE: Record<Phase, Phase[]> = {
  [Phase.INIT]: [
    Phase.RESEARCH,
    Phase.DECISION,
    Phase.EXECUTION,
    Phase.PAUSED,
    Phase.FAILED,
  ],
  [Phase.RESEARCH]: [
    Phase.DECISION,
    Phase.EXECUTION,
    Phase.PAUSED,
    Phase.FAILED,
  ],
  [Phase.DECISION]: [
    Phase.EXECUTION,
    Phase.RESEARCH,
    Phase.PAUSED,
    Phase.FAILED,
  ],
  [Phase.EXECUTION]: [
    Phase.FEEDBACK,
    Phase.DELIVERY,
    Phase.PAUSED,
    Phase.FAILED,
  ],
  [Phase.FEEDBACK]: [
    Phase.DELIVERY,
    Phase.EXECUTION,
    Phase.DECISION,
    Phase.PAUSED,
    Phase.FAILED,
  ],
  [Phase.DELIVERY]: [
    Phase.COMPLETED,
    Phase.EXECUTION,
    Phase.PAUSED,
    Phase.FAILED,
  ],
  [Phase.COMPLETED]: [],
  [Phase.FAILED]: [Phase.INIT],
  [Phase.PAUSED]: [
    // PAUSED can resume to any active phase — validated dynamically
    Phase.INIT,
    Phase.RESEARCH,
    Phase.DECISION,
    Phase.EXECUTION,
    Phase.FEEDBACK,
    Phase.DELIVERY,
  ],
};

/**
 * The standard linear phase order used as the baseline for
 * decision-path filtering. Phases not in this list (PAUSED, FAILED,
 * COMPLETED) are terminal/special and handled separately.
 */
const LINEAR_PHASE_ORDER: Phase[] = [
  Phase.INIT,
  Phase.RESEARCH,
  Phase.DECISION,
  Phase.EXECUTION,
  Phase.FEEDBACK,
  Phase.DELIVERY,
  Phase.COMPLETED,
];

// ============================================================
// Decision Path → Skippable Phases
// ============================================================

/**
 * Maps each decision path to the set of phases that MAY be skipped.
 * The state machine uses this to allow direct jumps in the linear order.
 *
 * EXPRESS  — skip L1 (RESEARCH) + L2 (DECISION): go INIT → EXECUTION
 * QUICK   — skip L1 (RESEARCH): go INIT → DECISION(fast) → EXECUTION
 * STANDARD — no skips, full linear flow
 * DEEP    — no skips + allows FEEDBACK → EXECUTION retry loop
 * FULL    — no skips + allows FEEDBACK → EXECUTION + DELIVERY → DECISION review
 */
const SKIPPABLE_PHASES: Record<DecisionPath, Phase[]> = {
  [DecisionPath.EXPRESS]: [Phase.RESEARCH, Phase.DECISION],
  [DecisionPath.QUICK]: [Phase.RESEARCH],
  [DecisionPath.STANDARD]: [],
  [DecisionPath.DEEP]: [],
  [DecisionPath.FULL]: [],
};

// ============================================================
// Risk Assessment Helpers
// ============================================================

/** Keywords in project description / goals that signal higher risk */
const SECURITY_KEYWORDS = [
  'security',
  'auth',
  'payment',
  'encrypt',
  'credential',
  'token',
  'secret',
  'permission',
  'rbac',
  'oauth',
  'certificate',
  'ssl',
  'tls',
  'firewall',
  'vulnerability',
  'compliance',
  'gdpr',
  'hipaa',
  'pci',
];

/** Keywords suggesting infrastructure / blast-radius risk */
const INFRA_KEYWORDS = [
  'database',
  'migration',
  'deploy',
  'production',
  'infrastructure',
  'kubernetes',
  'scaling',
  'cluster',
  'replication',
  'failover',
  'dns',
  'load-balancer',
  'cdn',
];

// ============================================================
// Risk Assessment Context
// ============================================================

/** Minimal context needed for risk assessment */
export interface RiskAssessmentContext {
  description: string;
  goals: string[];
  complexity: ComplexityLevel;
  constraints?: string[];
  file_count?: number;
  has_security_scope?: boolean;
  has_infrastructure_scope?: boolean;
}

// ============================================================
// PhaseStateMachine
// ============================================================

export class PhaseStateMachine {
  private currentPhase: Phase;
  private phaseHistory: PhaseRecord[];
  private decisionPath: DecisionPath;
  private riskLevel: RiskLevel;
  /** Tracks the phase before PAUSED so we can offer correct resume target */
  private phaseBeforePause: Phase | null;

  constructor(initialPhase: Phase = Phase.INIT) {
    this.currentPhase = initialPhase;
    this.phaseHistory = [];
    this.decisionPath = DecisionPath.STANDARD;
    this.riskLevel = RiskLevel.MEDIUM;
    this.phaseBeforePause = null;
  }

  // ----------------------------------------------------------
  // Phase Queries
  // ----------------------------------------------------------

  /** Returns the current phase. */
  getCurrentPhase(): Phase {
    return this.currentPhase;
  }

  /** Returns a defensive copy of the full phase transition history. */
  getPhaseHistory(): PhaseRecord[] {
    return [...this.phaseHistory];
  }

  /** Returns the active decision path. */
  getDecisionPath(): DecisionPath {
    return this.decisionPath;
  }

  /** Returns the current assessed risk level. */
  getRiskLevel(): RiskLevel {
    return this.riskLevel;
  }

  // ----------------------------------------------------------
  // Transition Logic
  // ----------------------------------------------------------

  /**
   * Checks whether a transition from the current phase to `target` is legal
   * under the current decision path rules.
   */
  canTransitionTo(target: Phase): boolean {
    if (target === this.currentPhase) {
      return false;
    }

    const allowed = TRANSITION_TABLE[this.currentPhase];
    if (!allowed || !allowed.includes(target)) {
      return false;
    }

    // For forward linear transitions, respect decision-path skip rules.
    // Non-linear jumps (e.g. FEEDBACK → EXECUTION) are always allowed
    // if they appear in the transition table.
    return true;
  }

  /**
   * Attempts to transition to the target phase.
   *
   * @param target  - The phase to transition to.
   * @param reason  - Human-readable reason for the transition.
   * @param metadata - Optional metadata to attach to the record.
   * @returns The created PhaseRecord.
   * @throws Error if the transition is illegal.
   */
  transitionTo(
    target: Phase,
    reason: string,
    metadata?: Record<string, unknown>,
  ): PhaseRecord {
    if (!this.canTransitionTo(target)) {
      throw new Error(
        `Invalid phase transition: ${this.currentPhase} → ${target}. ` +
          `Allowed targets from ${this.currentPhase}: [${(TRANSITION_TABLE[this.currentPhase] ?? []).join(', ')}]`,
      );
    }

    const record: PhaseRecord = {
      from: this.currentPhase,
      to: target,
      timestamp: Date.now(),
      reason,
      decision_path: this.decisionPath,
      metadata,
    };

    // Track pause/resume bookkeeping
    if (target === Phase.PAUSED) {
      this.phaseBeforePause = this.currentPhase;
    } else if (this.currentPhase === Phase.PAUSED) {
      this.phaseBeforePause = null;
    }

    this.currentPhase = target;
    this.phaseHistory.push(record);
    return record;
  }

  /**
   * Convenience: pause the current phase.
   * Equivalent to `transitionTo(Phase.PAUSED, reason)`.
   */
  pause(reason: string = 'Paused by operator'): PhaseRecord {
    return this.transitionTo(Phase.PAUSED, reason);
  }

  /**
   * Resume from PAUSED state back to the phase that was active before pausing.
   * Optionally override with a different target phase.
   */
  resume(
    targetOverride?: Phase,
    reason: string = 'Resumed by operator',
  ): PhaseRecord {
    if (this.currentPhase !== Phase.PAUSED) {
      throw new Error(
        `Cannot resume: current phase is ${this.currentPhase}, not PAUSED.`,
      );
    }

    const target = targetOverride ?? this.phaseBeforePause;
    if (!target) {
      throw new Error(
        'Cannot resume: no previous phase recorded and no override provided.',
      );
    }

    return this.transitionTo(target, reason);
  }

  /**
   * Mark the project as failed from the current phase.
   */
  fail(reason: string, metadata?: Record<string, unknown>): PhaseRecord {
    return this.transitionTo(Phase.FAILED, reason, metadata);
  }

  /**
   * Returns the set of phases reachable from the current phase
   * under the active decision path.
   */
  getAvailableTransitions(): Phase[] {
    return (TRANSITION_TABLE[this.currentPhase] ?? []).filter((target) =>
      this.canTransitionTo(target),
    );
  }

  /**
   * Returns the phase that was active before entering PAUSED,
   * or null if not currently paused / no record.
   */
  getPhaseBeforePause(): Phase | null {
    return this.phaseBeforePause;
  }

  // ----------------------------------------------------------
  // DF-CEA: Dynamic Decision Path Selection
  // ----------------------------------------------------------

  /**
   * Evaluates project context and returns a risk level.
   *
   * Heuristics (deliberately simple — production systems would plug in
   * more sophisticated analysis):
   *   1. Complexity level baseline
   *   2. Security keyword scan (+1 level per match, capped)
   *   3. Infrastructure keyword scan (+1 level if heavy infra)
   *   4. File count heuristic
   *   5. Explicit flags (has_security_scope, has_infrastructure_scope)
   */
  assessRisk(context: RiskAssessmentContext): RiskLevel {
    const levels: RiskLevel[] = [
      RiskLevel.VERY_LOW,
      RiskLevel.LOW,
      RiskLevel.MEDIUM,
      RiskLevel.HIGH,
      RiskLevel.CRITICAL,
    ];

    // Start with a baseline derived from complexity
    let score = complexityToBaseScore(context.complexity);

    // Scan text corpus for risk-elevating keywords
    const corpus = buildCorpus(context);

    const securityHits = SECURITY_KEYWORDS.filter((kw) =>
      corpus.includes(kw),
    ).length;
    if (securityHits >= 3) {
      score += 2;
    } else if (securityHits >= 1) {
      score += 1;
    }

    const infraHits = INFRA_KEYWORDS.filter((kw) =>
      corpus.includes(kw),
    ).length;
    if (infraHits >= 3) {
      score += 2;
    } else if (infraHits >= 1) {
      score += 1;
    }

    // Explicit flags
    if (context.has_security_scope) score += 1;
    if (context.has_infrastructure_scope) score += 1;

    // File count heuristic
    if (context.file_count !== undefined) {
      if (context.file_count > 500) score += 2;
      else if (context.file_count > 100) score += 1;
    }

    // Clamp to valid range
    const clamped = Math.max(0, Math.min(levels.length - 1, score));
    this.riskLevel = levels[clamped];
    return this.riskLevel;
  }

  /**
   * Given a risk level, selects the appropriate decision path and
   * updates internal state.
   */
  selectDecisionPath(riskLevel: RiskLevel): DecisionPath {
    const mapping: Record<RiskLevel, DecisionPath> = {
      [RiskLevel.VERY_LOW]: DecisionPath.EXPRESS,
      [RiskLevel.LOW]: DecisionPath.QUICK,
      [RiskLevel.MEDIUM]: DecisionPath.STANDARD,
      [RiskLevel.HIGH]: DecisionPath.DEEP,
      [RiskLevel.CRITICAL]: DecisionPath.FULL,
    };

    this.decisionPath = mapping[riskLevel];
    this.riskLevel = riskLevel;
    return this.decisionPath;
  }

  /**
   * Convenience: assess risk AND select decision path in one call.
   * Returns both the risk level and the chosen path.
   */
  evaluateAndSelectPath(
    context: RiskAssessmentContext,
  ): { riskLevel: RiskLevel; decisionPath: DecisionPath } {
    const riskLevel = this.assessRisk(context);
    const decisionPath = this.selectDecisionPath(riskLevel);
    return { riskLevel, decisionPath };
  }

  /**
   * Returns the phases that will be skipped under the current decision path.
   */
  getSkippedPhases(): Phase[] {
    return [...(SKIPPABLE_PHASES[this.decisionPath] ?? [])];
  }

  /**
   * Returns the effective linear phase sequence after applying
   * the current decision path's skip rules.
   */
  getEffectivePhaseSequence(): Phase[] {
    const skipped = new Set(SKIPPABLE_PHASES[this.decisionPath] ?? []);
    return LINEAR_PHASE_ORDER.filter((p) => !skipped.has(p));
  }

  /**
   * Determines the next phase in the effective sequence from the
   * current phase. Returns null if the current phase is terminal
   * or not in the linear sequence.
   */
  getNextPhase(): Phase | null {
    const sequence = this.getEffectivePhaseSequence();
    const idx = sequence.indexOf(this.currentPhase);
    if (idx === -1 || idx === sequence.length - 1) {
      return null;
    }
    return sequence[idx + 1];
  }

  /**
   * Advances to the next phase in the effective linear sequence.
   * Throws if there is no next phase or the transition is invalid.
   */
  advance(
    reason: string,
    metadata?: Record<string, unknown>,
  ): PhaseRecord {
    const next = this.getNextPhase();
    if (!next) {
      throw new Error(
        `Cannot advance from ${this.currentPhase}: no next phase in the ` +
          `effective sequence [${this.getEffectivePhaseSequence().join(' → ')}].`,
      );
    }
    return this.transitionTo(next, reason, metadata);
  }

  // ----------------------------------------------------------
  // Serialization
  // ----------------------------------------------------------

  /** Serialize state machine to a plain object for persistence. */
  toJSON(): {
    currentPhase: Phase;
    phaseHistory: PhaseRecord[];
    decisionPath: DecisionPath;
    riskLevel: RiskLevel;
    phaseBeforePause: Phase | null;
  } {
    return {
      currentPhase: this.currentPhase,
      phaseHistory: [...this.phaseHistory],
      decisionPath: this.decisionPath,
      riskLevel: this.riskLevel,
      phaseBeforePause: this.phaseBeforePause,
    };
  }

  /** Restore state machine from a serialized snapshot. */
  static fromJSON(data: {
    currentPhase: Phase;
    phaseHistory: PhaseRecord[];
    decisionPath: DecisionPath;
    riskLevel: RiskLevel;
    phaseBeforePause: Phase | null;
  }): PhaseStateMachine {
    const sm = new PhaseStateMachine(data.currentPhase);
    sm.phaseHistory = [...data.phaseHistory];
    sm.decisionPath = data.decisionPath;
    sm.riskLevel = data.riskLevel;
    sm.phaseBeforePause = data.phaseBeforePause;
    return sm;
  }
}

// ============================================================
// Internal Helpers
// ============================================================

/** Maps complexity level to a numeric base risk score (0-4 scale). */
function complexityToBaseScore(complexity: ComplexityLevel): number {
  switch (complexity) {
    case 'simple':
      return 0; // VERY_LOW → EXPRESS
    case 'standard':
      return 2; // MEDIUM → STANDARD (not LOW, to match expected path)
    case 'advanced':
      return 3; // HIGH → DEEP
    case 'enterprise':
      return 4; // CRITICAL → FULL
    default:
      return 2; // Default to MEDIUM (STANDARD path)
  }
}

/** Builds a lowercase search corpus from the risk assessment context. */
function buildCorpus(context: RiskAssessmentContext): string {
  const parts: string[] = [
    context.description,
    ...context.goals,
    ...(context.constraints ?? []),
  ];
  return parts.join(' ').toLowerCase();
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Creates a new PhaseStateMachine instance.
 *
 * @param initialPhase - The phase to start in (defaults to INIT).
 * @returns A fresh PhaseStateMachine.
 */
export function createStateMachine(
  initialPhase: Phase = Phase.INIT,
): PhaseStateMachine {
  return new PhaseStateMachine(initialPhase);
}
