/**
 * MemoryStore - 记忆存储系统
 * 支持向量检索、记忆整合、上下文管理、持久化存储
 */
import type {
  MemoryEntry,
  MemoryMetadata,
  RetrievalQuery,
  MemoryFilter,
  RetrievedContext,
  MemoryStats,
  ConsolidationResult,
} from './types.js';
import type { StorageAdapter } from './adapters/FileStorageAdapter.js';

/**
 * MemoryStore 配置
 */
export interface MemoryStoreConfig {
  /**
   * 存储适配器（可选）
   * 如果提供，则支持持久化存储
   */
  storageAdapter?: StorageAdapter<MemoryEntry>;

  /**
   * 是否在启动时自动恢复
   * @default false
   */
  autoRestore?: boolean;

  /**
   * 是否在每次变更后自动持久化
   * @default false
   */
  autoPersist?: boolean;
}

export class MemoryStore {
  private entries: Map<string, MemoryEntry> = new Map();
  private sessions: Map<string, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private storageAdapter?: StorageAdapter<MemoryEntry>;
  private autoPersist: boolean;

  constructor(config: MemoryStoreConfig = {}) {
    this.storageAdapter = config.storageAdapter;
    this.autoPersist = config.autoPersist ?? false;

    // 如果配置了自动恢复，在构造时恢复数据
    if (config.autoRestore && this.storageAdapter) {
      this.restore().catch(err => {
        console.warn('[MemoryStore] Failed to auto-restore:', err);
      });
    }
  }

  /**
   * 存储记忆
   */
  async store(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEntry> {
    const id = this.generateId();
    const now = Date.now();

    const fullEntry: MemoryEntry = {
      ...entry,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.entries.set(id, fullEntry);
    this.indexEntry(fullEntry);

    // 如果启用了自动持久化，立即保存
    if (this.autoPersist && this.storageAdapter) {
      await this.persist();
    }

    return fullEntry;
  }

  /**
   * 检索记忆
   */
  async retrieve(query: RetrievalQuery): Promise<MemoryEntry[]> {
    const { query: queryText, limit = 10, threshold = 0.0, filters } = query;

    let results = Array.from(this.entries.values());

    // 应用过滤器
    if (filters) {
      results = this.applyFilters(results, filters);
    }

    // 如果有向量嵌入，进行相似度检索
    // 这里使用简单的关键词匹配，实际可以使用向量数据库
    if (results.length > 0) {
      const queryKeywords = this.extractKeywords(queryText);
      results = results.map(entry => ({
        entry,
        score: this.calculateRelevance(entry, queryKeywords),
      }))
        .filter(item => item.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => item.entry);
    } else {
      results = results.slice(0, limit);
    }

    return results;
  }

  /**
   * 构建上下文
   */
  async buildContext(query: string, maxTokens: number): Promise<RetrievedContext> {
    const entries = await this.retrieve({
      query,
      limit: 20,
    });

    let totalTokens = 0;
    const selectedEntries: MemoryEntry[] = [];

    for (const entry of entries) {
      const entryTokens = this.estimateTokens(entry.content);
      if (totalTokens + entryTokens <= maxTokens) {
        selectedEntries.push(entry);
        totalTokens += entryTokens;
      } else {
        break;
      }
    }

    return {
      entries: selectedEntries,
      totalTokens,
      query,
    };
  }

  /**
   * 更新记忆
   */
  async update(id: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry | null> {
    const entry = this.entries.get(id);
    if (!entry) return null;

    const updated: MemoryEntry = {
      ...entry,
      ...updates,
      id,
      updatedAt: Date.now(),
    };

    this.entries.set(id, updated);

    // 如果启用了自动持久化，立即保存
    if (this.autoPersist && this.storageAdapter) {
      await this.persist();
    }

    return updated;
  }

  /**
   * 删除记忆
   */
  async delete(id: string): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry) return false;

    // 清理索引
    this.unindexEntry(entry);
    this.entries.delete(id);

    // 如果启用了自动持久化，立即保存
    if (this.autoPersist && this.storageAdapter) {
      await this.persist();
    }

    return true;
  }

  /**
   * 记忆整合
   * 合并相似的记忆，删除低重要性的记忆
   */
  async consolidate(): Promise<ConsolidationResult> {
    const entries = Array.from(this.entries.values());
    let consolidated = 0;
    let pruned = 0;
    let memorySaved = 0;

    // 1. 合并低重要性记忆
    const lowImportance = entries.filter(e => e.metadata.importance < 0.3);
    for (const entry of lowImportance) {
      // 简单策略：直接删除
      this.unindexEntry(entry);
      this.entries.delete(entry.id);
      memorySaved += this.estimateTokens(entry.content);
      pruned++;
    }

    // 2. 按会话汇总
    const sessionGroups = new Map<string, MemoryEntry[]>();
    for (const entry of entries) {
      const sessionId = entry.metadata.sessionId;
      if (!sessionGroups.has(sessionId)) {
        sessionGroups.set(sessionId, []);
      }
      sessionGroups.get(sessionId)!.push(entry);
    }

    // 为每个会话生成摘要（简化版）
    for (const [sessionId, sessionEntries] of sessionGroups) {
      if (sessionEntries.length > 5) {
        // 生成摘要记忆
        const summary = this.generateSummary(sessionEntries);
        const summaryEntry = await this.store({
          content: `[Session ${sessionId} Summary] ${summary}`,
          metadata: {
            sessionId,
            timestamp: Date.now(),
            importance: 0.7,
            tags: ['summary'],
            source: 'auto-consolidation',
          },
        });
        consolidated++;

        // 删除原始条目
        for (const entry of sessionEntries.slice(0, -1)) {
          this.unindexEntry(entry);
          this.entries.delete(entry.id);
          memorySaved += this.estimateTokens(entry.content);
          pruned++;
        }
      }
    }

    return { consolidated, pruned, memorySaved };
  }

  /**
   * 获取统计信息
   */
  getStats(): MemoryStats {
    const entries = Array.from(this.entries.values());
    const sessions = new Set(entries.map(e => e.metadata.sessionId));

    return {
      totalEntries: entries.length,
      totalSessions: sessions.size,
      averageImportance: entries.length > 0
        ? entries.reduce((sum, e) => sum + e.metadata.importance, 0) / entries.length
        : 0,
      oldestEntry: entries.length > 0
        ? Math.min(...entries.map(e => e.createdAt))
        : 0,
      newestEntry: entries.length > 0
        ? Math.max(...entries.map(e => e.updatedAt))
        : 0,
    };
  }

  /**
   * 获取会话的所有记忆
   */
  getBySession(sessionId: string): MemoryEntry[] {
    return Array.from(this.entries.values())
      .filter(e => e.metadata.sessionId === sessionId)
      .sort((a, b) => b.metadata.timestamp - a.metadata.timestamp);
  }

  // ==================== 持久化方法 ====================

  /**
   * 持久化所有记忆到存储适配器
   *
   * @returns 持久化的条目数量
   */
  async persist(): Promise<number> {
    if (!this.storageAdapter) {
      console.warn('[MemoryStore] No storage adapter configured, skipping persist');
      return 0;
    }

    const entries = Array.from(this.entries.values());
    await this.storageAdapter.save(entries);
    return entries.length;
  }

  /**
   * 从存储适配器恢复记忆
   *
   * @returns 恢复的条目数量
   */
  async restore(): Promise<number> {
    if (!this.storageAdapter) {
      console.warn('[MemoryStore] No storage adapter configured, skipping restore');
      return 0;
    }

    const entries = await this.storageAdapter.load();

    // 清空现有数据并重新加载
    this.entries.clear();
    this.sessions.clear();
    this.tagIndex.clear();

    for (const entry of entries) {
      this.entries.set(entry.id, entry);
      this.indexEntry(entry);
    }

    return entries.length;
  }

  /**
   * 检查是否配置了存储适配器
   */
  hasStorageAdapter(): boolean {
    return !!this.storageAdapter;
  }

  // ==================== 私有方法 ====================

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private indexEntry(entry: MemoryEntry): void {
    // 索引会话
    const sessionId = entry.metadata.sessionId;
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Set());
    }
    this.sessions.get(sessionId)!.add(entry.id);

    // 索引标签
    for (const tag of entry.metadata.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(entry.id);
    }
  }

  private unindexEntry(entry: MemoryEntry): void {
    const sessionId = entry.metadata.sessionId;
    this.sessions.get(sessionId)?.delete(entry.id);

    for (const tag of entry.metadata.tags) {
      this.tagIndex.get(tag)?.delete(entry.id);
    }
  }

  private applyFilters(entries: MemoryEntry[], filters: MemoryFilter): MemoryEntry[] {
    return entries.filter(entry => {
      if (filters.sessionId && entry.metadata.sessionId !== filters.sessionId) {
        return false;
      }

      if (filters.timeRange) {
        const timestamp = entry.metadata.timestamp;
        if (timestamp < filters.timeRange.from || timestamp > filters.timeRange.to) {
          return false;
        }
      }

      if (filters.tags && filters.tags.length > 0) {
        const hasTag = filters.tags.some(tag => entry.metadata.tags.includes(tag));
        if (!hasTag) return false;
      }

      if (filters.importance !== undefined && entry.metadata.importance < filters.importance) {
        return false;
      }

      return true;
    });
  }

  private extractKeywords(text: string): Set<string> {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    ]);

    const words = text.toLowerCase().split(/[\s,.!?;:'"()\[\]{}]+/);
    return new Set(words.filter(w => w.length > 2 && !stopWords.has(w)));
  }

  private calculateRelevance(entry: MemoryEntry, queryKeywords: Set<string>): number {
    const contentKeywords = this.extractKeywords(entry.content);
    let matchCount = 0;

    for (const keyword of queryKeywords) {
      if (contentKeywords.has(keyword)) {
        matchCount++;
      }
    }

    const baseScore = queryKeywords.size > 0 ? matchCount / queryKeywords.size : 0;
    const importanceBonus = entry.metadata.importance * 0.2;

    return Math.min(baseScore + importanceBonus, 1);
  }

  private estimateTokens(text: string): number {
    // 粗略估算：英文每词 1.3 tokens，中文每字 1 token
    const englishWords = text.split(/[a-zA-Z]+/).length;
    const chineseChars = text.split(/[\u4e00-\u9fa5]/).length;
    return Math.ceil(englishWords * 1.3 + chineseChars);
  }

  private generateSummary(entries: MemoryEntry[]): string {
    // 简单摘要：取第一条和最后一条
    if (entries.length === 0) return '';
    if (entries.length === 1) return entries[0].content.substring(0, 200);

    const first = entries[0];
    const last = entries[entries.length - 1];

    return `${entries.length} interactions. Started: ${first.content.substring(0, 100)}... Ended: ${last.content.substring(0, 100)}...`;
  }
}
