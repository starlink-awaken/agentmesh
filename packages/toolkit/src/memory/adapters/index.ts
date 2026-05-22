/**
 * Memory Adapters 模块导出
 *
 * 提供多种存储适配器实现
 */

// BeadsAdapter - Beads 记忆系统适配器
export { BeadsAdapter } from './BeadsAdapter.js';

export type {
  BeadsConfig,
  BeadsTask,
  BeadsTaskType,
  BeadsTaskStatus,
  BeadsMetadata,
  BeadsRelation,
  BeadsRelationType,
  BeadsContext,
  BeadsContextOptions,
  TaskFilter,
  CreateTaskOptions,
  UpdateTaskOptions,
} from './BeadsAdapter.js';

// FileStorageAdapter - 文件存储适配器
export {
  FileStorageAdapter,
  createMemoryStorageAdapter,
  createReasoningStorageAdapter,
} from './FileStorageAdapter.js';

export type {
  StorageAdapter,
  FileStorageConfig,
} from './FileStorageAdapter.js';

// OpenContextAdapter - OpenContext 存储适配器
export { OpenContextAdapter } from './OpenContextAdapter.js';

export {
  parseMarkdownContext,
  toMarkdown,
} from './MarkdownParser.js';

export type {
  OpenContextConfig,
  ContextManifest,
  ContextFile,
  RetrievedContext,
} from './OpenContextAdapter.js';
