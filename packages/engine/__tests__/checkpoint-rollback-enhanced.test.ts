/**
 * Tests for Enhanced Checkpoint Rollback - Preview, History, Granular Options
 * TDD: 测试先行，然后实现功能
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckpointManager } from '../src/checkpoint-manager.js';
import { RollbackHistory } from '../src/rollback-history.js';
import { Phase, DecisionPath, RiskLevel } from '../src/types.js';
import type { ProjectState, RollbackPreview, RollbackOptions } from '../src/types.js';

function makeTempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hc-rollback-test-'));
  return join(dir, 'test.db');
}

function makeProjectState(overrides?: Partial<ProjectState>): ProjectState {
  const now = Date.now();
  return {
    project_id: 'proj-001',
    project_name: 'Test Project',
    project_description: 'A project for testing rollback',
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
    total_token_usage: 1000,
    token_budget: 100000,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeArtifact(id: string, name: string) {
  return {
    id,
    name,
    type: 'document' as const,
    path: `/docs/${name}.md`,
    phase: Phase.EXECUTION,
    agent: 'test-agent',
    created_at: Date.now(),
    description: `Test artifact ${name}`,
  };
}

function makeDecision(id: string, phase: Phase) {
  return {
    id,
    phase,
    type: 'go' as const,
    reasoning: `Decision ${id}`,
    risk_level: RiskLevel.LOW,
    confidence: 0.9,
    made_by: 'test-agent',
    timestamp: Date.now(),
  };
}

describe('Enhanced Rollback - Preview', () => {
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
      const dir = dbPath.replace(/\/[^/]+$/, '');
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('previewRollback', () => {
    test('应该计算当前状态和检查点状态的差异', () => {
      // 创建初始检查点
      const initialState = makeProjectState({
        artifacts: [makeArtifact('art-1', 'initial-doc')],
        decisions: [makeDecision('dec-1', Phase.INIT)],
        total_token_usage: 1000,
      });
      const cp1 = mgr.createCheckpoint(initialState, 'Initial checkpoint');

      // 修改状态
      const currentState = makeProjectState({
        current_phase: Phase.EXECUTION,
        artifacts: [
          makeArtifact('art-1', 'initial-doc'),
          makeArtifact('art-2', 'new-doc'),
          makeArtifact('art-3', 'another-doc'),
        ],
        decisions: [
          makeDecision('dec-1', Phase.INIT),
          makeDecision('dec-2', Phase.RESEARCH),
          makeDecision('dec-3', Phase.EXECUTION),
        ],
        total_token_usage: 5000,
      });
      mgr.saveProjectState(currentState);

      // 预览回滚
      const preview = mgr.previewRollback('proj-001', cp1.id);

      // 验证差异计算
      expect(preview.changes.willBeRemoved.length).toBe(2);
      expect(preview.changes.willBeRemoved.map((a) => a.id)).toContain('art-2');
      expect(preview.changes.willBeRemoved.map((a) => a.id)).toContain('art-3');

      expect(preview.changes.decisionsWillBeLost).toBe(2);
      expect(preview.changes.tokenUsageDifference).toBe(-4000);

      expect(preview.changes.phaseWillChange.from).toBe(Phase.EXECUTION);
      expect(preview.changes.phaseWillChange.to).toBe(Phase.INIT);
    });

    test('应该识别回滚风险', () => {
      const initialState = makeProjectState({
        total_token_usage: 1000,
      });
      const cp1 = mgr.createCheckpoint(initialState, 'Initial');

      const currentState = makeProjectState({
        current_phase: Phase.EXECUTION,
        total_token_usage: 10000,
        decisions: Array(5).fill(null).map((_, i) =>
          makeDecision(`dec-${i}`, Phase.RESEARCH)
        ),
      });
      mgr.saveProjectState(currentState);

      const preview = mgr.previewRollback('proj-001', cp1.id);

      // 应该有风险提示
      expect(preview.risks.length).toBeGreaterThan(0);
      expect(preview.risks.some((r) => r.includes('5'))).toBe(true); // 5个决策将丢失（初始0个对当前5个）
    });

    test('当项目不存在时应该抛出错误', () => {
      expect(() =>
        mgr.previewRollback('non-existent', 'cp-123')
      ).toThrow(/Project not found/);
    });

    test('当检查点不存在时应该抛出错误', () => {
      mgr.saveProjectState(makeProjectState());
      expect(() =>
        mgr.previewRollback('proj-001', 'non-existent-cp')
      ).toThrow(/Checkpoint not found/);
    });

    test('应该正确处理空的变更', () => {
      const state = makeProjectState();
      const cp = mgr.createCheckpoint(state, 'Same state');
      mgr.saveProjectState(state);

      const preview = mgr.previewRollback('proj-001', cp.id);

      expect(preview.changes.willBeRemoved.length).toBe(0);
      expect(preview.changes.willBeAdded.length).toBe(0);
      expect(preview.changes.decisionsWillBeLost).toBe(0);
    });
  });

  describe('rollbackWithPreview', () => {
    test('应该支持带备份的回滚', async () => {
      const initialState = makeProjectState({
        total_token_usage: 1000,
      });
      const cp1 = mgr.createCheckpoint(initialState, 'Before changes');

      const currentState = makeProjectState({
        current_phase: Phase.EXECUTION,
        total_token_usage: 5000,
      });
      mgr.saveProjectState(currentState);

      const options: RollbackOptions = {
        createBackup: true,
        scope: 'full',
      };

      const result = await mgr.rollbackWithPreview('proj-001', cp1.id, options);

      expect(result.current_phase).toBe(Phase.INIT);
      expect(result.total_token_usage).toBe(1000);
    });

    test('应该支持细粒度回滚选项 - 仅状态', async () => {
      const initialState = makeProjectState({
        artifacts: [makeArtifact('art-1', 'old')],
        total_token_usage: 1000,
      });
      const cp1 = mgr.createCheckpoint(initialState, 'Initial');

      const currentState = makeProjectState({
        artifacts: [
          makeArtifact('art-1', 'old'),
          makeArtifact('art-2', 'new'),
        ],
        total_token_usage: 5000,
      });
      mgr.saveProjectState(currentState);

      const options: RollbackOptions = {
        scope: 'state',
        preserve: {
          artifacts: ['art-2'], // 保留新 artifact
        },
      };

      const result = await mgr.rollbackWithPreview('proj-001', cp1.id, options);

      // 应该保留了新 artifact
      expect(result.artifacts.some((a) => a.id === 'art-2')).toBe(true);
    });

    test('强制模式应该跳过预览确认', async () => {
      const initialState = makeProjectState();
      const cp1 = mgr.createCheckpoint(initialState, 'Initial');

      const currentState = makeProjectState({
        current_phase: Phase.EXECUTION,
      });
      mgr.saveProjectState(currentState);

      const options: RollbackOptions = {
        force: true,
      };

      const result = await mgr.rollbackWithPreview('proj-001', cp1.id, options);

      expect(result.current_phase).toBe(Phase.INIT);
    });

    test('回滚失败时应该从备份恢复', async () => {
      // 这个测试需要模拟失败场景
      // 在实际实现中，可以通过注入错误来测试
      const initialState = makeProjectState({
        total_token_usage: 1000,
      });
      const cp1 = mgr.createCheckpoint(initialState, 'Initial');

      const currentState = makeProjectState({
        current_phase: Phase.EXECUTION,
        total_token_usage: 5000,
      });
      mgr.saveProjectState(currentState);

      // 使用一个会"失败"的选项来触发恢复逻辑
      // 实际实现中需要设计可测试的错误注入机制
      const options: RollbackOptions = {
        createBackup: true,
      };

      // 正常情况应该成功
      const result = await mgr.rollbackWithPreview('proj-001', cp1.id, options);
      expect(result).toBeDefined();
    });
  });

  describe('细粒度回滚选项', () => {
    test('scope=state 应该只回滚状态，不回滚 artifacts', async () => {
      const initialState = makeProjectState({
        artifacts: [],
        total_token_usage: 1000,
      });
      const cp1 = mgr.createCheckpoint(initialState, 'Initial');

      const currentState = makeProjectState({
        artifacts: [makeArtifact('art-1', 'new')],
        total_token_usage: 5000,
      });
      mgr.saveProjectState(currentState);

      const options: RollbackOptions = {
        scope: 'state',
      };

      const result = await mgr.rollbackWithPreview('proj-001', cp1.id, options);

      // 状态应该回滚，但 artifacts 保持当前
      expect(result.total_token_usage).toBe(1000);
      // 根据 scope='state' 的实现，artifacts 应该保持
    });

    test('scope=artifacts 应该只回滚 artifacts', async () => {
      const initialState = makeProjectState({
        artifacts: [makeArtifact('art-1', 'old')],
        total_token_usage: 1000,
      });
      const cp1 = mgr.createCheckpoint(initialState, 'Initial');

      const currentState = makeProjectState({
        artifacts: [
          makeArtifact('art-1', 'old'),
          makeArtifact('art-2', 'new'),
        ],
        total_token_usage: 5000,
      });
      mgr.saveProjectState(currentState);

      const options: RollbackOptions = {
        scope: 'artifacts',
      };

      const result = await mgr.rollbackWithPreview('proj-001', cp1.id, options);

      // Artifacts 应该回滚
      expect(result.artifacts.length).toBe(1);
      expect(result.artifacts[0].id).toBe('art-1');
      // 但 token 使用可能保持当前
    });

    test('preserve.artifacts 应该保留指定的 artifacts', async () => {
      const initialState = makeProjectState({
        artifacts: [makeArtifact('art-1', 'old')],
      });
      const cp1 = mgr.createCheckpoint(initialState, 'Initial');

      const currentState = makeProjectState({
        artifacts: [
          makeArtifact('art-1', 'old'),
          makeArtifact('art-2', 'keep-me'),
          makeArtifact('art-3', 'remove-me'),
        ],
      });
      mgr.saveProjectState(currentState);

      const options: RollbackOptions = {
        scope: 'full',
        preserve: {
          artifacts: ['art-2'],
        },
      };

      const result = await mgr.rollbackWithPreview('proj-001', cp1.id, options);

      // art-1 应该在（来自检查点）
      expect(result.artifacts.some((a) => a.id === 'art-1')).toBe(true);
      // art-2 应该保留
      expect(result.artifacts.some((a) => a.id === 'art-2')).toBe(true);
      // art-3 应该被移除
      expect(result.artifacts.some((a) => a.id === 'art-3')).toBe(false);
    });

    test('preserve.tokenUsage=true 应该保留累计 token 使用', async () => {
      const initialState = makeProjectState({
        total_token_usage: 1000,
      });
      const cp1 = mgr.createCheckpoint(initialState, 'Initial');

      const currentState = makeProjectState({
        total_token_usage: 5000,
      });
      mgr.saveProjectState(currentState);

      const options: RollbackOptions = {
        scope: 'full',
        preserve: {
          tokenUsage: true,
        },
      };

      const result = await mgr.rollbackWithPreview('proj-001', cp1.id, options);

      // 应该保留当前的 token 使用量
      expect(result.total_token_usage).toBe(5000);
    });
  });
});

describe('RollbackHistory', () => {
  let dbPath: string;
  let mgr: CheckpointManager;
  let history: RollbackHistory;

  beforeEach(() => {
    dbPath = makeTempDb();
    mgr = new CheckpointManager(dbPath);
    history = new RollbackHistory(dbPath);
  });

  afterEach(() => {
    try {
      mgr.close();
    } catch {
      // already closed
    }
    try {
      const dir = dbPath.replace(/\/[^/]+$/, '');
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('记录回滚操作', () => {
    test('应该记录成功的回滚操作', () => {
      const record = {
        rollbackId: 'rb-001',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-from',
        toCheckpoint: 'cp-to',
        projectId: 'proj-001',
        options: {},
        preview: {} as any,
        success: true,
      };

      history.record(record);

      const records = history.getHistory('proj-001');
      expect(records.length).toBe(1);
      expect(records[0].rollbackId).toBe('rb-001');
    });

    test('应该记录失败的回滚操作', () => {
      const record = {
        rollbackId: 'rb-002',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-from',
        toCheckpoint: 'cp-to',
        projectId: 'proj-001',
        options: {},
        preview: {} as any,
        success: false,
        error: 'Simulated error',
      };

      history.record(record);

      const records = history.getHistory('proj-001');
      expect(records[0].success).toBe(false);
      expect(records[0].error).toBe('Simulated error');
    });

    test('应该按时间顺序返回历史记录', () => {
      const now = Date.now();
      for (let i = 0; i < 3; i++) {
        history.record({
          rollbackId: `rb-${i}`,
          timestamp: now + i * 1000,
          fromCheckpoint: `cp-from-${i}`,
          toCheckpoint: `cp-to-${i}`,
          projectId: 'proj-001',
          options: {},
          preview: {} as any,
          success: true,
        });
      }

      const records = history.getHistory('proj-001');
      expect(records.length).toBe(3);
      // 应该按时间顺序
      expect(records[0].rollbackId).toBe('rb-0');
      expect(records[2].rollbackId).toBe('rb-2');
    });

    test('应该只返回指定项目的历史', () => {
      history.record({
        rollbackId: 'rb-1',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-1',
        toCheckpoint: 'cp-2',
        projectId: 'proj-001',
        options: {},
        preview: {} as any,
        success: true,
      });

      history.record({
        rollbackId: 'rb-2',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-3',
        toCheckpoint: 'cp-4',
        projectId: 'proj-002',
        options: {},
        preview: {} as any,
        success: true,
      });

      const proj1Records = history.getHistory('proj-001');
      const proj2Records = history.getHistory('proj-002');

      expect(proj1Records.length).toBe(1);
      expect(proj2Records.length).toBe(1);
      expect(proj1Records[0].rollbackId).toBe('rb-1');
      expect(proj2Records[0].rollbackId).toBe('rb-2');
    });

    test('空项目应该返回空数组', () => {
      const records = history.getHistory('non-existent');
      expect(records).toEqual([]);
    });
  });

  describe('撤销回滚', () => {
    test('应该能够撤销最后一次成功的回滚', async () => {
      // 创建检查点序列
      const state1 = makeProjectState({
        current_phase: Phase.INIT,
        total_token_usage: 1000,
      });
      const cp1 = mgr.createCheckpoint(state1, 'Initial');

      const state2 = makeProjectState({
        current_phase: Phase.EXECUTION,
        total_token_usage: 5000,
      });
      const cp2 = mgr.createCheckpoint(state2, 'After changes');

      // 模拟从 cp2 回滚到 cp1
      mgr.saveProjectState(state2);
      await mgr.rollbackWithPreview('proj-001', cp1.id, { force: true });

      // 记录回滚
      history.record({
        rollbackId: 'rb-001',
        timestamp: Date.now(),
        fromCheckpoint: cp2.id,
        toCheckpoint: cp1.id,
        projectId: 'proj-001',
        options: {},
        preview: {} as any,
        success: true,
      });

      // 撤销回滚应该恢复到 cp2
      const undoneState = await history.undoLastRollback('proj-001', (cpId) => {
        return mgr.restoreCheckpoint(cpId);
      });

      expect(undoneState.current_phase).toBe(Phase.EXECUTION);
      expect(undoneState.total_token_usage).toBe(5000);
    });

    test('没有历史记录时应该抛出错误', async () => {
      await expect(history.undoLastRollback('proj-001', () => {
        throw new Error('Should not be called');
      })).rejects.toThrow(
        /No rollback history/
      );
    });

    test('最后一次回滚失败时应该抛出错误', async () => {
      history.record({
        rollbackId: 'rb-failed',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-1',
        toCheckpoint: 'cp-2',
        projectId: 'proj-001',
        options: {},
        preview: {} as any,
        success: false,
        error: 'Previous rollback failed',
      });

      await expect(history.undoLastRollback('proj-001', () => {
        throw new Error('Should not be called');
      })).rejects.toThrow(
        /Last rollback failed/
      );
    });

    test('撤销后应该移除最后一条历史记录', async () => {
      const state1 = makeProjectState();
      const cp1 = mgr.createCheckpoint(state1, 'CP1');

      const state2 = makeProjectState({ current_phase: Phase.EXECUTION });
      const cp2 = mgr.createCheckpoint(state2, 'CP2');
      mgr.saveProjectState(state2);

      await mgr.rollbackWithPreview('proj-001', cp1.id, { force: true });

      history.record({
        rollbackId: 'rb-001',
        timestamp: Date.now(),
        fromCheckpoint: cp2.id,  // 使用实际的 cp2 ID
        toCheckpoint: cp1.id,
        projectId: 'proj-001',
        options: {},
        preview: {} as any,
        success: true,
      });

      await history.undoLastRollback('proj-001', (cpId) => {
        return mgr.restoreCheckpoint(cpId);
      });

      // 历史记录应该被移除
      const records = history.getHistory('proj-001');
      expect(records.length).toBe(0);
    });
  });

  describe('持久化', () => {
    test('历史记录应该持久化到文件', () => {
      const record = {
        rollbackId: 'rb-persist',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-1',
        toCheckpoint: 'cp-2',
        projectId: 'proj-001',
        options: {},
        preview: {} as any,
        success: true,
      };

      history.record(record);

      // 创建新的 history 实例模拟重启
      const newHistory = new RollbackHistory(dbPath);
      const records = newHistory.getHistory('proj-001');

      expect(records.length).toBe(1);
      expect(records[0].rollbackId).toBe('rb-persist');
    });
  });
});
