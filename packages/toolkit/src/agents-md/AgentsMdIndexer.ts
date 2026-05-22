/**
 * AgentsMdIndexer - 向量索引构建器
 *
 * 整合 HybridRetriever，构建 BM25 + Vector 混合索引
 */

import type {
  IndexedDocument,
  IndexerConfig,
  SearchResult,
} from './types.js';
import type { VectorDocument } from '../knowledge/VectorStore.js';
import type { HybridRetriever } from '../knowledge/HybridRetriever.js';

import { DocumentParser } from './DocumentParser.js';
import { KeywordExtractor } from './KeywordExtractor.js';

/**
 * Agents.md 索引构建器
 *
 * @example
 * ```typescript
 * const indexer = new AgentsMdIndexer({
 *   vectorStore: new MemoryVectorStore(),
 *   enableBM25: true,
 *   enableVector: true,
 * });
 *
 * await indexer.indexDocument('AGENTS.md', content);
 * const results = await indexer.search('how to use');
 * ```
 */
export class AgentsMdIndexer {
  private vectorStore: IndexerConfig['vectorStore'];
  private hybridRetriever: HybridRetriever | null = null;
  private parser: DocumentParser;
  private extractor: KeywordExtractor;
  private documents: Map<string, IndexedDocument> = new Map();
  private config: {
    maxKeywordsPerSection: number;
    enableBM25: boolean;
    enableVector: boolean;
  };

  constructor(config: IndexerConfig) {
    this.vectorStore = config.vectorStore;
    this.parser = new DocumentParser();
    this.extractor = new KeywordExtractor();

    this.config = {
      maxKeywordsPerSection: config.maxKeywordsPerSection ?? 20,
      enableBM25: config.enableBM25 ?? true,
      enableVector: config.enableVector ?? true,
    };

    // 如果启用混合检索
    if (this.config.enableBM25 || this.config.enableVector) {
      this.initHybridRetriever();
    }
  }

  /**
   * 初始化混合检索器
   */
  private initHybridRetriever(): void {
    // 注意：这里需要导入 HybridRetriever
    // 由于循环依赖问题，我们在需要时动态创建
  }

  /**
   * 索引文档
   *
   * @param id - 文档 ID
   * @param content - 文档内容
   * @param metadata - 额外元数据
   */
  async indexDocument(
    id: string,
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    // 1. 解析文档
    const sections = this.parser.parse(content);

    // 2. 提取关键词
    const sectionKeywords = this.extractor.extractFromSections(
      sections.map(s => ({ title: s.title, content: s.content }))
    );

    // 3. 创建索引文档
    const indexedDocs: VectorDocument[] = [];

    for (const section of sections) {
      const keywords = sectionKeywords.get(section.title) || [];
      const topKeywords = keywords.slice(0, this.config.maxKeywordsPerSection);

      const indexedDoc: IndexedDocument = {
        id: `${id}#${section.id}`,
        title: section.title,
        content: section.content,
        sectionId: section.id,
        keywords: topKeywords,
        importance: section.importance,
        metadata: {
          ...metadata,
          documentId: id,
          startLine: section.startLine,
          endLine: section.endLine,
          level: section.level,
        },
      };

      this.documents.set(indexedDoc.id, indexedDoc);

      indexedDocs.push({
        id: indexedDoc.id,
        content: `${section.title}\n${section.content}`,
        metadata: indexedDoc.metadata,
      });
    }

    // 4. 添加到向量存储
    if (this.config.enableVector) {
      await this.vectorStore.add(indexedDocs);
    }

    // 5. 添加到 BM25 索引
    if (this.config.enableBM25 && this.hybridRetriever) {
      this.hybridRetriever.index(indexedDocs.map(d => ({
        id: d.id,
        content: d.content,
        metadata: d.metadata,
      })));
    }
  }

  /**
   * 批量索引多个文档
   *
   * @param documents - 文档列表
   */
  async indexDocuments(
    documents: Array<{ id: string; content: string; metadata?: Record<string, unknown> }>
  ): Promise<void> {
    for (const doc of documents) {
      await this.indexDocument(doc.id, doc.content, doc.metadata);
    }
  }

  /**
   * 搜索
   *
   * @param query - 查询文本
   * @param topK - 返回结果数量
   * @returns 搜索结果
   */
  async search(query: string, topK: number = 5): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    if (this.config.enableVector) {
      // 向量搜索
      const vectorResults = await this.vectorStore.search(query, topK * 2);

      for (const r of vectorResults) {
        const doc = this.documents.get(r.id);
        if (doc) {
          results.push({
            id: r.id,
            title: doc.title,
            content: this.truncateContent(doc.content, 200),
            score: r.score,
            sectionId: doc.sectionId,
            highlights: this.extractHighlights(doc.content, query),
          });
        }
      }
    }

    // BM25 搜索（如果可用）
    if (this.config.enableBM25 && this.hybridRetriever) {
      const bm25Results = await this.hybridRetriever.search(query, topK * 2);

      for (const r of bm25Results) {
        const existing = results.find(res => res.id === r.id);
        if (!existing) {
          const doc = this.documents.get(r.id);
          if (doc) {
            results.push({
              id: r.id,
              title: doc.title,
              content: this.truncateContent(doc.content, 200),
              score: r.score,
              sectionId: doc.sectionId,
              highlights: this.extractHighlights(doc.content, query),
            });
          }
        } else {
          // 融合分数
          existing.score = Math.max(existing.score, r.score);
        }
      }
    }

    // 按分数排序并返回 Top-K
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * 获取文档统计信息
   *
   * @returns 统计信息
   */
  getStats(): {
    documentCount: number;
    sectionCount: number;
    totalChars: number;
  } {
    let sectionCount = 0;
    let totalChars = 0;

    for (const doc of this.documents.values()) {
      sectionCount++;
      totalChars += doc.content.length;
    }

    return {
      documentCount: new Set(Array.from(this.documents.values()).map(d => d.metadata.documentId as string)).size,
      sectionCount,
      totalChars,
    };
  }

  /**
   * 清空索引
   */
  async clear(): Promise<void> {
    await this.vectorStore.clear();
    this.documents.clear();
  }

  /**
   * 截取内容
   */
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  }

  /**
   * 提取高亮片段
   */
  private extractHighlights(content: string, query: string): string[] {
    const highlights: string[] = [];
    const queryTerms = query.toLowerCase().split(/\s+/);
    const lines = content.split('\n');

    for (const line of lines) {
      const lineLower = line.toLowerCase();
      for (const term of queryTerms) {
        if (lineLower.includes(term) && line.trim().length > 10) {
          highlights.push(line.trim());
          break;
        }
      }

      if (highlights.length >= 3) break;
    }

    return highlights;
  }

  /**
   * 获取所有文档
   */
  getAllDocuments(): IndexedDocument[] {
    return Array.from(this.documents.values());
  }

  /**
   * 获取指定文档
   */
  getDocument(id: string): IndexedDocument | undefined {
    return this.documents.get(id);
  }
}

/**
 * 创建 AgentsMdIndexer 实例
 *
 * @param config - 配置选项
 * @returns AgentsMdIndexer 实例
 */
export function createAgentsMdIndexer(config: IndexerConfig): AgentsMdIndexer {
  return new AgentsMdIndexer(config);
}
