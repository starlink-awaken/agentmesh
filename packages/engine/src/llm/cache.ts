/**
 * Honeycomb LLM Integration - Response Cache
 *
 * LLM 响应缓存使用 LRU 策略缓存 API 响应，
 * 避免重复请求，提高响应速度，降低成本。
 *
 * 设计原则：
 * - LRU 淘汰：最久未使用的条目优先淘汰（双向链表实现）
 * - TTL 过期：自动清理过期条目
 * - 并发安全：支持并发访问
 * - 可配置：灵活的缓存策略
 * - 零依赖：仅使用原生数据结构
 */

import type {
  CompletionResult,
  CompletionOptions,
  CacheConfig,
  CacheStats,
} from './types.js';

// ============================================================
// 缓存条目
// ============================================================

/**
 * 缓存条目（包含 LRU 双向链表指针）
 */
interface CacheEntry {
  /** 缓存键 */
  key: string;
  /** 缓存结果 */
  result: CompletionResult;
  /** 创建时间戳 */
  timestamp: number;
  /** 过期时间戳 */
  expiresAt: number;
  /** 访问次数 */
  accessCount: number;
  /** 最后访问时间 */
  lastAccess: number;
  /** 前驱节点（LRU 链表） */
  prev?: CacheEntry;
  /** 后继节点（LRU 链表） */
  next?: CacheEntry;
}

// ============================================================
// 响应缓存
// ============================================================

/**
 * LLM 响应缓存（LRU 策略）
 *
 * 使用双向链表 + Map 实现 O(1) 的 get/set 操作
 */
export class ResponseCache {
  /** 缓存配置 */
  private config: CacheConfig;

  /** 缓存存储（键 -> 条目） */
  private cache: Map<string, CacheEntry> = new Map();

  /** 统计信息 */
  private stats: CacheStats;

  /** LRU 链表头哨兵（最近使用端） */
  private head: CacheEntry;

  /** LRU 链表尾哨兵（最久未使用端） */
  private tail: CacheEntry;

  /** Logger */
  private logger: any;

  /**
   * 构造函数
   * @param config - 缓存配置
   * @param logger - 日志记录器
   */
  constructor(config: CacheConfig, logger: any) {
    this.config = {
      maxSize: config.maxSize ?? 1000,
      ttl: config.ttl ?? 3600000, // 1 hour
      enabled: config.enabled ?? true,
    };
    this.logger = logger;

    // 初始化统计信息
    this.stats = {
      hits: 0,
      misses: 0,
      size: 0,
      hitRate: 0,
      evictions: 0,
    };

    // 初始化 LRU 链表哨兵
    this.head = {} as CacheEntry;
    this.tail = {} as CacheEntry;
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /**
   * 获取缓存结果
   * @param prompt - 提示词
   * @param options - 完成选项
   * @returns 缓存结果或 undefined
   */
  get(prompt: string, options?: CompletionOptions): CompletionResult | undefined {
    // 如果缓存禁用，直接返回 undefined
    if (!this.config.enabled) {
      return undefined;
    }

    const key = this.generateKey(prompt, options);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // 检查是否过期
    const now = Date.now();
    if (now > entry.expiresAt) {
      this.remove(entry);
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // 缓存命中：更新访问计数和访问时间，移到链表前面
    this.stats.hits++;
    this.moveToFront(entry);
    entry.accessCount++;
    entry.lastAccess = now;
    this.updateHitRate();

    this.logger?.debug('Cache hit', { key, accessCount: entry.accessCount });

    return entry.result;
  }

  /**
   * 设置缓存结果
   * @param prompt - 提示词
   * @param options - 完成选项
   * @param result - 完成结果
   */
  set(prompt: string, options: CompletionOptions | undefined, result: CompletionResult): void {
    // 如果缓存禁用，直接返回
    if (!this.config.enabled) {
      return;
    }

    // 如果 maxSize 为 0，不存储任何内容
    if (this.config.maxSize! <= 0) {
      return;
    }

    const key = this.generateKey(prompt, options);

    // 如果键已存在，更新并移到前面
    const existing = this.cache.get(key);
    if (existing) {
      existing.result = result;
      existing.timestamp = Date.now();
      existing.expiresAt = Date.now() + this.config.ttl!;
      this.moveToFront(existing);
      return;
    }

    // 达到最大大小，淘汰最少使用的条目
    if (this.cache.size >= this.config.maxSize!) {
      this.evictLRU();
    }

    // 创建新条目
    const now = Date.now();
    const entry: CacheEntry = {
      key,
      result,
      timestamp: now,
      expiresAt: now + this.config.ttl!,
      accessCount: 1,
      lastAccess: now,
    };

    this.cache.set(key, entry);
    this.addToFront(entry);
    this.stats.size = this.cache.size;

    this.logger?.debug('Cache set', { key, size: this.cache.size });
  }

  /**
   * 使用预生成的键获取缓存
   * @param key - 缓存键
   * @returns 缓存结果或 undefined
   */
  getByKey(key: string): CompletionResult | undefined {
    // 如果缓存禁用，直接返回 undefined
    if (!this.config.enabled) {
      return undefined;
    }

    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // 检查是否过期
    const now = Date.now();
    if (now > entry.expiresAt) {
      this.remove(entry);
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // 缓存命中
    this.stats.hits++;
    this.moveToFront(entry);
    entry.accessCount++;
    entry.lastAccess = now;
    this.updateHitRate();

    return entry.result;
  }

  /**
   * 使用预生成的键设置缓存
   * @param key - 缓存键
   * @param result - 完成结果
   */
  setByKey(key: string, result: CompletionResult): void {
    // 如果缓存禁用，直接返回
    if (!this.config.enabled) {
      return;
    }

    // 如果 maxSize 为 0，不存储任何内容
    if (this.config.maxSize! <= 0) {
      return;
    }

    // 如果键已存在，更新并移到前面
    const existing = this.cache.get(key);
    if (existing) {
      existing.result = result;
      existing.timestamp = Date.now();
      existing.expiresAt = Date.now() + this.config.ttl!;
      this.moveToFront(existing);
      return;
    }

    // 达到最大大小，淘汰最少使用的条目
    if (this.cache.size >= this.config.maxSize!) {
      this.evictLRU();
    }

    // 创建新条目
    const now = Date.now();
    const entry: CacheEntry = {
      key,
      result,
      timestamp: now,
      expiresAt: now + this.config.ttl!,
      accessCount: 1,
      lastAccess: now,
    };

    this.cache.set(key, entry);
    this.addToFront(entry);
    this.stats.size = this.cache.size;
  }

  /**
   * 检查缓存是否存在
   * @param prompt - 提示词
   * @param options - 完成选项
   * @returns 是否存在
   */
  has(prompt: string, options?: CompletionOptions): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const key = this.generateKey(prompt, options);
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.remove(entry);
      return false;
    }

    return true;
  }

  /**
   * 删除指定键的缓存
   * @param prompt - 提示词
   * @param options - 完成选项
   * @returns 是否删除成功
   */
  delete(prompt: string, options?: CompletionOptions): boolean {
    const key = this.generateKey(prompt, options);
    const entry = this.cache.get(key);

    if (entry) {
      this.remove(entry);
      return true;
    }

    return false;
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
    // 重置 LRU 链表
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.stats.size = 0;
    this.logger?.debug('Cache cleared');
  }

  /**
   * 删除过期条目
   * @returns 删除的条目数量
   */
  deleteExpired(): number {
    const now = Date.now();
    let deleted = 0;

    // 收集过期键
    const keysToDelete: string[] = [];
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    // 删除过期条目
    for (const key of keysToDelete) {
      const entry = this.cache.get(key)!;
      this.remove(entry);
      deleted++;
    }

    if (deleted > 0) {
      this.logger?.debug('Deleted expired entries', { count: deleted });
    }

    return deleted;
  }

  /**
   * 获取缓存大小
   * @returns 当前缓存条目数
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 获取统计信息
   * @returns 缓存统计信息
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
    this.stats.hitRate = 0;
    // 更新 size 为实际缓存大小
    this.stats.size = this.cache.size;
  }

  /**
   * 获取所有缓存键
   * @returns 缓存键数组
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取所有缓存结果
   * @returns 缓存结果数组
   */
  values(): CompletionResult[] {
    return Array.from(this.cache.values()).map(entry => entry.result);
  }

  /**
   * 获取缓存配置
   * @returns 缓存配置
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  /**
   * 启用或禁用缓存
   * @param enabled - 是否启用
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  // ==================== 私有方法 ====================

  /**
   * 生成缓存键
   * @param prompt - 提示词
   * @param options - 完成选项
   * @returns 缓存键
   */
  private generateKey(prompt: string, options?: CompletionOptions): string {
    // 标准化输入
    const normalized = {
      prompt: prompt.trim(),
      model: options?.model || 'default',
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens ?? 4096,
      systemPrompt: options?.systemPrompt || '',
    };

    // 使用简化哈希算法（比 SHA-256 快，足够用于缓存）
    const data = JSON.stringify(normalized);
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为 32 位整数
    }

    return `cache_${Math.abs(hash)}_${data.length}`;
  }

  /**
   * 淘汰最久未使用的条目（LRU）
   */
  private evictLRU(): void {
    // 尾哨兵的前驱是最久未使用的条目
    const lru = this.tail.prev;
    if (lru && lru !== this.head) {
      this.remove(lru);
      this.stats.evictions++;
      this.logger?.debug('LRU eviction', { key: lru.key });
    }
  }

  /**
   * 移动条目到链表前面（标记为最近使用）
   * @param entry - 缓存条目
   */
  private moveToFront(entry: CacheEntry): void {
    // 只从链表中移除，不从 Map 中删除
    this.removeFromList(entry);
    this.addToFront(entry);
  }

  /**
   * 从链表中移除条目
   * @param entry - 缓存条目
   */
  private remove(entry: CacheEntry): void {
    // 从双向链表中移除
    this.removeFromList(entry);
    // 从 Map 中删除
    this.cache.delete(entry.key);
    this.stats.size = this.cache.size;
  }

  /**
   * 仅从双向链表中移除条目（不删除 Map 中的条目）
   * @param entry - 缓存条目
   */
  private removeFromList(entry: CacheEntry): void {
    if (entry.prev) {
      entry.prev.next = entry.next;
    }
    if (entry.next) {
      entry.next.prev = entry.prev;
    }
  }

  /**
   * 添加条目到链表前面
   * @param entry - 缓存条目
   */
  private addToFront(entry: CacheEntry): void {
    // 插入到头哨兵之后
    entry.prev = this.head;
    entry.next = this.head.next;

    if (this.head.next) {
      this.head.next.prev = entry;
    }
    this.head.next = entry;
  }

  /**
   * 更新命中率
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
}

// ============================================================
// 缓存键生成器
// ============================================================

/**
 * 缓存键生成器
 */
export class CacheKeyGenerator {
  /**
   * 生成缓存键（异步版本，使用 SHA-256）
   * @param prompt - 提示词
   * @param options - 完成选项
   * @returns 缓存键
   */
  static async generate(
    prompt: string,
    options?: CompletionOptions
  ): Promise<string> {
    // 标准化输入
    const normalized = {
      prompt: prompt.trim(),
      model: options?.model || 'default',
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens ?? 4096,
      systemPrompt: options?.systemPrompt || '',
    };

    // 生成 SHA-256 哈希
    const data = new TextEncoder().encode(JSON.stringify(normalized));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return `llm:${hashHex}`;
  }

  /**
   * 生成简单的缓存键（同步版本）
   * 注意：这不是加密安全的哈希，仅用于缓存
   * @param prompt - 提示词
   * @param options - 完成选项
   * @returns 缓存键
   */
  static generateSimple(
    prompt: string,
    options?: CompletionOptions
  ): string {
    const parts = [
      prompt.substring(0, 100), // 只使用前 100 字符
      options?.model || 'default',
      String(options?.temperature ?? 0.7),
      String(options?.maxTokens ?? 4096),
    ];
    return `llm:simple:${Buffer.from(parts.join('|')).toString('base64')}`;
  }
}
