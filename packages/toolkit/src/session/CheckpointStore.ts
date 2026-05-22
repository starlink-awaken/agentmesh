/**
 * CheckpointStore - 检查点存储
 *
 * 支持内存存储和文件存储两种方式
 *
 * @author PAI
 * @version 1.0.0
 */

import type { Checkpoint, ICheckpointStore, CheckpointMetadata } from './types.js';

/**
 * 内存检查点存储
 */
export class MemoryCheckpointStore implements ICheckpointStore {
  private checkpoints: Map<string, Map<string, Checkpoint>> = new Map();

  /**
   * 保存检查点
   */
  async save(checkpoint: Checkpoint): Promise<void> {
    if (!this.checkpoints.has(checkpoint.sessionId)) {
      this.checkpoints.set(checkpoint.sessionId, new Map());
    }
    this.checkpoints.get(checkpoint.sessionId)!.set(checkpoint.id, {
      ...checkpoint,
      timestamp: new Date(checkpoint.timestamp),
    });
  }

  /**
   * 加载检查点
   */
  async load(sessionId: string, checkpointId: string): Promise<Checkpoint | null> {
    const sessionCheckpoints = this.checkpoints.get(sessionId);
    if (!sessionCheckpoints) {
      return null;
    }

    const checkpoint = sessionCheckpoints.get(checkpointId);
    if (!checkpoint) {
      return null;
    }

    return {
      ...checkpoint,
      timestamp: new Date(checkpoint.timestamp),
      state: {
        ...checkpoint.state,
        metadata: {
          ...checkpoint.state.metadata,
          createdAt: new Date(checkpoint.state.metadata.createdAt),
          updatedAt: new Date(checkpoint.state.metadata.updatedAt),
          startedAt: checkpoint.state.metadata.startedAt
            ? new Date(checkpoint.state.metadata.startedAt)
            : undefined,
          pausedAt: checkpoint.state.metadata.pausedAt
            ? new Date(checkpoint.state.metadata.pausedAt)
            : undefined,
          completedAt: checkpoint.state.metadata.completedAt
            ? new Date(checkpoint.state.metadata.completedAt)
            : undefined,
        },
        errors: checkpoint.state.errors.map((e) => ({
          ...e,
          timestamp: new Date(e.timestamp),
        })),
      },
    };
  }

  /**
   * 列出所有检查点
   */
  async list(sessionId: string): Promise<Checkpoint[]> {
    const sessionCheckpoints = this.checkpoints.get(sessionId);
    if (!sessionCheckpoints) {
      return [];
    }

    return Array.from(sessionCheckpoints.values())
      .map((cp) => ({
        ...cp,
        timestamp: new Date(cp.timestamp),
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * 获取最新的检查点
   */
  async latest(sessionId: string): Promise<Checkpoint | null> {
    const checkpoints = await this.list(sessionId);
    if (checkpoints.length === 0) {
      return null;
    }
    return checkpoints[checkpoints.length - 1];
  }

  /**
   * 删除检查点
   */
  async delete(sessionId: string, checkpointId: string): Promise<void> {
    const sessionCheckpoints = this.checkpoints.get(sessionId);
    if (sessionCheckpoints) {
      sessionCheckpoints.delete(checkpointId);
    }
  }

  /**
   * 清除会话的所有检查点
   */
  async clear(sessionId: string): Promise<void> {
    this.checkpoints.delete(sessionId);
  }
}

/**
 * 文件检查点存储
 */
export class FileCheckpointStore implements ICheckpointStore {
  private basePath: string;
  private cache: Map<string, Checkpoint> = new Map();
  private fs: typeof import('fs/promises') | null = null;

  /**
   * 构造函数
   */
  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * 初始化文件系统模块
   */
  private async initFs(): Promise<typeof import('fs/promises')> {
    if (!this.fs) {
      this.fs = await import('fs/promises');
    }
    return this.fs;
  }

  /**
   * 获取会话目录路径
   */
  private getSessionDir(sessionId: string): string {
    return `${this.basePath}/${sessionId}`;
  }

  /**
   * 获取检查点文件路径
   */
  private getCheckpointPath(sessionId: string, checkpointId: string): string {
    return `${this.getSessionDir(sessionId)}/${checkpointId}.json`;
  }

  /**
   * 确保会话目录存在
   */
  private async ensureDir(sessionId: string): Promise<void> {
    const fs = await this.initFs();
    const dir = this.getSessionDir(sessionId);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // 目录已存在
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * 保存检查点
   */
  async save(checkpoint: Checkpoint): Promise<void> {
    const fs = await this.initFs();
    await this.ensureDir(checkpoint.sessionId);

    const path = this.getCheckpointPath(checkpoint.sessionId, checkpoint.id);
    const data = JSON.stringify(checkpoint, null, 2);

    await fs.writeFile(path, data, 'utf-8');
    this.cache.set(`${checkpoint.sessionId}:${checkpoint.id}`, checkpoint);
  }

  /**
   * 加载检查点
   */
  async load(sessionId: string, checkpointId: string): Promise<Checkpoint | null> {
    // 先检查缓存
    const cached = this.cache.get(`${sessionId}:${checkpointId}`);
    if (cached) {
      return this.deserializeCheckpoint(cached);
    }

    const fs = await this.initFs();
    const path = this.getCheckpointPath(sessionId, checkpointId);

    try {
      const data = await fs.readFile(path, 'utf-8');
      const checkpoint = JSON.parse(data) as Checkpoint;
      this.cache.set(`${sessionId}:${checkpointId}`, checkpoint);
      return this.deserializeCheckpoint(checkpoint);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 列出所有检查点
   */
  async list(sessionId: string): Promise<Checkpoint[]> {
    const fs = await this.initFs();
    const dir = this.getSessionDir(sessionId);

    try {
      const files = await fs.readdir(dir);
      const checkpoints: Checkpoint[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const checkpointId = file.replace('.json', '');
        const checkpoint = await this.load(sessionId, checkpointId);
        if (checkpoint) {
          checkpoints.push(checkpoint);
        }
      }

      return checkpoints.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * 获取最新的检查点
   */
  async latest(sessionId: string): Promise<Checkpoint | null> {
    const checkpoints = await this.list(sessionId);
    if (checkpoints.length === 0) {
      return null;
    }
    return checkpoints[checkpoints.length - 1];
  }

  /**
   * 删除检查点
   */
  async delete(sessionId: string, checkpointId: string): Promise<void> {
    const fs = await this.initFs();
    const path = this.getCheckpointPath(sessionId, checkpointId);

    try {
      await fs.unlink(path);
      this.cache.delete(`${sessionId}:${checkpointId}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * 清除会话的所有检查点
   */
  async clear(sessionId: string): Promise<void> {
    const fs = await this.initFs();
    const dir = this.getSessionDir(sessionId);

    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(`${dir}/${file}`);
        }
      }
      // 清除缓存
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
          this.cache.delete(key);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * 反序列化检查点（恢复 Date 对象）
   */
  private deserializeCheckpoint(checkpoint: Checkpoint): Checkpoint {
    return {
      ...checkpoint,
      timestamp: new Date(checkpoint.timestamp),
      state: {
        ...checkpoint.state,
        metadata: {
          ...checkpoint.state.metadata,
          createdAt: new Date(checkpoint.state.metadata.createdAt),
          updatedAt: new Date(checkpoint.state.metadata.updatedAt),
          startedAt: checkpoint.state.metadata.startedAt
            ? new Date(checkpoint.state.metadata.startedAt)
            : undefined,
          pausedAt: checkpoint.state.metadata.pausedAt
            ? new Date(checkpoint.state.metadata.pausedAt)
            : undefined,
          completedAt: checkpoint.state.metadata.completedAt
            ? new Date(checkpoint.state.metadata.completedAt)
            : undefined,
        },
        errors: checkpoint.state.errors.map((e) => ({
          ...e,
          timestamp: new Date(e.timestamp),
        })),
      },
    };
  }
}

/**
 * 创建检查点存储
 */
export function createCheckpointStore(
  type: 'memory' | 'file',
  options?: { basePath?: string }
): ICheckpointStore {
  if (type === 'file') {
    if (!options?.basePath) {
      throw new Error('File checkpoint store requires basePath');
    }
    return new FileCheckpointStore(options.basePath);
  }
  return new MemoryCheckpointStore();
}

/**
 * 生成检查点 ID
 */
export function generateCheckpointId(): string {
  return `cp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
