/**
 * Tests for CheckpointManager - SQLite CRUD, transactions, rollback,
 * project lifecycle.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckpointManager } from '../src/checkpoint-manager.ts';
import { Phase, DecisionPath, RiskLevel } from '../src/types.ts';
import type { ProjectState } from '../src/types.ts';

function makeTempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hc-test-'));
  return join(dir, 'test.db');
}

function makeProjectState(overrides?: Partial<ProjectState>): ProjectState {
  const now = Date.now();
  return {
    project_id: 'proj-001',
    project_name: 'Test Project',
    project_description: 'A project for testing',
    archetype: 'software-dev',
    complexity: 'standard',
    decision_path: DecisionPath.STANDARD,
    risk_level: RiskLevel.MEDIUM,
    current_phase: Phase.INIT,
    phase_history: [],
    active_agents: [],
    agent_states: {},
    artifacts: [],
    decisions: [],
    total_token_usage: 0,
    token_budget: 100000,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('CheckpointManager', () => {
  let dbPath: string;
  let mgr: CheckpointManager;

  beforeEach(() => {
    dbPath = makeTempDb();
    mgr = new CheckpointManager(dbPath);
  });

  afterEach(() => {
    try {
      mgr.close();
    } catch {
      // already closed
    }
    try {
      // Clean up temp directory
      const dir = dbPath.replace(/\/[^/]+$/, '');
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // ============================================================
  // Project State CRUD
  // ============================================================

  describe('project state persistence', () => {
    test('saveProjectState and loadProjectState round-trip', () => {
      const state = makeProjectState();
      mgr.saveProjectState(state);
      const loaded = mgr.loadProjectState('proj-001');
      expect(loaded).not.toBeNull();
      expect(loaded!.project_id).toBe('proj-001');
      expect(loaded!.project_name).toBe('Test Project');
      expect(loaded!.archetype).toBe('software-dev');
    });

    test('loadProjectState returns null for non-existent project', () => {
      const loaded = mgr.loadProjectState('does-not-exist');
      expect(loaded).toBeNull();
    });

    test('saveProjectState upserts existing project', () => {
      const state = makeProjectState();
      mgr.saveProjectState(state);

      state.project_name = 'Updated Name';
      state.current_phase = Phase.EXECUTION;
      mgr.saveProjectState(state);

      const loaded = mgr.loadProjectState('proj-001');
      expect(loaded!.project_name).toBe('Updated Name');
      expect(loaded!.current_phase).toBe(Phase.EXECUTION);
    });

    test('listProjects returns all stored projects', () => {
      mgr.saveProjectState(makeProjectState({ project_id: 'p1', project_name: 'P1' }));
      mgr.saveProjectState(makeProjectState({ project_id: 'p2', project_name: 'P2' }));
      const list = mgr.listProjects();
      expect(list.length).toBe(2);
      const ids = list.map((p) => p.project_id);
      expect(ids).toContain('p1');
      expect(ids).toContain('p2');
    });

    test('listProjects returns empty array when no projects', () => {
      expect(mgr.listProjects()).toEqual([]);
    });

    test('deleteProject removes project', () => {
      const state = makeProjectState();
      mgr.saveProjectState(state);
      mgr.deleteProject('proj-001');
      expect(mgr.loadProjectState('proj-001')).toBeNull();
    });

    test('deleteProject throws for non-existent project', () => {
      expect(() => mgr.deleteProject('nope')).toThrow(/Project not found/);
    });
  });

  // ============================================================
  // Checkpoint CRUD
  // ============================================================

  describe('checkpoint operations', () => {
    test('createCheckpoint and restoreCheckpoint round-trip', () => {
      const state = makeProjectState();
      const cp = mgr.createCheckpoint(state, 'Initial checkpoint');
      expect(cp.id).toBeTruthy();
      expect(cp.project_id).toBe('proj-001');
      expect(cp.phase).toBe(Phase.INIT);
      expect(cp.description).toBe('Initial checkpoint');
      expect(cp.recoverable).toBe(true);

      const restored = mgr.restoreCheckpoint(cp.id);
      expect(restored.project_id).toBe('proj-001');
      expect(restored.current_phase).toBe(Phase.INIT);
    });

    test('restoreCheckpoint throws for non-existent checkpoint', () => {
      expect(() => mgr.restoreCheckpoint('bad-id')).toThrow(
        /Checkpoint not found/,
      );
    });

    test('listCheckpoints returns checkpoints newest first', async () => {
      const state = makeProjectState();
      mgr.createCheckpoint(state, 'CP 1');

      // Ensure a different timestamp
      await new Promise((r) => setTimeout(r, 10));

      state.current_phase = Phase.EXECUTION;
      mgr.createCheckpoint(state, 'CP 2');

      const list = mgr.listCheckpoints('proj-001');
      expect(list.length).toBe(2);
      expect(list[0].description).toBe('CP 2');
      expect(list[1].description).toBe('CP 1');
    });

    test('listCheckpoints returns empty for unknown project', () => {
      expect(mgr.listCheckpoints('unknown')).toEqual([]);
    });

    test('getLatestCheckpoint returns the most recent', async () => {
      const state = makeProjectState();
      mgr.createCheckpoint(state, 'CP 1');

      // Ensure a different timestamp by waiting 10ms
      await new Promise((r) => setTimeout(r, 10));

      state.current_phase = Phase.EXECUTION;
      const cp2 = mgr.createCheckpoint(state, 'CP 2');

      const latest = mgr.getLatestCheckpoint('proj-001');
      expect(latest).not.toBeNull();
      expect(latest!.id).toBe(cp2.id);
    });

    test('getLatestCheckpoint returns null when no checkpoints', () => {
      expect(mgr.getLatestCheckpoint('proj-001')).toBeNull();
    });

    test('deleteCheckpoint removes a specific checkpoint', () => {
      const state = makeProjectState();
      const cp = mgr.createCheckpoint(state, 'to delete');
      mgr.deleteCheckpoint(cp.id);
      expect(() => mgr.restoreCheckpoint(cp.id)).toThrow(
        /Checkpoint not found/,
      );
    });

    test('deleteCheckpoint throws for non-existent checkpoint', () => {
      expect(() => mgr.deleteCheckpoint('bad-id')).toThrow(
        /Checkpoint not found/,
      );
    });
  });

  // ============================================================
  // Transactions & Cascading Deletes
  // ============================================================

  describe('transactions and cascading deletes', () => {
    test('deleteProject cascades to checkpoints', () => {
      const state = makeProjectState();
      mgr.createCheckpoint(state, 'CP 1');
      mgr.createCheckpoint(state, 'CP 2');
      expect(mgr.listCheckpoints('proj-001').length).toBe(2);

      mgr.deleteProject('proj-001');
      expect(mgr.listCheckpoints('proj-001')).toEqual([]);
    });

    test('createCheckpoint is transactional (project upserted)', () => {
      // createCheckpoint should auto-upsert the project
      const state = makeProjectState({ project_id: 'auto-proj' });
      mgr.createCheckpoint(state, 'auto');
      const loaded = mgr.loadProjectState('auto-proj');
      expect(loaded).not.toBeNull();
      expect(loaded!.project_id).toBe('auto-proj');
    });
  });

  // ============================================================
  // State Integrity
  // ============================================================

  describe('state integrity', () => {
    test('preserves complex nested state through checkpoint', () => {
      const state = makeProjectState({
        phase_history: [
          {
            from: Phase.INIT,
            to: Phase.RESEARCH,
            timestamp: Date.now(),
            reason: 'started',
          },
        ],
        agent_states: {
          architect: {
            agent_name: 'architect',
            status: 'completed' as any,
            retry_count: 0,
            token_usage: 1234,
          },
        },
        artifacts: [
          {
            id: 'art-1',
            name: 'design doc',
            type: 'document',
            path: '/docs/design.md',
            phase: Phase.RESEARCH,
            agent: 'architect',
            created_at: Date.now(),
            description: 'Architecture document',
          },
        ],
      });

      const cp = mgr.createCheckpoint(state, 'complex state');
      const restored = mgr.restoreCheckpoint(cp.id);
      expect(restored.phase_history.length).toBe(1);
      expect(restored.agent_states.architect.token_usage).toBe(1234);
      expect(restored.artifacts.length).toBe(1);
      expect(restored.artifacts[0].name).toBe('design doc');
    });
  });

  // ============================================================
  // ID Generation
  // ============================================================

  describe('generateId', () => {
    test('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(mgr.generateId());
      }
      expect(ids.size).toBe(100);
    });

    test('returns UUID format', () => {
      const id = mgr.generateId();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  // ============================================================
  // Close & Error Handling
  // ============================================================

  describe('close', () => {
    test('close does not throw', () => {
      expect(() => mgr.close()).not.toThrow();
    });
  });
});
