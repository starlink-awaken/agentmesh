/**
 * Tests for PhaseStateMachine - phase transitions, DF-CEA paths,
 * risk assessment, pause/resume, serialization.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import {
  PhaseStateMachine,
  createStateMachine,
  type RiskAssessmentContext,
} from '../src/state-machine.ts';
import { Phase, DecisionPath, RiskLevel } from '../src/types.ts';

describe('PhaseStateMachine', () => {
  let sm: PhaseStateMachine;

  beforeEach(() => {
    sm = new PhaseStateMachine();
  });

  // ============================================================
  // Construction & Factory
  // ============================================================

  describe('construction', () => {
    test('defaults to Phase.INIT', () => {
      expect(sm.getCurrentPhase()).toBe(Phase.INIT);
    });

    test('accepts a custom initial phase', () => {
      const custom = new PhaseStateMachine(Phase.EXECUTION);
      expect(custom.getCurrentPhase()).toBe(Phase.EXECUTION);
    });

    test('starts with empty phase history', () => {
      expect(sm.getPhaseHistory()).toEqual([]);
    });

    test('defaults to STANDARD decision path', () => {
      expect(sm.getDecisionPath()).toBe(DecisionPath.STANDARD);
    });

    test('defaults to MEDIUM risk level', () => {
      expect(sm.getRiskLevel()).toBe(RiskLevel.MEDIUM);
    });

    test('createStateMachine factory works', () => {
      const factory = createStateMachine(Phase.RESEARCH);
      expect(factory.getCurrentPhase()).toBe(Phase.RESEARCH);
    });
  });

  // ============================================================
  // canTransitionTo
  // ============================================================

  describe('canTransitionTo', () => {
    test('allows valid forward transitions from INIT', () => {
      expect(sm.canTransitionTo(Phase.RESEARCH)).toBe(true);
      expect(sm.canTransitionTo(Phase.DECISION)).toBe(true);
      expect(sm.canTransitionTo(Phase.EXECUTION)).toBe(true);
    });

    test('disallows self-transition', () => {
      expect(sm.canTransitionTo(Phase.INIT)).toBe(false);
    });

    test('allows transition to PAUSED from any active phase', () => {
      expect(sm.canTransitionTo(Phase.PAUSED)).toBe(true);
    });

    test('allows transition to FAILED from any active phase', () => {
      expect(sm.canTransitionTo(Phase.FAILED)).toBe(true);
    });

    test('disallows invalid transitions from INIT', () => {
      expect(sm.canTransitionTo(Phase.FEEDBACK)).toBe(false);
      expect(sm.canTransitionTo(Phase.DELIVERY)).toBe(false);
      expect(sm.canTransitionTo(Phase.COMPLETED)).toBe(false);
    });

    test('disallows transitions from COMPLETED (terminal)', () => {
      const completed = new PhaseStateMachine(Phase.COMPLETED);
      expect(completed.canTransitionTo(Phase.INIT)).toBe(false);
      expect(completed.canTransitionTo(Phase.EXECUTION)).toBe(false);
    });

    test('allows FAILED -> INIT (restart)', () => {
      const failed = new PhaseStateMachine(Phase.FAILED);
      expect(failed.canTransitionTo(Phase.INIT)).toBe(true);
    });

    test('allows FEEDBACK -> EXECUTION (retry loop)', () => {
      const fb = new PhaseStateMachine(Phase.FEEDBACK);
      expect(fb.canTransitionTo(Phase.EXECUTION)).toBe(true);
    });

    test('allows DELIVERY -> EXECUTION (hotfix)', () => {
      const del = new PhaseStateMachine(Phase.DELIVERY);
      expect(del.canTransitionTo(Phase.EXECUTION)).toBe(true);
    });
  });

  // ============================================================
  // transitionTo
  // ============================================================

  describe('transitionTo', () => {
    test('transitions and returns a PhaseRecord', () => {
      const record = sm.transitionTo(Phase.RESEARCH, 'starting research');
      expect(record.from).toBe(Phase.INIT);
      expect(record.to).toBe(Phase.RESEARCH);
      expect(record.reason).toBe('starting research');
      expect(record.timestamp).toBeGreaterThan(0);
      expect(record.decision_path).toBe(DecisionPath.STANDARD);
    });

    test('updates current phase after transition', () => {
      sm.transitionTo(Phase.EXECUTION, 'skip to exec');
      expect(sm.getCurrentPhase()).toBe(Phase.EXECUTION);
    });

    test('records transition in phase history', () => {
      sm.transitionTo(Phase.RESEARCH, 'r1');
      sm.transitionTo(Phase.DECISION, 'r2');
      const history = sm.getPhaseHistory();
      expect(history.length).toBe(2);
      expect(history[0].from).toBe(Phase.INIT);
      expect(history[1].from).toBe(Phase.RESEARCH);
    });

    test('includes metadata when provided', () => {
      const record = sm.transitionTo(Phase.RESEARCH, 'test', { key: 'val' });
      expect(record.metadata).toEqual({ key: 'val' });
    });

    test('throws on invalid transition', () => {
      expect(() => sm.transitionTo(Phase.FEEDBACK, 'bad')).toThrow(
        /Invalid phase transition/,
      );
    });

    test('throws on self-transition', () => {
      expect(() => sm.transitionTo(Phase.INIT, 'noop')).toThrow(
        /Invalid phase transition/,
      );
    });

    test('history is a defensive copy', () => {
      sm.transitionTo(Phase.RESEARCH, 'r');
      const h1 = sm.getPhaseHistory();
      h1.push({
        from: Phase.INIT,
        to: Phase.COMPLETED,
        timestamp: 0,
        reason: 'fake',
      });
      expect(sm.getPhaseHistory().length).toBe(1);
    });
  });

  // ============================================================
  // Pause / Resume
  // ============================================================

  describe('pause and resume', () => {
    test('pause transitions to PAUSED', () => {
      sm.transitionTo(Phase.EXECUTION, 'go exec');
      const record = sm.pause('operator break');
      expect(sm.getCurrentPhase()).toBe(Phase.PAUSED);
      expect(record.from).toBe(Phase.EXECUTION);
      expect(record.to).toBe(Phase.PAUSED);
    });

    test('pause records the phase before pause', () => {
      sm.transitionTo(Phase.EXECUTION, 'go');
      sm.pause();
      expect(sm.getPhaseBeforePause()).toBe(Phase.EXECUTION);
    });

    test('resume returns to the phase before pause', () => {
      sm.transitionTo(Phase.EXECUTION, 'go');
      sm.pause();
      const record = sm.resume();
      expect(sm.getCurrentPhase()).toBe(Phase.EXECUTION);
      expect(record.from).toBe(Phase.PAUSED);
      expect(record.to).toBe(Phase.EXECUTION);
    });

    test('resume with override goes to a different phase', () => {
      sm.transitionTo(Phase.EXECUTION, 'go');
      sm.pause();
      sm.resume(Phase.DELIVERY);
      expect(sm.getCurrentPhase()).toBe(Phase.DELIVERY);
    });

    test('resume clears phaseBeforePause', () => {
      sm.transitionTo(Phase.EXECUTION, 'go');
      sm.pause();
      sm.resume();
      expect(sm.getPhaseBeforePause()).toBeNull();
    });

    test('resume throws when not paused', () => {
      expect(() => sm.resume()).toThrow(/Cannot resume/);
    });

    test('resume throws when no previous phase and no override', () => {
      // Manually create a paused machine without phaseBeforePause
      const paused = PhaseStateMachine.fromJSON({
        currentPhase: Phase.PAUSED,
        phaseHistory: [],
        decisionPath: DecisionPath.STANDARD,
        riskLevel: RiskLevel.MEDIUM,
        phaseBeforePause: null,
      });
      expect(() => paused.resume()).toThrow(/Cannot resume/);
    });
  });

  // ============================================================
  // fail()
  // ============================================================

  describe('fail', () => {
    test('transitions to FAILED', () => {
      const record = sm.fail('critical error', { code: 500 });
      expect(sm.getCurrentPhase()).toBe(Phase.FAILED);
      expect(record.to).toBe(Phase.FAILED);
      expect(record.metadata).toEqual({ code: 500 });
    });
  });

  // ============================================================
  // getAvailableTransitions
  // ============================================================

  describe('getAvailableTransitions', () => {
    test('returns valid targets from INIT', () => {
      const available = sm.getAvailableTransitions();
      expect(available).toContain(Phase.RESEARCH);
      expect(available).toContain(Phase.EXECUTION);
      expect(available).toContain(Phase.PAUSED);
      expect(available).toContain(Phase.FAILED);
    });

    test('returns empty for COMPLETED', () => {
      const completed = new PhaseStateMachine(Phase.COMPLETED);
      expect(completed.getAvailableTransitions()).toEqual([]);
    });
  });

  // ============================================================
  // DF-CEA: Risk Assessment
  // ============================================================

  describe('assessRisk', () => {
    test('simple project with no keywords returns VERY_LOW', () => {
      const ctx: RiskAssessmentContext = {
        description: 'A simple todo app',
        goals: ['build todo list'],
        complexity: 'simple',
      };
      const risk = sm.assessRisk(ctx);
      expect(risk).toBe(RiskLevel.VERY_LOW);
    });

    test('enterprise project baseline is CRITICAL', () => {
      const ctx: RiskAssessmentContext = {
        description: 'A basic tool',
        goals: ['build it'],
        complexity: 'enterprise',
      };
      const risk = sm.assessRisk(ctx);
      expect(risk).toBe(RiskLevel.CRITICAL);
    });

    test('security keywords elevate risk', () => {
      const ctx: RiskAssessmentContext = {
        description: 'oauth authentication with token encryption and credential management',
        goals: ['implement security'],
        complexity: 'simple',
      };
      const risk = sm.assessRisk(ctx);
      // 3+ security keywords => +2, base 0 => score 2 => MEDIUM
      expect(risk).toBe(RiskLevel.MEDIUM);
    });

    test('infrastructure keywords elevate risk', () => {
      const ctx: RiskAssessmentContext = {
        description: 'database migration with kubernetes deployment and replication',
        goals: ['deploy'],
        complexity: 'simple',
      };
      const risk = sm.assessRisk(ctx);
      // 3+ infra => +2, base 0 => score 2 => MEDIUM
      expect(risk).toBe(RiskLevel.MEDIUM);
    });

    test('explicit security scope flag elevates risk', () => {
      const ctx: RiskAssessmentContext = {
        description: 'simple app',
        goals: ['build'],
        complexity: 'simple',
        has_security_scope: true,
      };
      const risk = sm.assessRisk(ctx);
      // base 0 + 1 flag => LOW
      expect(risk).toBe(RiskLevel.LOW);
    });

    test('large file count elevates risk', () => {
      const ctx: RiskAssessmentContext = {
        description: 'simple app',
        goals: ['build'],
        complexity: 'simple',
        file_count: 600,
      };
      const risk = sm.assessRisk(ctx);
      // base 0 + 2 (file_count > 500) => MEDIUM
      expect(risk).toBe(RiskLevel.MEDIUM);
    });

    test('risk is clamped to CRITICAL maximum', () => {
      const ctx: RiskAssessmentContext = {
        description:
          'security oauth authentication token encryption credential database migration kubernetes deployment replication',
        goals: ['compliance gdpr pci hipaa'],
        complexity: 'enterprise',
        has_security_scope: true,
        has_infrastructure_scope: true,
        file_count: 1000,
      };
      const risk = sm.assessRisk(ctx);
      expect(risk).toBe(RiskLevel.CRITICAL);
    });

    test('stores the assessed risk level', () => {
      const ctx: RiskAssessmentContext = {
        description: 'simple',
        goals: ['build'],
        complexity: 'simple',
      };
      sm.assessRisk(ctx);
      expect(sm.getRiskLevel()).toBe(RiskLevel.VERY_LOW);
    });
  });

  // ============================================================
  // DF-CEA: Decision Path Selection
  // ============================================================

  describe('selectDecisionPath', () => {
    test('VERY_LOW risk => EXPRESS path', () => {
      expect(sm.selectDecisionPath(RiskLevel.VERY_LOW)).toBe(
        DecisionPath.EXPRESS,
      );
    });

    test('LOW risk => QUICK path', () => {
      expect(sm.selectDecisionPath(RiskLevel.LOW)).toBe(DecisionPath.QUICK);
    });

    test('MEDIUM risk => STANDARD path', () => {
      expect(sm.selectDecisionPath(RiskLevel.MEDIUM)).toBe(
        DecisionPath.STANDARD,
      );
    });

    test('HIGH risk => DEEP path', () => {
      expect(sm.selectDecisionPath(RiskLevel.HIGH)).toBe(DecisionPath.DEEP);
    });

    test('CRITICAL risk => FULL path', () => {
      expect(sm.selectDecisionPath(RiskLevel.CRITICAL)).toBe(
        DecisionPath.FULL,
      );
    });

    test('updates internal state', () => {
      sm.selectDecisionPath(RiskLevel.HIGH);
      expect(sm.getDecisionPath()).toBe(DecisionPath.DEEP);
      expect(sm.getRiskLevel()).toBe(RiskLevel.HIGH);
    });
  });

  // ============================================================
  // evaluateAndSelectPath
  // ============================================================

  describe('evaluateAndSelectPath', () => {
    test('combines risk assessment and path selection', () => {
      const ctx: RiskAssessmentContext = {
        description: 'a simple app',
        goals: ['build'],
        complexity: 'simple',
      };
      const result = sm.evaluateAndSelectPath(ctx);
      expect(result.riskLevel).toBe(RiskLevel.VERY_LOW);
      expect(result.decisionPath).toBe(DecisionPath.EXPRESS);
    });
  });

  // ============================================================
  // Skipped Phases & Effective Sequence
  // ============================================================

  describe('skipped phases and effective sequence', () => {
    test('EXPRESS skips RESEARCH and DECISION', () => {
      sm.selectDecisionPath(RiskLevel.VERY_LOW);
      expect(sm.getSkippedPhases()).toContain(Phase.RESEARCH);
      expect(sm.getSkippedPhases()).toContain(Phase.DECISION);
    });

    test('QUICK skips RESEARCH only', () => {
      sm.selectDecisionPath(RiskLevel.LOW);
      const skipped = sm.getSkippedPhases();
      expect(skipped).toContain(Phase.RESEARCH);
      expect(skipped).not.toContain(Phase.DECISION);
    });

    test('STANDARD skips nothing', () => {
      sm.selectDecisionPath(RiskLevel.MEDIUM);
      expect(sm.getSkippedPhases()).toEqual([]);
    });

    test('EXPRESS effective sequence excludes RESEARCH & DECISION', () => {
      sm.selectDecisionPath(RiskLevel.VERY_LOW);
      const seq = sm.getEffectivePhaseSequence();
      expect(seq).not.toContain(Phase.RESEARCH);
      expect(seq).not.toContain(Phase.DECISION);
      expect(seq).toContain(Phase.INIT);
      expect(seq).toContain(Phase.EXECUTION);
      expect(seq).toContain(Phase.FEEDBACK);
      expect(seq).toContain(Phase.DELIVERY);
      expect(seq).toContain(Phase.COMPLETED);
    });

    test('STANDARD effective sequence is the full linear order', () => {
      sm.selectDecisionPath(RiskLevel.MEDIUM);
      const seq = sm.getEffectivePhaseSequence();
      expect(seq).toEqual([
        Phase.INIT,
        Phase.RESEARCH,
        Phase.DECISION,
        Phase.EXECUTION,
        Phase.FEEDBACK,
        Phase.DELIVERY,
        Phase.COMPLETED,
      ]);
    });
  });

  // ============================================================
  // getNextPhase & advance
  // ============================================================

  describe('getNextPhase', () => {
    test('returns RESEARCH from INIT on STANDARD path', () => {
      expect(sm.getNextPhase()).toBe(Phase.RESEARCH);
    });

    test('returns EXECUTION from INIT on EXPRESS path', () => {
      sm.selectDecisionPath(RiskLevel.VERY_LOW);
      expect(sm.getNextPhase()).toBe(Phase.EXECUTION);
    });

    test('returns null from COMPLETED', () => {
      const completed = new PhaseStateMachine(Phase.COMPLETED);
      expect(completed.getNextPhase()).toBeNull();
    });

    test('returns null from non-linear phases like PAUSED', () => {
      const paused = new PhaseStateMachine(Phase.PAUSED);
      expect(paused.getNextPhase()).toBeNull();
    });
  });

  describe('advance', () => {
    test('advances through full STANDARD sequence', () => {
      sm.advance('step 1'); // INIT -> RESEARCH
      expect(sm.getCurrentPhase()).toBe(Phase.RESEARCH);
      sm.advance('step 2'); // RESEARCH -> DECISION
      expect(sm.getCurrentPhase()).toBe(Phase.DECISION);
      sm.advance('step 3'); // DECISION -> EXECUTION
      expect(sm.getCurrentPhase()).toBe(Phase.EXECUTION);
      sm.advance('step 4'); // EXECUTION -> FEEDBACK
      expect(sm.getCurrentPhase()).toBe(Phase.FEEDBACK);
      sm.advance('step 5'); // FEEDBACK -> DELIVERY
      expect(sm.getCurrentPhase()).toBe(Phase.DELIVERY);
      sm.advance('step 6'); // DELIVERY -> COMPLETED
      expect(sm.getCurrentPhase()).toBe(Phase.COMPLETED);
    });

    test('advances through EXPRESS sequence skipping RESEARCH and DECISION', () => {
      sm.selectDecisionPath(RiskLevel.VERY_LOW);
      sm.advance('step 1'); // INIT -> EXECUTION
      expect(sm.getCurrentPhase()).toBe(Phase.EXECUTION);
      sm.advance('step 2'); // EXECUTION -> FEEDBACK
      expect(sm.getCurrentPhase()).toBe(Phase.FEEDBACK);
    });

    test('throws when cannot advance from COMPLETED', () => {
      const completed = new PhaseStateMachine(Phase.COMPLETED);
      expect(() => completed.advance('nope')).toThrow(/Cannot advance/);
    });

    test('records metadata in phase history', () => {
      sm.advance('go', { custom: true });
      const history = sm.getPhaseHistory();
      expect(history[0].metadata).toEqual({ custom: true });
    });
  });

  // ============================================================
  // Serialization (toJSON / fromJSON)
  // ============================================================

  describe('serialization', () => {
    test('toJSON captures full state', () => {
      sm.selectDecisionPath(RiskLevel.HIGH);
      sm.transitionTo(Phase.EXECUTION, 'fast');
      sm.pause('lunch');
      const json = sm.toJSON();
      expect(json.currentPhase).toBe(Phase.PAUSED);
      expect(json.decisionPath).toBe(DecisionPath.DEEP);
      expect(json.riskLevel).toBe(RiskLevel.HIGH);
      expect(json.phaseBeforePause).toBe(Phase.EXECUTION);
      expect(json.phaseHistory.length).toBe(2);
    });

    test('fromJSON restores identical state', () => {
      sm.selectDecisionPath(RiskLevel.HIGH);
      sm.transitionTo(Phase.EXECUTION, 'fast');
      const json = sm.toJSON();
      const restored = PhaseStateMachine.fromJSON(json);
      expect(restored.getCurrentPhase()).toBe(Phase.EXECUTION);
      expect(restored.getDecisionPath()).toBe(DecisionPath.DEEP);
      expect(restored.getRiskLevel()).toBe(RiskLevel.HIGH);
      expect(restored.getPhaseHistory().length).toBe(1);
    });

    test('round-trip through JSON.stringify/parse works', () => {
      sm.transitionTo(Phase.RESEARCH, 'go');
      const serialized = JSON.stringify(sm.toJSON());
      const parsed = JSON.parse(serialized);
      const restored = PhaseStateMachine.fromJSON(parsed);
      expect(restored.getCurrentPhase()).toBe(Phase.RESEARCH);
    });
  });
});
