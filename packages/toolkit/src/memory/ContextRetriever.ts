/**
 * ContextRetriever - 上下文检索器
 * 基于记忆系统，提供上下文构建能力
 */
import type { MemoryEntry, RetrievedContext } from './types.js';
import { MemoryStore } from './MemoryStore.js';

export class ContextRetriever {
  private memoryStore: MemoryStore;
  private shortTermMemory: Map<string, MemoryEntry[]> = new Map();

  constructor(memoryStore: MemoryStore) {
    this.memoryStore = memoryStore;
  }

  /**
   * 构建检索上下文
   */
  async buildContext(query: string, maxTokens: number): Promise<RetrievedContext> {
    return this.memoryStore.buildContext(query, maxTokens);
  }

  /**
   * 检索相关历史
   */
  async retrieveRelevantHistory(
    query: string,
    limit = 5
  ): Promise<MemoryEntry[]> {
    const results = await this.memoryStore.retrieve({
      query,
      limit,
      threshold: 0.1,
    });
    return results;
  }

  /**
   * 总结历史
   */
  async summarizeHistory(entries: MemoryEntry[]): Promise<string> {
    if (entries.length === 0) return '';

    if (entries.length === 1) {
      return entries[0].content;
    }

    // 简单总结：提取关键信息
    const summaries: string[] = [];
    const seen = new Set<string>();

    for (const entry of entries) {
      // 提取前100个字符作为摘要
      const summary = entry.content.substring(0, 100).trim();
      if (!seen.has(summary)) {
        seen.add(summary);
        summaries.push(summary);
      }
    }

    return summaries.join('\n---\n');
  }

  /**
   * 添加短期记忆
   */
  addShortTermMemory(sessionId: string, content: string): void {
    const entry: MemoryEntry = {
      id: `stm_${Date.now()}`,
      content,
      metadata: {
        sessionId,
        timestamp: Date.now(),
        importance: 0.5,
        tags: ['short-term'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (!this.shortTermMemory.has(sessionId)) {
      this.shortTermMemory.set(sessionId, []);
    }
    this.shortTermMemory.get(sessionId)!.push(entry);
  }

  /**
   * 获取短期记忆
   */
  getShortTermMemory(sessionId: string): MemoryEntry[] {
    return this.shortTermMemory.get(sessionId) || [];
  }

  /**
   * 清除短期记忆
   */
  clearShortTermMemory(sessionId?: string): void {
    if (sessionId) {
      this.shortTermMemory.delete(sessionId);
    } else {
      this.shortTermMemory.clear();
    }
  }

  /**
   * 构建会话上下文
   */
  async buildSessionContext(
    sessionId: string,
    currentQuery: string,
    maxTokens: number
  ): Promise<{
    shortTerm: string;
    longTerm: string;
    combined: RetrievedContext;
  }> {
    // 获取短期记忆
    const shortTermEntries = this.getShortTermMemory(sessionId);
    const shortTerm = await this.summarizeHistory(shortTermEntries);

    // 获取长期记忆（从 MemoryStore 检索）
    const longTermContext = await this.buildContext(currentQuery, Math.floor(maxTokens * 0.6));
    const longTerm = await this.summarizeHistory(longTermContext.entries);

    // 组合上下文
    const combined = await this.buildContext(
      `${currentQuery} ${shortTerm} ${longTerm}`,
      maxTokens
    );

    return {
      shortTerm,
      longTerm,
      combined,
    };
  }

  /**
   * 渐进式上下文构建
   * 用于长对话场景，逐步添加上下文
   */
  async progressiveBuild(
    query: string,
    baseContext: RetrievedContext,
    additionalTokens: number
  ): Promise<RetrievedContext> {
    // 从已检索的结果中排除，获取新的相关记忆
    const existingIds = new Set(baseContext.entries.map(e => e.id));

    const moreEntries = await this.memoryStore.retrieve({
      query,
      limit: 10,
    });

    const newEntries = moreEntries.filter(e => !existingIds.has(e.id));

    // 估算当前 tokens
    let currentTokens = baseContext.totalTokens;
    const entriesToAdd: MemoryEntry[] = [];

    for (const entry of newEntries) {
      const entryTokens = this.estimateTokens(entry.content);
      if (currentTokens + entryTokens <= baseContext.totalTokens + additionalTokens) {
        entriesToAdd.push(entry);
        currentTokens += entryTokens;
      } else {
        break;
      }
    }

    return {
      entries: [...baseContext.entries, ...entriesToAdd],
      totalTokens: currentTokens,
      query,
    };
  }

  private estimateTokens(text: string): number {
    const englishWords = text.split(/[a-zA-Z]+/).length;
    const chineseChars = text.split(/[\u4e00-\u9fa5]/).length;
    return Math.ceil(englishWords * 1.3 + chineseChars);
  }
}
