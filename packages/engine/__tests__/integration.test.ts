/**
 * Integration tests - full Phase 0-5 flow through the orchestrator.
 * Tests the complete lifecycle: create -> start -> advance phases ->
 * checkpoint -> rollback -> shutdown.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HoneycombOrchestrator } from '../src/orchestrator.ts';
import {
  Phase,
  EngineEvent,
  DecisionPath,
  RiskLevel,
} from '../src/types.ts';
import type { EngineConfig, ProjectConfig, EngineEventPayload } from '../src/types.ts';

// ============================================================
// Helpers
// ============================================================

let tempDir: string;

function setupTestEnvironment(): {
  dbPath: string;
  agentsDir: string;
  outputDir: string;
} {
  tempDir = mkdtempSync(join(tmpdir(), 'hc-integration-'));
  const dbPath = join(tempDir, 'test.db');
  const agentsDir = join(tempDir, 'agents');
  const outputDir = join(tempDir, 'output');
  mkdirSync(outputDir, { recursive: true });

  // Create minimal agent files for each layer
  const layers = [
    { dir: 'layer-1-research', name: 'researcher', tools: "['read', 'search']" },
    { dir: 'layer-2-decision', name: 'decider', tools: "['read']" },
    { dir: 'layer-3-execution', name: 'executor', tools: "['read', 'edit', 'execute']" },
    { dir: 'layer-4-feedback', name: 'reviewer', tools: "['read']" },
    { dir: 'governance', name: 'guardian', tools: "['read']" },
  ];

  for (const layer of layers) {
    const layerDir = join(agentsDir, layer.dir);
    mkdirSync(layerDir, { recursive: true });
    writeFileSync(
      join(layerDir, `${layer.name}.md`),
      `---
name: ${layer.name}
description: Test ${layer.name} agent
tools: ${layer.tools}
---

# ${layer.name}

Test agent body.
`,
    );
  }

  return { dbPath, agentsDir, outputDir };
}

function createTestOrchestrator(
  overrides?: Partial<EngineConfig>,
): HoneycombOrchestrator {
  const { dbPath, agentsDir, outputDir } = setupTestEnvironment();

  return new HoneycombOrchestrator({
    db_path: dbPath,
    agents_root: agentsDir,
    output_dir: outputDir,
    log_level: 'error', // minimize noise during tests
    max_concurrent_agents: 5,
    auto_checkpoint: true,
    ...overrides,
  });
}

function makeProjectConfig(
  overrides?: Partial<ProjectConfig>,
): ProjectConfig {
  return {
    name: 'Test Project',
    description: 'A test project for integration testing',
    archetype: 'software-dev',
    goals: ['build API', 'deploy to production'],
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe('Integration: HoneycombOrchestrator', () => {
  let orchestrator: HoneycombOrchestrator;

  afterEach(() => {
    try {
      orchestrator?.shutdown();
    } catch {
      // ignore shutdown errors
    }
    try {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  });

  // ============================================================
  // Project Creation
  // ============================================================

  describe('project creation', () => {
    test('creates a project with correct initial state', () => {
      orchestrator = createTestOrchestrator();
      const state = orchestrator.createProject(makeProjectConfig());

      expect(state.project_id).toBeTruthy();
      expect(state.project_name).toBe('Test Project');
      expect(state.current_phase).toBe(Phase.INIT);
      expect(state.archetype).toBe('software-dev');
      expect(state.complexity).toBeTruthy();
      expect(state.decision_path).toBeTruthy();
      expect(state.risk_level).toBeTruthy();
      expect(state.phase_history).toEqual([]);
      expect(state.total_token_usage).toBe(0);
    });

    test('persists project state to database', () => {
      orchestrator = createTestOrchestrator();
      const state = orchestrator.createProject(makeProjectConfig());

      const loaded = orchestrator.loadProjectState(state.project_id);
      expect(loaded).not.toBeNull();
      expect(loaded!.project_id).toBe(state.project_id);
    });

    test('uses explicit complexity when provided', () => {
      orchestrator = createTestOrchestrator();
      const state = orchestrator.createProject(
        makeProjectConfig({ complexity: 'enterprise' }),
      );
      expect(state.complexity).toBe('enterprise');
    });

    test('uses explicit token budget when provided', () => {
      orchestrator = createTestOrchestrator();
      const state = orchestrator.createProject(
        makeProjectConfig({ token_budget: 50000 }),
      );
      expect(state.token_budget).toBe(50000);
    });

    test('emits PROJECT_CREATED event', () => {
      orchestrator = createTestOrchestrator();
      const events: EngineEventPayload[] = [];
      orchestrator.on(EngineEvent.PROJECT_CREATED, (payload) =>
        events.push(payload),
      );

      orchestrator.createProject(makeProjectConfig());
      expect(events.length).toBe(1);
      expect(events[0].event).toBe(EngineEvent.PROJECT_CREATED);
    });
  });

  // ============================================================
  // Full Lifecycle (startProject)
  // ============================================================

  describe('full lifecycle', () => {
    test('startProject runs through all phases to completion', async () => {
      orchestrator = createTestOrchestrator();
      const state = orchestrator.createProject(makeProjectConfig());
      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState();
      expect(finalState).not.toBeNull();
      expect(finalState!.current_phase).toBe(Phase.COMPLETED);
      expect(finalState!.completed_at).toBeGreaterThan(0);
      expect(finalState!.total_token_usage).toBeGreaterThan(0);
    });

    test('emits phase events during execution', async () => {
      orchestrator = createTestOrchestrator();
      const enteredPhases: string[] = [];

      orchestrator.on(EngineEvent.PHASE_ENTERED, (payload) => {
        enteredPhases.push(payload.data.phase as string);
      });

      const state = orchestrator.createProject(makeProjectConfig());
      await orchestrator.startProject(state.project_id);

      // Should have entered multiple phases
      expect(enteredPhases.length).toBeGreaterThan(0);
    });

    test('emits PROJECT_COMPLETED when done', async () => {
      orchestrator = createTestOrchestrator();
      const events: EngineEventPayload[] = [];
      orchestrator.on(EngineEvent.PROJECT_COMPLETED, (payload) =>
        events.push(payload),
      );

      const state = orchestrator.createProject(makeProjectConfig());
      await orchestrator.startProject(state.project_id);

      expect(events.length).toBe(1);
    });

    test('records agent states after execution', async () => {
      orchestrator = createTestOrchestrator();
      const state = orchestrator.createProject(makeProjectConfig());
      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;
      const agentNames = Object.keys(finalState.agent_states);
      expect(agentNames.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Pause & Resume
  // ============================================================

  describe('pause and resume', () => {
    test('pauseProject transitions to PAUSED', () => {
      orchestrator = createTestOrchestrator();
      const state = orchestrator.createProject(makeProjectConfig());

      // Manually advance to a non-INIT phase so pause makes sense
      orchestrator.advancePhase('manual advance');
      orchestrator.pauseProject('taking a break');

      const current = orchestrator.getProjectState()!;
      expect(current.current_phase).toBe(Phase.PAUSED);
    });

    test('resumeProject transitions back to previous phase', () => {
      orchestrator = createTestOrchestrator();
      orchestrator.createProject(makeProjectConfig());

      orchestrator.advancePhase('advance');
      const phaseBeforePause = orchestrator.getProjectState()!.current_phase;
      orchestrator.pauseProject('break');
      orchestrator.resumeProject();

      expect(orchestrator.getProjectState()!.current_phase).toBe(
        phaseBeforePause,
      );
    });

    test('emits PROJECT_PAUSED and PROJECT_RESUMED events', () => {
      orchestrator = createTestOrchestrator();
      const pausedEvents: EngineEventPayload[] = [];
      const resumedEvents: EngineEventPayload[] = [];

      orchestrator.on(EngineEvent.PROJECT_PAUSED, (p) => pausedEvents.push(p));
      orchestrator.on(EngineEvent.PROJECT_RESUMED, (p) =>
        resumedEvents.push(p),
      );

      orchestrator.createProject(makeProjectConfig());
      orchestrator.advancePhase('advance');
      orchestrator.pauseProject('break');
      orchestrator.resumeProject();

      expect(pausedEvents.length).toBe(1);
      expect(resumedEvents.length).toBe(1);
    });
  });

  // ============================================================
  // Checkpoints & Rollback
  // ============================================================

  describe('checkpoints and rollback', () => {
    test('checkpoint creates a restorable snapshot', () => {
      orchestrator = createTestOrchestrator({ auto_checkpoint: false });
      orchestrator.createProject(makeProjectConfig());

      orchestrator.checkpoint('manual snapshot');

      const checkpoints = orchestrator.listCheckpoints();
      expect(checkpoints.length).toBe(1);
      expect(checkpoints[0].description).toBe('manual snapshot');
    });

    test('rollback restores state to checkpoint', () => {
      orchestrator = createTestOrchestrator({ auto_checkpoint: false });
      orchestrator.createProject(makeProjectConfig());

      // Take checkpoint at INIT
      orchestrator.checkpoint('at init');
      const checkpoints = orchestrator.listCheckpoints();
      const cpId = checkpoints[0].id;

      // Advance to next phase
      orchestrator.advancePhase('moving on');
      expect(orchestrator.getProjectState()!.current_phase).not.toBe(Phase.INIT);

      // Rollback to INIT checkpoint
      orchestrator.rollback(cpId);
      expect(orchestrator.getProjectState()!.current_phase).toBe(Phase.INIT);
    });

    test('auto-checkpoint creates checkpoints on phase completion', async () => {
      orchestrator = createTestOrchestrator({ auto_checkpoint: true });
      const state = orchestrator.createProject(makeProjectConfig());
      await orchestrator.startProject(state.project_id);

      const checkpoints = orchestrator.listCheckpoints();
      expect(checkpoints.length).toBeGreaterThan(0);
    });

    test('createCheckpointForProject works for database projects', () => {
      orchestrator = createTestOrchestrator();
      const state = orchestrator.createProject(makeProjectConfig());

      const cpId = orchestrator.createCheckpointForProject(state.project_id, 'DB checkpoint');
      expect(cpId).toBeTruthy();
    });

    test('rollbackProject validates project ownership', () => {
      orchestrator = createTestOrchestrator();
      orchestrator.createProject(makeProjectConfig());
      orchestrator.checkpoint('snap');

      const checkpoints = orchestrator.listCheckpoints();
      const cpId = checkpoints[0].id;

      // Rollback with wrong project ID should throw
      expect(() =>
        orchestrator.rollbackProject('wrong-project-id', cpId),
      ).toThrow(/belongs to project/);
    });

    test('emits CHECKPOINT_CREATED event', () => {
      orchestrator = createTestOrchestrator({ auto_checkpoint: false });
      const events: EngineEventPayload[] = [];
      orchestrator.on(EngineEvent.CHECKPOINT_CREATED, (p) => events.push(p));

      orchestrator.createProject(makeProjectConfig());
      orchestrator.checkpoint('test');

      expect(events.length).toBe(1);
    });

    test('emits CHECKPOINT_RESTORED event on rollback', () => {
      orchestrator = createTestOrchestrator({ auto_checkpoint: false });
      const events: EngineEventPayload[] = [];
      orchestrator.on(EngineEvent.CHECKPOINT_RESTORED, (p) =>
        events.push(p),
      );

      orchestrator.createProject(makeProjectConfig());
      orchestrator.checkpoint('snap');
      const cpId = orchestrator.listCheckpoints()[0].id;
      orchestrator.rollback(cpId);

      expect(events.length).toBe(1);
    });
  });

  // ============================================================
  // Event System
  // ============================================================

  describe('event system', () => {
    test('on() returns an unsubscribe function', () => {
      orchestrator = createTestOrchestrator();
      const events: EngineEventPayload[] = [];
      const unsub = orchestrator.on(EngineEvent.PROJECT_CREATED, (p) =>
        events.push(p),
      );

      orchestrator.createProject(makeProjectConfig());
      expect(events.length).toBe(1);

      unsub();
      orchestrator.createProject(
        makeProjectConfig({ name: 'Second' }),
      );
      expect(events.length).toBe(1); // not incremented
    });
  });

  // ============================================================
  // Stats
  // ============================================================

  describe('stats', () => {
    test('getStats returns engine statistics', () => {
      orchestrator = createTestOrchestrator();
      orchestrator.createProject(makeProjectConfig());

      const stats = orchestrator.getStats();
      expect(stats.project_id).toBeTruthy();
      expect(stats.current_phase).toBe(Phase.INIT);
      expect(stats.agents_loaded).toBeGreaterThan(0);
    });

    test('getStats works with no active project', () => {
      orchestrator = createTestOrchestrator();
      const stats = orchestrator.getStats();
      expect(stats.project_id).toBeNull();
      expect(stats.current_phase).toBeNull();
    });
  });

  // ============================================================
  // Project Listing
  // ============================================================

  describe('project listing', () => {
    test('listProjects returns created projects', () => {
      orchestrator = createTestOrchestrator();
      orchestrator.createProject(makeProjectConfig({ name: 'P1' }));
      orchestrator.createProject(makeProjectConfig({ name: 'P2' }));

      const list = orchestrator.listProjects();
      expect(list.length).toBe(2);
    });
  });

  // ============================================================
  // Shutdown
  // ============================================================

  describe('shutdown', () => {
    test('shutdown clears state without throwing', () => {
      orchestrator = createTestOrchestrator();
      orchestrator.createProject(makeProjectConfig());

      expect(() => orchestrator.shutdown()).not.toThrow();
      expect(orchestrator.getProjectState()).toBeNull();
    });
  });

  // ============================================================
  // Error Handling
  // ============================================================

  describe('error handling', () => {
    test('startProject throws for non-existent project', async () => {
      orchestrator = createTestOrchestrator();
      try {
        await orchestrator.startProject('does-not-exist');
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.message).toContain('not found');
      }
    });

    test('checkpoint throws when no project is active', () => {
      orchestrator = createTestOrchestrator();
      expect(() => orchestrator.checkpoint()).toThrow(/No active project/);
    });

    test('advancePhase throws when no project is active', () => {
      orchestrator = createTestOrchestrator();
      expect(() => orchestrator.advancePhase()).toThrow(/No active project/);
    });

    test('pauseProject throws when no project is active', () => {
      orchestrator = createTestOrchestrator();
      expect(() => orchestrator.pauseProject('reason')).toThrow(
        /No active project/,
      );
    });

    test('resumeProject throws when no project is active', () => {
      orchestrator = createTestOrchestrator();
      expect(() => orchestrator.resumeProject()).toThrow(
        /No active project/,
      );
    });
  });
});
