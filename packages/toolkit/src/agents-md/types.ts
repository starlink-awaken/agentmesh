/**
 * AGENTS.md 优化工具 - 类型定义
 */

import type { VectorDocument, IVectorStore } from '../knowledge/VectorStore.js';
import type { HybridRetriever } from '../knowledge/HybridRetriever.js';

/**
 * 文档章节
 */
export interface Section {
  id: string;
  title: string;
  level: number;
  content: string;
  startLine: number;
  endLine: number;
  importance: number;
  keywords: string[];
}

/**
 * 压缩索引（Vercel 8KB 格式）
 */
export interface CompressedIndex {
  sections: Section[];
  totalSections: number;
  compressedSize: number;
  originalSize: number;
  metadata: {
    version: string;
    createdAt: string;
    format: 'vercel-8kb';
  };
}

/**
 * 文档统计信息
 */
export interface DocumentStats {
  totalLines: number;
  totalChars: number;
  totalSections: number;
  codeBlocks: number;
  avgSectionLength: number;
}

/**
 * 关键词
 */
export interface Keyword {
  text: string;
  type: 'technical' | 'ngram' | 'word';
  frequency: number;
  score: number;
  tfidf?: number;
  idf?: number;
}

/**
 * 关键词提取配置
 */
export interface ExtractorConfig {
  maxKeywords?: number;
  minKeywordLength?: number;
  useNgrams?: boolean;
  ngramMin?: number;
  ngramMax?: number;
  useTFIDF?: boolean;
}

/**
 * 索引文档
 */
export interface IndexedDocument {
  id: string;
  title: string;
  content: string;
  sectionId: string;
  keywords: Keyword[];
  importance: number;
  metadata: Record<string, unknown>;
}

/**
 * 索引配置
 */
export interface IndexerConfig {
  vectorStore: IVectorStore;
  maxKeywordsPerSection?: number;
  enableBM25?: boolean;
  enableVector?: boolean;
}

/**
 * 搜索结果
 */
export interface SearchResult {
  id: string;
  title: string;
  content: string;
  score: number;
  sectionId: string;
  highlights: string[];
}

/**
 * CLI 配置
 */
export interface CLIConfig {
  inputPath?: string;
  outputPath?: string;
  watch?: boolean;
  port?: number;
}
