/**
 * MemoryStore 持久化功能测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MemoryStore } from '../src/memory/MemoryStore.js';
import { FileStorageAdapter } from '../src/memory/adapters/FileStorageAdapter.js';
import type { MemoryEntry } from '../src/memory/types.js';

describe('MemoryStore Persistence', () => {
  const testDir = join(process.cwd(), 'test-memory-store');

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
    it('should persist and restore memory entries', async () => {
      const adapter = new FileStorageAdapter<MemoryEntry>({
        storagePath: testDir,
        filename: 'test.jsonl',
      });

      const store = new MemoryStore({ storageAdapter: adapter });

      // 存储一些记忆
      await store.store({
        content: 'First memory',
        metadata: {
          sessionId: 'session_1',
          timestamp: Date.now(),
          importance: 0.8,
          tags: ['test'],
        },
      });

      await store.store({
        content: 'Second memory',
        metadata: {
          sessionId: 'session_1',
          timestamp: Date.now(),
          importance: 0.9,
          tags: ['important'],
        },
      });

      // 持久化
      const persisted = await store.persist();
      expect(persisted).toBe(2);

      // 创建新的 store 实例并恢复
      const newStore = new MemoryStore({ storageAdapter: adapter });
      const restored = await newStore.restore();
      expect(restored).toBe(2);

      // 验证数据
      const stats = newStore.getStats();
      expect(stats.totalEntries).toBe(2);
    });

    it('should auto-persist when enabled', async () => {
      const adapter = new FileStorageAdapter<MemoryEntry>({
        storagePath: testDir,
        filename: 'auto.jsonl',
      });

      const store = new MemoryStore({
        storageAdapter: adapter,
        autoPersist: true,
      });

      // 存储记忆（应该自动持久化）
      await store.store({
        content: 'Auto persisted memory',
        metadata: {
          sessionId: 'session_1',
          timestamp: Date.now(),
          importance: 0.7,
          tags: ['auto'],
        },
      });

      // 创建新的 store 实例并恢复
      const newStore = new MemoryStore({ storageAdapter: adapter });
      const restored = await newStore.restore();
      expect(restored).toBe(1);
    });

    it('should auto-restore on startup', async () => {
      const adapter = new FileStorageAdapter<MemoryEntry>({
        storagePath: testDir,
        filename: 'startup.jsonl',
      });

      // 先创建并持久化数据
      {
        const store = new MemoryStore({ storageAdapter: adapter });
        await store.store({
          content: 'Startup test memory',
          metadata: {
            sessionId: 'session_1',
            timestamp: Date.now(),
            importance: 0.8,
            tags: [],
          },
        });
        await store.persist();
      }

      // 使用 autoRestore 创建新的 store
      const newStore = new MemoryStore({
        storageAdapter: adapter,
        autoRestore: true,
      });

      // 等待自动恢复完成
      await new Promise(resolve => setTimeout(resolve, 100));

      // 验证数据已恢复
      const stats = newStore.getStats();
      expect(stats.totalEntries).toBe(1);
    });

    it('should persist after update', async () => {
      const adapter = new FileStorageAdapter<MemoryEntry>({
        storagePath: testDir,
        filename: 'update.jsonl',
      });

      const store = new MemoryStore({
        storageAdapter: adapter,
        autoPersist: true,
      });

      // 存储并获取 id
      const entry = await store.store({
        content: 'Original content',
        metadata: {
          sessionId: 'session_1',
          timestamp: Date.now(),
          importance: 0.5,
          tags: [],
        },
      });

      // 更新
      await store.update(entry.id, { content: 'Updated content' });

      // 恢复并验证
      const newStore = new MemoryStore({ storageAdapter: adapter });
      await newStore.restore();

      const updated = await newStore.retrieve({ query: 'Updated' });
      expect(updated.length).toBe(1);
      expect(updated[0].content).toBe('Updated content');
    });

    it('should persist after delete', async () => {
      const adapter = new FileStorageAdapter<MemoryEntry>({
        storagePath: testDir,
        filename: 'delete.jsonl',
      });

      const store = new MemoryStore({
        storageAdapter: adapter,
        autoPersist: true,
      });

      // 存储两个条目
      const entry1 = await store.store({
        content: 'To be deleted',
        metadata: {
          sessionId: 'session_1',
          timestamp: Date.now(),
          importance: 0.5,
          tags: [],
        },
      });

      await store.store({
        content: 'To be kept',
        metadata: {
          sessionId: 'session_1',
          timestamp: Date.now(),
          importance: 0.5,
          tags: [],
        },
      });

      // 删除第一个
      await store.delete(entry1.id);

      // 恢复并验证
      const newStore = new MemoryStore({ storageAdapter: adapter });
      await newStore.restore();

      const stats = newStore.getStats();
      expect(stats.totalEntries).toBe(1);
    });

    it('should report hasStorageAdapter correctly', async () => {
      const adapter = new FileStorageAdapter<MemoryEntry>({
        storagePath: testDir,
        filename: 'check.jsonl',
      });

      const storeWithAdapter = new MemoryStore({ storageAdapter: adapter });
      expect(storeWithAdapter.hasStorageAdapter()).toBe(true);

      const storeWithoutAdapter = new MemoryStore();
      expect(storeWithoutAdapter.hasStorageAdapter()).toBe(false);
    });
  });
});
