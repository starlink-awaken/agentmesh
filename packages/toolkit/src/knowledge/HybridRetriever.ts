/**
 * HybridRetriever - 混合检索器
 *
 * 结合 BM25 (关键词) + Vector (语义) + Rerank (精排)
 * 源自 Advanced RAG 架构 - 让检索智商翻倍
 */
import type { VectorSearchResult, IVectorStore } from './VectorStore.js';

export interface RetrievalResult {
  id: string;
  content: string;
  score: number;
  rerankScore?: number;
  source: 'bm25' | 'vector' | 'merged';
  metadata: Record<string, unknown>;
}

export interface HybridRetrieverConfig {
  vectorStore: IVectorStore;
  enableRerank?: boolean;
  rerankTopK?: number;
  vectorTopK?: number;
  bm25TopK?: number;
  fusionWeight?: number; // 0-1, vector weight
}

/**
 * BM25 检索器（简化实现）
 */
class BM25Retriever {
  private documents: Map<string, { content: string; metadata: Record<string, unknown> }> = new Map();
  private docLengths: number[] = [];
  private avgDocLength: number = 0;
  private k1: number = 1.5;
  private b: number = 0.75;

  /**
   * 索引文档
   */
  index(documents: Array<{ id: string; content: string; metadata: Record<string, unknown> }>): void {
    this.documents.clear();
    this.docLengths = [];

    let totalLength = 0;

    for (const doc of documents) {
      this.documents.set(doc.id, { content: doc.content, metadata: doc.metadata });
      const length = this.tokenize(doc.content).length;
      this.docLengths.push(length);
      totalLength += length;
    }

    this.avgDocLength = totalLength / documents.length || 1;
  }

  /**
   * 搜索
   */
  search(query: string, topK: number): RetrievalResult[] {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const scores: Map<string, number> = new Map();

    // 计算每个文档的 BM25 分数
    for (const [id, doc] of this.documents.entries()) {
      const docTokens = this.tokenize(doc.content);
      const docLength = docTokens.length;

      let score = 0;
      const docTokenCounts = this.countTokens(docTokens);

      for (const token of queryTokens) {
        const tf = docTokenCounts.get(token) || 0;
        if (tf > 0) {
          // BM25 公式简化版
          const numerator = tf * (this.k1 + 1);
          const denominator = tf + this.k1 * (1 - this.b + (this.b * docLength / this.avgDocLength));
          score += numerator / denominator;
        }
      }

      if (score > 0) {
        scores.set(id, score);
      }
    }

    // 排序并返回 Top-K
    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);

    return sorted.map(([id, score]) => {
      const doc = this.documents.get(id)!;
      return {
        id,
        content: doc.content,
        score,
        source: 'bm25' as const,
        metadata: doc.metadata,
      };
    });
  }

  /**
   * 简单分词
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0);
  }

  /**
   * 词频统计
   */
  private countTokens(tokens: string[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const token of tokens) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
    return counts;
  }
}

/**
 * 混合检索器
 */
export class HybridRetriever {
  private vectorStore: IVectorStore;
  private bm25: BM25Retriever;
  private config: {
    enableRerank: boolean;
    rerankTopK: number;
    vectorTopK: number;
    bm25TopK: number;
    fusionWeight: number;
  };

  constructor(config: HybridRetrieverConfig) {
    this.vectorStore = config.vectorStore;
    this.bm25 = new BM25Retriever();

    this.config = {
      enableRerank: config.enableRerank ?? true,
      rerankTopK: config.rerankTopK ?? 3,
      vectorTopK: config.vectorTopK ?? 20,
      bm25TopK: config.bm25TopK ?? 20,
      fusionWeight: config.fusionWeight ?? 0.5,
    };
  }

  /**
   * 索引文档（供 BM25 使用）
   */
  index(documents: Array<{ id: string; content: string; metadata: Record<string, unknown> }>): void {
    this.bm25.index(documents);
  }

  /**
   * 混合搜索
   */
  async search(query: string, topK: number = 5): Promise<RetrievalResult[]> {
    const { vectorTopK, bm25TopK, fusionWeight } = this.config;

    // 并行执行 BM25 和 Vector 搜索
    const [bm25Results, vectorResults] = await Promise.all([
      Promise.resolve(this.bm25.search(query, bm25TopK)),
      this.vectorStore.search(query, vectorTopK),
    ]);

    // 融合结果
    const fused = this.fuseResults(bm25Results, vectorResults, fusionWeight);

    // Rerank（如果启用）
    if (this.config.enableRerank && fused.length > this.config.rerankTopK) {
      return this.rerank(query, fused, topK);
    }

    return fused.slice(0, topK);
  }

  /**
   * 融合 BM25 和 Vector 结果
   */
  private fuseResults(
    bm25: RetrievalResult[],
    vector: VectorSearchResult[],
    vectorWeight: number
  ): RetrievalResult[] {
    const bm25Weight = 1 - vectorWeight;
    const combined: Map<string, RetrievalResult> = new Map();

    // 添加 BM25 结果
    for (const doc of bm25) {
      combined.set(doc.id, { ...doc, source: 'bm25', score: doc.score * bm25Weight });
    }

    // 添加 Vector 结果并融合
    for (const doc of vector) {
      const existing = combined.get(doc.id);
      if (existing) {
        // 取最高分
        existing.score = Math.max(existing.score, doc.score * vectorWeight);
        existing.source = 'merged';
      } else {
        combined.set(doc.id, {
          id: doc.id,
          content: doc.content,
          score: doc.score * vectorWeight,
          source: 'vector',
          metadata: doc.metadata,
        });
      }
    }

    // 排序
    return Array.from(combined.values())
      .sort((a, b) => b.score - a.score);
  }

  /**
   * 重排序（简化版 Rerank）
   * 实际生产环境应使用专门的 Rerank 模型
   */
  private rerank(query: string, results: RetrievalResult[], topK: number): RetrievalResult[] {
    const queryTerms = query.toLowerCase().split(/\s+/);

    // 基于关键词重叠重新打分
    const reranked = results.map(result => {
      const contentTerms = result.content.toLowerCase().split(/\s+/);
      let overlap = 0;

      for (const term of queryTerms) {
        if (contentTerms.includes(term)) {
          overlap++;
        }
      }

      // 综合原始分数和重排分数
      const rerankScore = overlap / queryTerms.length;
      return {
        ...result,
        rerankScore,
        score: result.score * 0.7 + rerankScore * 0.3,
      };
    });

    // 排序
    return reranked
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

/**
 * 创建混合检索器
 */
export function createHybridRetriever(config: HybridRetrieverConfig): HybridRetriever {
  return new HybridRetriever(config);
}
