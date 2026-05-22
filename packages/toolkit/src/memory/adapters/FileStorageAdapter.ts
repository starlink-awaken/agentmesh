/**
 * FileStorageAdapter - 文件存储适配器
 *
 * 为 MemoryStore 和 ReasoningBank 提供文件持久化能力
 * 使用 JSONL (JSON Lines) 格式存储，每行一个 JSON 对象
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * StorageAdapter - 存储适配器接口
 */
export interface StorageAdapter<T> {
  /**
   * 保存所有条目（覆盖写入）
   */
  save(entries: T[]): Promise<void>;

  /**
   * 加载所有条目
   */
  load(): Promise<T[]>;

  /**
   * 清除所有条目
   */
  clear(): Promise<void>;

  /**
   * 追加条目（可选）
   */
  append?(entries: T[]): Promise<void>;
}

/**
 * FileStorageAdapter 配置
 */
export interface FileStorageConfig {
  /**
   * 存储目录路径
   * @default './data/memory'
   */
  storagePath?: string;

  /**
   * 存储文件名
   * @default 'memory.jsonl'
   */
  filename?: string;

  /**
   * 是否启用文件锁（简化实现）
   * @default false
   */
  enableLock?: boolean;

  /**
   * 是否在写入时创建备份
   * @default false
   */
  enableBackup?: boolean;
}

// ============================================================================
// FileStorageAdapter 主类
// ============================================================================

/**
 * FileStorageAdapter - 文件存储适配器
 *
 * 使用 JSONL 格式存储数据，支持泛型类型
 *
 * @example
 * ```typescript
 * // MemoryEntry 存储
 * const adapter = new FileStorageAdapter<MemoryEntry>({
 *   storagePath: './data/memory',
 *   filename: 'memories.jsonl',
 * });
 *
 * await adapter.save([entry1, entry2]);
 * const entries = await adapter.load();
 * ```
 *
 * @example
 * ```typescript
 * // ReasoningMemory 存储
 * const adapter = new FileStorageAdapter<ReasoningMemory>({
 *   storagePath: './data/reasoning',
 *   filename: 'reasoning-bank.jsonl',
 * });
 * ```
 */
export class FileStorageAdapter<T> implements StorageAdapter<T> {
  private readonly config: Required<FileStorageConfig>;
  private readonly filePath: string;
  private readonly backupPath: string;

  constructor(config: FileStorageConfig = {}) {
    this.config = {
      storagePath: config.storagePath || './data/memory',
      filename: config.filename || 'memory.jsonl',
      enableLock: config.enableLock ?? false,
      enableBackup: config.enableBackup ?? false,
    };

    this.filePath = join(this.config.storagePath, this.config.filename);
    this.backupPath = `${this.filePath}.backup`;

    this.ensureStorageDirectory();
  }

  /**
   * 确保存储目录存在
   */
  private ensureStorageDirectory(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 保存所有条目（覆盖写入）
   *
   * @param entries - 要保存的条目数组
   */
  async save(entries: T[]): Promise<void> {
    // 如果启用备份且文件存在，先创建备份
    if (this.config.enableBackup && existsSync(this.filePath)) {
      const content = readFileSync(this.filePath, 'utf-8');
      writeFileSync(this.backupPath, content);
    }

    // 将每个条目序列化为 JSON 行
    const lines = entries.map(entry => JSON.stringify(entry));
    const content = lines.length > 0 ? lines.join('\n') + '\n' : '';

    // 写入文件
    writeFileSync(this.filePath, content, 'utf-8');
  }

  /**
   * 加载所有条目
   *
   * @returns 加载的条目数组，如果文件不存在则返回空数组
   */
  async load(): Promise<T[]> {
    if (!existsSync(this.filePath)) {
      return [];
    }

    try {
      const content = readFileSync(this.filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      const entries: T[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as T;
          entries.push(entry);
        } catch (parseError) {
          // 跳过解析失败的行，但记录警告
          console.warn(`[FileStorageAdapter] Failed to parse line: ${line.substring(0, 50)}...`);
        }
      }

      return entries;
    } catch (error) {
      // 文件读取错误，返回空数组
      console.warn(`[FileStorageAdapter] Failed to read file: ${error}`);
      return [];
    }
  }

  /**
   * 清除所有条目
   */
  async clear(): Promise<void> {
    if (existsSync(this.filePath)) {
      unlinkSync(this.filePath);
    }

    // 同时删除备份文件
    if (existsSync(this.backupPath)) {
      unlinkSync(this.backupPath);
    }
  }

  /**
   * 追加条目到现有文件
   *
   * @param entries - 要追加的条目数组
   */
  async append(entries: T[]): Promise<void> {
    this.ensureStorageDirectory();

    const lines = entries.map(entry => JSON.stringify(entry));
    const content = lines.join('\n') + (lines.length > 0 ? '\n' : '');

    // 如果文件不存在，使用 writeFileSync 创建
    if (!existsSync(this.filePath)) {
      writeFileSync(this.filePath, content, 'utf-8');
    } else {
      // 追加到现有文件
      appendFileSync(this.filePath, content, 'utf-8');
    }
  }

  /**
   * 获取存储文件路径
   */
  getFilePath(): string {
    return this.filePath;
  }

  /**
   * 检查存储文件是否存在
   */
  exists(): boolean {
    return existsSync(this.filePath);
  }

  /**
   * 从备份恢复（如果存在）
   *
   * @returns 是否成功恢复
   */
  async restoreFromBackup(): Promise<boolean> {
    if (!existsSync(this.backupPath)) {
      return false;
    }

    try {
      const content = readFileSync(this.backupPath, 'utf-8');
      writeFileSync(this.filePath, content, 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取存储条目数量（不加载全部内容）
   */
  async count(): Promise<number> {
    if (!existsSync(this.filePath)) {
      return 0;
    }

    try {
      const content = readFileSync(this.filePath, 'utf-8');
      return content.split('\n').filter(line => line.trim()).length;
    } catch {
      return 0;
    }
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 MemoryEntry 存储适配器
 */
export function createMemoryStorageAdapter(storagePath?: string): FileStorageAdapter<import('../types.js').MemoryEntry> {
  return new FileStorageAdapter<import('../types.js').MemoryEntry>({
    storagePath: storagePath || './data/memory',
    filename: 'memories.jsonl',
  });
}

/**
 * 创建 ReasoningMemory 存储适配器
 */
export function createReasoningStorageAdapter(storagePath?: string): FileStorageAdapter<import('../types.js').ReasoningMemory> {
  return new FileStorageAdapter<import('../types.js').ReasoningMemory>({
    storagePath: storagePath || './data/reasoning',
    filename: 'reasoning-bank.jsonl',
  });
}
