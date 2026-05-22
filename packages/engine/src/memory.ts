/**
 * Honeycomb v2 - Three-Layer Memory System
 *
 * Provides hierarchical memory management for agents:
 * - WorkingMemory: volatile in-memory store for current task context (TTL support)
 * - ProjectMemory: SQLite-persisted project-scoped knowledge base
 * - OrgMemory: SQLite-persisted cross-project experience store
 *
 * Each layer serves a distinct temporal and scoping purpose:
 *   Working  → ephemeral, sub-second access, single task lifetime
 *   Project  → durable, project-scoped, survives restarts
 *   Org      → durable, cross-project, institutional knowledge
 */

import { Database, type Statement } from 'bun:sqlite';
import crypto from 'node:crypto';

// ============================================================
// Working Memory - Volatile In-Memory Store
// ============================================================

/** Entry stored in WorkingMemory with optional expiration */
interface WorkingMemoryEntry<T = unknown> {
  value: T;
  expires_at: number | null; // null = no expiration
  created_at: number;
}

/**
 * WorkingMemory provides a volatile key-value store with optional TTL.
 *
 * Designed for current task context that does not need to survive
 * process restarts. All data lives in-process memory only.
 * Expired entries are lazily pruned on access or explicitly via prune().
 */
export class WorkingMemory {
  private store: Map<string, WorkingMemoryEntry> = new Map();

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------

  /**
   * Store a value with an optional time-to-live.
   * @param key   - Unique key for this entry
   * @param value - Any serializable value
   * @param ttlMs - Time-to-live in milliseconds (omit for no expiration)
   */
  set<T = unknown>(key: string, value: T, ttlMs?: number): void {
    const now = Date.now();
    const entry: WorkingMemoryEntry<T> = {
      value,
      expires_at: ttlMs != null ? now + ttlMs : null,
      created_at: now,
    };
    this.store.set(key, entry as WorkingMemoryEntry);
  }

  /**
   * Retrieve a value by key. Returns undefined if the key does not exist
   * or if the entry has expired (expired entries are auto-deleted on access).
   * @param key - The key to look up
   */
  get<T = unknown>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    // Check expiration
    if (entry.expires_at !== null && Date.now() > entry.expires_at) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  /**
   * Check whether a key exists and is not expired.
   * @param key - The key to check
   */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }

    // Check expiration
    if (entry.expires_at !== null && Date.now() > entry.expires_at) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific key from working memory.
   * @param key - The key to remove
   * @returns true if the key existed and was deleted
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clear all entries from working memory.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Return all non-expired entries as a plain object.
   * Expired entries are pruned during this operation.
   */
  getAll(): Record<string, unknown> {
    this.prune();
    const result: Record<string, unknown> = {};
    for (const [key, entry] of this.store) {
      result[key] = entry.value;
    }
    return result;
  }

  /**
   * The number of non-expired entries currently stored.
   * Note: This calls prune() first to ensure accuracy.
   */
  get size(): number {
    this.prune();
    return this.store.size;
  }

  /**
   * Remove all expired entries from the store.
   * Called automatically by getAll() and size, but can be invoked manually
   * for periodic cleanup in long-running processes.
   * @returns The number of entries pruned
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.store) {
      if (entry.expires_at !== null && now > entry.expires_at) {
        this.store.delete(key);
        pruned++;
      }
    }

    return pruned;
  }
}

// ============================================================
// Project Memory - SQLite-Persisted Project Knowledge Base
// ============================================================

/** Row type for project_memory table query results */
interface ProjectMemoryRow {
  id: string;
  project_id: string;
  category: string;
  key: string;
  value: string;
  metadata: string;
  created_at: number;
  updated_at: number;
}

/** Result object returned from ProjectMemory retrieve/list operations */
export interface ProjectMemoryEntry {
  id: string;
  project_id: string;
  category: string;
  key: string;
  value: string;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

/**
 * ProjectMemory provides SQLite-backed storage scoped to a single project.
 *
 * All entries are organized by (project_id, category, key). Categories allow
 * logical grouping (e.g., "decisions", "research", "artifacts"). Values are
 * stored as text and can hold serialized JSON or plain text.
 *
 * Uses WAL mode, prepared statements, and transactions for performance and safety.
 */
export class ProjectMemory {
  private db: Database;

  // Prepared statements cache
  private stmts!: {
    upsert: Statement;
    selectByKey: Statement;
    selectByCategory: Statement;
    searchByValue: Statement;
    deleteByKey: Statement;
    deleteByProject: Statement;
  };

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.initTables();
    this.prepareStatements();
  }

  // ----------------------------------------------------------
  // Schema initialization
  // ----------------------------------------------------------

  private initTables(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS project_memory ('
      + 'id TEXT PRIMARY KEY,'
      + 'project_id TEXT NOT NULL,'
      + 'category TEXT NOT NULL,'
      + 'key TEXT NOT NULL,'
      + 'value TEXT NOT NULL,'
      + 'metadata TEXT NOT NULL DEFAULT \'{}\','
      + 'created_at INTEGER NOT NULL,'
      + 'updated_at INTEGER NOT NULL'
      + ')');
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_project_memory_unique ON project_memory(project_id, category, key)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_project_memory_lookup ON project_memory(project_id, category, key)');
  }

  // ----------------------------------------------------------
  // Prepared statements
  // ----------------------------------------------------------

  private prepareStatements(): void {
    this.stmts = {
      upsert: this.db.prepare(`
        INSERT INTO project_memory (id, project_id, category, key, value, metadata, created_at, updated_at)
        VALUES ($id, $project_id, $category, $key, $value, $metadata, $created_at, $updated_at)
        ON CONFLICT(project_id, category, key) DO UPDATE SET
          value      = $value,
          metadata   = $metadata,
          updated_at = $updated_at
      `),

      selectByKey: this.db.prepare(`
        SELECT id, project_id, category, key, value, metadata, created_at, updated_at
        FROM project_memory
        WHERE project_id = ? AND category = ? AND key = ?
      `),

      selectByCategory: this.db.prepare(`
        SELECT id, project_id, category, key, value, metadata, created_at, updated_at
        FROM project_memory
        WHERE project_id = ? AND category = ?
        ORDER BY updated_at DESC
      `),

      searchByValue: this.db.prepare(`
        SELECT id, project_id, category, key, value, metadata, created_at, updated_at
        FROM project_memory
        WHERE project_id = ? AND (
          key LIKE '%' || ? || '%' OR
          value LIKE '%' || ? || '%' OR
          category LIKE '%' || ? || '%'
        )
        ORDER BY updated_at DESC
      `),

      deleteByKey: this.db.prepare(`
        DELETE FROM project_memory
        WHERE project_id = ? AND category = ? AND key = ?
      `),

      deleteByProject: this.db.prepare(`
        DELETE FROM project_memory
        WHERE project_id = ?
      `),
    };
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------

  /**
   * Store or update a knowledge entry scoped to a project and category.
   * If an entry with the same (project_id, category, key) exists, it is updated.
   * @param projectId - The owning project ID
   * @param category  - Logical grouping (e.g., "decisions", "research", "context")
   * @param key       - Unique key within the category
   * @param value     - The value to store (text or serialized JSON)
   * @param metadata  - Optional metadata object
   */
  store(
    projectId: string,
    category: string,
    key: string,
    value: string,
    metadata?: Record<string, unknown>,
  ): void {
    const now = Date.now();
    this.stmts.upsert.run({
      $id: crypto.randomUUID(),
      $project_id: projectId,
      $category: category,
      $key: key,
      $value: value,
      $metadata: JSON.stringify(metadata ?? {}),
      $created_at: now,
      $updated_at: now,
    });
  }

  /**
   * Retrieve a single entry by exact (project_id, category, key) match.
   * @param projectId - The owning project ID
   * @param category  - The category to look in
   * @param key       - The exact key to retrieve
   * @returns The matching entry, or null if not found
   */
  retrieve(
    projectId: string,
    category: string,
    key: string,
  ): ProjectMemoryEntry | null {
    const row = this.stmts.selectByKey.get(projectId, category, key) as
      | ProjectMemoryRow
      | undefined;
    return row ? this.rowToEntry(row) : null;
  }

  /**
   * List all entries in a given category for a project, ordered by most recently updated.
   * @param projectId - The owning project ID
   * @param category  - The category to list
   */
  listByCategory(projectId: string, category: string): ProjectMemoryEntry[] {
    const rows = this.stmts.selectByCategory.all(projectId, category) as ProjectMemoryRow[];
    return rows.map(this.rowToEntry);
  }

  /**
   * Search for entries matching a query string across key, value, and category fields.
   * Uses case-insensitive LIKE matching.
   * @param projectId - The owning project ID
   * @param query     - The search term to match against key, value, and category
   */
  search(projectId: string, query: string): ProjectMemoryEntry[] {
    const rows = this.stmts.searchByValue.all(projectId, query, query, query) as ProjectMemoryRow[];
    return rows.map(this.rowToEntry);
  }

  /**
   * Delete a specific entry by (project_id, category, key).
   * @param projectId - The owning project ID
   * @param category  - The category
   * @param key       - The key to delete
   * @returns true if an entry was deleted
   */
  delete(projectId: string, category: string, key: string): boolean {
    const result = this.stmts.deleteByKey.run(projectId, category, key);
    return result.changes > 0;
  }

  /**
   * Delete all memory entries for a given project.
   * Use with caution - this removes all project knowledge.
   * @param projectId - The project whose entries should be purged
   * @returns The number of entries deleted
   */
  deleteByProject(projectId: string): number {
    const result = this.stmts.deleteByProject.run(projectId);
    return result.changes;
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
   * Convert a raw SQLite row to a typed ProjectMemoryEntry object.
   */
  private rowToEntry(row: ProjectMemoryRow): ProjectMemoryEntry {
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(row.metadata);
    } catch {
      // Silently default to empty object if metadata is malformed
    }

    return {
      id: row.id,
      project_id: row.project_id,
      category: row.category,
      key: row.key,
      value: row.value,
      metadata,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

// ============================================================
// Org Memory - SQLite-Persisted Cross-Project Experience Store
// ============================================================

/** Row type for org_memory table query results */
interface OrgMemoryRow {
  id: string;
  category: string;
  key: string;
  value: string;
  source_project: string;
  confidence: number;
  tags: string;
  created_at: number;
  updated_at: number;
}

/** Result object returned from OrgMemory retrieve/list operations */
export interface OrgMemoryEntry {
  id: string;
  category: string;
  key: string;
  value: string;
  source_project: string;
  confidence: number;
  tags: string[];
  created_at: number;
  updated_at: number;
}

/**
 * OrgMemory provides SQLite-backed storage for cross-project experience and patterns.
 *
 * Designed to capture institutional knowledge that transcends individual projects:
 * common failure modes, architectural patterns, risk indicators, best practices, etc.
 *
 * Entries have a confidence score (0.0-1.0) that can be updated as patterns are
 * reinforced or invalidated across projects. Tags enable flexible categorization
 * beyond the primary category key.
 *
 * Uses WAL mode, prepared statements, and transactions for performance and safety.
 */
export class OrgMemory {
  private db: Database;

  // Prepared statements cache
  private stmts!: {
    upsert: Statement;
    selectByKey: Statement;
    selectByCategory: Statement;
    searchByTags: Statement;
    selectHighConfidence: Statement;
    updateConfidence: Statement;
    deleteByKey: Statement;
  };

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.initTables();
    this.prepareStatements();
  }

  // ----------------------------------------------------------
  // Schema initialization
  // ----------------------------------------------------------

  private initTables(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS org_memory ('
      + 'id TEXT PRIMARY KEY,'
      + 'category TEXT NOT NULL,'
      + 'key TEXT NOT NULL,'
      + 'value TEXT NOT NULL,'
      + 'source_project TEXT NOT NULL,'
      + 'confidence REAL NOT NULL DEFAULT 0.5,'
      + 'tags TEXT NOT NULL DEFAULT \'[]\','
      + 'created_at INTEGER NOT NULL,'
      + 'updated_at INTEGER NOT NULL'
      + ')');
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_org_memory_unique ON org_memory(category, key)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_org_memory_lookup ON org_memory(category, key)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_org_memory_confidence ON org_memory(confidence DESC)');
  }

  // ----------------------------------------------------------
  // Prepared statements
  // ----------------------------------------------------------

  private prepareStatements(): void {
    this.stmts = {
      upsert: this.db.prepare(`
        INSERT INTO org_memory (id, category, key, value, source_project, confidence, tags, created_at, updated_at)
        VALUES ($id, $category, $key, $value, $source_project, $confidence, $tags, $created_at, $updated_at)
        ON CONFLICT(category, key) DO UPDATE SET
          value          = $value,
          source_project = $source_project,
          confidence     = $confidence,
          tags           = $tags,
          updated_at     = $updated_at
      `),

      selectByKey: this.db.prepare(`
        SELECT id, category, key, value, source_project, confidence, tags, created_at, updated_at
        FROM org_memory
        WHERE category = ? AND key = ?
      `),

      selectByCategory: this.db.prepare(`
        SELECT id, category, key, value, source_project, confidence, tags, created_at, updated_at
        FROM org_memory
        WHERE category = ?
        ORDER BY confidence DESC, updated_at DESC
      `),

      // Tag search uses LIKE against the JSON array string.
      // Each tag is checked individually; the caller builds the query dynamically.
      // This prepared statement handles a single-tag search; multi-tag is handled in the method.
      searchByTags: this.db.prepare(`
        SELECT id, category, key, value, source_project, confidence, tags, created_at, updated_at
        FROM org_memory
        WHERE tags LIKE '%' || ? || '%'
        ORDER BY confidence DESC, updated_at DESC
      `),

      selectHighConfidence: this.db.prepare(`
        SELECT id, category, key, value, source_project, confidence, tags, created_at, updated_at
        FROM org_memory
        WHERE confidence >= ?
        ORDER BY confidence DESC, updated_at DESC
        LIMIT ?
      `),

      updateConfidence: this.db.prepare(`
        UPDATE org_memory
        SET confidence = $confidence, updated_at = $updated_at
        WHERE category = $category AND key = $key
      `),

      deleteByKey: this.db.prepare(`
        DELETE FROM org_memory
        WHERE category = ? AND key = ?
      `),
    };
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------

  /**
   * Store or update an organizational knowledge entry.
   * If an entry with the same (category, key) exists, it is updated.
   * @param category      - Knowledge category (e.g., "patterns", "risks", "lessons")
   * @param key           - Unique key within the category
   * @param value         - The knowledge content (text or serialized JSON)
   * @param sourceProject - The project ID that contributed this knowledge
   * @param confidence    - Confidence score 0.0-1.0 (default 0.5)
   * @param tags          - Optional tags for flexible search and grouping
   */
  store(
    category: string,
    key: string,
    value: string,
    sourceProject: string,
    confidence: number = 0.5,
    tags: string[] = [],
  ): void {
    const now = Date.now();
    const clampedConfidence = Math.max(0, Math.min(1, confidence));

    this.stmts.upsert.run({
      $id: crypto.randomUUID(),
      $category: category,
      $key: key,
      $value: value,
      $source_project: sourceProject,
      $confidence: clampedConfidence,
      $tags: JSON.stringify(tags),
      $created_at: now,
      $updated_at: now,
    });
  }

  /**
   * Retrieve a single entry by exact (category, key) match.
   * @param category - The category to look in
   * @param key      - The exact key to retrieve
   * @returns The matching entry, or null if not found
   */
  retrieve(category: string, key: string): OrgMemoryEntry | null {
    const row = this.stmts.selectByKey.get(category, key) as
      | OrgMemoryRow
      | undefined;
    return row ? this.rowToEntry(row) : null;
  }

  /**
   * List all entries in a given category, ordered by confidence (descending),
   * then by most recently updated.
   * @param category - The category to list
   */
  listByCategory(category: string): OrgMemoryEntry[] {
    const rows = this.stmts.selectByCategory.all(category) as OrgMemoryRow[];
    return rows.map(this.rowToEntry);
  }

  /**
   * Search for entries that contain ANY of the given tags.
   * Results are ordered by confidence (descending), then by most recently updated.
   *
   * For single-tag searches, uses the prepared statement directly.
   * For multi-tag searches, builds a dynamic query with OR conditions.
   *
   * @param tags - Array of tags to search for (OR logic)
   */
  searchByTags(tags: string[]): OrgMemoryEntry[] {
    if (tags.length === 0) {
      return [];
    }

    // Single tag: use prepared statement
    if (tags.length === 1) {
      const rows = this.stmts.searchByTags.all(tags[0]) as OrgMemoryRow[];
      return rows.map(this.rowToEntry);
    }

    // Multiple tags: build dynamic query with OR conditions
    const conditions = tags.map(() => "tags LIKE '%' || ? || '%'").join(' OR ');
    const sql = `
      SELECT id, category, key, value, source_project, confidence, tags, created_at, updated_at
      FROM org_memory
      WHERE ${conditions}
      ORDER BY confidence DESC, updated_at DESC
    `;
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...tags) as OrgMemoryRow[];
    return rows.map(this.rowToEntry);
  }

  /**
   * Retrieve high-confidence entries across all categories.
   * Useful for surfacing well-established patterns and best practices.
   * @param minConfidence - Minimum confidence threshold (0.0-1.0)
   * @param limit         - Maximum number of results (default 50)
   */
  getHighConfidence(minConfidence: number, limit: number = 50): OrgMemoryEntry[] {
    const rows = this.stmts.selectHighConfidence.all(minConfidence, limit) as OrgMemoryRow[];
    return rows.map(this.rowToEntry);
  }

  /**
   * Update the confidence score of an existing entry.
   * Confidence is clamped to the 0.0-1.0 range.
   * @param category      - The category of the entry
   * @param key           - The key of the entry
   * @param newConfidence - The new confidence score
   * @returns true if an entry was updated
   */
  updateConfidence(category: string, key: string, newConfidence: number): boolean {
    const clampedConfidence = Math.max(0, Math.min(1, newConfidence));
    const result = this.stmts.updateConfidence.run({
      $category: category,
      $key: key,
      $confidence: clampedConfidence,
      $updated_at: Date.now(),
    });
    return result.changes > 0;
  }

  /**
   * Delete a specific entry by (category, key).
   * @param category - The category
   * @param key      - The key to delete
   * @returns true if an entry was deleted
   */
  delete(category: string, key: string): boolean {
    const result = this.stmts.deleteByKey.run(category, key);
    return result.changes > 0;
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
   * Convert a raw SQLite row to a typed OrgMemoryEntry object.
   */
  private rowToEntry(row: OrgMemoryRow): OrgMemoryEntry {
    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags);
    } catch {
      // Silently default to empty array if tags JSON is malformed
    }

    return {
      id: row.id,
      category: row.category,
      key: row.key,
      value: row.value,
      source_project: row.source_project,
      confidence: row.confidence,
      tags,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

// ============================================================
// Factory Functions & Global Singleton
// ============================================================

/**
 * Create a new WorkingMemory instance.
 * WorkingMemory is pure in-memory and requires no configuration.
 */
export function createWorkingMemory(): WorkingMemory {
  return new WorkingMemory();
}

/**
 * Create a new ProjectMemory instance backed by the given SQLite database.
 * @param dbPath - Path to the SQLite database file
 */
export function createProjectMemory(dbPath: string): ProjectMemory {
  return new ProjectMemory(dbPath);
}

/**
 * Create a new OrgMemory instance backed by the given SQLite database.
 * @param dbPath - Path to the SQLite database file
 */
export function createOrgMemory(dbPath: string): OrgMemory {
  return new OrgMemory(dbPath);
}

/**
 * Global WorkingMemory singleton instance.
 * Available immediately for in-process use without configuration.
 */
export const workingMemory: WorkingMemory = createWorkingMemory();
