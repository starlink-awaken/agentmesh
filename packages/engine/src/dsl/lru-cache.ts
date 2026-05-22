/**
 * Honeycomb DSL - LRU (Least Recently Used) 缓存
 *
 * 实现基于 Map 的 LRU 缓存，自动淘汰最久未使用的条目。
 * 支持 TTL 过期策略，适用于解析结果缓存等场景。
 *
 * @module dsl/lru-cache
 */

/**
 * LRU 缓存统计信息
 */
export interface LRUCacheStats {
  /** 缓存大小 */
  size: number;
  /** 最大容量 */
  maxSize: number;
  /** 命中次数 */
  hits: number;
  /** 未命中次数 */
  misses: number;
  /** 命中率 */
  hitRate: number;
  /** 淘汰次数 */
  evictions: number;
}

/**
 * 带过期时间的缓存条目
 */
interface CacheEntry<V> {
  /** 缓存值 */
  value: V;
  /** 过期时间戳（毫秒），0 表示永不过期 */
  expires: number;
}

/**
 * LRU (Least Recently Used) 缓存
 *
 * 基于 Map 实现，自动淘汰最久未使用的条目。
 * 使用 Map 的插入顺序特性来追踪 LRU 顺序。
 *
 * @example
 * ```ts
 * const cache = new LRUCache<string, number>(100);
 * cache.set('key1', 100);
 * const value = cache.get('key1'); // 100
 * cache.clear();
 * ```
 */
export class LRUCache<K, V> {
  /** 缓存存储 */
  protected cache: Map<K, V>;
  /** 最大容量 */
  protected maxSize: number;
  /** 命中次数 */
  protected hits: number = 0;
  /** 未命中次数 */
  protected misses: number = 0;
  /** 淘汰次数 */
  protected evictions: number = 0;

  /**
   * 创建 LRU 缓存
   *
   * @param maxSize - 最大缓存大小（默认 100）
   */
  constructor(maxSize: number = 100) {
    if (maxSize <= 0) {
      throw new Error(`maxSize must be positive, got ${maxSize}`);
    }
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * 获取缓存值
   *
   * 获取时会将条目移到最后（标记为最近使用）。
   *
   * @param key - 缓存键
   * @returns 缓存值，如果不存在或已过期则返回 undefined
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);

    if (value === undefined) {
      this.misses++;
      return undefined;
    }

    // LRU: 移到最后（最近使用）
    this.cache.delete(key);
    this.cache.set(key, value);

    this.hits++;
    return value;
  }

  /**
   * 设置缓存值
   *
   * 如果缓存已满，会淘汰最久未使用的条目。
   *
   * @param key - 缓存键
   * @param value - 缓存值
   */
  set(key: K, value: V): void {
    // 删除旧值（如果存在）以便重新插入到末尾
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // 添加新值
    this.cache.set(key, value);

    // 淘汰最久未使用的（第一个条目）
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
        this.evictions++;
      }
    }
  }

  /**
   * 检查键是否存在
   *
   * 注意：此操作不会更新 LRU 顺序
   *
   * @param key - 缓存键
   * @returns 如果键存在返回 true
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * 删除缓存条目
   *
   * @param key - 缓存键
   * @returns 如果删除成功返回 true
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 获取所有键
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * 获取所有值
   */
  values(): IterableIterator<V> {
    return this.cache.values();
  }

  /**
   * 获取所有条目
   */
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): LRUCacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      evictions: this.evictions,
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * 调整缓存大小
   *
   * 如果新大小小于当前大小，会淘汰多余条目
   *
   * @param newMaxSize - 新的最大容量
   */
  resize(newMaxSize: number): void {
    if (newMaxSize <= 0) {
      throw new Error(`maxSize must be positive, got ${newMaxSize}`);
    }

    this.maxSize = newMaxSize;

    // 淘汰超出容量的条目
    while (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
        this.evictions++;
      } else {
        // 没有更多键可删除
        break;
      }
    }
  }
}

/**
 * 带 TTL (Time To Live) 的 LRU 缓存
 *
 * 在 LRU 缓存基础上增加过期时间功能。
 *
 * @example
 * ```ts
 * const cache = new LRUCacheWithTTL<string, number>(100, 60000); // 60秒 TTL
 * cache.set('key1', 100);
 * const value = cache.get('key1'); // 100
 * // 等待 60 秒后...
 * const expired = cache.get('key1'); // undefined (已过期)
 * ```
 */
export class LRUCacheWithTTL<K, V> {
  /** 缓存存储 */
  protected cache: Map<K, CacheEntry<V>>;
  /** 最大容量 */
  protected maxSize: number;
  /** TTL（毫秒） */
  protected ttl: number;
  /** 命中次数 */
  protected hits: number = 0;
  /** 未命中次数 */
  protected misses: number = 0;
  /** 过期次数 */
  protected expirations: number = 0;
  /** 淘汰次数 */
  protected evictions: number = 0;

  /**
   * 创建带 TTL 的 LRU 缓存
   *
   * @param maxSize - 最大缓存大小（默认 100）
   * @param ttl - 过期时间（毫秒，默认 60000 = 1分钟）
   */
  constructor(maxSize: number = 100, ttl: number = 60000) {
    if (maxSize <= 0) {
      throw new Error(`maxSize must be positive, got ${maxSize}`);
    }
    if (ttl <= 0) {
      throw new Error(`ttl must be positive, got ${ttl}`);
    }

    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * 获取缓存值
   *
   * 如果条目已过期，会自动删除并返回 undefined。
   * 获取时会将有效条目移到最后（标记为最近使用）。
   *
   * @param key - 缓存键
   * @returns 缓存值，如果不存在或已过期则返回 undefined
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // 检查是否过期
    const now = Date.now();
    if (entry.expires > 0 && now > entry.expires) {
      this.cache.delete(key);
      this.misses++;
      this.expirations++;
      return undefined;
    }

    // LRU: 移到最后（最近使用）
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    return entry.value;
  }

  /**
   * 设置缓存值
   *
   * 会自动设置过期时间。如果缓存已满，会淘汰最久未使用的条目。
   *
   * @param key - 缓存键
   * @param value - 缓存值
   * @param customTTL - 自定义 TTL（毫秒），可选，默认使用构造函数设置的 TTL
   */
  set(key: K, value: V, customTTL?: number): void {
    // 删除旧值（如果存在）
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // 添加新值（带过期时间）
    const ttl = customTTL ?? this.ttl;
    const entry: CacheEntry<V> = {
      value,
      expires: ttl === 0 ? 0 : Date.now() + ttl,
    };
    this.cache.set(key, entry);

    // 淘汰最久未使用的（第一个条目）
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
        this.evictions++;
      }
    }
  }

  /**
   * 检查键是否存在且未过期
   *
   * 注意：此操作不会更新 LRU 顺序
   *
   * @param key - 缓存键
   * @returns 如果键存在且未过期返回 true
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // 检查是否过期
    const now = Date.now();
    if (entry.expires > 0 && now > entry.expires) {
      // 延迟删除：在 has 时删除过期条目
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 删除缓存条目
   *
   * @param key - 缓存键
   * @returns 如果删除成功返回 true
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.expirations = 0;
    this.evictions = 0;
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 清理所有过期条目
   *
   * 遍历整个缓存，删除已过期的条目。
   * 建议定期调用以释放内存。
   *
   * @returns 清理的过期条目数量
   */
  purgeExpired(): number {
    const now = Date.now();
    let purged = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires > 0 && now > entry.expires) {
        this.cache.delete(key);
        purged++;
      }
    }

    this.expirations += purged;
    return purged;
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): LRUCacheStats & { expirations: number; ttl: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      evictions: this.evictions,
      expirations: this.expirations,
      ttl: this.ttl,
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.expirations = 0;
    this.evictions = 0;
  }

  /**
   * 调整缓存大小
   *
   * @param newMaxSize - 新的最大容量
   */
  resize(newMaxSize: number): void {
    if (newMaxSize <= 0) {
      throw new Error(`maxSize must be positive, got ${newMaxSize}`);
    }

    this.maxSize = newMaxSize;

    // 淘汰超出容量的条目
    while (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
        this.evictions++;
      } else {
        // 没有更多键可删除
        break;
      }
    }
  }

  /**
   * 获取所有键
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * 获取所有值（仅返回未过期的）
   */
  values(): IterableIterator<V> {
    const now = Date.now();
    const values: V[] = [];

    for (const entry of this.cache.values()) {
      if (entry.expires === 0 || now <= entry.expires) {
        values.push(entry.value);
      }
    }

    return values[Symbol.iterator]();
  }

  /**
   * 获取所有条目（仅返回未过期的）
   */
  entries(): IterableIterator<[K, V]> {
    const now = Date.now();
    const entries: [K, V][] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires === 0 || now <= entry.expires) {
        entries.push([key, entry.value]);
      }
    }

    return entries[Symbol.iterator]();
  }
}

/**
 * 创建 LRU 缓存的工厂函数
 *
 * @param maxSize - 最大缓存大小
 * @returns LRU 缓存实例
 */
export function createLRUCache<K, V>(maxSize: number = 100): LRUCache<K, V> {
  return new LRUCache<K, V>(maxSize);
}

/**
 * 创建带 TTL 的 LRU 缓存的工厂函数
 *
 * @param maxSize - 最大缓存大小
 * @param ttl - 过期时间（毫秒）
 * @returns 带 TTL 的 LRU 缓存实例
 */
export function createLRUCacheWithTTL<K, V>(
  maxSize: number = 100,
  ttl: number = 60000
): LRUCacheWithTTL<K, V> {
  return new LRUCacheWithTTL<K, V>(maxSize, ttl);
}
