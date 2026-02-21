import { ChromaClient } from 'chromadb';
import type { Collection } from 'chromadb';
import type { AgentMessage } from '../types/index.js';

interface VectorEntry {
  id: string;
  message: AgentMessage;
  embedding?: number[];
}

export class VectorStore {
  private client: ChromaClient | null = null;
  private collection: Collection | null = null;
  private isInitialized = false;
  private baseDir: string;

  constructor(baseDir: string = './data/vector-db') {
    this.baseDir = baseDir;
  }

  /**
   * 初始化向量数据库
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.client = new ChromaClient({
        path: 'http://localhost:8000'
      });

      // 尝试获取或创建 collection
      try {
        this.collection = await this.client.getOrCreateCollection({
          name: 'agent-context'
        });
      } catch {
        // Collection 可能不存在，创建新的
        this.collection = await this.client.createCollection({
          name: 'agent-context'
        });
      }

      this.isInitialized = true;
      console.log('[VectorStore] Initialized successfully');
    } catch (error) {
      console.warn('[VectorStore] Failed to initialize (ChromaDB not running?):', error);
      this.isInitialized = false;
    }
  }

  /**
   * 添加消息到向量存储
   */
  async addMessage(spaceId: string, message: AgentMessage): Promise<void> {
    if (!this.isInitialized || !this.collection) {
      console.warn('[VectorStore] Not initialized, skipping add');
      return;
    }

    const entry: VectorEntry = {
      id: `${spaceId}_${message.id}`,
      message
    };

    try {
      // 简单文本向量化（使用消息内容）
      const text = this.messageToText(message);

      await this.collection.add({
        ids: [entry.id],
        documents: [text],
        metadatas: [{
          space_id: spaceId,
          message_id: message.id,
          timestamp: message.timestamp,
          source: message.source,
          type: message.type
        }]
      });

      console.log('[VectorStore] Added message:', entry.id);
    } catch (error) {
      console.error('[VectorStore] Failed to add message:', error);
    }
  }

  /**
   * 搜索相似上下文
   */
  async searchSimilar(spaceId: string, query: string, limit: number = 5): Promise<AgentMessage[]> {
    if (!this.isInitialized || !this.collection) {
      console.warn('[VectorStore] Not initialized, returning empty');
      return [];
    }

    try {
      const results = await this.collection.query({
        queryTexts: [query],
        nResults: limit,
        where: { space_id: spaceId }
      });

      const messages: AgentMessage[] = [];
      if (results.documents && results.documents[0]) {
        for (let i = 0; i < results.documents[0].length; i++) {
          const metadata = results.metadatas?.[0]?.[i];
          if (metadata?.message_id) {
            // 这里返回元数据，实际使用时可以从文件/内存中获取完整消息
            messages.push({
              id: metadata.message_id as string,
              type: 'event',
              source: metadata.source as string,
              target: 'search',
              correlation_id: '',
              timestamp: metadata.timestamp as number,
              payload: {
                task: results.documents[0][i] || ''
              }
            });
          }
        }
      }

      return messages;
    } catch (error) {
      console.error('[VectorStore] Search failed:', error);
      return [];
    }
  }

  /**
   * 获取空间的向量数量
   */
  async getCount(spaceId: string): Promise<number> {
    if (!this.isInitialized || !this.collection) {
      return 0;
    }

    try {
      const results = await this.collection.get({
        where: { space_id: spaceId }
      });
      return results.ids?.length || 0;
    } catch {
      return 0;
    }
  }

  /**
   * 删除空间的向量
   */
  async deleteSpace(spaceId: string): Promise<void> {
    if (!this.isInitialized || !this.collection) {
      return;
    }

    try {
      // 获取该 space 的所有 ID
      const results = await this.collection.get({
        where: { space_id: spaceId }
      });

      if (results.ids && results.ids.length > 0) {
        await this.collection.delete({
          ids: results.ids
        });
      }
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
