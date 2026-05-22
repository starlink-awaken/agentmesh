/**
 * RollbackHistory 测试 - 回滚历史管理器完整测试
 * 测试回滚操作记录、撤销、持久化等功能
 */

import { describe, beforeEach, afterEach, it, expect } from 'bun:test';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { RollbackHistory } from '../src/rollback-history.js';
import type { RollbackRecord, ProjectState, Checkpoint, Phase } from '../src/types.js';

const TEST_DIR = '/tmp/honeycomb-rollback-history-test';
const DB_PATH = join(TEST_DIR, 'test.db');

describe('RollbackHistory', () => {
  let history: RollbackHistory;
  let mockProjectState: ProjectState;
  let mockCheckpoint: Checkpoint;

  beforeEach(async () => {
    // 创建测试目录
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });

    // 创建模拽数据
    mockProjectState = {
      project_id: 'test-project-id',
      project_name: 'Test Project',
      project_description: 'Test Description',
      archetype: 'software-dev',
      complexity: 'standard',
      decision_path: 'standard',
      risk_level: 'medium',
      current_phase: 'execution' as Phase,
      phase_history: [],
      active_agents: ['agent1', 'agent2'],
      agent_states: {},
      artifacts: [],
      decisions: [],
      total_token_usage: 1000,
      token_budget: 100000,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    mockCheckpoint = {
      id: 'cp-test-123',
      project_id: 'test-project-id',
      phase: 'init' as Phase,
      timestamp: Date.now(),
      created_at: Date.now(),
      description: 'Test checkpoint',
      recoverable: true,
      state_json: JSON.stringify(mockProjectState),
    };

    history = new RollbackHistory(DB_PATH);
  });

  afterEach(async () => {
    // 清理测试目录
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('记录回滚操作', () => {
    it('应该记录一次回滚操作', () => {
      const record: RollbackRecord = {
        rollbackId: 'rb-001',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-before-rollback',
        toCheckpoint: 'cp-after-rollback',
        projectId: 'test-project-id',
        options: {},
        preview: {
          targetCheckpoint: mockCheckpoint,
          currentState: mockProjectState,
          changes: {
            willBeRemoved: [],
            willBeAdded: [],
            phaseWillChange: {
              from: 'execution' as Phase,
              to: 'init' as Phase,
            },
            decisionsWillBeLost: 0,
            tokenUsageDifference: -500,
          },
          risks: [],
        },
        success: true,
      };

      history.record(record);

      const records = history.getHistory('test-project-id');
      expect(records.length).toBe(1);
      expect(records[0].rollbackId).toBe('rb-001');
    });

    it('应该记录多次回滚操作', () => {
      for (let i = 0; i < 3; i++) {
        const record: RollbackRecord = {
          rollbackId: `rb-00${i}`,
          timestamp: Date.now() + i * 1000,
          fromCheckpoint: `cp-before-${i}`,
          toCheckpoint: `cp-after-${i}`,
          projectId: 'test-project-id',
          options: {},
          preview: {
            targetCheckpoint: mockCheckpoint,
            currentState: mockProjectState,
            changes: {
              willBeRemoved: [],
              willBeAdded: [],
              phaseWillChange: {
                from: 'execution' as Phase,
                to: 'init' as Phase,
              },
              decisionsWillBeLost: 0,
              tokenUsageDifference: -500,
            },
            risks: [],
          },
          success: true,
        };

        history.record(record);
      }

      const records = history.getHistory('test-project-id');
      expect(records.length).toBe(3);
    });

    it('应该支持多个项目的回滚历史', () => {
      const record1: RollbackRecord = {
        rollbackId: 'rb-001',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-1',
        toCheckpoint: 'cp-2',
        projectId: 'project-1',
        options: {},
        preview: {
          targetCheckpoint: mockCheckpoint,
          currentState: mockProjectState,
          changes: {
            willBeRemoved: [],
            willBeAdded: [],
            phaseWillChange: {
              from: 'execution' as Phase,
              to: 'init' as Phase,
            },
            decisionsWillBeLost: 0,
            tokenUsageDifference: -500,
          },
          risks: [],
        },
        success: true,
      };

      const record2: RollbackRecord = {
        ...record1,
        rollbackId: 'rb-002',
        projectId: 'project-2',
      };

      history.record(record1);
      history.record(record2);

      const records1 = history.getHistory('project-1');
      const records2 = history.getHistory('project-2');

      expect(records1.length).toBe(1);
      expect(records2.length).toBe(1);
    });
  });

  describe('查询历史记录', () => {
    it('应该返回项目的回滚历史副本', () => {
      const record: RollbackRecord = {
        rollbackId: 'rb-001',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-1',
        toCheckpoint: 'cp-2',
        projectId: 'test-project-id',
        options: {},
        preview: {
          targetCheckpoint: mockCheckpoint,
          currentState: mockProjectState,
          changes: {
            willBeRemoved: [],
            willBeAdded: [],
            phaseWillChange: {
              from: 'execution' as Phase,
              to: 'init' as Phase,
            },
            decisionsWillBeLost: 0,
            tokenUsageDifference: -500,
          },
          risks: [],
        },
        success: true,
      };

      history.record(record);

      const records1 = history.getHistory('test-project-id');
      const records2 = history.getHistory('test-project-id');

      // 应该是不同的数组实例
      expect(records1).not.toBe(records2);
      // 但内容相同
      expect(records1).toEqual(records2);
    });

    it('应该返回空数组对于没有历史的项目', () => {
      const records = history.getHistory('non-existent-project');
      expect(records).toEqual([]);
    });

    it('应该获取最后一次回滚记录', () => {
      const records: RollbackRecord[] = [];
      for (let i = 0; i < 3; i++) {
        const record: RollbackRecord = {
          rollbackId: `rb-00${i}`,
          timestamp: Date.now() + i * 1000,
          fromCheckpoint: `cp-before-${i}`,
          toCheckpoint: `cp-after-${i}`,
          projectId: 'test-project-id',
          options: {},
          preview: {
            targetCheckpoint: mockCheckpoint,
            currentState: mockProjectState,
            changes: {
              willBeRemoved: [],
              willBeAdded: [],
              phaseWillChange: {
                from: 'execution' as Phase,
                to: 'init' as Phase,
              },
              decisionsWillBeLost: 0,
              tokenUsageDifference: -500,
            },
            risks: [],
          },
          success: true,
        };

        records.push(record);
        history.record(record);
      }

      const lastRollback = history.getLastRollback('test-project-id');
      expect(lastRollback).toBeDefined();
      expect(lastRollback?.rollbackId).toBe('rb-002');
    });

    it('应该返回 null 对于没有历史的项目', () => {
      const lastRollback = history.getLastRollback('non-existent-project');
      expect(lastRollback).toBeNull();
    });

    it('应该获取所有项目的回滚历史', () => {
      const record1: RollbackRecord = {
        rollbackId: 'rb-001',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-1',
        toCheckpoint: 'cp-2',
        projectId: 'project-1',
        options: {},
        preview: {
          targetCheckpoint: mockCheckpoint,
          currentState: mockProjectState,
          changes: {
            willBeRemoved: [],
            willBeAdded: [],
            phaseWillChange: {
              from: 'execution' as Phase,
              to: 'init' as Phase,
            },
            decisionsWillBeLost: 0,
            tokenUsageDifference: -500,
          },
          risks: [],
        },
        success: true,
      };

      const record2: RollbackRecord = {
        ...record1,
        rollbackId: 'rb-002',
        projectId: 'project-2',
      };

      history.record(record1);
      history.record(record2);

      const allHistory = history.getAllHistory();
      expect(allHistory.size).toBe(2);
      expect(allHistory.has('project-1')).toBe(true);
      expect(allHistory.has('project-2')).toBe(true);
    });
  });

  describe('清除历史记录', () => {
    it('应该清除项目的回滚历史', () => {
      const record: RollbackRecord = {
        rollbackId: 'rb-001',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-1',
        toCheckpoint: 'cp-2',
        projectId: 'test-project-id',
        options: {},
        preview: {
          targetCheckpoint: mockCheckpoint,
          currentState: mockProjectState,
          changes: {
            willBeRemoved: [],
            willBeAdded: [],
            phaseWillChange: {
              from: 'execution' as Phase,
              to: 'init' as Phase,
            },
            decisionsWillBeLost: 0,
            tokenUsageDifference: -500,
          },
          risks: [],
        },
        success: true,
      };

      history.record(record);
      expect(history.getHistory('test-project-id').length).toBe(1);

      history.clearHistory('test-project-id');
      expect(history.getHistory('test-project-id').length).toBe(0);
    });

    it('应该支持清除不存在的项目', () => {
      expect(() => {
        history.clearHistory('non-existent-project');
      }).not.toThrow();
    });
  });

  describe('撤销回滚', () => {
    it('应该撤销最后一次成功的回滚', async () => {
      const record: RollbackRecord = {
        rollbackId: 'rb-001',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-original',
        toCheckpoint: 'cp-rolled-back',
        projectId: 'test-project-id',
        options: {},
        preview: {
          targetCheckpoint: mockCheckpoint,
          currentState: mockProjectState,
          changes: {
            willBeRemoved: [],
            willBeAdded: [],
            phaseWillChange: {
              from: 'execution' as Phase,
              to: 'init' as Phase,
            },
            decisionsWillBeLost: 0,
            tokenUsageDifference: -500,
          },
          risks: [],
        },
        success: true,
      };

      history.record(record);

      const restoreFn = async (checkpointId: string) => {
        expect(checkpointId).toBe('cp-original');
        return mockProjectState;
      };

      const restoredState = await history.undoLastRollback('test-project-id', restoreFn);

      expect(restoredState).toBeDefined();
      expect(restoredState.project_id).toBe('test-project-id');

      // 历史记录应该被移除
      const records = history.getHistory('test-project-id');
      expect(records.length).toBe(0);
    });

    it('应该拒绝撤销失败的回滚', async () => {
      const record: RollbackRecord = {
        rollbackId: 'rb-001',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-1',
        toCheckpoint: 'cp-2',
        projectId: 'test-project-id',
        options: {},
        preview: {
          targetCheckpoint: mockCheckpoint,
          currentState: mockProjectState,
          changes: {
            willBeRemoved: [],
            willBeAdded: [],
            phaseWillChange: {
              from: 'execution' as Phase,
              to: 'init' as Phase,
            },
            decisionsWillBeLost: 0,
            tokenUsageDifference: -500,
          },
          risks: [],
        },
        success: false, // 回滚失败
      };

      history.record(record);

      const restoreFn = async () => mockProjectState;

      await expect(
        history.undoLastRollback('test-project-id', restoreFn)
      ).rejects.toThrow('Last rollback failed');
    });

    it('应该拒绝撤销没有历史的项目', async () => {
      const restoreFn = async () => mockProjectState;

      await expect(
        history.undoLastRollback('non-existent-project', restoreFn)
      ).rejects.toThrow('No rollback history');
    });

    it('应该计算可撤销的回滚数量', () => {
      // 添加两次成功的回滚和一次失败的回滚
      for (let i = 0; i < 3; i++) {
        const record: RollbackRecord = {
          rollbackId: `rb-00${i}`,
          timestamp: Date.now() + i * 1000,
          fromCheckpoint: `cp-before-${i}`,
          toCheckpoint: `cp-after-${i}`,
          projectId: 'test-project-id',
          options: {},
          preview: {
            targetCheckpoint: mockCheckpoint,
            currentState: mockProjectState,
            changes: {
              willBeRemoved: [],
              willBeAdded: [],
              phaseWillChange: {
                from: 'execution' as Phase,
                to: 'init' as Phase,
              },
              decisionsWillBeLost: 0,
              tokenUsageDifference: -500,
            },
            risks: [],
          },
          success: i !== 1, // 第二次失败
        };

        history.record(record);
      }

      const undoableCount = history.getUndoableCount('test-project-id');
      expect(undoableCount).toBe(2); // 只有成功的可以撤销
    });

    it('应该返回 0 对于没有历史的项目', () => {
      const count = history.getUndoableCount('non-existent-project');
      expect(count).toBe(0);
    });
  });

  describe('持久化', () => {
    it('应该保存历史到文件', async () => {
      const record: RollbackRecord = {
        rollbackId: 'rb-001',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-1',
        toCheckpoint: 'cp-2',
        projectId: 'test-project-id',
        options: {},
        preview: {
          targetCheckpoint: mockCheckpoint,
          currentState: mockProjectState,
          changes: {
            willBeRemoved: [],
            willBeAdded: [],
            phaseWillChange: {
              from: 'execution' as Phase,
              to: 'init' as Phase,
            },
            decisionsWillBeLost: 0,
            tokenUsageDifference: -500,
          },
          risks: [],
        },
        success: true,
      };

      history.record(record);

      // 验证文件存在
      const historyPath = history.getHistoryPath();
      const exists = await fileExists(historyPath);
      expect(exists).toBe(true);
    });

    it('应该从文件加载历史', async () => {
      const record: RollbackRecord = {
        rollbackId: 'rb-001',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-1',
        toCheckpoint: 'cp-2',
        projectId: 'test-project-id',
        options: {},
        preview: {
          targetCheckpoint: mockCheckpoint,
          currentState: mockProjectState,
          changes: {
            willBeRemoved: [],
            willBeAdded: [],
            phaseWillChange: {
              from: 'execution' as Phase,
              to: 'init' as Phase,
            },
            decisionsWillBeLost: 0,
            tokenUsageDifference: -500,
          },
          risks: [],
        },
        success: true,
      };

      history.record(record);

      // 创建新的 RollbackHistory 实例，应该加载已有历史
      const newHistory = new RollbackHistory(DB_PATH);
      const records = newHistory.getHistory('test-project-id');

      expect(records.length).toBe(1);
      expect(records[0].rollbackId).toBe('rb-001');
    });

    it('应该处理损坏的历史文件', async () => {
      // 创建损坏的历史文件
      const historyPath = join(TEST_DIR, 'test-rollback-history.json');
      await fs.writeFile(historyPath, 'invalid json content');

      // 不应该抛出错误
      expect(() => {
        new RollbackHistory(DB_PATH);
      }).not.toThrow();

      const newHistory = new RollbackHistory(DB_PATH);
      expect(newHistory.getHistory('test-project-id')).toEqual([]);
    });

    it('应该处理不存在的历史文件', () => {
      // 使用不存在的目录
      const newDbPath = join(TEST_DIR, 'nonexistent', 'test.db');

      expect(() => {
        new RollbackHistory(newDbPath);
      }).not.toThrow();
    });
  });

  describe('路径处理', () => {
    it('应该正确生成历史文件路径', () => {
      const historyPath = history.getHistoryPath();

      expect(historyPath).toContain('test-rollback-history.json');
      expect(historyPath).toContain(TEST_DIR);
    });

    it('应该处理不同的数据库路径', () => {
      const history1 = new RollbackHistory(join(TEST_DIR, 'db1.db'));
      const history2 = new RollbackHistory(join(TEST_DIR, 'db2.db'));

      expect(history1.getHistoryPath()).toContain('db1-rollback-history.json');
      expect(history2.getHistoryPath()).toContain('db2-rollback-history.json');
    });
  });

  describe('边界条件', () => {
    it('应该处理空的回滚记录', () => {
      const emptyRecord: RollbackRecord = {
        rollbackId: 'rb-empty',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-1',
        toCheckpoint: 'cp-2',
        projectId: 'test-project-id',
        options: {},
        preview: {
          targetCheckpoint: mockCheckpoint,
          currentState: mockProjectState,
          changes: {
            willBeRemoved: [],
            willBeAdded: [],
            phaseWillChange: {
              from: 'execution' as Phase,
              to: 'init' as Phase,
            },
            decisionsWillBeLost: 0,
            tokenUsageDifference: 0,
          },
          risks: [],
        },
        success: true,
      };

      history.record(emptyRecord);

      const records = history.getHistory('test-project-id');
      expect(records.length).toBe(1);
    });

    it('应该处理回滚选项', () => {
      const record: RollbackRecord = {
        rollbackId: 'rb-with-options',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-1',
        toCheckpoint: 'cp-2',
        projectId: 'test-project-id',
        options: {
          scope: 'artifacts',
          preserve: {
            artifacts: ['art-1', 'art-2'],
          },
          createBackup: true,
          force: true,
        },
        preview: {
          targetCheckpoint: mockCheckpoint,
          currentState: mockProjectState,
          changes: {
            willBeRemoved: [],
            willBeAdded: [],
            phaseWillChange: {
              from: 'execution' as Phase,
              to: 'init' as Phase,
            },
            decisionsWillBeLost: 0,
            tokenUsageDifference: -500,
          },
          risks: [],
        },
        success: true,
      };

      history.record(record);

      const records = history.getHistory('test-project-id');
      expect(records[0].options?.scope).toBe('artifacts');
      expect(records[0].options?.preserve?.artifacts).toEqual(['art-1', 'art-2']);
      expect(records[0].options?.createBackup).toBe(true);
      expect(records[0].options?.force).toBe(true);
    });

    it('应该处理恢复函数抛出错误', async () => {
      const record: RollbackRecord = {
        rollbackId: 'rb-001',
        timestamp: Date.now(),
        fromCheckpoint: 'cp-1',
        toCheckpoint: 'cp-2',
        projectId: 'test-project-id',
        options: {},
        preview: {
          targetCheckpoint: mockCheckpoint,
          currentState: mockProjectState,
          changes: {
            willBeRemoved: [],
            willBeAdded: [],
            phaseWillChange: {
              from: 'execution' as Phase,
              to: 'init' as Phase,
            },
            decisionsWillBeLost: 0,
            tokenUsageDifference: -500,
          },
          risks: [],
        },
        success: true,
      };

      history.record(record);

      const restoreFn = async () => {
        throw new Error('Restore failed');
      };

      await expect(
        history.undoLastRollback('test-project-id', restoreFn)
      ).rejects.toThrow('Failed to undo rollback');
    });
  });

  describe('性能测试', () => {
    it('应该快速记录大量回滚', () => {
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        const record: RollbackRecord = {
          rollbackId: `rb-${i}`,
          timestamp: Date.now() + i,
          fromCheckpoint: `cp-before-${i}`,
          toCheckpoint: `cp-after-${i}`,
          projectId: `project-${i % 10}`,
          options: {},
          preview: {
            targetCheckpoint: mockCheckpoint,
            currentState: mockProjectState,
            changes: {
              willBeRemoved: [],
              willBeAdded: [],
              phaseWillChange: {
                from: 'execution' as Phase,
                to: 'init' as Phase,
              },
              decisionsWillBeLost: 0,
              tokenUsageDifference: -500,
            },
            risks: [],
          },
          success: true,
        };

        history.record(record);
      }

      const duration = performance.now() - start;

      // 100 次记录应该在 100ms 内完成
      expect(duration).toBeLessThan(100);
    });
  });
});

// 辅助函数
async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
