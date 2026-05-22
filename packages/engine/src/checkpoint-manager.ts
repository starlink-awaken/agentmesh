/**
 * Honeycomb v2 - 检查点管理器
 *
 * 基于 SQLite 的项目检查点和项目状态持久化。
 * 使用 bun:sqlite，支持预处理语句和事务。
 *
 * @since v2.0.0
 */

import { Database, type Statement } from 'bun:sqlite';
import crypto from 'node:crypto';
import type { Checkpoint, Phase, ProjectState, RollbackPreview, RollbackOptions, RollbackRecord } from './types.js';

// ============================================================
// Row types for SQLite query results
// ============================================================

interface CheckpointRow {
  id: string;
  project_id: string;
  phase: string;
  timestamp: number;
  description: string;
  recoverable: number; // SQLite stores booleans as 0/1
  state_json: string;
}

interface ProjectRow {
  project_id: string;
  project_name: string;
  state_json: string;
  created_at: number;
  updated_at: number;
}

interface ProjectListRow {
  project_id: string;
  project_name: string;
  updated_at: number;
}

// ============================================================
// CheckpointManager
// ============================================================

export class CheckpointManager {
  private db: Database;
  private sequence: number = 0; // 用于确保同一毫秒内的检查点有序

  // Prepared statements cache
  private stmts!: {
    insertCheckpoint: Statement;
    selectCheckpoint: Statement;
    selectCheckpointsByProject: Statement;
    deleteCheckpoint: Statement;
    deleteCheckpointsByProject: Statement;
    selectLatestCheckpoint: Statement;
    upsertProject: Statement;
    selectProject: Statement;
    selectAllProjects: Statement;
    deleteProject: Statement;
    selectMaxSequence: Statement;
  };

  constructor(dbPath: string) {
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');

    this.initTables();
    this.prepareStatements();

    // 初始化序列号为当前最大值 + 1
    this.initializeSequence();
  }

  // ----------------------------------------------------------
  // Sequence initialization
  // ----------------------------------------------------------

  private initializeSequence(): void {
    try {
      const result = this.stmts.selectMaxSequence.get() as { max_seq: number } | undefined;
      this.sequence = result?.max_seq ?? 0;
    } catch {
      this.sequence = 0;
    }
  }

  // ----------------------------------------------------------
  // Schema initialization
  // ----------------------------------------------------------

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        project_id   TEXT PRIMARY KEY,
        project_name TEXT NOT NULL,
        state_json   TEXT NOT NULL,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS checkpoints (
        id           TEXT PRIMARY KEY,
        project_id   TEXT NOT NULL,
        phase        TEXT NOT NULL,
        timestamp    INTEGER NOT NULL,
        sequence     INTEGER NOT NULL DEFAULT 0,
        description  TEXT NOT NULL,
        recoverable  INTEGER NOT NULL DEFAULT 1,
        state_json   TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_checkpoints_project
        ON checkpoints(project_id, timestamp DESC, sequence DESC);
    `);
  }

  // ----------------------------------------------------------
  // Prepared statements
  // ----------------------------------------------------------

  private prepareStatements(): void {
    this.stmts = {
      insertCheckpoint: this.db.prepare(`
        INSERT INTO checkpoints (id, project_id, phase, timestamp, sequence, description, recoverable, state_json)
        VALUES ($id, $project_id, $phase, $timestamp, $sequence, $description, $recoverable, $state_json)
      `),

      selectCheckpoint: this.db.prepare(`
        SELECT id, project_id, phase, timestamp, description, recoverable, state_json
        FROM checkpoints WHERE id = ?
      `),

      selectCheckpointsByProject: this.db.prepare(`
        SELECT id, project_id, phase, timestamp, description, recoverable, state_json
        FROM checkpoints WHERE project_id = ? ORDER BY timestamp DESC, sequence DESC
      `),

      deleteCheckpoint: this.db.prepare(`
        DELETE FROM checkpoints WHERE id = ?
      `),

      deleteCheckpointsByProject: this.db.prepare(`
        DELETE FROM checkpoints WHERE project_id = ?
      `),

      selectLatestCheckpoint: this.db.prepare(`
        SELECT id, project_id, phase, timestamp, description, recoverable, state_json
        FROM checkpoints WHERE project_id = ? ORDER BY timestamp DESC, sequence DESC LIMIT 1
      `),

      upsertProject: this.db.prepare(`
        INSERT INTO projects (project_id, project_name, state_json, created_at, updated_at)
        VALUES ($project_id, $project_name, $state_json, $created_at, $updated_at)
        ON CONFLICT(project_id) DO UPDATE SET
          project_name = $project_name,
          state_json   = $state_json,
          updated_at   = $updated_at
      `),

      selectProject: this.db.prepare(`
        SELECT project_id, project_name, state_json, created_at, updated_at
        FROM projects WHERE project_id = ?
      `),

      selectAllProjects: this.db.prepare(`
        SELECT project_id, project_name, updated_at
        FROM projects ORDER BY updated_at DESC
      `),

      deleteProject: this.db.prepare(`
        DELETE FROM projects WHERE project_id = ?
      `),

      selectMaxSequence: this.db.prepare(`
        SELECT COALESCE(MAX(sequence), 0) as max_seq FROM checkpoints
      `),
    };
  }

  // ----------------------------------------------------------
  // Checkpoint operations
  // ----------------------------------------------------------

  /**
   * Create a checkpoint snapshot of the current project state.
   * Runs inside a transaction: ensures the project row exists before
   * inserting the checkpoint row.
   */
  createCheckpoint(state: ProjectState, description: string): Checkpoint {
    const now = Date.now();
    this.sequence = (this.sequence + 1); // 自增序列号（无限递增）

    const checkpoint: Checkpoint = {
      id: this.generateId(),
      project_id: state.project_id,
      phase: state.current_phase,
      timestamp: now,
      created_at: now, // Alias for API consistency
      description,
      recoverable: true,
      state_json: JSON.stringify(state),
    };

    const txn = this.db.transaction(() => {
      // Ensure the project record exists / is up-to-date
      this.stmts.upsertProject.run({
        $project_id: state.project_id,
        $project_name: state.project_name,
        $state_json: JSON.stringify(state),
        $created_at: state.created_at,
        $updated_at: Date.now(),
      });

      this.stmts.insertCheckpoint.run({
        $id: checkpoint.id,
        $project_id: checkpoint.project_id,
        $phase: checkpoint.phase,
        $timestamp: checkpoint.timestamp,
        $sequence: this.sequence,
        $description: checkpoint.description,
        $recoverable: checkpoint.recoverable ? 1 : 0,
        $state_json: checkpoint.state_json,
      });
    });

    txn();
    return checkpoint;
  }

  /**
   * Restore a ProjectState from a checkpoint.
   * @throws Error if checkpoint not found or state_json is invalid.
   */
  restoreCheckpoint(checkpointId: string): ProjectState {
    const row = this.stmts.selectCheckpoint.get(checkpointId) as
      | CheckpointRow
      | undefined;

    if (!row) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    try {
      return JSON.parse(row.state_json) as ProjectState;
    } catch (err) {
      throw new Error(
        `Failed to parse checkpoint state (${checkpointId}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * List all checkpoints for a given project, newest first.
   */
  listCheckpoints(projectId: string): Checkpoint[] {
    const rows = this.stmts.selectCheckpointsByProject.all(projectId) as CheckpointRow[];
    return rows.map(this.rowToCheckpoint);
  }

  /**
   * Delete a single checkpoint by its ID.
   */
  deleteCheckpoint(checkpointId: string): void {
    const result = this.stmts.deleteCheckpoint.run(checkpointId);
    if (result.changes === 0) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }
  }

  /**
   * Get the most recent checkpoint for a project, or null if none exist.
   */
  getLatestCheckpoint(projectId: string): Checkpoint | null {
    const row = this.stmts.selectLatestCheckpoint.get(projectId) as
      | CheckpointRow
      | undefined;
    return row ? this.rowToCheckpoint(row) : null;
  }

  // ----------------------------------------------------------
  // Project state persistence
  // ----------------------------------------------------------

  /**
   * Save or update the full project state.
   * Uses UPSERT so it works for both new and existing projects.
   */
  saveProjectState(state: ProjectState): void {
    this.stmts.upsertProject.run({
      $project_id: state.project_id,
      $project_name: state.project_name,
      $state_json: JSON.stringify(state),
      $created_at: state.created_at,
      $updated_at: Date.now(),
    });
  }

  /**
   * Load the full project state, or null if the project doesn't exist.
   */
  loadProjectState(projectId: string): ProjectState | null {
    const row = this.stmts.selectProject.get(projectId) as
      | ProjectRow
      | undefined;

    if (!row) {
      return null;
    }

    try {
      return JSON.parse(row.state_json) as ProjectState;
    } catch (err) {
      throw new Error(
        `Failed to parse project state (${projectId}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * List all known projects with summary metadata.
   */
  listProjects(): Array<{ project_id: string; project_name: string; updated_at: number }> {
    return this.stmts.selectAllProjects.all() as ProjectListRow[];
  }

  /**
   * Delete a project and all its associated checkpoints (CASCADE).
   * Wrapped in a transaction for atomicity.
   */
  deleteProject(projectId: string): void {
    const txn = this.db.transaction(() => {
      // Explicitly delete checkpoints first for engines that may not honour FK CASCADE
      this.stmts.deleteCheckpointsByProject.run(projectId);
      const result = this.stmts.deleteProject.run(projectId);
      if (result.changes === 0) {
        throw new Error(`Project not found: ${projectId}`);
      }
    });

    txn();
  }

  // ----------------------------------------------------------
  // Utility
  // ----------------------------------------------------------

  /**
   * Generate a unique ID using the built-in crypto API.
   */
  generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Close the database connection. Must be called on shutdown.
   */
  close(): void {
    this.db.close();
  }

  // ----------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------

  /**
   * Convert a raw SQLite row to a typed Checkpoint object.
   */
  private rowToCheckpoint(row: CheckpointRow): Checkpoint {
    return {
      id: row.id,
      project_id: row.project_id,
      phase: row.phase as Phase,
      timestamp: row.timestamp,
      created_at: row.timestamp, // Alias for API consistency
      description: row.description,
      recoverable: row.recoverable === 1,
      state_json: row.state_json,
    };
  }

  // ============================================================
  // Enhanced Rollback Operations (Phase 2)
  // ============================================================

  /**
   * 预览回滚效果（不实际执行）
   * 计算当前状态和目标检查点之间的差异
   *
   * @param projectId - 项目 ID
   * @param checkpointId - 目标检查点 ID
   * @returns 回滚预览信息，包含差异和风险评估
   * @throws Error 如果项目或检查点不存在
   */
  previewRollback(projectId: string, checkpointId: string): RollbackPreview {
    // 加载当前状态
    const currentState = this.loadProjectState(projectId);
    if (!currentState) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // 加载检查点
    const checkpointRow = this.stmts.selectCheckpoint.get(checkpointId) as
      | CheckpointRow
      | undefined;

    if (!checkpointRow) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    const checkpoint = this.rowToCheckpoint(checkpointRow);
    const oldState = JSON.parse(checkpoint.state_json) as ProjectState;

    // 验证检查点属于该项目
    if (oldState.project_id !== projectId) {
      throw new Error(
        `Checkpoint ${checkpointId} belongs to project ${oldState.project_id}, not ${projectId}`,
      );
    }

    // 计算差异
    const currentArtifactIds = new Set(currentState.artifacts.map((a) => a.id));
    const oldArtifactIds = new Set(oldState.artifacts.map((a) => a.id));

    const willBeRemoved = currentState.artifacts.filter(
      (a) => !oldArtifactIds.has(a.id)
    );
    const willBeAdded = oldState.artifacts.filter(
      (a) => !currentArtifactIds.has(a.id)
    );

    const changes = {
      willBeRemoved,
      willBeAdded,
      phaseWillChange: {
        from: currentState.current_phase,
        to: oldState.current_phase,
      },
      decisionsWillBeLost: Math.max(0, currentState.decisions.length - oldState.decisions.length),
      tokenUsageDifference: oldState.total_token_usage - currentState.total_token_usage,
    };

    // 风险评估
    const risks: string[] = [];

    if (changes.decisionsWillBeLost > 0) {
      risks.push(`${changes.decisionsWillBeLost} 个决策将丢失`);
    }

    if (changes.tokenUsageDifference < 0) {
      risks.push(`Token 使用量将减少 ${Math.abs(changes.tokenUsageDifference)}`);
    }

    if (changes.phaseWillChange.from !== changes.phaseWillChange.to) {
      risks.push(
        `项目阶段将从 ${changes.phaseWillChange.from} 变为 ${changes.phaseWillChange.to}`,
      );
    }

    if (willBeRemoved.length > 0) {
      risks.push(`${willBeRemoved.length} 个 artifacts 将被移除`);
    }

    if (oldState.current_phase === 'completed' || oldState.current_phase === 'failed') {
      risks.push(`回滚到 ${oldState.current_phase} 状态可能导致项目无法继续`);
    }

    return {
      targetCheckpoint: checkpoint,
      currentState,
      changes,
      risks,
    };
  }

  /**
   * 交互式回滚（带预览和确认）
   * 支持细粒度回滚选项、备份创建、错误恢复
   *
   * @param projectId - 项目 ID
   * @param checkpointId - 目标检查点 ID
   * @param options - 回滚选项
   * @returns 回滚后的新状态
   */
  async rollbackWithPreview(
    projectId: string,
    checkpointId: string,
    options: RollbackOptions = {}
  ): Promise<ProjectState> {
    const scope = options.scope ?? 'full';

    // 如果不是强制回滚，先计算预览（实际使用中可以用于用户确认）
    let preview: RollbackPreview;
    if (!options.force) {
      preview = this.previewRollback(projectId, checkpointId);
      // TODO: 在实际使用中，这里应该等待用户确认
      // 暂时用日志记录表示
      console.log(`[回滚预览] 项目: ${projectId}`);
      console.log(`[回滚预览] 将丢失 ${preview.changes.decisionsWillBeLost} 个决策`);
      console.log(`[回滚预览] 风险: ${preview.risks.join(', ')}`);
    } else {
      preview = this.previewRollback(projectId, checkpointId);
    }

    // 如果需要，先创建备份
    let backupCheckpointId: string | undefined;
    if (options.createBackup) {
      const currentState = this.loadProjectState(projectId);
      if (currentState) {
        const backup = this.createCheckpoint(
          currentState,
          `自动备份: 回滚前 (${new Date().toISOString()})`,
        );
        backupCheckpointId = backup.id;
        console.log(`[回滚备份] 已创建备份: ${backup.id}`);
      }
    }

    try {
      // 执行回滚
      const newState = await this.performRollback(
        projectId,
        checkpointId,
        options,
        preview
      );

      return newState;
    } catch (error) {
      // 如果有备份且发生错误，尝试从备份恢复
      if (backupCheckpointId) {
        console.warn(`[回滚恢复] 回滚失败，从备份恢复: ${backupCheckpointId}`);
        try {
          return this.recoverFromFailedRollback(projectId, backupCheckpointId);
        } catch (recoveryError) {
          throw new Error(
            `回滚失败且备份恢复也失败: ${(error as Error).message}. 恢复错误: ${(recoveryError as Error).message}`,
          );
        }
      }
      throw error;
    }
  }

  /**
   * 执行实际的回滚操作
   */
  private async performRollback(
    projectId: string,
    checkpointId: string,
    options: RollbackOptions,
    preview: RollbackPreview
  ): Promise<ProjectState> {
    // 加载目标检查点状态
    const restoredState = this.restoreCheckpoint(checkpointId);
    const scope = options.scope ?? 'full';
    const preserve = options.preserve ?? {};

    // 获取当前状态（用于 preserve 操作）
    const currentState = this.loadProjectState(projectId);

    if (!currentState) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // 根据范围应用不同的回滚策略
    switch (scope) {
      case 'full': {
        // 完整回滚，但考虑 preserve 选项
        if (preserve.artifacts && preserve.artifacts.length > 0) {
          // 保留指定的 artifacts
          const preserveArtifacts = currentState.artifacts.filter((a) =>
            preserve.artifacts!.includes(a.id)
          );
          // 合并 artifacts（去重）
          const artifactIds = new Set(restoredState.artifacts.map((a) => a.id));
          for (const artifact of preserveArtifacts) {
            if (!artifactIds.has(artifact.id)) {
              restoredState.artifacts.push(artifact);
            }
          }
        }

        if (preserve.decisions && preserve.decisions.length > 0) {
          // 保留指定的 decisions
          const preserveDecisions = currentState.decisions.filter((_, i) =>
            preserve.decisions!.includes(i)
          );
          const decisionIds = new Set(restoredState.decisions.map((d) => d.id));
          for (const decision of preserveDecisions) {
            if (!decisionIds.has(decision.id)) {
              restoredState.decisions.push(decision);
            }
          }
        }

        if (preserve.tokenUsage) {
          // 保留当前的 token 使用量
          restoredState.total_token_usage = currentState.total_token_usage;
        }

        break;
      }

      case 'state': {
        // 只回滚状态（phase, decisions），保留 artifacts
        restoredState.artifacts = currentState.artifacts;

        if (!preserve.tokenUsage) {
          // 除非明确要求保留，否则使用检查点的 token 使用量
          restoredState.total_token_usage = restoredState.total_token_usage;
        } else {
          restoredState.total_token_usage = currentState.total_token_usage;
        }
        break;
      }

      case 'artifacts': {
        // 只回滚 artifacts，其他保持当前状态
        const oldArtifacts = restoredState.artifacts;
        restoredState.current_phase = currentState.current_phase;
        restoredState.decisions = currentState.decisions;
        restoredState.artifacts = oldArtifacts;
        restoredState.total_token_usage = currentState.total_token_usage;
        break;
      }

      case 'decisions': {
        // 只回滚 decisions
        const oldDecisions = restoredState.decisions;
        restoredState.current_phase = currentState.current_phase;
        restoredState.decisions = oldDecisions;
        restoredState.artifacts = currentState.artifacts;
        restoredState.total_token_usage = currentState.total_token_usage;
        break;
      }
    }

    // 更新时间戳
    restoredState.updated_at = Date.now();

    // 持久化回滚后的状态
    this.saveProjectState(restoredState);

    return restoredState;
  }

  /**
   * 从失败的回滚中恢复
   */
  private recoverFromFailedRollback(
    projectId: string,
    backupCheckpointId: string
  ): ProjectState {
    const backupState = this.restoreCheckpoint(backupCheckpointId);
    backupState.updated_at = Date.now();
    this.saveProjectState(backupState);
    return backupState;
  }

  /**
   * 加载检查点（内部方法）
   */
  private loadCheckpoint(checkpointId: string): Checkpoint | null {
    const row = this.stmts.selectCheckpoint.get(checkpointId) as
      | CheckpointRow
      | undefined;
    return row ? this.rowToCheckpoint(row) : null;
  }
}
