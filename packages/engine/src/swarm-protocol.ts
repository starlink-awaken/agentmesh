/**
 * Honeycomb v2 - Swarm Protocol
 *
 * Enables enterprise-scale parallel project execution through
 * master-worker honeycomb architecture. The master honeycomb
 * coordinates sub-honeycombs, manages shared state, and ensures
 * cross-module consistency.
 *
 * Architecture: Master Honeycomb -> Sub-Honeycomb[] -> Worker Agents
 *
 * Supports optional SQLite persistence for crash recovery and
 * state restoration across process restarts.
 */

import { randomUUID } from 'node:crypto';
import { Phase } from './types.js';
import { Database } from 'bun:sqlite';

// ============================================================
// Type Definitions
// ============================================================

/** Role of a honeycomb within the swarm */
export type SwarmRole = 'master' | 'worker';

/** Lifecycle status of a sub-honeycomb */
export type SubHoneycombStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused';

/** A sub-honeycomb representing an independent workstream within the swarm */
export interface SubHoneycomb {
  id: string;
  name: string;
  description: string;
  status: SubHoneycombStatus;
  dependencies: string[];   // IDs of sub-honeycombs this depends on
  progress: number;          // 0-100
  assigned_phase?: Phase;
  started_at?: number;
  completed_at?: number;
  error?: string;
  metadata: Record<string, unknown>;
}

/** Complete swarm state snapshot */
export interface SwarmState {
  swarm_id: string;
  master_project_id: string;
  role: SwarmRole;
  sub_honeycombs: Map<string, SubHoneycomb>;
  shared_state: Record<string, unknown>;
  heartbeat_interval_ms: number;
  last_sync: number;
  created_at: number;
}

/** Configuration options for the swarm protocol */
export interface SwarmConfig {
  heartbeat_interval_ms: number;   // Default 10000 (10s)
  sync_timeout_ms: number;         // Default 30000 (30s)
  max_sub_honeycombs: number;      // Default 20
  auto_rebalance: boolean;         // Default true
  /** Enable SQLite persistence (optional) */
  persistence_enabled?: boolean;
  /** Database path for swarm state persistence */
  db_path?: string;
  /** Auto-persist interval (ms). Default: 60000 (1 minute) */
  auto_persist_interval_ms?: number;
}

// ============================================================
// SQLite Row Types
// ============================================================

/** Raw row from swarm_states table */
interface SwarmStateRow {
  swarm_id: string;
  master_project_id: string;
  role: string;
  sub_honeycombs_json: string;
  shared_state_json: string;
  heartbeat_interval_ms: number;
  last_sync: number;
  created_at: number;
  updated_at: number;
}

/** Raw row from sub_honeycombs table */
interface SubHoneycombRow {
  id: string;
  swarm_id: string;
  name: string;
  description: string;
  status: string;
  dependencies_json: string;
  progress: number;
  assigned_phase: string | null;
  started_at: number | null;
  completed_at: number | null;
  error: string | null;
  metadata_json: string;
  created_at: number;
  updated_at: number;
}

/** Raw row from swarm_messages table */
interface SwarmMessageRow {
  message_id: string;
  swarm_id: string;
  from_sub: string;
  to_sub: string | null;
  type: string;
  payload_json: string;
  created_at: number;
  processed: number;
}

/** Raw row from swarm_votes table */
interface SwarmVoteRow {
  vote_id: string;
  swarm_id: string;
  proposal_id: string;
  voter_id: string;
  choice: string;
  created_at: number;
}

/** Dependency graph representation for topological analysis */
export interface DependencyGraph {
  nodes: string[];                                // Sub-honeycomb IDs
  edges: Array<{ from: string; to: string }>;     // from depends on to
}

/** Heartbeat status report */
export interface HeartbeatReport {
  swarm_id: string;
  active_count: number;
  completed_count: number;
  failed_count: number;
  progress_pct: number;
}

/** Progress summary across all sub-honeycombs */
export interface ProgressReport {
  total: number;
  completed: number;
  running: number;
  pending: number;
  failed: number;
  overall_pct: number;
}

// ============================================================
// Default Configuration
// ============================================================

const DEFAULT_CONFIG: SwarmConfig = {
  heartbeat_interval_ms: 10_000,
  sync_timeout_ms: 30_000,
  max_sub_honeycombs: 20,
  auto_rebalance: true,
  persistence_enabled: false,
  db_path: './honeycomb.db',
  auto_persist_interval_ms: 60_000,
};

// ============================================================
// SwarmProtocol
// ============================================================

export class SwarmProtocol {
  private readonly config: SwarmConfig;
  private state: SwarmState | null = null;
  private db?: Database;
  private autoPersistTimer?: ReturnType<typeof setInterval>;
  private isShuttingDown = false;

  // Prepared statements cache (when persistence is enabled)
  private stmts?: {
    upsertState: ReturnType<Database['prepare']>;
    selectState: ReturnType<Database['prepare']>;
    upsertSubHoneycomb: ReturnType<Database['prepare']>;
    selectSubHoneycombs: ReturnType<Database['prepare']>;
    deleteSubHoneycomb: ReturnType<Database['prepare']>;
    insertMessage: ReturnType<Database['prepare']>;
    selectMessages: ReturnType<Database['prepare']>;
    insertVote: ReturnType<Database['prepare']>;
    selectVotes: ReturnType<Database['prepare']>;
  };

  constructor(config?: Partial<SwarmConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize persistence if enabled
    if (this.config.persistence_enabled && this.config.db_path) {
      this.initPersistence();
    }
  }

  // ----------------------------------------------------------
  // Swarm Lifecycle
  // ----------------------------------------------------------

  /**
   * Initialize a new swarm with this instance as the master.
   * Creates a fresh swarm state bound to the given master project ID.
   *
   * @param masterProjectId - The project ID that will serve as the swarm master.
   * @returns The newly created SwarmState.
   * @throws Error if a swarm is already initialized.
   */
  initSwarm(masterProjectId: string): SwarmState {
    if (this.state) {
      throw new Error(
        `Swarm already initialized (swarm_id=${this.state.swarm_id}). ` +
          'Call reset() before re-initializing.',
      );
    }

    const now = Date.now();

    this.state = {
      swarm_id: randomUUID(),
      master_project_id: masterProjectId,
      role: 'master',
      sub_honeycombs: new Map(),
      shared_state: {},
      heartbeat_interval_ms: this.config.heartbeat_interval_ms,
      last_sync: now,
      created_at: now,
    };

    return this.state;
  }

  // ----------------------------------------------------------
  // Sub-Honeycomb Management
  // ----------------------------------------------------------

  /**
   * Add a new sub-honeycomb to the swarm.
   *
   * @param name - Human-readable name for the sub-honeycomb.
   * @param description - Description of the workstream this sub-honeycomb handles.
   * @param dependencies - IDs of sub-honeycombs that must complete before this one starts.
   * @returns The newly created SubHoneycomb.
   * @throws Error if swarm is not initialized, capacity is exceeded, or dependencies are invalid.
   */
  addSubHoneycomb(
    name: string,
    description: string,
    dependencies: string[] = [],
  ): SubHoneycomb {
    const state = this.requireState();

    // Enforce capacity limit
    if (state.sub_honeycombs.size >= this.config.max_sub_honeycombs) {
      throw new Error(
        `Cannot add sub-honeycomb: capacity limit reached ` +
          `(${this.config.max_sub_honeycombs} max).`,
      );
    }

    // Validate that all declared dependencies exist
    for (const depId of dependencies) {
      if (!state.sub_honeycombs.has(depId)) {
        throw new Error(
          `Invalid dependency: sub-honeycomb "${depId}" does not exist.`,
        );
      }
    }

    const sub: SubHoneycomb = {
      id: randomUUID(),
      name,
      description,
      status: 'pending',
      dependencies: [...dependencies],
      progress: 0,
      metadata: {},
    };

    state.sub_honeycombs.set(sub.id, sub);

    // Validate that adding this sub-honeycomb does not create a cycle
    if (this.hasCycle()) {
      state.sub_honeycombs.delete(sub.id);
      throw new Error(
        `Cannot add sub-honeycomb "${name}": would create a circular dependency.`,
      );
    }

    return sub;
  }

  /**
   * Remove a sub-honeycomb from the swarm.
   * Also removes it from dependency lists of other sub-honeycombs.
   *
   * @param subId - The ID of the sub-honeycomb to remove.
   * @throws Error if swarm is not initialized or sub-honeycomb is not found.
   */
  removeSubHoneycomb(subId: string): void {
    const state = this.requireState();

    if (!state.sub_honeycombs.has(subId)) {
      throw new Error(`Sub-honeycomb not found: ${subId}`);
    }

    state.sub_honeycombs.delete(subId);

    // Clean up dangling dependency references in remaining sub-honeycombs
    for (const sub of Array.from(state.sub_honeycombs.values())) {
      const idx = sub.dependencies.indexOf(subId);
      if (idx !== -1) {
        sub.dependencies.splice(idx, 1);
      }
    }
  }

  /**
   * Update the status and optionally the progress/error of a sub-honeycomb.
   *
   * @param subId - The ID of the sub-honeycomb to update.
   * @param status - The new status.
   * @param progress - Optional progress value (0-100).
   * @param error - Optional error message (typically set when status is 'failed').
   * @throws Error if swarm is not initialized or sub-honeycomb is not found.
   */
  updateSubStatus(
    subId: string,
    status: SubHoneycombStatus,
    progress?: number,
    error?: string,
  ): void {
    const state = this.requireState();

    const sub = state.sub_honeycombs.get(subId);
    if (!sub) {
      throw new Error(`Sub-honeycomb not found: ${subId}`);
    }

    sub.status = status;

    if (progress !== undefined) {
      sub.progress = Math.max(0, Math.min(100, progress));
    }

    if (error !== undefined) {
      sub.error = error;
    }

    // Record lifecycle timestamps
    const now = Date.now();
    if (status === 'running' && !sub.started_at) {
      sub.started_at = now;
    }
    if (status === 'completed' || status === 'failed') {
      sub.completed_at = now;
      if (status === 'completed') {
        sub.progress = 100;
      }
    }
  }

  /**
   * Retrieve a sub-honeycomb by its ID.
   *
   * @param subId - The ID to look up.
   * @returns The SubHoneycomb if found, undefined otherwise.
   */
  getSubHoneycomb(subId: string): SubHoneycomb | undefined {
    if (!this.state) return undefined;
    return this.state.sub_honeycombs.get(subId);
  }

  /**
   * List sub-honeycombs, optionally filtered by status.
   *
   * @param status - If provided, only return sub-honeycombs with this status.
   * @returns Array of matching SubHoneycomb objects.
   */
  listSubHoneycombs(status?: SubHoneycombStatus): SubHoneycomb[] {
    if (!this.state) return [];

    const all = Array.from(this.state.sub_honeycombs.values());

    if (status !== undefined) {
      return all.filter((sub) => sub.status === status);
    }

    return all;
  }

  // ----------------------------------------------------------
  // Dependency Analysis
  // ----------------------------------------------------------

  /**
   * Build and return the dependency graph for all sub-honeycombs.
   * Nodes are sub-honeycomb IDs; edges represent "from depends on to".
   *
   * @returns The DependencyGraph representation.
   */
  getDependencyGraph(): DependencyGraph {
    if (!this.state) {
      return { nodes: [], edges: [] };
    }

    const nodes: string[] = [];
    const edges: Array<{ from: string; to: string }> = [];

    for (const sub of Array.from(this.state.sub_honeycombs.values())) {
      nodes.push(sub.id);
      for (const depId of sub.dependencies) {
        edges.push({ from: sub.id, to: depId });
      }
    }

    return { nodes, edges };
  }

  /**
   * Compute the execution order using topological sort on the dependency graph.
   * Returns batches of sub-honeycomb IDs that can run in parallel.
   * Each inner array is a batch of independent sub-honeycombs whose
   * dependencies are all satisfied by previous batches.
   *
   * @returns Array of batches, where each batch contains IDs that can execute concurrently.
   * @throws Error if the dependency graph contains a cycle.
   */
  getExecutionOrder(): string[][] {
    if (!this.state) return [];

    const subs = this.state.sub_honeycombs;
    if (subs.size === 0) return [];

    // Build adjacency and in-degree structures
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>(); // to -> [from] (who depends on to)

    for (const sub of Array.from(subs.values())) {
      if (!inDegree.has(sub.id)) {
        inDegree.set(sub.id, 0);
      }
      if (!dependents.has(sub.id)) {
        dependents.set(sub.id, []);
      }

      for (const depId of sub.dependencies) {
        inDegree.set(sub.id, (inDegree.get(sub.id) ?? 0) + 1);
        if (!dependents.has(depId)) {
          dependents.set(depId, []);
        }
        dependents.get(depId)!.push(sub.id);
      }
    }

    // Kahn's algorithm with batch collection
    const batches: string[][] = [];
    let currentBatch = Array.from(inDegree.entries())
      .filter(([, deg]) => deg === 0)
      .map(([id]) => id);

    let processedCount = 0;

    while (currentBatch.length > 0) {
      batches.push([...currentBatch]);
      processedCount += currentBatch.length;

      const nextBatch: string[] = [];

      for (const nodeId of currentBatch) {
        for (const dependent of dependents.get(nodeId) ?? []) {
          const newDegree = (inDegree.get(dependent) ?? 1) - 1;
          inDegree.set(dependent, newDegree);
          if (newDegree === 0) {
            nextBatch.push(dependent);
          }
        }
      }

      currentBatch = nextBatch;
    }

    // Detect cycle: if we didn't process all nodes, there's a cycle
    if (processedCount < subs.size) {
      throw new Error(
        'Dependency graph contains a cycle — cannot determine execution order.',
      );
    }

    return batches;
  }

  /**
   * Return sub-honeycombs whose dependencies are all completed and
   * that are still in 'pending' status (i.e., ready to start running).
   *
   * @returns Array of SubHoneycomb objects ready for execution.
   */
  getReadyToRun(): SubHoneycomb[] {
    if (!this.state) return [];

    const result: SubHoneycomb[] = [];
    const subs = this.state.sub_honeycombs;

    for (const sub of Array.from(subs.values())) {
      if (sub.status !== 'pending') continue;

      const allDepsCompleted = sub.dependencies.every((depId) => {
        const dep = subs.get(depId);
        return dep !== undefined && dep.status === 'completed';
      });

      if (allDepsCompleted) {
        result.push(sub);
      }
    }

    return result;
  }

  // ----------------------------------------------------------
  // Shared State
  // ----------------------------------------------------------

  /**
   * Set a value in the swarm's shared state.
   *
   * @param key - The state key.
   * @param value - The value to store.
   * @throws Error if swarm is not initialized.
   */
  setSharedState(key: string, value: unknown): void {
    const state = this.requireState();
    state.shared_state[key] = value;
  }

  /**
   * Get a value from the swarm's shared state.
   *
   * @param key - The state key to retrieve.
   * @returns The stored value, or undefined if the key does not exist.
   */
  getSharedState(key: string): unknown {
    if (!this.state) return undefined;
    return this.state.shared_state[key];
  }

  /**
   * Merge multiple key-value pairs into the swarm's shared state.
   * Existing keys are overwritten; new keys are added.
   *
   * @param updates - Object containing the key-value pairs to merge.
   * @throws Error if swarm is not initialized.
   */
  mergeSharedState(updates: Record<string, unknown>): void {
    const state = this.requireState();
    Object.assign(state.shared_state, updates);
  }

  // ----------------------------------------------------------
  // Heartbeat & Sync
  // ----------------------------------------------------------

  /**
   * Produce a heartbeat report summarizing the current swarm health.
   * Updates the last_sync timestamp.
   *
   * @returns A HeartbeatReport with aggregate counts and overall progress.
   * @throws Error if swarm is not initialized.
   */
  heartbeat(): HeartbeatReport {
    const state = this.requireState();

    state.last_sync = Date.now();

    let activeCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    let totalProgress = 0;

    for (const sub of Array.from(state.sub_honeycombs.values())) {
      totalProgress += sub.progress;

      switch (sub.status) {
        case 'running':
          activeCount++;
          break;
        case 'completed':
          completedCount++;
          break;
        case 'failed':
          failedCount++;
          break;
      }
    }

    const total = state.sub_honeycombs.size;
    const progressPct = total > 0 ? Math.round(totalProgress / total) : 0;

    return {
      swarm_id: state.swarm_id,
      active_count: activeCount,
      completed_count: completedCount,
      failed_count: failedCount,
      progress_pct: progressPct,
    };
  }

  /**
   * Return a snapshot of the current swarm state.
   * The returned state contains a shallow copy of the sub-honeycombs map
   * to prevent external mutation.
   *
   * @returns A SwarmState snapshot.
   * @throws Error if swarm is not initialized.
   */
  syncState(): SwarmState {
    const state = this.requireState();

    state.last_sync = Date.now();

    return {
      ...state,
      sub_honeycombs: new Map(state.sub_honeycombs),
      shared_state: { ...state.shared_state },
    };
  }

  // ----------------------------------------------------------
  // Progress & Completion
  // ----------------------------------------------------------

  /**
   * Compute a detailed progress report across all sub-honeycombs.
   *
   * @returns A ProgressReport with counts per status and overall percentage.
   */
  getProgress(): ProgressReport {
    if (!this.state) {
      return {
        total: 0,
        completed: 0,
        running: 0,
        pending: 0,
        failed: 0,
        overall_pct: 0,
      };
    }

    let completed = 0;
    let running = 0;
    let pending = 0;
    let failed = 0;
    let totalProgress = 0;

    for (const sub of Array.from(this.state.sub_honeycombs.values())) {
      totalProgress += sub.progress;

      switch (sub.status) {
        case 'completed':
          completed++;
          break;
        case 'running':
          running++;
          break;
        case 'pending':
          pending++;
          break;
        case 'failed':
          failed++;
          break;
        // 'paused' is not counted in any specific bucket but
        // contributes to total and progress
      }
    }

    const total = this.state.sub_honeycombs.size;
    const overallPct = total > 0 ? Math.round(totalProgress / total) : 0;

    return {
      total,
      completed,
      running,
      pending,
      failed,
      overall_pct: overallPct,
    };
  }

  /**
   * Check whether the swarm can be marked as complete.
   * Returns true if every sub-honeycomb that is not failed has completed.
   * An empty swarm (no sub-honeycombs) is not considered completable.
   *
   * @returns true if all non-failed sub-honeycombs are completed.
   */
  canComplete(): boolean {
    if (!this.state || this.state.sub_honeycombs.size === 0) {
      return false;
    }

    for (const sub of Array.from(this.state.sub_honeycombs.values())) {
      if (sub.status !== 'completed' && sub.status !== 'failed') {
        return false;
      }
    }

    return true;
  }

  // ----------------------------------------------------------
  // State Access & Reset
  // ----------------------------------------------------------

  /**
   * Return the raw swarm state, or null if the swarm has not been initialized.
   *
   * @returns The current SwarmState or null.
   */
  getSwarmState(): SwarmState | null {
    return this.state;
  }

  /**
   * Reset the swarm protocol, clearing all state.
   * After calling reset(), initSwarm() must be called again to use the protocol.
   */
  reset(): void {
    this.state = null;
  }

  // ----------------------------------------------------------
  // Persistence (Phase 4)
  // ----------------------------------------------------------

  /**
   * Initialize SQLite persistence layer.
   * Creates tables and prepares statements if persistence is enabled.
   *
   * @private
   */
  private initPersistence(): void {
    if (!this.config.db_path) {
      throw new Error('db_path is required when persistence_enabled is true');
    }

    this.db = new Database(this.config.db_path);

    // Enable WAL mode for better concurrent read performance
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');

    this.initTables();
    this.prepareStatements();
  }

  /**
   * Initialize database tables for swarm persistence.
   *
   * @private
   */
  private initTables(): void {
    if (!this.db) return;

    this.db.exec(`
      -- Swarm states table (main state snapshot)
      CREATE TABLE IF NOT EXISTS swarm_states (
        swarm_id TEXT PRIMARY KEY,
        master_project_id TEXT NOT NULL,
        role TEXT NOT NULL,
        sub_honeycombs_json TEXT NOT NULL,
        shared_state_json TEXT NOT NULL DEFAULT '{}',
        heartbeat_interval_ms INTEGER NOT NULL,
        last_sync INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Sub-honeycombs table (individual workstream state)
      CREATE TABLE IF NOT EXISTS sub_honeycombs (
        id TEXT PRIMARY KEY,
        swarm_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        dependencies_json TEXT NOT NULL DEFAULT '[]',
        progress INTEGER NOT NULL DEFAULT 0,
        assigned_phase TEXT,
        started_at INTEGER,
        completed_at INTEGER,
        error TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (swarm_id) REFERENCES swarm_states(swarm_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sub_honeycombs_swarm ON sub_honeycombs(swarm_id);
      CREATE INDEX IF NOT EXISTS idx_sub_honeycombs_status ON sub_honeycombs(status);

      -- Swarm messages table (inter-honeycomb communication)
      CREATE TABLE IF NOT EXISTS swarm_messages (
        message_id TEXT PRIMARY KEY,
        swarm_id TEXT NOT NULL,
        from_sub TEXT NOT NULL,
        to_sub TEXT,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        processed INTEGER DEFAULT 0,
        FOREIGN KEY (swarm_id) REFERENCES swarm_states(swarm_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_swarm_messages_swarm ON swarm_messages(swarm_id);
      CREATE INDEX IF NOT EXISTS idx_swarm_messages_processed ON swarm_messages(processed);

      -- Swarm votes table (consensus decisions)
      CREATE TABLE IF NOT EXISTS swarm_votes (
        vote_id TEXT PRIMARY KEY,
        swarm_id TEXT NOT NULL,
        proposal_id TEXT NOT NULL,
        voter_id TEXT NOT NULL,
        choice TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (swarm_id) REFERENCES swarm_states(swarm_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_swarm_votes_swarm ON swarm_votes(swarm_id);
      CREATE INDEX IF NOT EXISTS idx_swarm_votes_proposal ON swarm_votes(proposal_id);
    `);
  }

  /**
   * Prepare SQLite statements for performance.
   *
   * @private
   */
  private prepareStatements(): void {
    if (!this.db) return;

    this.stmts = {
      upsertState: this.db.prepare(`
        INSERT INTO swarm_states (
          swarm_id, master_project_id, role, sub_honeycombs_json,
          shared_state_json, heartbeat_interval_ms, last_sync,
          created_at, updated_at
        ) VALUES (
          $swarm_id, $master_project_id, $role, $sub_honeycombs_json,
          $shared_state_json, $heartbeat_interval_ms, $last_sync,
          $created_at, $updated_at
        ) ON CONFLICT(swarm_id) DO UPDATE SET
          master_project_id = $master_project_id,
          role = $role,
          sub_honeycombs_json = $sub_honeycombs_json,
          shared_state_json = $shared_state_json,
          heartbeat_interval_ms = $heartbeat_interval_ms,
          last_sync = $last_sync,
          updated_at = $updated_at
      `),

      selectState: this.db.prepare(`
        SELECT swarm_id, master_project_id, role, sub_honeycombs_json,
               shared_state_json, heartbeat_interval_ms, last_sync,
               created_at, updated_at
        FROM swarm_states WHERE swarm_id = ?
      `),

      upsertSubHoneycomb: this.db.prepare(`
        INSERT INTO sub_honeycombs (
          id, swarm_id, name, description, status, dependencies_json,
          progress, assigned_phase, started_at, completed_at, error,
          metadata_json, created_at, updated_at
        ) VALUES (
          $id, $swarm_id, $name, $description, $status, $dependencies_json,
          $progress, $assigned_phase, $started_at, $completed_at, $error,
          $metadata_json, $created_at, $updated_at
        ) ON CONFLICT(id) DO UPDATE SET
          name = $name,
          description = $description,
          status = $status,
          dependencies_json = $dependencies_json,
          progress = $progress,
          assigned_phase = $assigned_phase,
          started_at = $started_at,
          completed_at = $completed_at,
          error = $error,
          metadata_json = $metadata_json,
          updated_at = $updated_at
      `),

      selectSubHoneycombs: this.db.prepare(`
        SELECT id, swarm_id, name, description, status, dependencies_json,
               progress, assigned_phase, started_at, completed_at, error,
               metadata_json, created_at, updated_at
        FROM sub_honeycombs WHERE swarm_id = ?
      `),

      deleteSubHoneycomb: this.db.prepare(`
        DELETE FROM sub_honeycombs WHERE id = ?
      `),

      insertMessage: this.db.prepare(`
        INSERT INTO swarm_messages (
          message_id, swarm_id, from_sub, to_sub, type, payload_json,
          created_at, processed
        ) VALUES ($message_id, $swarm_id, $from_sub, $to_sub, $type,
                  $payload_json, $created_at, $processed)
      `),

      selectMessages: this.db.prepare(`
        SELECT message_id, swarm_id, from_sub, to_sub, type, payload_json,
               created_at, processed
        FROM swarm_messages WHERE swarm_id = ? AND processed = 0
        ORDER BY created_at ASC
      `),

      insertVote: this.db.prepare(`
        INSERT INTO swarm_votes (
          vote_id, swarm_id, proposal_id, voter_id, choice, created_at
        ) VALUES ($vote_id, $swarm_id, $proposal_id, $voter_id, $choice, $created_at)
      `),

      selectVotes: this.db.prepare(`
        SELECT vote_id, swarm_id, proposal_id, voter_id, choice, created_at
        FROM swarm_votes WHERE swarm_id = ? AND proposal_id = ?
      `),
    };
  }

  /**
   * Persist the current swarm state to SQLite.
   * Writes both the main state and all sub-honeycombs.
   *
   * @returns Promise that resolves when persistence is complete.
   * @throws Error if persistence is not enabled or database operations fail.
   */
  async persistState(): Promise<void> {
    if (!this.config.persistence_enabled || !this.db || !this.stmts) {
      return; // Silently skip if persistence not enabled
    }

    if (!this.state) {
      return; // Nothing to persist
    }

    try {
      const now = Date.now();

      // Serialize sub-honeycombs Map to array for JSON storage
      const subHoneycombsArray = Array.from(this.state.sub_honeycombs.values());

      // Upsert main swarm state
      this.stmts.upsertState.run({
        $swarm_id: this.state.swarm_id,
        $master_project_id: this.state.master_project_id,
        $role: this.state.role,
        $sub_honeycombs_json: JSON.stringify(subHoneycombsArray),
        $shared_state_json: JSON.stringify(this.state.shared_state),
        $heartbeat_interval_ms: this.state.heartbeat_interval_ms,
        $last_sync: this.state.last_sync,
        $created_at: this.state.created_at,
        $updated_at: now,
      });

      // Persist each sub-honeycomb individually
      for (const sub of subHoneycombsArray) {
        this.stmts.upsertSubHoneycomb.run({
          $id: sub.id,
          $swarm_id: this.state.swarm_id,
          $name: sub.name,
          $description: sub.description,
          $status: sub.status,
          $dependencies_json: JSON.stringify(sub.dependencies),
          $progress: sub.progress,
          $assigned_phase: sub.assigned_phase ?? null,
          $started_at: sub.started_at ?? null,
          $completed_at: sub.completed_at ?? null,
          $error: sub.error ?? null,
          $metadata_json: JSON.stringify(sub.metadata),
          $created_at: sub.started_at ?? now,
          $updated_at: now,
        });
      }
    } catch (error) {
      throw new Error(
        `Failed to persist swarm state: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Load swarm state from SQLite.
   * Restores both the main state and all sub-honeycombs.
   *
   * @param swarmId - The swarm ID to load.
   * @returns The loaded SwarmState or null if not found.
   * @throws Error if persistence is not enabled or database operations fail.
   */
  async loadState(swarmId: string): Promise<SwarmState | null> {
    if (!this.config.persistence_enabled || !this.db || !this.stmts) {
      throw new Error('Persistence is not enabled. Set persistence_enabled=true in config.');
    }

    try {
      const row = this.stmts.selectState.get(swarmId) as SwarmStateRow | undefined;

      if (!row) {
        return null;
      }

      // Parse sub-honeycombs
      const subHoneycombsArray = JSON.parse(row.sub_honeycombs_json) as SubHoneycomb[];
      const subHoneycombsMap = new Map<string, SubHoneycomb>();
      for (const sub of subHoneycombsArray) {
        subHoneycombsMap.set(sub.id, sub);
      }

      // Parse shared state
      const sharedState = JSON.parse(row.shared_state_json) as Record<string, unknown>;

      // Reconstruct state
      this.state = {
        swarm_id: row.swarm_id,
        master_project_id: row.master_project_id,
        role: row.role as SwarmRole,
        sub_honeycombs: subHoneycombsMap,
        shared_state: sharedState,
        heartbeat_interval_ms: row.heartbeat_interval_ms,
        last_sync: row.last_sync,
        created_at: row.created_at,
      };

      // Start auto-persist timer if configured
      this.startAutoPersist();

      return this.state;
    } catch (error) {
      throw new Error(
        `Failed to load swarm state: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Start auto-persist timer if configured.
   *
   * @private
   */
  private startAutoPersist(): void {
    if (
      this.autoPersistTimer ||
      !this.config.auto_persist_interval_ms ||
      this.config.auto_persist_interval_ms <= 0
    ) {
      return;
    }

    this.autoPersistTimer = setInterval(() => {
      if (!this.isShuttingDown && this.state) {
        this.persistState().catch((err) => {
          console.error(`[SwarmProtocol] Auto-persist failed: ${err}`);
        });
      }
    }, this.config.auto_persist_interval_ms);
  }

  /**
   * Stop auto-persist timer.
   *
   * @private
   */
  private stopAutoPersist(): void {
    if (this.autoPersistTimer) {
      clearInterval(this.autoPersistTimer);
      this.autoPersistTimer = undefined;
    }
  }

  /**
   * Gracefully shutdown the swarm protocol.
   * Persists current state and closes database connection.
   *
   * @returns Promise that resolves when shutdown is complete.
   */
  async gracefulShutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.stopAutoPersist();

    // Final persist
    if (this.state) {
      await this.persistState();
    }

    // Close database connection
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }

    this.stmts = undefined;
  }

  /**
   * Restore a swarm from persistence on startup.
   * Attempts to load the most recent swarm state.
   * If multiple swarms exist, returns the most recently updated one.
   *
   * @returns The restored SwarmState or null if no persisted state exists.
   */
  async restoreOnStartup(): Promise<SwarmState | null> {
    if (!this.config.persistence_enabled || !this.db) {
      return null;
    }

    try {
      // Find the most recently updated swarm
      // Use updated_at DESC, then created_at DESC, then swarm_id DESC as tiebreaker to ensure deterministic results
      const result = this.db.query(
        `SELECT swarm_id FROM swarm_states ORDER BY updated_at DESC, created_at DESC, swarm_id DESC LIMIT 1`
      ).get() as { swarm_id: string } | undefined;

      if (!result) {
        return null;
      }

      return await this.loadState(result.swarm_id);
    } catch (error) {
      console.error(`[SwarmProtocol] Failed to restore on startup: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Check if persistence is enabled.
   *
   * @returns true if persistence is enabled.
   */
  isPersistenceEnabled(): boolean {
    return this.config.persistence_enabled ?? false;
  }

  /**
   * Delete persisted state for a swarm.
   * Useful for cleanup or testing.
   *
   * @param swarmId - The swarm ID to delete.
   * @throws Error if persistence is not enabled or database operations fail.
   */
  async deletePersistedState(swarmId: string): Promise<void> {
    if (!this.config.persistence_enabled || !this.db) {
      throw new Error('Persistence is not enabled.');
    }

    const txn = this.db.transaction(() => {
      // Cascade delete will handle sub_honeycombs, messages, and votes
      this.db!.prepare('DELETE FROM swarm_states WHERE swarm_id = ?').run(swarmId);
    });

    txn();
  }

  // ----------------------------------------------------------
  // Message & Vote Persistence (Phase 4)
  // ----------------------------------------------------------

  /**
   * Persist a swarm message.
   *
   * @param from - Source sub-honeycomb ID.
   * @param to - Target sub-honeycomb ID (null for broadcast).
   * @param type - Message type.
   * @param payload - Message payload.
   * @returns The message ID.
   */
  async persistMessage(
    from: string,
    to: string | null,
    type: string,
    payload: unknown,
  ): Promise<string> {
    if (!this.config.persistence_enabled || !this.db || !this.stmts || !this.state) {
      return randomUUID(); // Return a UUID but don't persist
    }

    // Ensure swarm state exists in database (for foreign key constraint)
    await this.persistState();

    const messageId = randomUUID();
    const now = Date.now();

    this.stmts.insertMessage.run({
      $message_id: messageId,
      $swarm_id: this.state.swarm_id,
      $from_sub: from,
      $to_sub: to,
      $type: type,
      $payload_json: JSON.stringify(payload),
      $created_at: now,
      $processed: 0,
    });

    return messageId;
  }

  /**
   * Get pending (unprocessed) messages for the swarm.
   *
   * @returns Array of pending messages.
   */
  async getPendingMessages(): Promise<Array<{
    message_id: string;
    from_sub: string;
    to_sub: string | null;
    type: string;
    payload: unknown;
  }>> {
    if (!this.config.persistence_enabled || !this.db || !this.stmts || !this.state) {
      return [];
    }

    const rows = this.stmts.selectMessages.all(this.state.swarm_id) as SwarmMessageRow[];

    return rows.map((row) => ({
      message_id: row.message_id,
      from_sub: row.from_sub,
      to_sub: row.to_sub,
      type: row.type,
      payload: JSON.parse(row.payload_json),
    }));
  }

  /**
   * Persist a vote record.
   *
   * @param proposalId - The proposal ID being voted on.
   * @param voterId - The voter's sub-honeycomb ID.
   * @param choice - The vote choice.
   * @returns The vote ID.
   */
  async persistVote(
    proposalId: string,
    voterId: string,
    choice: string,
  ): Promise<string> {
    if (!this.config.persistence_enabled || !this.db || !this.stmts || !this.state) {
      return randomUUID();
    }

    // Ensure swarm state exists in database (for foreign key constraint)
    await this.persistState();

    const voteId = randomUUID();
    const now = Date.now();

    this.stmts.insertVote.run({
      $vote_id: voteId,
      $swarm_id: this.state.swarm_id,
      $proposal_id: proposalId,
      $voter_id: voterId,
      $choice: choice,
      $created_at: now,
    });

    return voteId;
  }

  /**
   * Get votes for a proposal.
   *
   * @param proposalId - The proposal ID.
   * @returns Map of voter_id to choice.
   */
  async getVotes(proposalId: string): Promise<Map<string, string>> {
    if (!this.config.persistence_enabled || !this.db || !this.stmts || !this.state) {
      return new Map();
    }

    const rows = this.stmts.selectVotes.all(this.state.swarm_id, proposalId) as SwarmVoteRow[];

    const votes = new Map<string, string>();
    for (const row of rows) {
      votes.set(row.voter_id, row.choice);
    }

    return votes;
  }

  // ----------------------------------------------------------
  // Private Helpers
  // ----------------------------------------------------------

  /**
   * Guard that ensures the swarm has been initialized before operations
   * that require an active swarm state. Returns the non-null state.
   *
   * @returns The current SwarmState (guaranteed non-null).
   * @throws Error if swarm state is null.
   */
  private requireState(): SwarmState {
    if (!this.state) {
      throw new Error(
        'Swarm not initialized. Call initSwarm() before performing this operation.',
      );
    }
    return this.state;
  }

  /**
   * Detect whether the current dependency graph contains a cycle
   * using iterative depth-first search.
   *
   * @returns true if a cycle exists, false otherwise.
   */
  private hasCycle(): boolean {
    if (!this.state) return false;

    const subs = this.state.sub_honeycombs;
    const visited = new Set<string>();
    const inStack = new Set<string>();

    for (const id of Array.from(subs.keys())) {
      if (visited.has(id)) continue;

      // Iterative DFS using an explicit stack
      const stack: Array<{ id: string; index: number }> = [{ id, index: 0 }];
      inStack.add(id);

      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        const sub = subs.get(frame.id);
        const deps = sub?.dependencies ?? [];

        if (frame.index < deps.length) {
          const depId = deps[frame.index];
          frame.index++;

          if (inStack.has(depId)) {
            return true; // Cycle detected
          }

          if (!visited.has(depId)) {
            inStack.add(depId);
            stack.push({ id: depId, index: 0 });
          }
        } else {
          // Finished processing this node
          visited.add(frame.id);
          inStack.delete(frame.id);
          stack.pop();
        }
      }
    }

    return false;
  }
}

// ============================================================
// Factory & Global Instance
// ============================================================

/**
 * Create a new SwarmProtocol instance with optional configuration overrides.
 *
 * @param config - Partial configuration to merge with defaults.
 * @returns A fresh SwarmProtocol instance.
 */
export function createSwarmProtocol(config?: Partial<SwarmConfig>): SwarmProtocol {
  return new SwarmProtocol(config);
}

/**
 * Global swarm protocol singleton instance.
 * Can be replaced at engine startup with a configured instance.
 */
export const swarmProtocol: SwarmProtocol = createSwarmProtocol();
