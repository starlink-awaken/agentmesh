import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createVectorStore, VectorStoreConfig, VectorDocument } from '../src/knowledge/VectorStore';

describe('VectorStore', () => {
  describe('MemoryVectorStore', () => {
    let store: ReturnType<typeof createVectorStore>;

    beforeEach(() => {
      const config: VectorStoreConfig = {
        provider: 'memory',
        dimension: 384
      };
      store = createVectorStore(config);
    });

    afterEach(async () => {
      await store.clear();
    });

    test('should add and retrieve documents', async () => {
      const documents: VectorDocument[] = [
        {
          id: 'doc1',
          content: 'This is document 1',
          metadata: { category: 'test', priority: 1 }
        },
        {
          id: 'doc2',
          content: 'This is document 2',
          metadata: { category: 'test', priority: 2 }
        }
      ];

      await store.add(documents);

      const retrieved = await store.get(['doc1', 'doc2']);
      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].content).toBe('This is document 1');
      expect(retrieved[1].content).toBe('This is document 2');
    });

    test('should search documents', async () => {
      const documents: VectorDocument[] = [
        {
          id: 'doc1',
          content: 'Machine learning is fascinating',
          metadata: { topic: 'ai' }
        },
        {
          id: 'doc2',
          content: 'Deep learning requires GPUs',
          metadata: { topic: 'ai' }
        }
      ];

      await store.add(documents);

      const results = await store.search('learning', 5);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThan(0);
    });

    test('should delete documents', async () => {
      const documents: VectorDocument[] = [
        { id: 'doc1', content: 'Test 1', metadata: {} },
        { id: 'doc2', content: 'Test 2', metadata: {} }
      ];

      await store.add(documents);

      let retrieved = await store.get(['doc1', 'doc2']);
      expect(retrieved).toHaveLength(2);

      await store.delete(['doc1']);

      retrieved = await store.get(['doc1', 'doc2']);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].id).toBe('doc2');
    });

    test('should get stats', async () => {
      const documents: VectorDocument[] = [
        { id: 'doc1', content: 'Test 1', metadata: {} },
        { id: 'doc2', content: 'Test 2', metadata: {} }
      ];

      await store.add(documents);

      const stats = await store.getStats();
      expect(stats.count).toBe(2);
      expect(stats.dimension).toBe(384);
    });

    test('should clear all documents', async () => {
      const documents: VectorDocument[] = [
        { id: 'doc1', content: 'Test 1', metadata: {} },
        { id: 'doc2', content: 'Test 2', metadata: {} }
      ];

      await store.add(documents);

      let stats = await store.getStats();
      expect(stats.count).toBe(2);

      await store.clear();

      stats = await store.getStats();
      expect(stats.count).toBe(0);
    });
  });

  describe('ChromaVectorStore (mock)', () => {
    let store: ReturnType<typeof createVectorStore>;

    beforeEach(() => {
      const config: VectorStoreConfig = {
        provider: 'chroma',
        collectionName: 'test-collection',
        dimension: 384,
        path: 'http://localhost:8000'
      };
      store = createVectorStore(config);
    });

    test('should create ChromaVectorStore instance', () => {
      expect(store).toBeDefined();
      expect(typeof store.add).toBe('function');
      expect(typeof store.search).toBe('function');
      expect(typeof store.get).toBe('function');
      expect(typeof store.delete).toBe('function');
      expect(typeof store.getStats).toBe('function');
      expect(typeof store.clear).toBe('function');
    });

    test.skip('should handle add operation (mock)', async () => {
      const documents: VectorDocument[] = [
        {
          id: 'doc1',
          content: 'Test document for ChromaDB',
          metadata: { source: 'test' }
        }
      ];

      // 应该不抛出错误
      await store.add(documents);
    });

    test.skip('should handle search operation (mock)', async () => {
      // 应该返回空数组或模拟结果
      const results = await store.search('test query', 5);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('QdrantVectorStore (mock)', () => {
    let store: ReturnType<typeof createVectorStore>;

    beforeEach(() => {
      const config: VectorStoreConfig = {
        provider: 'qdrant',
        collectionName: 'test-collection',
        dimension: 384,
        url: 'http://localhost:6333'
      };
      store = createVectorStore(config);
    });

    test('should create QdrantVectorStore instance', () => {
      expect(store).toBeDefined();
      expect(typeof store.add).toBe('function');
      expect(typeof store.search).toBe('function');
      expect(typeof store.get).toBe('function');
      expect(typeof store.delete).toBe('function');
      expect(typeof store.getStats).toBe('function');
      expect(typeof store.clear).toBe('function');
    });

    test.skip('should handle add operation (mock)', async () => {
      const documents: VectorDocument[] = [
        {
          id: 'doc1',
          content: 'Test document for Qdrant',
          metadata: { source: 'test' }
        }
      ];

      // 应该不抛出错误
      await store.add(documents);
    });

    test.skip('should handle search operation (mock)', async () => {
      // 应该返回空数组或模拟结果
      const results = await store.search('test query', 5);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Factory function', () => {
    test('should create memory store by default', () => {
      const config: VectorStoreConfig = {
        provider: 'memory',
        dimension: 384
      };
      const store = createVectorStore(config);
      expect(store).toBeDefined();
    });

    test('should create ChromaDB store', () => {
      const config: VectorStoreConfig = {
        provider: 'chroma',
        collectionName: 'test',
        dimension: 384
      };
      const store = createVectorStore(config);
      expect(store).toBeDefined();
    });

    test('should create Qdrant store', () => {
      const config: VectorStoreConfig = {
        provider: 'qdrant',
        collectionName: 'test',
        dimension: 384
      };
      const store = createVectorStore(config);
      expect(store).toBeDefined();
    });

    test('should fallback to memory store for unknown provider', () => {
      const config = {
        provider: 'unknown' as any,
        dimension: 384
      };
      const store = createVectorStore(config);
      expect(store).toBeDefined();
    });
  });
});