import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Task } from '../types/index.js';

/**
 * TaskStore — bun:sqlite 持久化，无内存缓存
 * TaskManager 持有唯一 L1 缓存，TaskStore 只做 L2 持久化
 */
export class TaskStore {
  private db: Database;

  constructor(dbPath: string) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.db = new Database(dbPath);
    this.db.run('PRAGMA journal_mode=WAL');
    this.db.run('PRAGMA busy_timeout=3000');
    this._migrate();
  }

  private _migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending',
        request_json TEXT NOT NULL,
        assigned_agents TEXT NOT NULL DEFAULT '[]',
        result_json TEXT,
        error_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at)');
  }

  private _rowToTask(row: any): Task {
    return {
      id: row.id,
      status: row.status,
      request: JSON.parse(row.request_json),
      assignedAgents: JSON.parse(row.assigned_agents),
      result: row.result_json ? JSON.parse(row.result_json) : undefined,
      error: row.error_json ? JSON.parse(row.error_json) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** 加载所有任务（启动时调用一次） */
  loadAll(): Task[] {
    const rows = this.db.query('SELECT * FROM tasks ORDER BY created_at DESC').all() as any[];
    return rows.map(r => this._rowToTask(r));
  }

  /** 保存/更新单个任务 (UPSERT) */
  save(task: Task): void {
    this.db.run(
      `INSERT OR REPLACE INTO tasks (id, status, request_json, assigned_agents, result_json, error_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id, task.status,
        JSON.stringify(task.request),
        JSON.stringify(task.assignedAgents),
        task.result ? JSON.stringify(task.result) : null,
        task.error ? JSON.stringify(task.error) : null,
        task.createdAt, task.updatedAt,
      ]
    );
  }

  /** 删除 N 天前已完成/失败的任务，返回被删除的 ID */
  purgeCompleted(olderThanDays: number = 7): string[] {
    const cutoff = Date.now() - olderThanDays * 86400_000;
    const rows = this.db.query(
      `SELECT id FROM tasks WHERE status IN ('completed', 'failed') AND updated_at < ${cutoff}`
    ).all() as { id: string }[];
    if (rows.length > 0) {
      const ids = rows.map(r => `'${r.id}'`).join(',');
      this.db.run(`DELETE FROM tasks WHERE id IN (${ids})`);
    }
    return rows.map(r => r.id);
  }

  close(): void {
    this.db.close();
  }
}
