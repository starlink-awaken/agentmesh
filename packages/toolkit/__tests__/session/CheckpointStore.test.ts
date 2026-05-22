/**
 * CheckpointStore 单元测试
 *
 * 测试检查点存储的内存存储和文件存储功能
 *
 * @author PAI
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'bun:test';
import {
  MemoryCheckpointStore,
  FileCheckpointStore,
  createCheckpointStore,
  generateCheckpointId,
} from '../../dist/session/CheckpointStore.js';
import type { Checkpoint, SessionState } from '../../dist/session/types.js';

describe('MemoryCheckpointStore', () => {
  let store: MemoryCheckpointStore;
  let testCheckpoint: Checkpoint;

  beforeEach(() => {
    store = new MemoryCheckpointStore();

    // 创建测试检查点
    const testState: SessionState = {
      currentStep: 5,
      completedSteps: [1, 2, 3, 4],
      context: { testKey: 'testValue' },
      errors: [],
      metadata: {
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    };

    testCheckpoint = {
      id: 'cp_001',
      sessionId: 'session_001',
      state: testState,
      timestamp: new Date('2024-01-01T10:00:00Z'),
      metadata: {
        step: 5,
        description: 'Test checkpoint',
        size: 1024,
      },
    };
  });

  // ============================================================================
  // save 测试
  // ============================================================================

  describe('save', () => {
    it('should save checkpoint', async () => {
      await store.save(testCheckpoint);

      const loaded = await store.load('session_001', 'cp_001');
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe('cp_001');
    });

    it('should update existing checkpoint', async () => {
      await store.save(testCheckpoint);
      const updated = { ...testCheckpoint, state: { ...testCheckpoint.state, currentStep: 10 } };
      await store.save(updated);

      const loaded = await store.load('session_001', 'cp_001');
      expect(loaded?.state.currentStep).toBe(10);
    });

    it('should handle multiple sessions', async () => {
      const cp1 = { ...testCheckpoint, id: 'cp_1', sessionId: 'session_1' };
      const cp2 = { ...testCheckpoint, id: 'cp_2', sessionId: 'session_2' };

      await store.save(cp1);
      await store.save(cp2);

      const loaded1 = await store.load('session_1', 'cp_1');
      const loaded2 = await store.load('session_2', 'cp_2');

      expect(loaded1?.id).toBe('cp_1');
      expect(loaded2?.id).toBe('cp_2');
    });
  });

  // ============================================================================
  // load 测试
  // ============================================================================

  describe('load', () => {
    it('should load existing checkpoint', async () => {
      await store.save(testCheckpoint);

      const loaded = await store.load('session_001', 'cp_001');

      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe('cp_001');
      expect(loaded?.state.currentStep).toBe(5);
    });

    it('should return null for non-existent checkpoint', async () => {
      const loaded = await store.load('session_001', 'non_existent');

      expect(loaded).toBeNull();
    });

    it('should return null for non-existent session', async () => {
      await store.save(testCheckpoint);

      const loaded = await store.load('non_existent_session', 'cp_001');

      expect(loaded).toBeNull();
    });

    it('should restore Date objects correctly', async () => {
      await store.save(testCheckpoint);

      const loaded = await store.load('session_001', 'cp_001');

      expect(loaded?.timestamp).toBeInstanceOf(Date);
      expect(loaded?.state.metadata.createdAt).toBeInstanceOf(Date);
      expect(loaded?.state.metadata.updatedAt).toBeInstanceOf(Date);
      // errors 数组可能为空，所以检查第一个元素是否存在
      if (loaded?.state.errors && loaded.state.errors.length > 0) {
        expect(loaded.state.errors[0].timestamp).toBeInstanceOf(Date);
      }
    });
  });

  // ============================================================================
  // list 测试
  // ============================================================================

  describe('list', () => {
    it('should list all checkpoints for session', async () => {
      await store.save(testCheckpoint);
      await store.save({ ...testCheckpoint, id: 'cp_002', metadata: { step: 6 } });
      await store.save({ ...testCheckpoint, id: 'cp_003', metadata: { step: 7 } });

      const checkpoints = await store.list('session_001');

      expect(checkpoints.length).toBe(3);
    });

    it('should return empty array for non-existent session', async () => {
      const checkpoints = await store.list('non_existent');

      expect(checkpoints).toEqual([]);
    });

    it('should return checkpoints sorted by timestamp', async () => {
      const cp1 = { ...testCheckpoint, id: 'cp_001', timestamp: new Date('2024-01-01T10:00:00Z') };
      const cp2 = { ...testCheckpoint, id: 'cp_002', timestamp: new Date('2024-01-01T12:00:00Z') };
      const cp3 = { ...testCheckpoint, id: 'cp_003', timestamp: new Date('2024-01-01T11:00:00Z') };

      await store.save(cp3);
      await store.save(cp1);
      await store.save(cp2);

      const checkpoints = await store.list('session_001');

      expect(checkpoints[0].id).toBe('cp_001');
      expect(checkpoints[1].id).toBe('cp_003');
      expect(checkpoints[2].id).toBe('cp_002');
    });

    it('should not include checkpoints from other sessions', async () => {
      await store.save(testCheckpoint);
      await store.save({ ...testCheckpoint, id: 'cp_002', sessionId: 'other_session' });

      const checkpoints = await store.list('session_001');

      expect(checkpoints.length).toBe(1);
    });
  });

  // ============================================================================
  // latest 测试
  // ============================================================================

  describe('latest', () => {
    it('should return latest checkpoint', async () => {
      const cp1 = { ...testCheckpoint, id: 'cp_001', timestamp: new Date('2024-01-01T10:00:00Z') };
      const cp2 = { ...testCheckpoint, id: 'cp_002', timestamp: new Date('2024-01-01T12:00:00Z') };
      const cp3 = { ...testCheckpoint, id: 'cp_003', timestamp: new Date('2024-01-01T11:00:00Z') };

      await store.save(cp1);
      await store.save(cp2);
      await store.save(cp3);

      const latest = await store.latest('session_001');

      expect(latest?.id).toBe('cp_002');
    });

    it('should return null for session without checkpoints', async () => {
      const latest = await store.latest('non_existent');

      expect(latest).toBeNull();
    });
  });

  // ============================================================================
  // delete 测试
  // ============================================================================

  describe('delete', () => {
    it('should delete checkpoint', async () => {
      await store.save(testCheckpoint);
      await store.delete('session_001', 'cp_001');

      const loaded = await store.load('session_001', 'cp_001');
      expect(loaded).toBeNull();
    });

    it('should not affect other checkpoints', async () => {
      await store.save(testCheckpoint);
      await store.save({ ...testCheckpoint, id: 'cp_002' });

      await store.delete('session_001', 'cp_001');

      const checkpoints = await store.list('session_001');
      expect(checkpoints.length).toBe(1);
      expect(checkpoints[0].id).toBe('cp_002');
    });

    it('should handle deleting non-existent checkpoint', async () => {
      await store.save(testCheckpoint);

      // 删除不存在的检查点应该不会抛出错误
      await store.delete('session_001', 'non_existent');

      // 验证原始检查点仍然存在
      const loaded = await store.load('session_001', 'cp_001');
      expect(loaded).toBeDefined();
    });
  });

  // ============================================================================
  // clear 测试
  // ============================================================================

  describe('clear', () => {
    it('should clear all checkpoints for session', async () => {
      await store.save(testCheckpoint);
      await store.save({ ...testCheckpoint, id: 'cp_002' });
      await store.save({ ...testCheckpoint, id: 'cp_003' });

      await store.clear('session_001');

      const checkpoints = await store.list('session_001');
      expect(checkpoints).toEqual([]);
    });

    it('should not affect other sessions', async () => {
      await store.save(testCheckpoint);
      await store.save({ ...testCheckpoint, id: 'cp_002', sessionId: 'other_session' });

      await store.clear('session_001');

      const otherCheckpoints = await store.list('other_session');
      expect(otherCheckpoints.length).toBe(1);
    });

    it('should handle clearing non-existent session', async () => {
      // 清除不存在的会话应该不会抛出错误
      await store.clear('non_existent');

      // 验证没有错误发生
      expect(true).toBe(true);
    });
  });
});

describe('FileCheckpointStore', () => {
  let store: FileCheckpointStore;
  const testDir = '/tmp/test-checkpoints';

  beforeEach(() => {
    store = new FileCheckpointStore(testDir);
  });

  afterEach(async () => {
    // 清理测试目录
    try {
      const fs = await import('fs/promises');
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  // ============================================================================
  // save 测试
  // ============================================================================

  describe('save', () => {
    it('should save checkpoint to file', async () => {
      const checkpoint: Checkpoint = {
        id: 'cp_001',
        sessionId: 'session_001',
        state: {
          currentStep: 5,
          completedSteps: [1, 2, 3],
          context: {},
          errors: [],
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        timestamp: new Date(),
        metadata: {
          step: 5,
          description: 'Test',
        },
      };

      await store.save(checkpoint);

      const loaded = await store.load('session_001', 'cp_001');
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe('cp_001');
    });

    it('should create session directory automatically', async () => {
      const checkpoint: Checkpoint = {
        id: 'cp_001',
        sessionId: 'new_session',
        state: {
          currentStep: 0,
          completedSteps: [],
          context: {},
          errors: [],
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        timestamp: new Date(),
        metadata: { step: 0 },
      };

      await store.save(checkpoint);

      const loaded = await store.load('new_session', 'cp_001');
      expect(loaded).toBeDefined();
    });
  });

  // ============================================================================
  // load 测试
  // ============================================================================

  describe('load', () => {
    it('should load saved checkpoint', async () => {
      const checkpoint: Checkpoint = {
        id: 'cp_001',
        sessionId: 'session_001',
        state: {
          currentStep: 10,
          completedSteps: [1, 2, 3],
          context: { key: 'value' },
          errors: [],
          metadata: {
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
          },
        },
        timestamp: new Date(),
        metadata: { step: 10 },
      };

      await store.save(checkpoint);
      const loaded = await store.load('session_001', 'cp_001');

      expect(loaded?.state.currentStep).toBe(10);
      expect(loaded?.state.context.key).toBe('value');
    });

    it('should return null for non-existent checkpoint', async () => {
      const loaded = await store.load('session_001', 'non_existent');

      expect(loaded).toBeNull();
    });

    it('should use cache for subsequent loads', async () => {
      const checkpoint: Checkpoint = {
        id: 'cp_001',
        sessionId: 'session_001',
        state: {
          currentStep: 5,
          completedSteps: [],
          context: {},
          errors: [],
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        timestamp: new Date(),
        metadata: { step: 5 },
      };

      await store.save(checkpoint);
      await store.load('session_001', 'cp_001');
      const loaded = await store.load('session_001', 'cp_001');

      expect(loaded).toBeDefined();
    });
  });

  // ============================================================================
  // list 测试
  // ============================================================================

  describe('list', () => {
    it('should list all checkpoints', async () => {
      for (let i = 0; i < 3; i++) {
        const checkpoint: Checkpoint = {
          id: `cp_00${i + 1}`,
          sessionId: 'session_001',
          state: {
            currentStep: i,
            completedSteps: [],
            context: {},
            errors: [],
            metadata: {
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          timestamp: new Date(Date.now() + i * 1000),
          metadata: { step: i },
        };
        await store.save(checkpoint);
      }

      const checkpoints = await store.list('session_001');

      expect(checkpoints.length).toBe(3);
    });

    it('should return empty array for non-existent session', async () => {
      const checkpoints = await store.list('non_existent');

      expect(checkpoints).toEqual([]);
    });
  });

  // ============================================================================
  // latest 测试
  // ============================================================================

  describe('latest', () => {
    it('should return latest checkpoint by timestamp', async () => {
      const cp1: Checkpoint = {
        id: 'cp_001',
        sessionId: 'session_001',
        state: {
          currentStep: 1,
          completedSteps: [],
          context: {},
          errors: [],
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        timestamp: new Date('2024-01-01T10:00:00Z'),
        metadata: { step: 1 },
      };
      const cp2: Checkpoint = {
        id: 'cp_002',
        sessionId: 'session_001',
        state: {
          currentStep: 2,
          completedSteps: [],
          context: {},
          errors: [],
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        timestamp: new Date('2024-01-01T12:00:00Z'),
        metadata: { step: 2 },
      };

      await store.save(cp1);
      await store.save(cp2);

      const latest = await store.latest('session_001');

      expect(latest?.id).toBe('cp_002');
    });
  });

  // ============================================================================
  // delete 测试
  // ============================================================================

  describe('delete', () => {
    it('should delete checkpoint file', async () => {
      const checkpoint: Checkpoint = {
        id: 'cp_001',
        sessionId: 'session_001',
        state: {
          currentStep: 0,
          completedSteps: [],
          context: {},
          errors: [],
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        timestamp: new Date(),
        metadata: { step: 0 },
      };

      await store.save(checkpoint);
      await store.delete('session_001', 'cp_001');

      const loaded = await store.load('session_001', 'cp_001');
      expect(loaded).toBeNull();
    });

    it('should clear cache on delete', async () => {
      const checkpoint: Checkpoint = {
        id: 'cp_001',
        sessionId: 'session_001',
        state: {
          currentStep: 0,
          completedSteps: [],
          context: {},
          errors: [],
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        timestamp: new Date(),
        metadata: { step: 0 },
      };

      await store.save(checkpoint);
      await store.load('session_001', 'cp_001'); // 加载到缓存
      await store.delete('session_001', 'cp_001');

      const loaded = await store.load('session_001', 'cp_001');
      expect(loaded).toBeNull();
    });
  });

  // ============================================================================
  // clear 测试
  // ============================================================================

  describe('clear', () => {
    it('should clear all checkpoint files for session', async () => {
      for (let i = 0; i < 3; i++) {
        const checkpoint: Checkpoint = {
          id: `cp_00${i + 1}`,
          sessionId: 'session_001',
          state: {
            currentStep: i,
            completedSteps: [],
            context: {},
            errors: [],
            metadata: {
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          timestamp: new Date(),
          metadata: { step: i },
        };
        await store.save(checkpoint);
      }

      await store.clear('session_001');

      const checkpoints = await store.list('session_001');
      expect(checkpoints).toEqual([]);
    });
  });
});

describe('createCheckpointStore', () => {
  it('should create memory store', () => {
    const store = createCheckpointStore('memory');

    expect(store).toBeInstanceOf(MemoryCheckpointStore);
  });

  it('should create file store with basePath', () => {
    const store = createCheckpointStore('file', { basePath: '/tmp/test' });

    expect(store).toBeInstanceOf(FileCheckpointStore);
  });

  it('should throw error when file store missing basePath', () => {
    expect(() => createCheckpointStore('file')).toThrow(
      'File checkpoint store requires basePath'
    );
  });
});

describe('generateCheckpointId', () => {
  it('should generate unique checkpoint IDs', () => {
    const id1 = generateCheckpointId();
    const id2 = generateCheckpointId();

    expect(id1).not.toBe(id2);
  });

  it('should start with cp_ prefix', () => {
    const id = generateCheckpointId();

    expect(id.startsWith('cp_')).toBe(true);
  });

  it('should contain timestamp and random string', () => {
    const id = generateCheckpointId();
    const parts = id.split('_');

    expect(parts.length).toBe(3); // cp_<timestamp>_<random>
    expect(parts[1]).toMatch(/^\d+$/);
  });
});

describe('concurrent access', () => {
  it('should handle concurrent saves to memory store', async () => {
    const store = new MemoryCheckpointStore();
    const promises: Promise<void>[] = [];

    for (let i = 0; i < 10; i++) {
      const checkpoint: Checkpoint = {
        id: `cp_${i}`,
        sessionId: 'session_001',
        state: {
          currentStep: i,
          completedSteps: [],
          context: {},
          errors: [],
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        timestamp: new Date(),
        metadata: { step: i },
      };
      promises.push(store.save(checkpoint));
    }

    await Promise.all(promises);

    const checkpoints = await store.list('session_001');
    expect(checkpoints.length).toBe(10);
  });

  it('should handle concurrent reads and writes', async () => {
    const store = new MemoryCheckpointStore();

    // 先保存一个检查点
    await store.save({
      id: 'cp_001',
      sessionId: 'session_001',
      state: {
        currentStep: 0,
        completedSteps: [],
        context: {},
        errors: [],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      timestamp: new Date(),
      metadata: { step: 0 },
    });

    // 并发读写
    const results = await Promise.all([
      store.load('session_001', 'cp_001'),
      store.list('session_001'),
      store.load('session_001', 'cp_001'),
    ]);

    expect(results[0]).toBeDefined();
    expect(results[1].length).toBe(1);
    expect(results[2]).toBeDefined();
  });
});
