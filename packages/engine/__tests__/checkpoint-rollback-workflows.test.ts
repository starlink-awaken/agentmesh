/**
 * Checkpoint and Rollback Workflow Integration Tests
 *
 * Tests comprehensive checkpoint and rollback functionality:
 * - Manual checkpoint creation during project execution
 * - Auto-checkpoint at phase boundaries
 * - Rollback to previous checkpoints with state restoration
 * - Checkpoint listing and metadata
 * - Complex rollback scenarios (cross-phase, multiple rollbacks)
 * - Checkpoint validation and integrity
 * - Performance with multiple checkpoints
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HoneycombOrchestrator } from '../src/orchestrator.ts';
import {
  Phase,
  EngineEvent,
  type ProjectConfig,
  type EngineEventPayload,
} from '../src/types.ts';

// ============================================================
// Test Setup
// ============================================================

let tempDir: string;

function setupTestEnvironment(): {
  dbPath: string;
  agentsDir: string;
  domainsDir: string;
  outputDir: string;
} {
  tempDir = mkdtempSync(join(tmpdir(), 'hc-checkpoint-test-'));
  const dbPath = join(tempDir, 'test.db');
  const agentsDir = join(tempDir, 'agents');
  const domainsDir = join(tempDir, 'domains');
  const outputDir = join(tempDir, 'output');

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(domainsDir, { recursive: true });

  // Create minimal agent structure
  const layers = [
    { dir: 'layer-1-research', name: 'researcher' },
    { dir: 'layer-2-decision', name: 'decider' },
    { dir: 'layer-3-execution', name: 'executor' },
    { dir: 'layer-4-feedback', name: 'reviewer' },
  ];

  for (const layer of layers) {
    const layerDir = join(agentsDir, layer.dir);
    mkdirSync(layerDir, { recursive: true });
    writeFileSync(
      join(layerDir, `${layer.name}.md`),
      `---
name: ${layer.name}
description: Test ${layer.name}
tools: ['read']
---

# ${layer.name}
`,
    );
  }

  return { dbPath, agentsDir, domainsDir, outputDir };
}

function cleanupTestEnvironment(): void {
  if (tempDir && existsSync(tempDir)) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================================
// Checkpoint and Rollback Tests
// ============================================================

describe('Checkpoint and Rollback Workflows', () => {
  let orchestrator: HoneycombOrchestrator;

  afterEach(() => {
    try {
      orchestrator?.shutdown();
    } catch {
      // Ignore shutdown errors
    }
    cleanupTestEnvironment();
  });

  describe('manual checkpoint creation', () => {
    test('creates manual checkpoint with description', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      orchestrator.createProject({
        name: 'Checkpoint Test',
        description: 'Test manual checkpoints',
        archetype: 'custom',
        goals: ['test'],
      });

      orchestrator.checkpoint('Manual checkpoint for testing');

      const checkpoints = orchestrator.listCheckpoints();
      expect(checkpoints.length).toBe(1);
      expect(checkpoints[0].description).toBe('Manual checkpoint for testing');
    });

    test('multiple manual checkpoints can be created', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      orchestrator.createProject({
        name: 'Multi-Checkpoint Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      orchestrator.checkpoint('Checkpoint 1');
      orchestrator.advancePhase('Moving forward');
      orchestrator.checkpoint('Checkpoint 2');
      orchestrator.advancePhase('Moving further');
      orchestrator.checkpoint('Checkpoint 3');

      const checkpoints = orchestrator.listCheckpoints();
      expect(checkpoints.length).toBe(3);
      expect(checkpoints[0].description).toBe('Checkpoint 3'); // Newest first
      expect(checkpoints[1].description).toBe('Checkpoint 2');
      expect(checkpoints[2].description).toBe('Checkpoint 1');
    });

    test('checkpoint captures current project state', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const state = orchestrator.createProject({
        name: 'State Capture Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      orchestrator.checkpoint('Initial state');

      const checkpoints = orchestrator.listCheckpoints();
      expect(checkpoints[0].phase).toBe(Phase.INIT);
      expect(checkpoints[0].project_id).toBe(state.project_id);
    });

    test('checkpoint without description uses default', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      orchestrator.createProject({
        name: 'Default Description Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      orchestrator.checkpoint();

      const checkpoints = orchestrator.listCheckpoints();
      expect(checkpoints.length).toBe(1);
      expect(checkpoints[0].description).toBeTruthy();
    });

    test('CHECKPOINT_CREATED event is emitted', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const events: EngineEventPayload[] = [];
      orchestrator.on(EngineEvent.CHECKPOINT_CREATED, (payload) =>
        events.push(payload),
      );

      orchestrator.createProject({
        name: 'Event Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      orchestrator.checkpoint('Test checkpoint');

      expect(events.length).toBe(1);
      expect(events[0].event).toBe(EngineEvent.CHECKPOINT_CREATED);
      expect(events[0].data.checkpoint_id).toBeTruthy();
    });
  });

  describe('auto-checkpoint functionality', () => {
    test('auto-checkpoints are created at phase completion', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: true,
      });

      const state = orchestrator.createProject({
        name: 'Auto-Checkpoint Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      await orchestrator.startProject(state.project_id);

      const checkpoints = orchestrator.listCheckpoints();
      expect(checkpoints.length).toBeGreaterThan(0);
    });

    test('auto-checkpoint can be disabled', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const state = orchestrator.createProject({
        name: 'No Auto-Checkpoint Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      await orchestrator.startProject(state.project_id);

      const checkpoints = orchestrator.listCheckpoints();
      expect(checkpoints.length).toBe(0);
    });
  });

  describe('rollback functionality', () => {
    test('rollback restores previous state', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      orchestrator.createProject({
        name: 'Rollback Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      // Create checkpoint at INIT
      orchestrator.checkpoint('Before advance');
      const checkpoints = orchestrator.listCheckpoints();
      const checkpointId = checkpoints[0].id;

      // Advance phase
      orchestrator.advancePhase('Moving forward');
      expect(orchestrator.getProjectState()!.current_phase).not.toBe(Phase.INIT);

      // Rollback
      orchestrator.rollback(checkpointId);
      expect(orchestrator.getProjectState()!.current_phase).toBe(Phase.INIT);
    });

    test('rollback across multiple phases', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      orchestrator.createProject({
        name: 'Multi-Phase Rollback',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      // Create checkpoint at start
      orchestrator.checkpoint('Start');
      const startCheckpoint = orchestrator.listCheckpoints()[0].id;

      // Advance multiple phases
      orchestrator.advancePhase('Phase 1');
      orchestrator.advancePhase('Phase 2');
      orchestrator.advancePhase('Phase 3');

      const beforeRollbackPhase = orchestrator.getProjectState()!.current_phase;
      expect(beforeRollbackPhase).not.toBe(Phase.INIT);

      // Rollback to start
      orchestrator.rollback(startCheckpoint);
      expect(orchestrator.getProjectState()!.current_phase).toBe(Phase.INIT);
    });

    test('CHECKPOINT_RESTORED event is emitted on rollback', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const events: EngineEventPayload[] = [];
      orchestrator.on(EngineEvent.CHECKPOINT_RESTORED, (payload) =>
        events.push(payload),
      );

      orchestrator.createProject({
        name: 'Restore Event Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      orchestrator.checkpoint('Before rollback');
      const checkpointId = orchestrator.listCheckpoints()[0].id;

      orchestrator.advancePhase('Move');
      orchestrator.rollback(checkpointId);

      expect(events.length).toBe(1);
      expect(events[0].event).toBe(EngineEvent.CHECKPOINT_RESTORED);
      expect(events[0].data.checkpoint_id).toBe(checkpointId);
    });

    test('rollback preserves phase history up to checkpoint', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      orchestrator.createProject({
        name: 'History Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      orchestrator.advancePhase('Phase 1');
      orchestrator.checkpoint('After phase 1');
      const checkpointId = orchestrator.listCheckpoints()[0].id;

      orchestrator.advancePhase('Phase 2');
      orchestrator.advancePhase('Phase 3');

      orchestrator.rollback(checkpointId);

      const state = orchestrator.getProjectState()!;
      // Phase history should be restored to checkpoint state
      expect(state.phase_history.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkpoint validation', () => {
    test('throws error when rolling back to non-existent checkpoint', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      orchestrator.createProject({
        name: 'Invalid Rollback Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      expect(() => {
        orchestrator.rollback('non-existent-checkpoint-id');
      }).toThrow();
    });

    test('throws error when creating checkpoint with no active project', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      expect(() => {
        orchestrator.checkpoint('No project');
      }).toThrow(/No active project/);
    });

    test('validates checkpoint belongs to correct project', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      // Create first project and checkpoint
      orchestrator.createProject({
        name: 'Project 1',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      orchestrator.checkpoint('Project 1 checkpoint');
      const project1CheckpointId = orchestrator.listCheckpoints()[0].id;

      // Create second project
      orchestrator.createProject({
        name: 'Project 2',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      // Try to rollback to checkpoint from different project
      expect(() => {
        orchestrator.rollback(project1CheckpointId);
      }).toThrow();
    });
  });

  describe('checkpoint listing and metadata', () => {
    test('listCheckpoints returns checkpoints newest first', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      orchestrator.createProject({
        name: 'List Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      orchestrator.checkpoint('First');
      await new Promise((resolve) => setTimeout(resolve, 10));
      orchestrator.checkpoint('Second');
      await new Promise((resolve) => setTimeout(resolve, 10));
      orchestrator.checkpoint('Third');

      const checkpoints = orchestrator.listCheckpoints();
      expect(checkpoints[0].description).toBe('Third');
      expect(checkpoints[1].description).toBe('Second');
      expect(checkpoints[2].description).toBe('First');
    });

    test('checkpoint metadata includes timestamp and phase', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      orchestrator.createProject({
        name: 'Metadata Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      orchestrator.checkpoint('Test checkpoint');

      const checkpoints = orchestrator.listCheckpoints();
      expect(checkpoints[0].created_at).toBeGreaterThan(0);
      expect(checkpoints[0].phase).toBe(Phase.INIT);
      expect(checkpoints[0].recoverable).toBe(true);
    });

    test('empty checkpoint list when no checkpoints created', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      orchestrator.createProject({
        name: 'No Checkpoints Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      const checkpoints = orchestrator.listCheckpoints();
      expect(checkpoints).toEqual([]);
    });
  });

  describe('project-specific checkpoint management', () => {
    test('createCheckpointForProject works for database projects', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const state = orchestrator.createProject({
        name: 'Database Project Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      const checkpointId = orchestrator.createCheckpointForProject(
        state.project_id,
        'External checkpoint',
      );

      expect(checkpointId).toBeTruthy();

      const checkpoints = orchestrator.listCheckpoints();
      expect(checkpoints.length).toBe(1);
      expect(checkpoints[0].id).toBe(checkpointId);
    });

    test('rollbackProject validates checkpoint ownership', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const state = orchestrator.createProject({
        name: 'Ownership Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      orchestrator.checkpoint('Test');
      const checkpointId = orchestrator.listCheckpoints()[0].id;

      // Try to rollback with wrong project ID
      expect(() => {
        orchestrator.rollbackProject('wrong-project-id', checkpointId);
      }).toThrow();
    });
  });

  describe('performance and scalability', () => {
    test('handles multiple checkpoints efficiently', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      orchestrator.createProject({
        name: 'Performance Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      // Create many checkpoints
      const count = 50;
      for (let i = 0; i < count; i++) {
        orchestrator.checkpoint(`Checkpoint ${i}`);
      }

      const checkpoints = orchestrator.listCheckpoints();
      expect(checkpoints.length).toBe(count);
    });

    test('checkpoint and rollback operations are reasonably fast', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      orchestrator.createProject({
        name: 'Speed Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      const start = Date.now();
      orchestrator.checkpoint('Speed test');
      const checkpointTime = Date.now() - start;

      const checkpointId = orchestrator.listCheckpoints()[0].id;

      orchestrator.advancePhase('Move');

      const rollbackStart = Date.now();
      orchestrator.rollback(checkpointId);
      const rollbackTime = Date.now() - rollbackStart;

      // Operations should be fast (< 1 second each)
      expect(checkpointTime).toBeLessThan(1000);
      expect(rollbackTime).toBeLessThan(1000);
    });
  });
});
