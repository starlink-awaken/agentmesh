/**
 * Honeycomb v2 - Context Shard Manager
 *
 * Manages context sharding for agents to ensure efficient token usage.
 * Each agent receives only the context shards relevant to its task,
 * keeping total context within 60% of the available window.
 *
 * Architecture principle #7: Sharded Context - each Agent loads only
 * current task context shard + global summary.
 */

import crypto from 'node:crypto';
import type { ContextShard } from './types.js';

// ============================================================
// Constants
// ============================================================

/** Default maximum context window in tokens */
const DEFAULT_MAX_WINDOW = 200_000;

/** Maximum fraction of context window that may be used (60%) */
const WINDOW_USAGE_LIMIT = 0.6;

/** Maximum tokens allowed for the global summary shard */
const SUMMARY_MAX_TOKENS = 2000;

// ============================================================
// Internal Types
// ============================================================

/** Scope priority for shard ordering during assembly */
const SCOPE_PRIORITY: Record<ContextShard['scope'], number> = {
  'global-summary': 0,
  'task': 1,
  'module': 2,
};

/** Result of assembling context from multiple shards */
export interface AssembleResult {
  shards: ContextShard[];
  totalTokens: number;
  withinLimit: boolean;
}

/** Aggregate statistics for the shard store */
export interface ShardStats {
  totalShards: number;
  totalTokens: number;
  byScope: Record<string, number>;
  avgTokensPerShard: number;
}

// ============================================================
// ContextShardManager
// ============================================================

export class ContextShardManager {
  /** Internal shard store keyed by shard_id */
  private readonly shards = new Map<string, ContextShard>();

  /** Maximum context window in tokens */
  private readonly maxWindow: number;

  constructor(maxWindow: number = DEFAULT_MAX_WINDOW) {
    this.maxWindow = maxWindow;
  }

  // ----------------------------------------------------------
  // CRUD Operations
  // ----------------------------------------------------------

  /**
   * Create a new context shard and store it.
   *
   * @param scope      - Shard scope: 'global-summary', 'module', or 'task'
   * @param content    - The textual content of the shard
   * @param moduleName - Optional module name (required for 'module' scope)
   * @returns The newly created ContextShard
   */
  createShard(
    scope: ContextShard['scope'],
    content: string,
    moduleName?: string,
  ): ContextShard {
    const shard: ContextShard = {
      shard_id: crypto.randomUUID(),
      scope,
      content,
      token_count: this.estimateTokenCount(content),
      last_updated: Date.now(),
    };

    if (moduleName !== undefined) {
      shard.module_name = moduleName;
    }

    this.shards.set(shard.shard_id, shard);
    return shard;
  }

  /**
   * Retrieve a shard by its ID.
   *
   * @param shardId - The unique shard identifier
   * @returns The shard if found, undefined otherwise
   */
  getShard(shardId: string): ContextShard | undefined {
    return this.shards.get(shardId);
  }

  /**
   * Update an existing shard's content and recalculate its token count.
   *
   * @param shardId - The shard to update
   * @param content - The new content
   * @throws Error if the shard does not exist
   */
  updateShard(shardId: string, content: string): void {
    const shard = this.shards.get(shardId);
    if (!shard) {
      throw new Error(`ContextShardManager: shard not found (id=${shardId})`);
    }

    shard.content = content;
    shard.token_count = this.estimateTokenCount(content);
    shard.last_updated = Date.now();
  }

  /**
   * Delete a shard from the store.
   * No-op if the shard does not exist.
   *
   * @param shardId - The shard to delete
   */
  deleteShard(shardId: string): void {
    this.shards.delete(shardId);
  }

  // ----------------------------------------------------------
  // Query Operations
  // ----------------------------------------------------------

  /**
   * Retrieve all shards matching a given scope.
   *
   * @param scope - The scope to filter by
   * @returns Array of matching shards
   */
  getShardsByScope(scope: ContextShard['scope']): ContextShard[] {
    const result: ContextShard[] = [];
    for (const shard of this.shards.values()) {
      if (shard.scope === scope) {
        result.push(shard);
      }
    }
    return result;
  }

  /**
   * Retrieve all shards belonging to a specific module.
   *
   * @param moduleName - The module name to filter by
   * @returns Array of matching shards
   */
  getShardsByModule(moduleName: string): ContextShard[] {
    const result: ContextShard[] = [];
    for (const shard of this.shards.values()) {
      if (shard.module_name === moduleName) {
        result.push(shard);
      }
    }
    return result;
  }

  // ----------------------------------------------------------
  // Context Assembly
  // ----------------------------------------------------------

  /**
   * Assemble context from a set of shard IDs.
   *
   * Always includes the global-summary shard (if one exists).
   * Shards are ordered by priority: global-summary first, then task, then module.
   * Returns whether the total token count is within the 60% window limit.
   *
   * @param shardIds  - Array of shard IDs to include
   * @param maxWindow - Optional override for the context window size
   * @returns Assembled shards, total tokens, and whether within limit
   */
  assembleContext(shardIds: string[], maxWindow?: number): AssembleResult {
    const effectiveWindow = maxWindow ?? this.maxWindow;
    const tokenBudget = Math.floor(effectiveWindow * WINDOW_USAGE_LIMIT);

    // Collect requested shards (skip missing IDs)
    const collected = new Map<string, ContextShard>();
    for (const id of shardIds) {
      const shard = this.shards.get(id);
      if (shard) {
        collected.set(id, shard);
      }
    }

    // Auto-include global-summary if not already present
    const globalSummary = this.getGlobalSummary();
    if (globalSummary && !collected.has(globalSummary.shard_id)) {
      collected.set(globalSummary.shard_id, globalSummary);
    }

    // Sort by scope priority: global-summary (0) -> task (1) -> module (2)
    const shards = Array.from(collected.values()).sort(
      (a, b) => SCOPE_PRIORITY[a.scope] - SCOPE_PRIORITY[b.scope],
    );

    const totalTokens = shards.reduce((sum, s) => sum + s.token_count, 0);

    return {
      shards,
      totalTokens,
      withinLimit: totalTokens <= tokenBudget,
    };
  }

  // ----------------------------------------------------------
  // Compression
  // ----------------------------------------------------------

  /**
   * Compress a shard by truncating its content to fit within a target token count.
   * Appends "[...truncated]" when truncation occurs.
   *
   * @param shardId      - The shard to compress
   * @param targetTokens - Maximum token count after compression
   * @returns The compressed shard
   * @throws Error if the shard does not exist
   */
  compressShard(shardId: string, targetTokens: number): ContextShard {
    const shard = this.shards.get(shardId);
    if (!shard) {
      throw new Error(`ContextShardManager: shard not found (id=${shardId})`);
    }

    // If already under target, return as-is
    if (shard.token_count <= targetTokens) {
      return shard;
    }

    const truncationIndicator = '[...truncated]';
    const indicatorTokens = this.estimateTokenCount(truncationIndicator);
    const contentTokens = Math.max(0, targetTokens - indicatorTokens);
    const maxChars = contentTokens * 4;

    shard.content = shard.content.slice(0, maxChars) + truncationIndicator;
    shard.token_count = this.estimateTokenCount(shard.content);
    shard.last_updated = Date.now();

    return shard;
  }

  // ----------------------------------------------------------
  // Global Summary
  // ----------------------------------------------------------

  /**
   * Retrieve the global summary shard.
   *
   * @returns The global-summary shard, or undefined if none exists
   */
  getGlobalSummary(): ContextShard | undefined {
    for (const shard of this.shards.values()) {
      if (shard.scope === 'global-summary') {
        return shard;
      }
    }
    return undefined;
  }

  /**
   * Create or update the global summary shard.
   * If content exceeds SUMMARY_MAX_TOKENS, it is truncated.
   *
   * @param content - The summary content
   * @returns The created or updated global-summary shard
   */
  setGlobalSummary(content: string): ContextShard {
    // Enforce summary token limit
    let finalContent = content;
    const estimatedTokens = this.estimateTokenCount(content);
    if (estimatedTokens > SUMMARY_MAX_TOKENS) {
      const maxChars = SUMMARY_MAX_TOKENS * 4;
      finalContent = content.slice(0, maxChars);
    }

    const existing = this.getGlobalSummary();
    if (existing) {
      existing.content = finalContent;
      existing.token_count = this.estimateTokenCount(finalContent);
      existing.last_updated = Date.now();
      return existing;
    }

    return this.createShard('global-summary', finalContent);
  }

  // ----------------------------------------------------------
  // Statistics
  // ----------------------------------------------------------

  /**
   * Get aggregate statistics about the current shard store.
   *
   * @returns Stats including total shards, tokens, per-scope breakdown, and average
   */
  getStats(): ShardStats {
    let totalTokens = 0;
    const byScope: Record<string, number> = {};

    for (const shard of this.shards.values()) {
      totalTokens += shard.token_count;
      byScope[shard.scope] = (byScope[shard.scope] ?? 0) + 1;
    }

    const totalShards = this.shards.size;

    return {
      totalShards,
      totalTokens,
      byScope,
      avgTokensPerShard: totalShards > 0 ? totalTokens / totalShards : 0,
    };
  }

  // ----------------------------------------------------------
  // Token Estimation
  // ----------------------------------------------------------

  /**
   * Estimate the token count for a piece of text.
   * Uses a rough heuristic: ceil(text.length / 4).
   *
   * @param text - The text to estimate
   * @returns Estimated token count
   */
  estimateTokenCount(text: string): number {
    if (text.length === 0) return 0;
    return Math.ceil(text.length / 4);
  }

  // ----------------------------------------------------------
  // Housekeeping
  // ----------------------------------------------------------

  /**
   * Remove shards whose last_updated timestamp is older than maxAgeMs.
   *
   * @param maxAgeMs - Maximum age in milliseconds
   * @returns Number of shards removed
   */
  pruneStale(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;

    for (const [id, shard] of this.shards) {
      if (shard.last_updated < cutoff) {
        this.shards.delete(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Clear all shards from the store.
   */
  clear(): void {
    this.shards.clear();
  }
}

// ============================================================
// Factory & Global Instance
// ============================================================

/**
 * Create a new ContextShardManager instance.
 *
 * @param maxWindow - Optional maximum context window in tokens (default 200,000)
 * @returns A new ContextShardManager
 */
export function createContextShardManager(maxWindow?: number): ContextShardManager {
  return new ContextShardManager(maxWindow);
}

/**
 * Global context shard manager singleton instance.
 * Can be replaced at engine startup with a configured instance.
 */
export const contextShardManager: ContextShardManager = createContextShardManager();
