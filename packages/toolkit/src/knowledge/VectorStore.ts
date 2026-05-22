/**
 * VectorStore - 向量存储抽象层
 *
 * 支持多种向量数据库：ChromaDB, Qdrant, 内存向量
 * 源自 Advanced RAG 架构
 */

import { ChromaVectorStore } from './ChromaVectorStore';
import { QdrantVectorStore } from './QdrantVectorStore';

export interface VectorDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface VectorStoreConfig {
  provider: 'chroma' | 'qdrant' | 'memory';
  path?: string;           // ChromaDB 路径
  collectionName?: string;
  dimension?: number;      // 向量维度
  url?: string;           // Qdrant URL
  apiKey?: string;       // Qdrant API Key
}

/**
 * VectorStore 接口
 */
export interface IVectorStore {
  /**
   * 添加文档
   */
  add(documents: VectorDocument[]): Promise<void>;

  /**
   * 删除文档
   */
  delete(ids: string[]): Promise<void>;

  /**
   * 向量搜索
   */
  search(query: string | number[], topK: number, filter?: Record<string, unknown>): Promise<VectorSearchResult[]>;

  /**
   * 获取文档
   */
  get(ids: string[]): Promise<VectorDocument[]>;

  /**
   * 获取集合统计
   */
  getStats(): Promise<{ count: number; dimension: number }>;

  /**
   * 清空集合
   */
  clear(): Promise<void>;
}

/**
 * 内存向量存储（默认实现，无需外部依赖）
 */
export class MemoryVectorStore implements IVectorStore {
  private documents: Map<string, VectorDocument> = new Map();
  private dimension: number = 384;

  constructor(dimension: number = 384) {
    this.dimension = dimension;
  }

  async add(documents: VectorDocument[]): Promise<void> {
    for (const doc of documents) {
      this.documents.set(doc.id, doc);
    }
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.documents.delete(id);
    }
  }

  async search(
    query: string | number[],
    topK: number,
    _filter?: Record<string, unknown>
  ): Promise<VectorSearchResult[]> {
    // 简化实现：基于关键词匹配
    // 实际使用时需要接入 embedding 模型
    const queryStr = typeof query === 'string' ? query : '';
    const queryLower = queryStr.toLowerCase();

    const results: Array<{ doc: VectorDocument; score: number }> = [];

    const docs = Array.from(this.documents.values());
    for (const doc of docs) {
      // 简单的相似度计算
      let score = 0;

      // 标题/内容匹配
      if (doc.content.toLowerCase().includes(queryLower)) {
        score += 0.8;
      }

      // 元数据匹配
      for (const [key, value] of Object.entries(doc.metadata)) {
        if (queryLower.includes(String(value).toLowerCase())) {
          score += 0.3;
        }
      }

      if (score > 0) {
        results.push({ doc, score: Math.min(score, 1.0) });
      }
    }

    // 排序并返回 Top-K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK).map(r => ({
      id: r.doc.id,
      content: r.doc.content,
      score: r.score,
      metadata: r.doc.metadata,
    }));
  }

  async get(ids: string[]): Promise<VectorDocument[]> {
    return ids
      .map(id => this.documents.get(id))
      .filter((d): d is VectorDocument => d !== undefined);
  }

  async getStats(): Promise<{ count: number; dimension: number }> {
    return {
      count: this.documents.size,
      dimension: this.dimension,
    };
  }

  async clear(): Promise<void> {
    this.documents.clear();
  }
}

/**
 * VectorStore 工厂
 */
export function createVectorStore(config: VectorStoreConfig): IVectorStore {
  switch (config.provider) {
    case 'memory':
      return new MemoryVectorStore(config.dimension);
    case 'chroma':
      return new ChromaVectorStore(config);
    case 'qdrant':
      return new QdrantVectorStore(config);
    default:
      return new MemoryVectorStore(config.dimension);
  }
}
