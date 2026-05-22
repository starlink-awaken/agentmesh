/**
 * Honeycomb P2.4 - 对象池
 *
 * 通用对象池实现，用于复用昂贵对象，减少初始化开销。
 * 适用于 Lexer、Parser 等需要频繁创建的对象。
 *
 * 特性：
 * - 自动对象获取和释放
 * - 可选重置函数
 * - 可配置最大池大小
 * - 线程安全（单线程环境）
 */

/**
 * 对象池配置选项
 */
export interface ObjectPoolOptions<T> {
  /** 对象工厂函数 */
  factory: () => T;
  /** 重置函数（可选）- 对象归还时调用 */
  reset?: (obj: T) => void;
  /** 最大池大小（默认10） */
  maxSize?: number;
  /** 初始池大小（默认0） */
  initialSize?: number;
}

/**
 * 通用对象池
 *
 * 用于复用昂贵对象，减少初始化开销。
 * 适用于 Lexer、Parser 等对象。
 *
 * @example
 * ```typescript
 * const lexerPool = new ObjectPool(
 *   () => new Lexer(),
 *   (lexer) => lexer.reset(),
 *   10
 * );
 *
 * const lexer = lexerPool.acquire();
 * try {
 *   const tokens = lexer.tokenize(source);
 *   // 处理 tokens...
 * } finally {
 *   lexerPool.release(lexer);
 * }
 * ```
 */
export class ObjectPool<T> {
  /** 对象池存储 */
  private pool: T[] = [];
  /** 对象工厂函数 */
  private factory: () => T;
  /** 重置函数（可选） */
  private reset?: (obj: T) => void;
  /** 最大池大小 */
  private maxSize: number;
  /** 统计信息 */
  private stats = {
    /** 获取次数 */
    acquireCount: 0,
    /** 从池中获取次数（缓存命中） */
    hitCount: 0,
    /** 创建新对象次数（缓存未命中） */
    missCount: 0,
    /** 归还次数 */
    releaseCount: 0,
    /** 因池满丢弃次数 */
    discardCount: 0,
  };

  /**
   * 创建对象池
   *
   * @param factory - 对象工厂函数
   * @param reset - 重置函数（可选）
   * @param maxSize - 最大池大小（默认10）
   */
  constructor(factory: () => T, reset?: (obj: T) => void, maxSize: number = 10) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;
  }

  /**
   * 使用配置对象创建对象池
   *
   * @param options - 配置选项
   */
  static withOptions<T>(options: ObjectPoolOptions<T>): ObjectPool<T> {
    const {
      factory,
      reset,
      maxSize = 10,
      initialSize = 0,
    } = options;

    const pool = new ObjectPool(factory, reset, maxSize);

    // 预填充池
    for (let i = 0; i < initialSize; i++) {
      pool.pool.push(factory());
    }

    return pool;
  }

  /**
   * 获取对象（从池中取出或新建）
   *
   * @returns 对象实例
   */
  acquire(): T {
    this.stats.acquireCount++;

    if (this.pool.length > 0) {
      this.stats.hitCount++;
      return this.pool.pop()!;
    }

    this.stats.missCount++;
    return this.factory();
  }

  /**
   * 归还对象（重置后放回池中）
   *
   * @param obj - 要归还的对象
   */
  release(obj: T): void {
    this.stats.releaseCount++;

    if (this.pool.length < this.maxSize) {
      if (this.reset) {
        this.reset(obj);
      }
      this.pool.push(obj);
    } else {
      this.stats.discardCount++;
    }
  }

  /**
   * 使用对象执行函数（自动获取和释放）
   *
   * 这是一个便捷方法，确保对象在使用后被正确归还。
   *
   * @param fn - 使用对象的函数
   * @returns 函数执行结果
   *
   * @example
   * ```typescript
   * const tokens = await pool.use(async (lexer) => {
   *   return lexer.tokenize(source);
   * });
   * ```
   */
  use<R>(fn: (obj: T) => R): R {
    const obj = this.acquire();
    try {
      return fn(obj);
    } finally {
      this.release(obj);
    }
  }

  /**
   * 异步使用对象执行函数（自动获取和释放）
   *
   * @param fn - 使用对象的异步函数
   * @returns Promise 包含函数执行结果
   */
  async useAsync<R>(fn: (obj: T) => Promise<R>): Promise<R> {
    const obj = this.acquire();
    try {
      return await fn(obj);
    } finally {
      this.release(obj);
    }
  }

  /**
   * 清空池
   */
  clear(): void {
    this.pool = [];
  }

  /**
   * 获取当前池大小
   */
  size(): number {
    return this.pool.length;
  }

  /**
   * 获取池的最大容量
   */
  getMaxSize(): number {
    return this.maxSize;
  }

  /**
   * 获取统计信息
   */
  getStats(): Readonly<{
    /** 获取次数 */
    acquireCount: number;
    /** 从池中获取次数（缓存命中） */
    hitCount: number;
    /** 创建新对象次数（缓存未命中） */
    missCount: number;
    /** 归还次数 */
    releaseCount: number;
    /** 因池满丢弃次数 */
    discardCount: number;
    /** 缓存命中率 */
    hitRate: number;
    /** 当前池大小 */
    currentSize: number;
  }> {
    return {
      ...this.stats,
      hitRate: this.stats.acquireCount > 0
        ? this.stats.hitCount / this.stats.acquireCount
        : 0,
      currentSize: this.pool.length,
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      acquireCount: 0,
      hitCount: 0,
      missCount: 0,
      releaseCount: 0,
      discardCount: 0,
    };
  }
}

// ============================================================
// Lexer 专用对象池
// ============================================================

import { Lexer } from './parser.js';

/**
 * Lexer 对象池
 *
 * 预配置的 Lexer 对象池，支持 reset 操作。
 */
export class LexerPool extends ObjectPool<Lexer> {
  constructor(maxSize: number = 10) {
    // Lexer 需要存储源码和文件名，用于 reset
    const createLexer = () => new Lexer('', '<unknown>');

    const resetLexer = (lexer: Lexer) => {
      // 重置 Lexer 状态
      lexer.reset?.();
    };

    super(createLexer, resetLexer, maxSize);
  }

  /**
   * 获取并配置 Lexer
   *
   * @param source - DSL 源码
   * @param filename - 文件名
   * @returns 配置好的 Lexer
   */
  acquireWithSource(source: string, filename: string = '<unknown>'): Lexer {
    const lexer = this.acquire();
    lexer.setSource?.(source, filename);
    return lexer;
  }
}

// ============================================================
// 导出默认实例
// ============================================================

/**
 * 默认 Lexer 对象池（单例）
 *
 * 全局共享的 Lexer 对象池，避免创建多个池。
 */
export const defaultLexerPool = new LexerPool(10);
