/**
 * Knowledge 模块 - 统一导出
 *
 * @author PAI
 * @version 1.0.0
 *
 * 包含：
 * - KnowledgeGraph: 知识图谱
 * - DataSources: 数据源管理
 * - VectorStore: 向量存储
 * - HybridRetriever: 混合检索 (BM25 + Vector + Rerank)
 */

export { KnowledgeGraph } from './KnowledgeGraph.js';
export type {
  KnowledgeNode,
  KnowledgeRelation,
  QueryResult,
  NodeType,
  RelationType,
} from './KnowledgeGraph.js';

export {
  BaseDataSource,
  DataSourceFactory,
  DataSourceType,
} from './DataSources.js';
export type {
  DataSourceConfig,
  QueryOptions,
  DataSourceResult,
} from './DataSources.js';

// VectorStore - 向量存储
export {
  MemoryVectorStore,
  createVectorStore,
} from './VectorStore.js';
export { ChromaVectorStore } from './ChromaVectorStore.js';
export type {
  VectorDocument,
  VectorSearchResult,
  VectorStoreConfig,
  IVectorStore,
} from './VectorStore.js';

// HybridRetriever - 混合检索
export {
  HybridRetriever,
  createHybridRetriever,
} from './HybridRetriever.js';
export type {
  RetrievalResult,
  HybridRetrieverConfig,
} from './HybridRetriever.js';
