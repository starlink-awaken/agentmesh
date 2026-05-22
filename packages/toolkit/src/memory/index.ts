/**
 * Memory Module - 记忆系统
 *
 * 提供记忆存储、检索、整合能力
 * 源自 ReasoningBank 论文：让AI从成败经验中自我进化
 *
 * 核心组件：
 * - MemoryStore: 基础记忆存储
 * - ContextRetriever: 上下文检索器
 * - ReasoningBank: 推理记忆银行（从成败中学习）
 * - SelfJudge: 自我评判器（LLM-as-a-Judge）
 * - EmbeddingProvider: 向量嵌入提供者（语义搜索）
 * - FileStorageAdapter: 文件持久化存储
 */
export { MemoryStore } from './MemoryStore.js';
export { ContextRetriever } from './ContextRetriever.js';
export { ReasoningBank } from './ReasoningBank.js';
export { SelfJudge } from './SelfJudge.js';

// Embedding Providers
export {
  LocalEmbeddingProvider,
  OpenAIEmbeddingProvider,
  cosineSimilarity,
  type EmbeddingProvider,
  type LocalEmbeddingProviderConfig,
  type OpenAIEmbeddingProviderConfig,
} from './EmbeddingProvider.js';

// Storage Adapters
export {
  FileStorageAdapter,
  createMemoryStorageAdapter,
  createReasoningStorageAdapter,
  type StorageAdapter,
  type FileStorageConfig,
} from './adapters/FileStorageAdapter.js';

export * from './types.js';

/**
 * 快速创建记忆系统
 */
import { MemoryStore } from './MemoryStore.js';
import { ContextRetriever } from './ContextRetriever.js';
import { ReasoningBank } from './ReasoningBank.js';

export function createMemorySystem() {
  const store = new MemoryStore();
  const retriever = new ContextRetriever(store);
  const reasoningBank = new ReasoningBank();
  return { store, retriever, reasoningBank };
}

/**
 * 创建 ReasoningBank（推荐）
 * 从成功和失败经验中学习
 */
export function createReasoningBank(config?: {
  maxMemories?: number;
  embeddingEnabled?: boolean;
  judgeConfig?: {
    judgeLLM?: string;
    enableRefinement?: boolean;
  };
}) {
  return new ReasoningBank(config);
}
