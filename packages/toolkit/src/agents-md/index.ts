/**
 * AGENTS.md 优化工具 - 统一导出
 *
 * @author PAI
 * @version 1.0.0
 *
 * 包含：
 * - DocumentParser: 文档解析与压缩器
 * - KeywordExtractor: 关键词提取器
 * - AgentsMdIndexer: 向量索引构建器
 * - CLI 工具
 */

// DocumentParser - 文档解析与压缩器
export { DocumentParser, createDocumentParser } from './DocumentParser.js';
export type { ParserConfig } from './DocumentParser.js';
export type {
  Section,
  CompressedIndex,
  DocumentStats,
} from './types.js';

// KeywordExtractor - 关键词提取器
export { KeywordExtractor, createKeywordExtractor } from './KeywordExtractor.js';
export type {
  Keyword,
  ExtractorConfig,
} from './types.js';

// AgentsMdIndexer - 向量索引构建器
export { AgentsMdIndexer, createAgentsMdIndexer } from './AgentsMdIndexer.js';
export type {
  IndexedDocument,
  IndexerConfig,
  SearchResult,
} from './types.js';

// CLI 工具
export { buildCommand, serveCommand, watchCommand, main } from './cli.js';
export type {
  CLIConfig,
} from './types.js';
