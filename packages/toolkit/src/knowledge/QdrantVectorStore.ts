/**
 * QdrantVectorStore - Qdrant 向量存储实现
 *
 * @author PAI
 */

import type { VectorStoreConfig, VectorDocument, VectorSearchResult, IVectorStore } from './VectorStore';

export class QdrantVectorStore implements IVectorStore {
  private client: any;
  private collectionName: string;
  private dimension: number;
  private url: string;
  private apiKey?: string;

  constructor(config: VectorStoreConfig) {
    this.collectionName = config.collectionName || 'default';
    this.dimension = config.dimension || 384;
    this.url = config.url || 'http://localhost:6333';
    this.apiKey = config.apiKey;

    // 延迟加载 @qdrant/js-client-rest 依赖
    // 实际使用时需要安装 @qdrant/js-client-rest 包
    try {
      // @ts-ignore - 动态导入
      const { QdrantClient } = require('@qdrant/js-client-rest');
      this.client = new QdrantClient({
        url: this.url,
        apiKey: this.apiKey
      });
    } catch (error) {
      console.warn('Qdrant not available, using mock client. Install with: bun add @qdrant/js-client-rest');
      this.client = this.createMockClient();
    }
  }

  private createMockClient() {
    return {
      getCollections: async () => ({ collections: [] }),
      createCollection: async (params: any) => {
        console.log('Mock Qdrant createCollection:', params);
      },
      upsert: async (params: any) => {
        console.log('Mock Qdrant upsert:', params.points?.length || 0, 'points');
      },
      search: async (params: any) => ({
        points: []
      }),
      retrieve: async (params: any) => ({
        points: []
      }),
      delete: async (params: any) => {
        console.log('Mock Qdrant delete:', params);
      },
      count: async (params: any) => ({
        count: 0
      })
    };
  }

  async initialize(): Promise<void> {
    try {
      // 检查集合是否存在
      const collections = await this.client.getCollections();
      const exists = collections.collections.some((c: any) => c.name === this.collectionName);

      if (!exists) {
        await this.client.createCollection({
          collection_name: this.collectionName,
          vectors: {
            size: this.dimension,
            distance: 'Cosine'
          }
        });
      }
    } catch (error) {
      console.error('Failed to initialize Qdrant collection:', error);
      throw error;
    }
  }

  async add(documents: VectorDocument[]): Promise<void> {
    await this.initialize();

    const points = documents.map(doc => ({
      id: doc.id,
      vector: doc.embedding || this.generateMockEmbedding(),
      payload: {
        content: doc.content,
        ...doc.metadata
      }
    }));

    try {
      await this.client.upsert({
        collection_name: this.collectionName,
        points,
        wait: true
      });
    } catch (error) {
      console.error('Failed to add documents to Qdrant:', error);
      throw error;
    }
  }

  async delete(ids: string[]): Promise<void> {
    await this.initialize();

    try {
      await this.client.delete({
        collection_name: this.collectionName,
        points: ids,
        wait: true
      });
    } catch (error) {
      console.error('Failed to delete documents from Qdrant:', error);
      throw error;
    }
  }

  async search(
    query: string | number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<VectorSearchResult[]> {
    await this.initialize();

    let queryVector: number[];
    if (typeof query === 'string') {
      // 实际使用时需要接入 embedding 模型
      queryVector = this.generateMockEmbedding();
    } else {
      queryVector = query;
    }

    try {
      const result = await this.client.search({
        collection_name: this.collectionName,
        vector: queryVector,
        limit: topK,
        filter: filter ? this.buildQdrantFilter(filter) : undefined,
        with_payload: true,
        with_vector: false
      });

      return result.points.map((point: any) => ({
        id: point.id,
        content: point.payload?.content || '',
        score: point.score || 0,
        metadata: {
          ...point.payload,
          content: undefined // 移除 content，因为已经在顶层
        }
      }));
    } catch (error) {
      console.error('Failed to search Qdrant:', error);
      throw error;
    }
  }

  async get(ids: string[]): Promise<VectorDocument[]> {
    await this.initialize();

    try {
      const result = await this.client.retrieve({
        collection_name: this.collectionName,
        ids,
        with_payload: true,
        with_vector: false
      });

      return result.points.map((point: any) => ({
        id: point.id,
        content: point.payload?.content || '',
        metadata: {
          ...point.payload,
          content: undefined
        }
      }));
    } catch (error) {
      console.error('Failed to get documents from Qdrant:', error);
      throw error;
    }
  }

  async getStats(): Promise<{ count: number; dimension: number }> {
    await this.initialize();

    try {
      const result = await this.client.count({
        collection_name: this.collectionName
      });

      return {
        count: result.count,
        dimension: this.dimension
      };
    } catch (error) {
      console.error('Failed to get stats from Qdrant:', error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    await this.initialize();

    try {
      // Qdrant 可以通过删除所有点来清空集合
      await this.client.delete({
        collection_name: this.collectionName,
        points: [],
        wait: true
      });
    } catch (error) {
      console.error('Failed to clear Qdrant collection:', error);
      throw error;
    }
  }

  private generateMockEmbedding(): number[] {
    // 生成模拟的 embedding 向量
    return Array(this.dimension).fill(0).map(() => Math.random() - 0.5);
  }

  private buildQdrantFilter(filter: Record<string, unknown>): any {
    // 将通用过滤器转换为 Qdrant 过滤器格式
    const conditions = Object.entries(filter).map(([key, value]) => {
      if (typeof value === 'string') {
        return {
          key,
          match: { value }
        };
      } else if (typeof value === 'number') {
        return {
          key,
          range: {
            gte: value,
            lte: value
          }
        };
      } else if (typeof value === 'boolean') {
        return {
          key,
          match: { value }
        };
      } else {
        return {
          key,
          match: { value: String(value) }
        };
      }
    });

    if (conditions.length === 1) {
      return conditions[0];
    }

    return {
      must: conditions
    };
  }

  /**
   * 创建快照（Qdrant 特有功能）
   */
  async createSnapshot(): Promise<string> {
    await this.initialize();

    try {
      const result = await this.client.createSnapshot({
        collection_name: this.collectionName
      });
      return result.name;
    } catch (error) {
      console.error('Failed to create Qdrant snapshot:', error);
      throw error;
    }
  }

  /**
   * 恢复快照（Qdrant 特有功能）
   */
  async restoreSnapshot(snapshotName: string): Promise<void> {
    await this.initialize();

    try {
      await this.client.recoverSnapshot({
        collection_name: this.collectionName,
        location: snapshotName
      });
    } catch (error) {
      console.error('Failed to restore Qdrant snapshot:', error);
      throw error;
    }
  }
}