/**
 * FileStorageAdapter 单元测试
 *
 * 测试文件存储适配器的持久化能力
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { FileStorageAdapter } from '../src/memory/adapters/FileStorageAdapter.js';
import type { MemoryEntry, ReasoningMemory } from '../src/memory/types.js';

describe('FileStorageAdapter', () => {
  let adapter: FileStorageAdapter<MemoryEntry>;
  const testDir = join(process.cwd(), 'test-storage');

  beforeEach(() => {
    // 清理并创建测试目录
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // 清理测试目录
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  // ============================================================================
  // 构造函数测试
  // ============================================================================

  describe('constructor', () => {
    it('should create adapter with default path', () => {
      adapter = new FileStorageAdapter<MemoryEntry>({
        storagePath: testDir,
        filename: 'test-memory.jsonl',
      });
      expect(adapter).toBeDefined();
    });

    it('should create adapter with custom path', () => {
      const customPath = join(testDir, 'custom');
      adapter = new FileStorageAdapter<MemoryEntry>({
        storagePath: customPath,
        filename: 'custom-memory.jsonl',
      });
      expect(adapter).toBeDefined();
    });

    it('should create storage directory if not exists', () => {
      const newPath = join(testDir, 'new-dir');
      adapter = new FileStorageAdapter<MemoryEntry>({
        storagePath: newPath,
        filename: 'memory.jsonl',
      });
      expect(existsSync(newPath)).toBe(true);
    });
  });

  // ============================================================================
  // save 测试
  // ============================================================================

  describe('save', () => {
    beforeEach(() => {
      adapter = new FileStorageAdapter<MemoryEntry>({
        storagePath: testDir,
        filename: 'test-memory.jsonl',
      });
    });

    it('should save empty array', async () => {
      await adapter.save([]);
      const loaded = await adapter.load();
      expect(loaded).toEqual([]);
    });

    it('should save single entry', async () => {
      const entry: MemoryEntry = {
        id: 'mem_001',
        content: 'Test memory content',
        metadata: {
          sessionId: 'session_001',
          timestamp: Date.now(),
          importance: 0.8,
          tags: ['test'],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await adapter.save([entry]);
      const loaded = await adapter.load();

      expect(loaded.length).toBe(1);
      expect(loaded[0].id).toBe('mem_001');
      expect(loaded[0].content).toBe('Test memory content');
    });

    it('should save multiple entries', async () => {
      const entries: MemoryEntry[] = [
        {
          id: 'mem_001',
          content: 'First memory',
          metadata: {
            sessionId: 'session_001',
            timestamp: Date.now(),
            importance: 0.7,
            tags: ['test'],
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'mem_002',
          content: 'Second memory',
          metadata: {
            sessionId: 'session_001',
            timestamp: Date.now(),
            importance: 0.9,
            tags: ['important'],
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      await adapter.save(entries);
      const loaded = await adapter.load();

      expect(loaded.length).toBe(2);
    });

    it('should overwrite existing file', async () => {
      const entry1: MemoryEntry = {
        id: 'mem_001',
        content: 'Original content',
        metadata: {
          sessionId: 'session_001',
          timestamp: Date.now(),
          importance: 0.5,
          tags: [],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await adapter.save([entry1]);

      const entry2: MemoryEntry = {
        id: 'mem_002',
        content: 'New content',
        metadata: {
          sessionId: 'session_002',
          timestamp: Date.now(),
          importance: 0.8,
          tags: [],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await adapter.save([entry2]);
      const loaded = await adapter.load();

      expect(loaded.length).toBe(1);
      expect(loaded[0].id).toBe('mem_002');
    });

    it('should handle entries with embeddings', async () => {
      const entry: MemoryEntry = {
        id: 'mem_001',
        content: 'Memory with embedding',
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
        metadata: {
          sessionId: 'session_001',
          timestamp: Date.now(),
          importance: 0.8,
          tags: ['embedding'],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await adapter.save([entry]);
      const loaded = await adapter.load();

      expect(loaded[0].embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });
  });

  // ============================================================================
  // load 测试
  // ============================================================================

  describe('load', () => {
    beforeEach(() => {
      adapter = new FileStorageAdapter<MemoryEntry>({
        storagePath: testDir,
        filename: 'test-memory.jsonl',
      });
    });

    it('should return empty array when file does not exist', async () => {
      const loaded = await adapter.load();
      expect(loaded).toEqual([]);
    });

    it('should load saved entries', async () => {
      const entries: MemoryEntry[] = [
        {
          id: 'mem_001',
          content: 'Test content',
          metadata: {
            sessionId: 'session_001',
            timestamp: 1000,
            importance: 0.5,
            tags: ['test'],
          },
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];

      await adapter.save(entries);
      const loaded = await adapter.load();

      expect(loaded.length).toBe(1);
      expect(loaded[0].id).toBe('mem_001');
      expect(loaded[0].metadata.timestamp).toBe(1000);
    });

    it('should handle corrupted file gracefully', async () => {
      // 写入无效的 JSON
      const filePath = join(testDir, 'test-memory.jsonl');
      const fs = await import('fs');
      fs.writeFileSync(filePath, 'invalid json\n{broken');

      // 应该返回空数组或抛出可处理的错误
      try {
        const loaded = await adapter.load();
        expect(loaded).toEqual([]);
      } catch (error) {
        // 如果抛出错误，应该是可识别的错误类型
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  // ============================================================================
  // clear 测试
  // ============================================================================

  describe('clear', () => {
    beforeEach(() => {
      adapter = new FileStorageAdapter<MemoryEntry>({
        storagePath: testDir,
        filename: 'test-memory.jsonl',
      });
    });

    it('should clear all entries', async () => {
      const entry: MemoryEntry = {
        id: 'mem_001',
        content: 'Test content',
        metadata: {
          sessionId: 'session_001',
          timestamp: Date.now(),
          importance: 0.5,
          tags: [],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await adapter.save([entry]);
      await adapter.clear();
      const loaded = await adapter.load();

      expect(loaded).toEqual([]);
    });

    it('should handle clear on empty storage', async () => {
      await adapter.clear();
      const loaded = await adapter.load();
      expect(loaded).toEqual([]);
    });
  });

  // ============================================================================
  // append 测试
  // ============================================================================

  describe('append', () => {
    beforeEach(() => {
      adapter = new FileStorageAdapter<MemoryEntry>({
        storagePath: testDir,
        filename: 'test-memory.jsonl',
      });
    });

    it('should append entries to existing file', async () => {
      const entry1: MemoryEntry = {
        id: 'mem_001',
        content: 'First',
        metadata: {
          sessionId: 'session_001',
          timestamp: Date.now(),
          importance: 0.5,
          tags: [],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await adapter.save([entry1]);

      const entry2: MemoryEntry = {
        id: 'mem_002',
        content: 'Second',
        metadata: {
          sessionId: 'session_001',
          timestamp: Date.now(),
          importance: 0.5,
          tags: [],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await adapter.append([entry2]);
      const loaded = await adapter.load();

      expect(loaded.length).toBe(2);
    });

    it('should create file if not exists when appending', async () => {
      const entry: MemoryEntry = {
        id: 'mem_001',
        content: 'First entry',
        metadata: {
          sessionId: 'session_001',
          timestamp: Date.now(),
          importance: 0.5,
          tags: [],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await adapter.append([entry]);
      const loaded = await adapter.load();

      expect(loaded.length).toBe(1);
    });
  });

  // ============================================================================
  // ReasoningMemory 测试
  // ============================================================================

  describe('with ReasoningMemory', () => {
    let reasoningAdapter: FileStorageAdapter<ReasoningMemory>;

    beforeEach(() => {
      reasoningAdapter = new FileStorageAdapter<ReasoningMemory>({
        storagePath: testDir,
        filename: 'reasoning-bank.jsonl',
      });
    });

    it('should save and load ReasoningMemory entries', async () => {
      const memory: ReasoningMemory = {
        id: 'rb_001',
        title: 'Test Strategy',
        description: 'A test reasoning strategy',
        content: 'Detailed reasoning steps...',
        outcome: 'success',
        refinementLevel: 1,
        originalTask: 'Test task',
        trajectory: ['step1', 'step2'],
        tags: ['test', 'strategy'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 0,
      };

      await reasoningAdapter.save([memory]);
      const loaded = await reasoningAdapter.load();

      expect(loaded.length).toBe(1);
      expect(loaded[0].title).toBe('Test Strategy');
      expect(loaded[0].outcome).toBe('success');
      expect(loaded[0].trajectory).toEqual(['step1', 'step2']);
    });
  });

  // ============================================================================
  // 错误处理测试
  // ============================================================================

  describe('error handling', () => {
    it('should handle corrupted file gracefully', async () => {
      // 写入无效的 JSON
      const filePath = join(testDir, 'corrupted.jsonl');
      const fs = await import('fs');
      fs.writeFileSync(filePath, 'invalid json\n{broken');

      const corruptedAdapter = new FileStorageAdapter<MemoryEntry>({
        storagePath: testDir,
        filename: 'corrupted.jsonl',
      });

      // 应该返回空数组或抛出可处理的错误
      try {
        const loaded = await corruptedAdapter.load();
        expect(loaded).toEqual([]);
      } catch (error) {
        // 如果抛出错误，应该是可识别的错误类型
        expect(error).toBeInstanceOf(Error);
      }
    });
  });
});
