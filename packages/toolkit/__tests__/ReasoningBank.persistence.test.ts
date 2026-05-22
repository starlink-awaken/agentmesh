/**
 * ReasoningBank 持久化功能测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ReasoningBank } from '../src/memory/ReasoningBank.js';
import { FileStorageAdapter } from '../src/memory/adapters/FileStorageAdapter.js';
import type { ReasoningMemory, TaskResult } from '../src/memory/types.js';

describe('ReasoningBank Persistence', () => {
  const testDir = join(process.cwd(), 'test-reasoning-bank');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('with storage adapter', () => {
    it('should persist and restore reasoning memories', async () => {
      const adapter = new FileStorageAdapter<ReasoningMemory>({
        storagePath: testDir,
        filename: 'test.jsonl',
      });

      const bank = new ReasoningBank({ storageAdapter: adapter });

      // 学习一些经验
      const result: TaskResult = {
        taskId: 'task_1',
        input: 'Search for information',
        output: { result: 'found' },
        success: true,
        trajectory: ['step1', 'step2'],
        duration: 1000,
      };

      await bank.learn(result);

      // 持久化
      const persisted = await bank.persist();
      expect(persisted).toBe(1);

      // 创建新的 bank 实例并恢复
      const newBank = new ReasoningBank({ storageAdapter: adapter });
      const restored = await newBank.restore();
      expect(restored).toBe(1);

      // 验证数据
      const stats = newBank.getStats();
      expect(stats.total).toBe(1);
      expect(stats.success).toBe(1);
    });

    it('should auto-persist when enabled', async () => {
      const adapter = new FileStorageAdapter<ReasoningMemory>({
        storagePath: testDir,
        filename: 'auto.jsonl',
      });

      const bank = new ReasoningBank({
        storageAdapter: adapter,
        autoPersist: true,
      });

      // 学习经验（应该自动持久化）
      const result: TaskResult = {
        taskId: 'task_1',
        input: 'Test task',
        output: {},
        success: true,
        duration: 100,
      };

      await bank.learn(result);

      // 创建新的 bank 实例并恢复
      const newBank = new ReasoningBank({ storageAdapter: adapter });
      const restored = await newBank.restore();
      expect(restored).toBe(1);
    });

    it('should auto-restore on startup', async () => {
      const adapter = new FileStorageAdapter<ReasoningMemory>({
        storagePath: testDir,
        filename: 'startup.jsonl',
      });

      // 先创建并持久化数据
      {
        const bank = new ReasoningBank({ storageAdapter: adapter });
        const result: TaskResult = {
          taskId: 'task_1',
          input: 'Startup test',
          output: {},
          success: true,
          duration: 100,
        };
        await bank.learn(result);
        await bank.persist();
      }

      // 使用 autoRestore 创建新的 bank
      const newBank = new ReasoningBank({
        storageAdapter: adapter,
        autoRestore: true,
      });

      // 等待自动恢复完成
      await new Promise(resolve => setTimeout(resolve, 100));

      // 验证数据已恢复
      const stats = newBank.getStats();
      expect(stats.total).toBe(1);
    });

    it('should persist failure memories', async () => {
      const adapter = new FileStorageAdapter<ReasoningMemory>({
        storagePath: testDir,
        filename: 'failure.jsonl',
      });

      const bank = new ReasoningBank({ storageAdapter: adapter });

      // 学习失败经验
      const result: TaskResult = {
        taskId: 'task_1',
        input: 'Failed task',
        output: null,
        success: false,
        error: 'Authentication failed',
        trajectory: ['attempt1', 'attempt2'],
        duration: 500,
      };

      await bank.learn(result);
      await bank.persist();

      // 恢复并验证
      const newBank = new ReasoningBank({ storageAdapter: adapter });
      await newBank.restore();

      const stats = newBank.getStats();
      expect(stats.total).toBe(1);
      expect(stats.failure).toBe(1);
    });

    it('should persist after clear', async () => {
      const adapter = new FileStorageAdapter<ReasoningMemory>({
        storagePath: testDir,
        filename: 'clear.jsonl',
      });

      const bank = new ReasoningBank({ storageAdapter: adapter });

      // 学习经验
      const result: TaskResult = {
        taskId: 'task_1',
        input: 'Task to be cleared',
        output: {},
        success: true,
        duration: 100,
      };

      await bank.learn(result);

      // 清除
      await bank.clear();

      // 验证存储文件也被清除
      const newBank = new ReasoningBank({ storageAdapter: adapter });
      const restored = await newBank.restore();
      expect(restored).toBe(0);
    });

    it('should report hasStorageAdapter correctly', async () => {
      const adapter = new FileStorageAdapter<ReasoningMemory>({
        storagePath: testDir,
        filename: 'check.jsonl',
      });

      const bankWithAdapter = new ReasoningBank({ storageAdapter: adapter });
      expect(bankWithAdapter.hasStorageAdapter()).toBe(true);

      const bankWithoutAdapter = new ReasoningBank();
      expect(bankWithoutAdapter.hasStorageAdapter()).toBe(false);
    });

    it('should persist multiple memories', async () => {
      const adapter = new FileStorageAdapter<ReasoningMemory>({
        storagePath: testDir,
        filename: 'multiple.jsonl',
      });

      const bank = new ReasoningBank({
        storageAdapter: adapter,
        autoPersist: true,
      });

      // 学习多个经验
      await bank.learn({
        taskId: 'task_1',
        input: 'Code task',
        output: {},
        success: true,
        duration: 100,
      });

      await bank.learn({
        taskId: 'task_2',
        input: 'Search task',
        output: {},
        success: true,
        duration: 100,
      });

      await bank.learn({
        taskId: 'task_3',
        input: 'Failed task',
        output: null,
        success: false,
        error: 'Error',
        duration: 100,
      });

      // 恢复并验证
      const newBank = new ReasoningBank({ storageAdapter: adapter });
      await newBank.restore();

      const stats = newBank.getStats();
      expect(stats.total).toBe(3);
      expect(stats.success).toBe(2);
      expect(stats.failure).toBe(1);
    });
  });
});
