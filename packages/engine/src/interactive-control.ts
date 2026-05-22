/**
 * Honeycomb v2 - Interactive Control
 *
 * Provides real-time interactive control over running projects.
 * Wraps the orchestrator to add pause/resume with reason tracking,
 * priority management, manual checkpoints, status polling, and
 * command queueing for batched operations.
 *
 * Designed to be imported by the CLI or used programmatically.
 * Zero external dependencies.
 */

import { randomUUID } from 'node:crypto';
import { type ProjectState } from './types.js';

// ============================================================
// Type Definitions
// ============================================================

/** A single control command with lifecycle tracking */
export interface ControlCommand {
  id: string;
  type: 'pause' | 'resume' | 'checkpoint' | 'rollback' | 'set-priority' | 'status';
  payload?: Record<string, unknown>;
  timestamp: number;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

/** Priority levels for phase execution weighting */
export type PriorityLevel = 'low' | 'normal' | 'high' | 'urgent';

/** Snapshot of the interactive controller state for polling */
export interface InteractiveStatus {
  project_id: string | null;
  project_name: string | null;
  current_phase: string | null;
  is_paused: boolean;
  pause_reason: string | null;
  priority: PriorityLevel;
  uptime_ms: number;
  command_history_count: number;
  pending_commands: number;
  last_checkpoint_at: number | null;
  stats: Record<string, unknown>;
}

/**
 * Minimal orchestrator interface to avoid circular imports.
 * Any object implementing these methods can be controlled interactively.
 */
export interface OrchestratorInterface {
  pauseProject(reason: string): void;
  resumeProject(): void;
  checkpoint(description?: string): void;
  rollback(checkpointId: string): void;
  getProjectState(): ProjectState | null;
  getStats(): Record<string, unknown>;
}

// ============================================================
// InteractiveController
// ============================================================

export class InteractiveController {
  private readonly orchestrator: OrchestratorInterface;
  private readonly createdAt: number;

  private paused: boolean = false;
  private pauseReason: string | null = null;
  private priority: PriorityLevel = 'normal';
  private lastCheckpointAt: number | null = null;

  private commandHistory: ControlCommand[] = [];
  private commandQueue: ControlCommand[] = [];

  constructor(orchestrator: OrchestratorInterface) {
    this.orchestrator = orchestrator;
    this.createdAt = Date.now();
  }

  // ============================================================
  // Pause / Resume
  // ============================================================

  /**
   * Pause the running project with a reason.
   * Delegates to the orchestrator and tracks internal pause state.
   * Returns the resulting ControlCommand (completed or failed).
   */
  pause(reason: string): ControlCommand {
    const cmd = this.buildCommand('pause', { reason });

    if (this.paused) {
      return this.failCommand(cmd, 'Project is already paused');
    }

    try {
      this.orchestrator.pauseProject(reason);
      this.paused = true;
      this.pauseReason = reason;
      return this.completeCommand(cmd);
    } catch (err) {
      return this.failCommand(cmd, errorMessage(err));
    }
  }

  /**
   * Resume the paused project.
   * Delegates to the orchestrator and clears internal pause state.
   * Returns the resulting ControlCommand (completed or failed).
   */
  resume(): ControlCommand {
    const cmd = this.buildCommand('resume');

    if (!this.paused) {
      return this.failCommand(cmd, 'Project is not paused');
    }

    try {
      this.orchestrator.resumeProject();
      this.paused = false;
      this.pauseReason = null;
      return this.completeCommand(cmd);
    } catch (err) {
      return this.failCommand(cmd, errorMessage(err));
    }
  }

  /**
   * Check whether the project is currently paused.
   */
  isPaused(): boolean {
    return this.paused;
  }

  // ============================================================
  // Priority Management
  // ============================================================

  /**
   * Set the execution priority level for phase scheduling.
   */
  setPriority(level: PriorityLevel): void {
    this.priority = level;
  }

  /**
   * Get the current priority level.
   */
  getPriority(): PriorityLevel {
    return this.priority;
  }

  // ============================================================
  // Checkpoint & Rollback
  // ============================================================

  /**
   * Create a manual checkpoint of the current project state.
   * Delegates to the orchestrator and records the timestamp.
   */
  createCheckpoint(description?: string): ControlCommand {
    const cmd = this.buildCommand('checkpoint', { description });

    try {
      this.orchestrator.checkpoint(description);
      this.lastCheckpointAt = Date.now();
      return this.completeCommand(cmd);
    } catch (err) {
      return this.failCommand(cmd, errorMessage(err));
    }
  }

  /**
   * Rollback to a previous checkpoint by ID.
   * Delegates to the orchestrator.
   */
  rollbackTo(checkpointId: string): ControlCommand {
    const cmd = this.buildCommand('rollback', { checkpointId });

    try {
      this.orchestrator.rollback(checkpointId);
      return this.completeCommand(cmd);
    } catch (err) {
      return this.failCommand(cmd, errorMessage(err));
    }
  }

  // ============================================================
  // Status Polling
  // ============================================================

  /**
   * Get a comprehensive status snapshot of the controller and project.
   * Combines orchestrator project state with controller-level metadata.
   */
  getStatus(): InteractiveStatus {
    const projectState = this.orchestrator.getProjectState();
    const stats = this.orchestrator.getStats();

    return {
      project_id: projectState?.project_id ?? null,
      project_name: projectState?.project_name ?? null,
      current_phase: projectState?.current_phase ?? null,
      is_paused: this.paused,
      pause_reason: this.pauseReason,
      priority: this.priority,
      uptime_ms: this.getUptime(),
      command_history_count: this.commandHistory.length,
      pending_commands: this.commandQueue.length,
      last_checkpoint_at: this.lastCheckpointAt,
      stats,
    };
  }

  /**
   * Get the controller uptime in milliseconds since construction.
   */
  getUptime(): number {
    return Date.now() - this.createdAt;
  }

  // ============================================================
  // Command History
  // ============================================================

  /**
   * Retrieve the command history, optionally limited to the N most recent.
   * When a limit is provided, returns the most recent N commands in
   * reverse chronological order (newest first).
   */
  getCommandHistory(limit?: number): ControlCommand[] {
    if (limit === undefined) {
      return [...this.commandHistory];
    }

    // Return newest first, limited to `limit` entries
    const reversed = [...this.commandHistory].reverse();
    return reversed.slice(0, limit);
  }

  // ============================================================
  // Command Queue (Batched Operations)
  // ============================================================

  /**
   * Add a command to the pending queue without executing it.
   * Returns the queued command in 'pending' status.
   */
  queueCommand(
    type: ControlCommand['type'],
    payload?: Record<string, unknown>,
  ): ControlCommand {
    const cmd: ControlCommand = {
      id: randomUUID(),
      type,
      payload,
      timestamp: Date.now(),
      status: 'pending',
    };
    this.commandQueue.push(cmd);
    return cmd;
  }

  /**
   * Execute all pending commands in FIFO order.
   * Each command is dispatched to the appropriate handler.
   * Returns the array of executed commands with final statuses.
   */
  async executeQueue(): Promise<ControlCommand[]> {
    const pending = [...this.commandQueue];
    this.commandQueue = [];

    const results: ControlCommand[] = [];

    for (const cmd of pending) {
      cmd.status = 'executing';
      const result = this.dispatchCommand(cmd);
      results.push(result);
    }

    return results;
  }

  // ============================================================
  // Private: Command Lifecycle
  // ============================================================

  /**
   * Build a new ControlCommand and immediately record it in history.
   */
  private buildCommand(
    type: ControlCommand['type'],
    payload?: Record<string, unknown>,
  ): ControlCommand {
    const cmd: ControlCommand = {
      id: randomUUID(),
      type,
      payload,
      timestamp: Date.now(),
      status: 'executing',
    };
    this.commandHistory.push(cmd);
    return cmd;
  }

  /**
   * Mark a command as completed.
   */
  private completeCommand(cmd: ControlCommand, result?: unknown): ControlCommand {
    cmd.status = 'completed';
    cmd.result = result;
    return cmd;
  }

  /**
   * Mark a command as failed with an error message.
   */
  private failCommand(cmd: ControlCommand, error: string): ControlCommand {
    cmd.status = 'failed';
    cmd.error = error;
    return cmd;
  }

  /**
   * Dispatch a queued command to the appropriate handler.
   * Returns the updated command with final status.
   */
  private dispatchCommand(cmd: ControlCommand): ControlCommand {
    // Record in history before execution
    this.commandHistory.push(cmd);

    const payload = cmd.payload ?? {};

    try {
      switch (cmd.type) {
        case 'pause': {
          const reason = (payload.reason as string) ?? 'Queued pause';
          if (this.paused) {
            return this.failCommand(cmd, 'Project is already paused');
          }
          this.orchestrator.pauseProject(reason);
          this.paused = true;
          this.pauseReason = reason;
          return this.completeCommand(cmd);
        }

        case 'resume': {
          if (!this.paused) {
            return this.failCommand(cmd, 'Project is not paused');
          }
          this.orchestrator.resumeProject();
          this.paused = false;
          this.pauseReason = null;
          return this.completeCommand(cmd);
        }

        case 'checkpoint': {
          const description = payload.description as string | undefined;
          this.orchestrator.checkpoint(description);
          this.lastCheckpointAt = Date.now();
          return this.completeCommand(cmd);
        }

        case 'rollback': {
          const checkpointId = payload.checkpointId as string;
          this.orchestrator.rollback(checkpointId);
          return this.completeCommand(cmd);
        }

        case 'set-priority': {
          const level = payload.level as PriorityLevel;
          this.priority = level;
          return this.completeCommand(cmd, { priority: level });
        }

        case 'status': {
          const status = this.getStatus();
          return this.completeCommand(cmd, status);
        }

        default: {
          return this.failCommand(cmd, `Unknown command type: ${cmd.type}`);
        }
      }
    } catch (err) {
      return this.failCommand(cmd, errorMessage(err));
    }
  }
}

// ============================================================
// Utility
// ============================================================

/**
 * Extract an error message string from an unknown caught value.
 */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create a new InteractiveController wrapping the given orchestrator.
 */
export function createInteractiveController(
  orchestrator: OrchestratorInterface,
): InteractiveController {
  return new InteractiveController(orchestrator);
}
