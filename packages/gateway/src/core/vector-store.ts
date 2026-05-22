/**
 * VectorStore - 向量存储桥接
 *
 * Bridge: @agentmesh/toolkit createVectorStore → gateway VectorStore
 * 封装 toolkit 的 IVectorStore 以保持对旧版 public API 的向后兼容
 */
import { createVectorStore } from '@agentmesh/toolkit';
import type { IVectorStore } from '@agentmesh/toolkit';
import type { AgentMessage } from '../types/index.js';

export class VectorStore {
  private store: IVectorStore | null = null;
  private isInitialized = false;
  private baseDir: string;
  private collectionName: string;

  constructor(baseDir: string = './data/vector-db') {
    this.baseDir = baseDir;
    this.collectionName = 'agent-context';
  }

  /** 从配置中更新存储路径 */
  configure(baseDir: string): void {
    this.baseDir = baseDir;
  }

  /**
   * 初始化向量数据库（委托给 toolkit ChromaVectorStore）
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 使用 toolkit 的 createVectorStore 工厂创建 ChromaDB 后端
      const sv = createVectorStore({
        provider: 'chroma',
        path: this.baseDir,
        collectionName: this.collectionName,
      });

      // 调用 initialize（IVectorStore 接口不包含，通过 any 转换）
      await (sv as any).initialize();

      this.store = sv;
      this.isInitialized = true;
      console.log('[VectorStore] Initialized successfully (toolkit createVectorStore)');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('ERR_INVALID_URL') || msg.includes('connect')) {
        console.warn('[VectorStore] ChromaDB not available, vector features disabled');
      } else {
        console.warn('[VectorStore] Failed to initialize:', msg);
      }
      this.isInitialized = false;
    }
  }

  /**
   * 添加消息到向量存储
   */
  async addMessage(spaceId: string, message: AgentMessage): Promise<void> {
    if (!this.isInitialized || !this.store) {
      console.warn('[VectorStore] Not initialized, skipping add');
      return;
    }

    const id = `${spaceId}_${message.id}`;
    const text = this.messageToText(message);

    try {
      await this.store.add([{
        id,
        content: text,
        metadata: {
          space_id: spaceId,
          message_id: message.id,
          timestamp: message.timestamp,
          source: message.source,
          type: message.type,
        },
      }]);
      console.log('[VectorStore] Added message:', id);
    } catch (error) {
      console.error('[VectorStore] Failed to add message:', error);
    }
  }

  /**
   * 搜索相似上下文
   */
  async searchSimilar(spaceId: string, query: string, limit: number = 5): Promise<AgentMessage[]> {
    if (!this.isInitialized || !this.store) {
      console.warn('[VectorStore] Not initialized, returning empty');
      return [];
    }

    try {
      const results = await this.store.search(query, limit, { space_id: spaceId });

      return results.map(r => ({
        id: r.metadata?.message_id as string || r.id,
        type: 'event' as const,
        source: r.metadata?.source as string || 'unknown',
        target: 'search',
        correlation_id: '',
        timestamp: (r.metadata?.timestamp as number) || Date.now(),
        payload: {
          task: r.content || '',
        },
      }));
    } catch (error) {
      console.error('[VectorStore] Search failed:', error);
      return [];
    }
  }

  /**
   * 获取空间的向量数量
   */
  async getCount(spaceId: string): Promise<number> {
    if (!this.isInitialized || !this.store) {
      return 0;
    }

    try {
      const stats = await this.store.getStats();
      return stats.count;
    } catch {
      return 0;
    }
  }

  /**
   * 删除空间的向量
   */
  async deleteSpace(spaceId: string): Promise<void> {
    if (!this.isInitialized || !this.store) {
      return;
    }

    try {
      console.warn('[VectorStore] deleteSpace not fully supported by toolkit IVectorStore');
    } catch (error) {
      console.error('[VectorStore] Delete space failed:', error);
    }
  }

  /**
   * 将消息转换为可向量化的文本
   */
  private messageToText(message: AgentMessage): string {
    const parts: string[] = [];

    if (message.payload?.task) {
      parts.push(`Task: ${message.payload.task}`);
    }

    if (message.result) {
      parts.push(`Result: ${JSON.stringify(message.result)}`);
    }

    if (message.error) {
      parts.push(`Error: ${message.error.message}`);
    }

    return parts.join('\n') || JSON.stringify(message);
  }

  /**
   * 检查是否可用
   */
  isAvailable(): boolean {
    return this.isInitialized;
  }
}

export const vectorStore = new VectorStore();
