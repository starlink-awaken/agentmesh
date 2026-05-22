/**
 * Honeycomb v2 - RollbackHistory
 * 管理回滚操作历史，支持撤销回滚和持久化存储
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RollbackRecord, ProjectState } from './types.js';

/**
 * 回滚历史管理器
 * 跟踪所有回滚操作，支持撤销最后一次回滚
 */
export class RollbackHistory {
  private historyPath: string;
  private history: Map<string, RollbackRecord[]> = new Map();
  private loaded = false;

  constructor(dbPath: string) {
    // 使用与数据库同目录的 JSON 文件存储历史
    const dbDir = path.dirname(dbPath);
    const dbName = path.basename(dbPath, '.db');
    this.historyPath = path.join(dbDir, `${dbName}-rollback-history.json`);
    this.loadHistory();
  }

  // ----------------------------------------------------------
  // History Management
  // ----------------------------------------------------------

  /**
   * 记录一次回滚操作
   */
  record(record: RollbackRecord): void {
    if (!this.history.has(record.projectId)) {
      this.history.set(record.projectId, []);
    }

    this.history.get(record.projectId)!.push(record);
    this.saveHistory();
  }

  /**
   * 获取项目的回滚历史
   */
  getHistory(projectId: string): RollbackRecord[] {
    return (this.history.get(projectId) ?? []).slice(); // 返回副本
  }

  /**
   * 获取所有回滚历史
   */
  getAllHistory(): Map<string, RollbackRecord[]> {
    const result = new Map<string, RollbackRecord[]>();
    for (const [projectId, records] of this.history) {
      result.set(projectId, records.slice());
    }
    return result;
  }

  /**
   * 清除项目的回滚历史
   */
  clearHistory(projectId: string): void {
    this.history.delete(projectId);
    this.saveHistory();
  }

  /**
   * 获取最后一次回滚记录
   */
  getLastRollback(projectId: string): RollbackRecord | null {
    const records = this.history.get(projectId);
    if (!records || records.length === 0) {
      return null;
    }
    return records[records.length - 1];
  }

  // ----------------------------------------------------------
  // Undo Operations
  // ----------------------------------------------------------

  /**
   * 撤销最后一次成功的回滚
   * 这需要 CheckpointManager 来实际执行状态恢复
   *
   * @param projectId - 项目 ID
   * @param restoreFn - 恢复函数，接收目标检查点 ID 并返回状态
   * @returns 恢复后的项目状态
   * @throws Error 如果没有历史或最后一次回滚失败
   */
  async undoLastRollback(
    projectId: string,
    restoreFn: (checkpointId: string) => ProjectState | Promise<ProjectState>
  ): Promise<ProjectState> {
    const records = this.history.get(projectId);
    if (!records || records.length === 0) {
      throw new Error(`No rollback history for project: ${projectId}`);
    }

    const lastRollback = records[records.length - 1];
    if (!lastRollback.success) {
      throw new Error('Last rollback failed, cannot undo');
    }

    // 使用 fromCheckpoint 作为恢复目标（撤销回滚 = 回到回滚前的状态）
    const targetCheckpointId = lastRollback.fromCheckpoint;

    try {
      const restoredState = await restoreFn(targetCheckpointId);

      // 移除最后一条历史记录
      records.pop();
      if (records.length === 0) {
        this.history.delete(projectId);
      }
      this.saveHistory();

      return restoredState;
    } catch (error) {
      throw new Error(
        `Failed to undo rollback: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 获取可以撤销的回滚操作数量
   */
  getUndoableCount(projectId: string): number {
    const records = this.history.get(projectId);
    if (!records) {
      return 0;
    }
    // 计算成功的回滚数量
    return records.filter((r) => r.success).length;
  }

  // ----------------------------------------------------------
  // Persistence
  // ----------------------------------------------------------

  /**
   * 从文件加载历史记录
   */
  private loadHistory(): void {
    if (this.loaded) {
      return;
    }

    try {
      if (fs.existsSync(this.historyPath)) {
        const content = fs.readFileSync(this.historyPath, 'utf-8');
        const data = JSON.parse(content) as Record<string, RollbackRecord[]>;

        this.history.clear();
        for (const [projectId, records] of Object.entries(data)) {
          this.history.set(projectId, records);
        }
      }
    } catch (error) {
      console.warn(`[RollbackHistory] 加载历史失败: ${(error as Error).message}`);
      this.history.clear();
    }

    this.loaded = true;
  }

  /**
   * 保存历史记录到文件
   */
  private saveHistory(): void {
    try {
      const data: Record<string, RollbackRecord[]> = {};
      for (const [projectId, records] of this.history) {
        data[projectId] = records;
      }

      const content = JSON.stringify(data, null, 2);
      fs.writeFileSync(this.historyPath, content, 'utf-8');
    } catch (error) {
      console.error(`[RollbackHistory] 保存历史失败: ${(error as Error).message}`);
    }
  }

  /**
   * 获取历史文件路径（用于调试）
   */
  getHistoryPath(): string {
    return this.historyPath;
  }
}
