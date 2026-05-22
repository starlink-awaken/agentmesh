/**
 * ChromaVectorStore - ChromaDB 向量存储实现
 *
 * @author PAI
 */

import type { VectorStoreConfig, VectorDocument, VectorSearchResult, IVectorStore } from './VectorStore';

export class ChromaVectorStore implements IVectorStore {
  private client: any;
  private collection: any;
  private collectionName: string;
  private dimension: number;

  constructor(config: VectorStoreConfig) {
    this.collectionName = config.collectionName || 'default';
    this.dimension = config.dimension || 384;

    // 延迟加载 chromadb 依赖
    // 实际使用时需要安装 chromadb 包
    try {
      // @ts-ignore - 动态导入
      const { ChromaClient } = require('chromadb');
      this.client = new ChromaClient({
        path: config.path || 'http://localhost:8000'
      });
    } catch (error) {
      console.warn('ChromaDB not available, using mock client. Install with: bun add chromadb');
      this.client = this.createMockClient();
    }
  }

  private createMockClient() {
    return {
      getOrCreateCollection: async (params: any) => ({
        add: async (documents: any[]) => {
          console.log('Mock ChromaDB add:', documents.length, 'documents');
        },
        query: async (queryParams: any) => ({
          documents: [[]],
          distances: [[]],
          metadatas: [[]],
          ids: [[]]
        }),
        get: async (params: any) => ({
          documents: [],
          metadatas: [],
          ids: []
        }),
        delete: async (params: any) => {
          console.log('Mock ChromaDB delete:', params);
        },
        count: async () => 0
      })
    };
  }

  async initialize(): Promise<void> {
    try {
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: { dimension: this.dimension }
      });
    } catch (error) {
      console.error('Failed to initialize ChromaDB collection:', error);
      throw error;
    }
  }

  async add(documents: VectorDocument[]): Promise<void> {
    if (!this.collection) {
      await this.initialize();
    }

    const ids = documents.map(doc => doc.id);
    const contents = documents.map(doc => doc.content);
    const embeddings = documents.map(doc => doc.embedding || this.generateMockEmbedding());
    const metadatas = documents.map(doc => doc.metadata);

    try {
      await this.collection.add({
        ids,
        documents: contents,
        embeddings,
        metadatas
      });
    } catch (error) {
      console.error('Failed to add documents to ChromaDB:', error);
      throw error;
    }
  }

  async delete(ids: string[]): Promise<void> {
    if (!this.collection) {
      await this.initialize();
    }

    try {
      await this.collection.delete({ ids });
    } catch (error) {
      console.error('Failed to delete documents from ChromaDB:', error);
      throw error;
    }
  }

  async search(
    query: string | number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<VectorSearchResult[]> {
    if (!this.collection) {
      await this.initialize();
    }

    let queryEmbedding: number[];
    if (typeof query === 'string') {
      // 实际使用时需要接入 embedding 模型
      queryEmbedding = this.generateMockEmbedding();
    } else {
      queryEmbedding = query;
    }

    try {
      const result = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK,
        where: filter,
        include: ['documents', 'metadatas', 'distances']
      });

      if (!result.documents || result.documents.length === 0) {
        return [];
      }

      const documents = result.documents[0];
      const metadatas = result.metadatas[0];
      const distances = result.distances[0];
      const ids = result.ids[0];

      return documents.map((content: string, index: number) => ({
        id: ids[index] || `result-${index}`,
        content,
        score: 1 - (distances[index] || 0), // 距离转换为相似度分数
        metadata: metadatas[index] || {}
      }));
    } catch (error) {
      console.error('Failed to search ChromaDB:', error);
      throw error;
    }
  }

  async get(ids: string[]): Promise<VectorDocument[]> {
    if (!this.collection) {
      await this.initialize();
    }

    try {
      const result = await this.collection.get({ ids });

      return result.documents.map((content: string, index: number) => ({
        id: result.ids[index],
        content,
        metadata: result.metadatas[index] || {}
      }));
    } catch (error) {
      console.error('Failed to get documents from ChromaDB:', error);
      throw error;
    }
  }

  async getStats(): Promise<{ count: number; dimension: number }> {
    if (!this.collection) {
      await this.initialize();
    }

    try {
      const count = await this.collection.count();
      return {
        count,
        dimension: this.dimension
      };
    } catch (error) {
      console.error('Failed to get stats from ChromaDB:', error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    if (!this.collection) {
      await this.initialize();
    }

    try {
      // ChromaDB 没有直接的 clear 方法，通过删除所有文档实现
      const allDocs = await this.collection.get();
      if (allDocs.ids.length > 0) {
        await this.collection.delete({ ids: allDocs.ids });
      }
    } catch (error) {
      console.error('Failed to clear ChromaDB collection:', error);
      throw error;
    }
  }

  private generateMockEmbedding(): number[] {
    // 生成模拟的 embedding 向量
    return Array(this.dimension).fill(0).map(() => Math.random() - 0.5);
  }
}