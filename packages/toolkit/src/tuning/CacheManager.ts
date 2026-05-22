/**
 * CacheManager - 分层缓存管理器
 *
 * 支持多级缓存：内存 -> 磁盘 -> 远程
 * 源自"分层缓存"设计模式
 */
import type { CacheEntry, CacheConfig, CacheTier } from './types.js';

export class CacheManager {
  private caches: Map<CacheTier, Map<string, CacheEntry>> = new Map();
  private configs: Map<CacheTier, CacheConfig> = new Map();

  constructor(defaultConfigs?: Partial<Record<CacheTier, CacheConfig>>) {
    // 初始化各层配置
    this.configs.set('memory', defaultConfigs?.memory || {
      tier: 'memory',
      maxSize: 1000,
      ttl: 60 * 1000, // 1分钟
      evictionPolicy: 'lru',
    });

    this.configs.set('disk', defaultConfigs?.disk || {
      tier: 'disk',
      maxSize: 10000,
      ttl: 60 * 60 * 1000, // 1小时
      evictionPolicy: 'lfu',
    });

    this.configs.set('remote', defaultConfigs?.remote || {
      tier: 'remote',
      maxSize: 100000,
      ttl: 24 * 60 * 60 * 1000, // 1天
      evictionPolicy: 'fifo',
    });

    // 初始化缓存存储
    for (const tier of ['memory', 'disk', 'remote'] as CacheTier[]) {
      this.caches.set(tier, new Map());
    }
  }

  /**
   * 设置缓存
   */
  set<T>(key: string, value: T, tier: CacheTier = 'memory', ttl?: number): void {
    const cache = this.caches.get(tier)!;
    const config = this.configs.get(tier)!;

    // 检查容量，必要时驱逐
    if (cache.size >= config.maxSize) {
      this.evict(tier);
    }

    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + (ttl || config.ttl),
      accessCount: 0,
      lastAccessed: Date.now(),
    };

    cache.set(key, entry as CacheEntry);
  }

  /**
   * 获取缓存
   */
  get<T>(key: string, tier: CacheTier = 'memory'): T | null {
    const cache = this.caches.get(tier)!;
    const entry = cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      // 尝试从下一层获取
      return this.getFromLowerTier(key, tier) as T | null;
    }

    // 检查过期
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return null;
    }

    // 更新访问统计
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    return entry.value;
  }

  /**
   * 从下层缓存获取
   */
  private getFromLowerTier(key: string, currentTier: CacheTier): unknown {
    const tiers: CacheTier[] = ['memory', 'disk', 'remote'];
    const currentIndex = tiers.indexOf(currentTier);

    for (let i = currentIndex + 1; i < tiers.length; i++) {
      const lowerTier = tiers[i];
      const value = this.caches.get(lowerTier)!.get(key);
      if (value) {
        // 提升到当前层
        this.set(key, value.value, currentTier);
        return value.value;
      }
    }

    return null;
  }

  /**
   * 驱逐条目
   */
  private evict(tier: CacheTier): void {
    const cache = this.caches.get(tier)!;
    const config = this.configs.get(tier)!;
    const entries = Array.from(cache.entries());

    if (entries.length === 0) return;

    let evictIndex = 0;

    switch (config.evictionPolicy) {
      case 'lru':
        // 最久未使用
        evictIndex = entries.reduce((minIdx, [_, entry], idx, arr) =>
          entry.lastAccessed < arr[minIdx][1].lastAccessed ? idx : minIdx, 0);
        break;
      case 'lfu':
        // 最少使用
        evictIndex = entries.reduce((minIdx, [_, entry], idx, arr) =>
          entry.accessCount < arr[minIdx][1].accessCount ? idx : minIdx, 0);
        break;
      case 'fifo':
        // 最早创建
        evictIndex = entries.reduce((minIdx, [_, entry], idx, arr) =>
          entry.createdAt < arr[minIdx][1].createdAt ? idx : minIdx, 0);
        break;
    }

    cache.delete(entries[evictIndex][0]);
  }

  /**
   * 清除缓存
   */
  clear(tier?: CacheTier): void {
    if (tier) {
      this.caches.get(tier)!.clear();
    } else {
      for (const cache of this.caches.values()) {
        cache.clear();
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): Record<CacheTier, { size: number; hits: number }> {
    return {
      memory: { size: this.caches.get('memory')!.size, hits: 0 },
      disk: { size: this.caches.get('disk')!.size, hits: 0 },
      remote: { size: this.caches.get('remote')!.size, hits: 0 },
    };
  }
}
