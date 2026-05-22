/**
 * Honeycomb v2 - InteractiveController Tests
 *
 * TDD: These tests were written BEFORE the implementation.
 * They validate pause/resume, priority management, checkpoint creation,
 * status polling, and command queue execution.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  InteractiveController,
  createInteractiveController,
  type ControlCommand,
  type PriorityLevel,
  type InteractiveStatus,
  type OrchestratorInterface,
} from './interactive-control.js';
import { Phase, DecisionPath, RiskLevel, type ProjectState } from './types.js';

// ============================================================
// Mock Orchestrator
// ============================================================

function createMockProjectState(overrides?: Partial<ProjectState>): ProjectState {
  return {
    project_id: 'test-project-001',
    project_name: 'Test Project',
    project_description: 'A test project for interactive control',
    archetype: 'software-dev',
    complexity: 'standard',
    decision_path: DecisionPath.STANDARD,
    risk_level: RiskLevel.MEDIUM,
    current_phase: Phase.EXECUTION,
    phase_history: [],
    active_agents: [],
    agent_states: {},
    artifacts: [],
    decisions: [],
    total_token_usage: 1500,
    token_budget: 100000,
    created_at: Date.now() - 60000,
    updated_at: Date.now(),
    ...overrides,
  };
}

function createMockOrchestrator(projectState?: ProjectState | null): OrchestratorInterface {
  const state = projectState === null ? null : (projectState ?? createMockProjectState());
  const pauseCalls: string[] = [];
  const resumeCalls: number[] = [];
  const checkpointCalls: Array<string | undefined> = [];
  const rollbackCalls: string[] = [];

  return {
    pauseProject(reason: string): void {
      pauseCalls.push(reason);
    },
    resumeProject(): void {
      resumeCalls.push(Date.now());
    },
    checkpoint(description?: string): void {
      checkpointCalls.push(description);
    },
    rollback(checkpointId: string): void {
      rollbackCalls.push(checkpointId);
    },
    getProjectState(): ProjectState | null {
      return state;
    },
    getStats(): Record<string, unknown> {
      return {
        project_id: state?.project_id ?? null,
        current_phase: state?.current_phase ?? null,
        total_token_usage: state?.total_token_usage ?? 0,
        agents_loaded: 12,
      };
    },
    // Expose call records for assertions
    _pauseCalls: pauseCalls,
    _resumeCalls: resumeCalls,
    _checkpointCalls: checkpointCalls,
    _rollbackCalls: rollbackCalls,
  } as OrchestratorInterface & {
    _pauseCalls: string[];
    _resumeCalls: number[];
    _checkpointCalls: Array<string | undefined>;
    _rollbackCalls: string[];
  };
}

// ============================================================
// Tests: Construction & Factory
// ============================================================

describe('InteractiveController', () => {
  describe('construction', () => {
    test('creates via constructor', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      expect(ctrl).toBeInstanceOf(InteractiveController);
    });

    test('creates via factory function', () => {
      const orch = createMockOrchestrator();
      const ctrl = createInteractiveController(orch);
      expect(ctrl).toBeInstanceOf(InteractiveController);
    });

    test('starts in non-paused state', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      expect(ctrl.isPaused()).toBe(false);
    });

    test('starts with normal priority', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      expect(ctrl.getPriority()).toBe('normal');
    });

    test('uptime starts at zero and increases', async () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      const t0 = ctrl.getUptime();
      expect(t0).toBeGreaterThanOrEqual(0);
      // Wait a tiny bit and confirm uptime grew
      await new Promise((r) => setTimeout(r, 15));
      const t1 = ctrl.getUptime();
      expect(t1).toBeGreaterThan(t0);
    });
  });

  // ============================================================
  // Tests: Pause / Resume
  // ============================================================

  describe('pause / resume', () => {
    test('pause returns a completed ControlCommand', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      const cmd = ctrl.pause('user requested');
      expect(cmd.type).toBe('pause');
      expect(cmd.status).toBe('completed');
      expect(cmd.payload).toEqual({ reason: 'user requested' });
      expect(typeof cmd.id).toBe('string');
      expect(cmd.id.length).toBeGreaterThan(0);
      expect(typeof cmd.timestamp).toBe('number');
    });

    test('pause delegates to orchestrator', () => {
      const orch = createMockOrchestrator() as ReturnType<typeof createMockOrchestrator> & { _pauseCalls: string[] };
      const ctrl = new InteractiveController(orch);
      ctrl.pause('maintenance window');
      expect(orch._pauseCalls).toContain('maintenance window');
    });

    test('isPaused returns true after pause', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      ctrl.pause('test');
      expect(ctrl.isPaused()).toBe(true);
    });

    test('resume returns a completed ControlCommand', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      ctrl.pause('test');
      const cmd = ctrl.resume();
      expect(cmd.type).toBe('resume');
      expect(cmd.status).toBe('completed');
    });

    test('resume delegates to orchestrator', () => {
      const orch = createMockOrchestrator() as ReturnType<typeof createMockOrchestrator> & { _resumeCalls: number[] };
      const ctrl = new InteractiveController(orch);
      ctrl.pause('test');
      ctrl.resume();
      expect(orch._resumeCalls.length).toBe(1);
    });

    test('isPaused returns false after resume', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      ctrl.pause('test');
      ctrl.resume();
      expect(ctrl.isPaused()).toBe(false);
    });

    test('resume when not paused returns failed command', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      const cmd = ctrl.resume();
      expect(cmd.status).toBe('failed');
      expect(cmd.error).toBeDefined();
    });

    test('pause tracks reason', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      ctrl.pause('deployment in progress');
      const status = ctrl.getStatus();
      expect(status.pause_reason).toBe('deployment in progress');
    });

    test('pause when already paused returns failed command', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      ctrl.pause('first');
      const cmd = ctrl.pause('second');
      expect(cmd.status).toBe('failed');
      expect(cmd.error).toContain('already paused');
    });

    test('pause handles orchestrator errors gracefully', () => {
      const orch = createMockOrchestrator();
      orch.pauseProject = () => { throw new Error('no active project'); };
      const ctrl = new InteractiveController(orch);
      const cmd = ctrl.pause('test');
      expect(cmd.status).toBe('failed');
      expect(cmd.error).toContain('no active project');
    });
  });

  // ============================================================
  // Tests: Priority
  // ============================================================

  describe('priority', () => {
    test('setPriority changes priority', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      ctrl.setPriority('urgent');
      expect(ctrl.getPriority()).toBe('urgent');
    });

    test('setPriority accepts all valid levels', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      const levels: PriorityLevel[] = ['low', 'normal', 'high', 'urgent'];
      for (const level of levels) {
        ctrl.setPriority(level);
        expect(ctrl.getPriority()).toBe(level);
      }
    });

    test('priority is reflected in status', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      ctrl.setPriority('high');
      const status = ctrl.getStatus();
      expect(status.priority).toBe('high');
    });
  });

  // ============================================================
  // Tests: Checkpoint
  // ============================================================

  describe('checkpoint', () => {
    test('createCheckpoint returns a completed command', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      const cmd = ctrl.createCheckpoint('before refactor');
      expect(cmd.type).toBe('checkpoint');
      expect(cmd.status).toBe('completed');
      expect(cmd.payload).toEqual({ description: 'before refactor' });
    });

    test('createCheckpoint delegates to orchestrator', () => {
      const orch = createMockOrchestrator() as ReturnType<typeof createMockOrchestrator> & { _checkpointCalls: Array<string | undefined> };
      const ctrl = new InteractiveController(orch);
      ctrl.createCheckpoint('snapshot alpha');
      expect(orch._checkpointCalls).toContain('snapshot alpha');
    });

    test('createCheckpoint without description works', () => {
      const orch = createMockOrchestrator() as ReturnType<typeof createMockOrchestrator> & { _checkpointCalls: Array<string | undefined> };
      const ctrl = new InteractiveController(orch);
      const cmd = ctrl.createCheckpoint();
      expect(cmd.status).toBe('completed');
      expect(orch._checkpointCalls.length).toBe(1);
    });

    test('createCheckpoint updates last_checkpoint_at', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      const before = ctrl.getStatus().last_checkpoint_at;
      expect(before).toBeNull();
      ctrl.createCheckpoint('test');
      const after = ctrl.getStatus().last_checkpoint_at;
      expect(after).not.toBeNull();
      expect(typeof after).toBe('number');
    });

    test('createCheckpoint handles orchestrator errors', () => {
      const orch = createMockOrchestrator();
      orch.checkpoint = () => { throw new Error('db locked'); };
      const ctrl = new InteractiveController(orch);
      const cmd = ctrl.createCheckpoint('oops');
      expect(cmd.status).toBe('failed');
      expect(cmd.error).toContain('db locked');
    });
  });

  // ============================================================
  // Tests: Rollback
  // ============================================================

  describe('rollback', () => {
    test('rollbackTo returns a completed command', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      const cmd = ctrl.rollbackTo('cp-001');
      expect(cmd.type).toBe('rollback');
      expect(cmd.status).toBe('completed');
      expect(cmd.payload).toEqual({ checkpointId: 'cp-001' });
    });

    test('rollbackTo delegates to orchestrator', () => {
      const orch = createMockOrchestrator() as ReturnType<typeof createMockOrchestrator> & { _rollbackCalls: string[] };
      const ctrl = new InteractiveController(orch);
      ctrl.rollbackTo('cp-xyz');
      expect(orch._rollbackCalls).toContain('cp-xyz');
    });

    test('rollbackTo handles orchestrator errors', () => {
      const orch = createMockOrchestrator();
      orch.rollback = () => { throw new Error('checkpoint not found'); };
      const ctrl = new InteractiveController(orch);
      const cmd = ctrl.rollbackTo('bad-id');
      expect(cmd.status).toBe('failed');
      expect(cmd.error).toContain('checkpoint not found');
    });
  });

  // ============================================================
  // Tests: Status
  // ============================================================

  describe('status', () => {
    test('getStatus returns correct shape', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      const status = ctrl.getStatus();
      expect(status).toHaveProperty('project_id');
      expect(status).toHaveProperty('project_name');
      expect(status).toHaveProperty('current_phase');
      expect(status).toHaveProperty('is_paused');
      expect(status).toHaveProperty('pause_reason');
      expect(status).toHaveProperty('priority');
      expect(status).toHaveProperty('uptime_ms');
      expect(status).toHaveProperty('command_history_count');
      expect(status).toHaveProperty('pending_commands');
      expect(status).toHaveProperty('last_checkpoint_at');
      expect(status).toHaveProperty('stats');
    });

    test('getStatus reflects orchestrator project state', () => {
      const state = createMockProjectState({
        project_id: 'proj-42',
        project_name: 'My Engine',
        current_phase: Phase.RESEARCH,
      });
      const orch = createMockOrchestrator(state);
      const ctrl = new InteractiveController(orch);
      const status = ctrl.getStatus();
      expect(status.project_id).toBe('proj-42');
      expect(status.project_name).toBe('My Engine');
      expect(status.current_phase).toBe('research');
    });

    test('getStatus returns nulls when no project loaded', () => {
      const orch = createMockOrchestrator(null);
      const ctrl = new InteractiveController(orch);
      const status = ctrl.getStatus();
      expect(status.project_id).toBeNull();
      expect(status.project_name).toBeNull();
      expect(status.current_phase).toBeNull();
    });

    test('getStatus command_history_count increases with commands', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      expect(ctrl.getStatus().command_history_count).toBe(0);
      ctrl.pause('test');
      expect(ctrl.getStatus().command_history_count).toBe(1);
      ctrl.resume();
      expect(ctrl.getStatus().command_history_count).toBe(2);
    });

    test('getStatus includes orchestrator stats', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      const status = ctrl.getStatus();
      expect(status.stats).toHaveProperty('agents_loaded', 12);
    });
  });

  // ============================================================
  // Tests: Command History
  // ============================================================

  describe('command history', () => {
    test('getCommandHistory returns empty array initially', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      expect(ctrl.getCommandHistory()).toEqual([]);
    });

    test('getCommandHistory records all commands', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      ctrl.pause('a');
      ctrl.resume();
      ctrl.createCheckpoint('b');
      ctrl.rollbackTo('cp-1');
      const history = ctrl.getCommandHistory();
      expect(history.length).toBe(4);
      expect(history[0].type).toBe('pause');
      expect(history[1].type).toBe('resume');
      expect(history[2].type).toBe('checkpoint');
      expect(history[3].type).toBe('rollback');
    });

    test('getCommandHistory respects limit', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      ctrl.pause('a');
      ctrl.resume();
      ctrl.createCheckpoint('b');
      const history = ctrl.getCommandHistory(2);
      expect(history.length).toBe(2);
      // Should be the most recent 2
      expect(history[0].type).toBe('checkpoint');
      expect(history[1].type).toBe('resume');
    });

    test('each command has a unique id', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      ctrl.pause('a');
      ctrl.resume();
      ctrl.createCheckpoint('c');
      const history = ctrl.getCommandHistory();
      const ids = new Set(history.map((c) => c.id));
      expect(ids.size).toBe(3);
    });

    test('failed commands are also recorded', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      // Resume without pause should fail
      const cmd = ctrl.resume();
      expect(cmd.status).toBe('failed');
      const history = ctrl.getCommandHistory();
      expect(history.length).toBe(1);
      expect(history[0].status).toBe('failed');
    });
  });

  // ============================================================
  // Tests: Command Queue
  // ============================================================

  describe('command queue', () => {
    test('queueCommand adds a pending command', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      const cmd = ctrl.queueCommand('pause', { reason: 'queued' });
      expect(cmd.type).toBe('pause');
      expect(cmd.status).toBe('pending');
      expect(ctrl.getStatus().pending_commands).toBe(1);
    });

    test('queueCommand does not execute immediately', () => {
      const orch = createMockOrchestrator() as ReturnType<typeof createMockOrchestrator> & { _pauseCalls: string[] };
      const ctrl = new InteractiveController(orch);
      ctrl.queueCommand('pause', { reason: 'queued' });
      expect(orch._pauseCalls.length).toBe(0);
      expect(ctrl.isPaused()).toBe(false);
    });

    test('executeQueue processes all pending commands', async () => {
      const orch = createMockOrchestrator() as ReturnType<typeof createMockOrchestrator> & {
        _pauseCalls: string[];
        _checkpointCalls: Array<string | undefined>;
      };
      const ctrl = new InteractiveController(orch);
      ctrl.queueCommand('pause', { reason: 'batch pause' });
      ctrl.queueCommand('checkpoint', { description: 'batch cp' });
      const results = await ctrl.executeQueue();
      expect(results.length).toBe(2);
      expect(results[0].type).toBe('pause');
      expect(results[1].type).toBe('checkpoint');
      // Verify delegation happened
      expect(orch._pauseCalls).toContain('batch pause');
      expect(orch._checkpointCalls).toContain('batch cp');
    });

    test('executeQueue empties the queue', async () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      ctrl.queueCommand('checkpoint', { description: 'test' });
      expect(ctrl.getStatus().pending_commands).toBe(1);
      await ctrl.executeQueue();
      expect(ctrl.getStatus().pending_commands).toBe(0);
    });

    test('executeQueue returns empty array when queue is empty', async () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      const results = await ctrl.executeQueue();
      expect(results).toEqual([]);
    });

    test('executeQueue processes commands in FIFO order', async () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      ctrl.queueCommand('checkpoint', { description: 'first' });
      ctrl.queueCommand('checkpoint', { description: 'second' });
      ctrl.queueCommand('checkpoint', { description: 'third' });
      const results = await ctrl.executeQueue();
      expect(results[0].payload).toEqual({ description: 'first' });
      expect(results[1].payload).toEqual({ description: 'second' });
      expect(results[2].payload).toEqual({ description: 'third' });
    });

    test('queueCommand for status type is supported', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      const cmd = ctrl.queueCommand('status');
      expect(cmd.type).toBe('status');
      expect(cmd.status).toBe('pending');
    });

    test('executeQueue handles mixed success and failure', async () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      // Queue a checkpoint (will succeed) and a rollback with bad id
      ctrl.queueCommand('checkpoint', { description: 'ok' });
      orch.rollback = () => { throw new Error('not found'); };
      ctrl.queueCommand('rollback', { checkpointId: 'bad' });
      const results = await ctrl.executeQueue();
      expect(results[0].status).toBe('completed');
      expect(results[1].status).toBe('failed');
    });

    test('queued commands appear in command history after execution', async () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      ctrl.queueCommand('checkpoint', { description: 'queued one' });
      // Before execution, queued commands should not be in history
      expect(ctrl.getCommandHistory().length).toBe(0);
      await ctrl.executeQueue();
      expect(ctrl.getCommandHistory().length).toBe(1);
    });

    test('queueCommand for set-priority type is supported', () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      const cmd = ctrl.queueCommand('set-priority', { level: 'urgent' });
      expect(cmd.type).toBe('set-priority');
      expect(cmd.status).toBe('pending');
    });

    test('executeQueue processes set-priority command', async () => {
      const orch = createMockOrchestrator();
      const ctrl = new InteractiveController(orch);
      ctrl.queueCommand('set-priority', { level: 'high' });
      await ctrl.executeQueue();
      expect(ctrl.getPriority()).toBe('high');
    });
  });
});
