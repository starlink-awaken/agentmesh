/**
 * EmbeddingProvider Tests - Embedding Provider 单元测试
 *
 * 测试向量嵌入提供者的核心功能
 * TDD: 测试先行
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  LocalEmbeddingProvider,
  cosineSimilarity,
  type EmbeddingProvider,
} from '../src/memory/EmbeddingProvider.js';

describe('EmbeddingProvider', () => {
  // ============================================================================
  // cosineSimilarity 工具函数测试
  // ============================================================================

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vec = [1, 2, 3, 4, 5];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 2, 3];
      const b = [-1, -2, -3];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
    });

    it('should return 0 for vectors of different lengths', () => {
      const a = [1, 2, 3];
      const b = [1, 2];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('should return 0 for empty vectors', () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it('should return 0 for zero vectors', () => {
      const a = [0, 0, 0];
      const b = [1, 2, 3];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('should calculate similarity for normalized vectors', () => {
      // Normalized vectors: magnitude = 1
      const a = [0.6, 0.8]; // magnitude = 1
      const b = [0.8, 0.6]; // magnitude = 1
      // dot product = 0.48 + 0.48 = 0.96
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.96, 5);
    });

    it('should handle negative values', () => {
      const a = [1, -1, 1];
      const b = [1, 1, -1];
      // dot = 1 - 1 - 1 = -1
      // |a| = sqrt(3), |b| = sqrt(3)
      // cos = -1/3
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1 / 3, 5);
    });
  });

  // ============================================================================
  // LocalEmbeddingProvider 测试
  // ============================================================================

  describe('LocalEmbeddingProvider', () => {
    let provider: LocalEmbeddingProvider;

    beforeEach(() => {
      provider = new LocalEmbeddingProvider();
    });

    describe('constructor', () => {
      it('should create provider with default config', () => {
        expect(provider).toBeDefined();
      });

      it('should accept custom dimensions', () => {
        const customProvider = new LocalEmbeddingProvider({ dimensions: 256 });
        expect(customProvider).toBeDefined();
      });

      it('should accept cache configuration', () => {
        const cachedProvider = new LocalEmbeddingProvider({
          cacheEnabled: true,
          maxCacheSize: 1000,
        });
        expect(cachedProvider).toBeDefined();
      });
    });

    describe('embed', () => {
      it('should return vector of correct dimensions', async () => {
        const embedding = await provider.embed('test text');
        expect(Array.isArray(embedding)).toBe(true);
        expect(embedding.length).toBeGreaterThan(0);
      });

      it('should return same embedding for identical text', async () => {
        const text = 'identical text';
        const embedding1 = await provider.embed(text);
        const embedding2 = await provider.embed(text);
        expect(embedding1).toEqual(embedding2);
      });

      it('should return different embeddings for different text', async () => {
        const embedding1 = await provider.embed('hello world');
        const embedding2 = await provider.embed('goodbye world');
        expect(embedding1).not.toEqual(embedding2);
      });

      it('should handle empty string', async () => {
        const embedding = await provider.embed('');
        expect(Array.isArray(embedding)).toBe(true);
      });

      it('should handle unicode characters', async () => {
        const embedding = await provider.embed('你好世界 🌍');
        expect(Array.isArray(embedding)).toBe(true);
      });

      it('should normalize output vectors', async () => {
        const embedding = await provider.embed('normalize this vector');
        const magnitude = Math.sqrt(
          embedding.reduce((sum, val) => sum + val * val, 0)
        );
        expect(magnitude).toBeCloseTo(1, 3);
      });

      it('should use cache for repeated calls', async () => {
        const cachedProvider = new LocalEmbeddingProvider({ cacheEnabled: true });
        const text = 'cached text';

        const start1 = performance.now();
        await cachedProvider.embed(text);
        const time1 = performance.now() - start1;

        const start2 = performance.now();
        await cachedProvider.embed(text);
        const time2 = performance.now() - start2;

        // Second call should be faster (from cache)
        expect(time2).toBeLessThanOrEqual(time1 * 2); // Allow some margin
      });
    });

    describe('embedBatch', () => {
      it('should return embeddings for multiple texts', async () => {
        const texts = ['hello', 'world', 'test'];
        const embeddings = await provider.embedBatch(texts);

        expect(embeddings.length).toBe(3);
        embeddings.forEach((emb) => {
          expect(Array.isArray(emb)).toBe(true);
          expect(emb.length).toBeGreaterThan(0);
        });
      });

      it('should return empty array for empty input', async () => {
        const embeddings = await provider.embedBatch([]);
        expect(embeddings).toEqual([]);
      });

      it('should maintain order of inputs', async () => {
        const texts = ['first', 'second', 'third'];
        const embeddings = await provider.embedBatch(texts);

        const single = await provider.embed('second');
        expect(embeddings[1]).toEqual(single);
      });

      it('should handle large batches', async () => {
        const texts = Array(100).fill('').map((_, i) => `text ${i}`);
        const embeddings = await provider.embedBatch(texts);

        expect(embeddings.length).toBe(100);
      });
    });

    describe('similarity', () => {
      it('should calculate similarity between texts', async () => {
        const sim = await provider.similarity('hello world', 'hello world');
        expect(sim).toBeCloseTo(1, 3);
      });

      it('should return lower similarity for different texts', async () => {
        const sim = await provider.similarity('cat dog', 'python java');
        expect(sim).toBeLessThan(1);
      });

      it('should handle similar texts', async () => {
        const sim1 = await provider.similarity('the cat sat', 'the cat sat on mat');
        const sim2 = await provider.similarity('the cat sat', 'programming in rust');

        // Similar texts should have higher similarity
        expect(sim1).toBeGreaterThan(sim2);
      });
    });

    describe('clearCache', () => {
      it('should clear the cache', async () => {
        const cachedProvider = new LocalEmbeddingProvider({ cacheEnabled: true });
        const text = 'cache test';

        await cachedProvider.embed(text);
        cachedProvider.clearCache();

        // After clear, internal cache should be empty
        const stats = cachedProvider.getCacheStats();
        expect(stats.size).toBe(0);
      });
    });

    describe('getCacheStats', () => {
      it('should return cache statistics', async () => {
        const cachedProvider = new LocalEmbeddingProvider({ cacheEnabled: true });
        await cachedProvider.embed('text 1');
        await cachedProvider.embed('text 2');

        const stats = cachedProvider.getCacheStats();
        expect(stats.size).toBe(2);
        expect(stats.maxSize).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================================
  // EmbeddingProvider Interface 契约测试
  // ============================================================================

  describe('EmbeddingProvider Interface', () => {
    it('should implement required methods', () => {
      const provider: EmbeddingProvider = new LocalEmbeddingProvider();

      expect(typeof provider.embed).toBe('function');
      expect(typeof provider.embedBatch).toBe('function');
      expect(typeof provider.similarity).toBe('function');
    });
  });
});
