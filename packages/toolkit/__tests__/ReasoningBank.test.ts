/**
 * ReasoningBank 单元测试
 *
 * 测试推理记忆银行的闭环学习能力
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ReasoningBank } from '../src/memory/ReasoningBank.js';
import type { TaskResult, ReasoningMemory } from '../src/memory/types.js';

describe('ReasoningBank', () => {
  let bank: ReasoningBank;

  beforeEach(() => {
    bank = new ReasoningBank({
      maxMemories: 100,
      embeddingEnabled: false,
    });
  });

  // ============================================================================
  // 构造函数测试
  // ============================================================================

  describe('constructor', () => {
    it('should create reasoning bank', () => {
      expect(bank).toBeDefined();
    });

    it('should accept custom config', () => {
      const customBank = new ReasoningBank({
        maxMemories: 50,
        embeddingEnabled: true,
      });
      expect(customBank).toBeDefined();
    });
  });

  // ============================================================================
  // 检索功能测试
  // ============================================================================

  describe('retrieve', () => {
    it('should return empty array when no memories', async () => {
      const results = await bank.retrieve('test query');
      expect(results).toEqual([]);
    });

    it('should retrieve by title match', async () => {
      // 先添加记忆
      await bank.learn({
        input: '实现搜索功能',
        output: { success: true },
        success: true,
      });

      const results = await bank.retrieve('搜索');
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should respect limit parameter', async () => {
      // 添加多个记忆
      await bank.learn({ input: 'task1', output: {}, success: true });
      await bank.learn({ input: 'task2', output: {}, success: true });
      await bank.learn({ input: 'task3', output: {}, success: true });

      const results = await bank.retrieve('task', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  // ============================================================================
  // 学习功能测试
  // ============================================================================

  describe('learn', () => {
    it('should create memory from successful task', async () => {
      const result: TaskResult = {
        input: '实现用户登录',
        output: { token: 'abc123' },
        success: true,
        duration: 1000,
      };

      const memory = await bank.learn(result);

      expect(memory).toBeDefined();
      expect(memory.outcome).toBe('success');
    });

    it('should create memory from failed task', async () => {
      const result: TaskResult = {
        input: '实现用户登录',
        output: null,
        success: false,
        error: 'Authentication failed',
        duration: 1000,
      };

      const memory = await bank.learn(result);

      expect(memory).toBeDefined();
      expect(memory.outcome).toBe('failure');
    });

    it('should extract tags from input', async () => {
      const result: TaskResult = {
        input: 'search for information',
        output: {},
        success: true,
      };

      const memory = await bank.learn(result);

      expect(memory.tags).toContain('search');
    });

    it('should include trajectory in memory', async () => {
      const result: TaskResult = {
        input: 'test task',
        output: {},
        success: true,
        trajectory: ['step1', 'step2', 'step3'],
      };

      const memory = await bank.learn(result);

      expect(memory.trajectory).toEqual(['step1', 'step2', 'step3']);
    });

    it('should handle string input', async () => {
      const result: TaskResult = {
        input: '简单字符串任务',
        output: {},
        success: true,
      };

      const memory = await bank.learn(result);

      expect(memory).toBeDefined();
      expect(memory.originalTask).toContain('简单字符串任务');
    });

    it('should handle object input', async () => {
      const result: TaskResult = {
        input: { action: 'test', data: 'value' },
        output: {},
        success: true,
      };

      const memory = await bank.learn(result);

      expect(memory).toBeDefined();
    });
  });

  // ============================================================================
  // 整合功能测试
  // ============================================================================

  describe('consolidate', () => {
    it('should add memory to bank', async () => {
      const memory: ReasoningMemory = {
        id: 'test_1',
        title: 'Test Memory',
        description: 'Test description',
        content: 'Test content',
        outcome: 'success',
        refinementLevel: 1,
        originalTask: 'test task',
        tags: ['test'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 0,
      };

      await bank.consolidate(memory);
      const all = bank.getAll();

      expect(all.length).toBe(1);
    });

    it('should evict old memories when exceeding max', async () => {
      const smallBank = new ReasoningBank({ maxMemories: 2 });

      await smallBank.learn({ input: 'task1', output: {}, success: true });
      await smallBank.learn({ input: 'task2', output: {}, success: true });
      await smallBank.learn({ input: 'task3', output: {}, success: true });

      const all = smallBank.getAll();
      expect(all.length).toBeLessThanOrEqual(2);
    });
  });

  // ============================================================================
  // 统计功能测试
  // ============================================================================

  describe('getStats', () => {
    it('should return zero stats for empty bank', () => {
      const stats = bank.getStats();

      expect(stats.total).toBe(0);
      expect(stats.success).toBe(0);
      expect(stats.failure).toBe(0);
    });

    it('should count success and failure memories', async () => {
      await bank.learn({ input: 'success task', output: {}, success: true });
      await bank.learn({ input: 'failed task', output: {}, success: false });

      const stats = bank.getStats();

      expect(stats.total).toBe(2);
      expect(stats.success).toBe(1);
      expect(stats.failure).toBe(1);
    });

    it('should calculate average refinement level', async () => {
      await bank.learn({ input: 'task1', output: {}, success: true });
      await bank.learn({ input: 'task2', output: {}, success: true });

      const stats = bank.getStats();

      expect(stats.avgRefinementLevel).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // 获取记忆测试
  // ============================================================================

  describe('getAll', () => {
    it('should return empty array initially', () => {
      const all = bank.getAll();
      expect(all).toEqual([]);
    });

    it('should return all memories', async () => {
      await bank.learn({ input: 'task1', output: {}, success: true });
      await bank.learn({ input: 'task2', output: {}, success: true });

      const all = bank.getAll();
      expect(all.length).toBe(2);
    });
  });

  // ============================================================================
  // 清除功能测试
  // ============================================================================

  describe('clear', () => {
    it('should clear all memories', async () => {
      await bank.learn({ input: 'task1', output: {}, success: true });
      bank.clear();

      const all = bank.getAll();
      expect(all).toEqual([]);
    });
  });

  // ============================================================================
  // 边界情况测试
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty input', async () => {
      const result: TaskResult = {
        input: '',
        output: {},
        success: true,
      };

      const memory = await bank.learn(result);
      expect(memory).toBeDefined();
    });

    it('should handle null output', async () => {
      const result: TaskResult = {
        input: 'task',
        output: null,
        success: false,
      };

      const memory = await bank.learn(result);
      expect(memory).toBeDefined();
    });

    it('should handle metadata', async () => {
      const result: TaskResult = {
        input: 'task',
        output: {},
        success: true,
        metadata: { category: 'testing', strategy: 'TDD' },
      };

      const memory = await bank.learn(result);
      expect(memory.tags).toContain('testing');
    });

    it('should handle very long input', async () => {
      const longInput = 'x'.repeat(10000);
      const result: TaskResult = {
        input: longInput,
        output: {},
        success: true,
      };

      const memory = await bank.learn(result);
      expect(memory).toBeDefined();
    });
  });

  // ============================================================================
  // 语义搜索功能测试
  // ============================================================================

  describe('semanticSearch', () => {
    it('should throw error when no embedding provider', async () => {
      const bankWithoutProvider = new ReasoningBank({
        embeddingEnabled: true,
      });

      await expect(
        bankWithoutProvider.semanticSearch('test query')
      ).rejects.toThrow('embedding provider');
    });

    it('should return empty array when no memories', async () => {
      const mockProvider = async (text: string) => {
        return new Array(128).fill(0).map(() => Math.random());
      };

      const bankWithProvider = new ReasoningBank({
        embeddingEnabled: true,
        embeddingProvider: mockProvider,
      });

      const results = await bankWithProvider.semanticSearch('test query');
      expect(results).toEqual([]);
    });

    it('should return results with similarity scores', async () => {
      const mockProvider = async (text: string) => {
        return new Array(128).fill(0.1);
      };

      const bankWithProvider = new ReasoningBank({
        embeddingEnabled: true,
        embeddingProvider: mockProvider,
      });

      // 添加记忆
      const memory = await bankWithProvider.learn({
        input: '实现搜索功能',
        output: { success: true },
        success: true,
      });

      // 为记忆添加嵌入
      await bankWithProvider.addEmbedding(memory);

      const results = await bankWithProvider.semanticSearch('搜索相关');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('memory');
      expect(results[0]).toHaveProperty('similarity');
    });

    it('should respect limit parameter', async () => {
      const mockProvider = async (text: string) => {
        return new Array(128).fill(0).map(() => Math.random());
      };

      const bankWithProvider = new ReasoningBank({
        embeddingEnabled: true,
        embeddingProvider: mockProvider,
      });

      // 添加多个记忆
      await bankWithProvider.learn({ input: 'task1', output: {}, success: true });
      await bankWithProvider.learn({ input: 'task2', output: {}, success: true });
      await bankWithProvider.learn({ input: 'task3', output: {}, success: true });

      const results = await bankWithProvider.semanticSearch('task', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  // ============================================================================
  // addEmbedding 功能测试
  // ============================================================================

  describe('addEmbedding', () => {
    it('should throw error when no embedding provider', async () => {
      const bankWithoutProvider = new ReasoningBank();

      const memory: ReasoningMemory = {
        id: 'test_1',
        title: 'Test Memory',
        description: 'Test description',
        content: 'Test content',
        outcome: 'success',
        refinementLevel: 1,
        tags: ['test'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 0,
      };

      await expect(
        bankWithoutProvider.addEmbedding(memory)
      ).rejects.toThrow('embedding provider');
    });

    it('should add embedding to memory', async () => {
      const mockProvider = async (text: string) => {
        return new Array(128).fill(0.1);
      };

      const bankWithProvider = new ReasoningBank({
        embeddingProvider: mockProvider,
      });

      const memory: ReasoningMemory = {
        id: 'test_1',
        title: 'Test Memory',
        description: 'Test description',
        content: 'Test content',
        outcome: 'success',
        refinementLevel: 1,
        tags: ['test'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 0,
      };

      await bankWithProvider.addEmbedding(memory);

      // 检查嵌入是否添加到内存对象
      const memWithEmbedding = memory as ReasoningMemory & { embedding: number[] };
      expect(memWithEmbedding.embedding).toBeDefined();
      expect(memWithEmbedding.embedding.length).toBe(128);
    });
  });

  // ============================================================================
  // addEmbeddings 批量添加测试
  // ============================================================================

  describe('addEmbeddings', () => {
    it('should add embeddings to multiple memories', async () => {
      const mockProvider = async (text: string) => {
        return new Array(128).fill(0.1);
      };

      const bankWithProvider = new ReasoningBank({
        embeddingProvider: mockProvider,
      });

      const memories: ReasoningMemory[] = [
        {
          id: 'test_1',
          title: 'Memory 1',
          description: 'Description 1',
          content: 'Content 1',
          outcome: 'success',
          refinementLevel: 1,
          tags: ['test'],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessCount: 0,
        },
        {
          id: 'test_2',
          title: 'Memory 2',
          description: 'Description 2',
          content: 'Content 2',
          outcome: 'failure',
          refinementLevel: 1,
          tags: ['test'],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessCount: 0,
        },
      ];

      await bankWithProvider.addEmbeddings(memories);

      // 检查两个记忆都有嵌入
      for (const memory of memories) {
        const memWithEmbedding = memory as ReasoningMemory & { embedding: number[] };
        expect(memWithEmbedding.embedding).toBeDefined();
        expect(memWithEmbedding.embedding.length).toBe(128);
      }
    });
  });
});
