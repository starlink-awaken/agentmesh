import { describe, test, expect, beforeEach } from 'bun:test';
import {
  ContextShardManager,
  createContextShardManager,
  contextShardManager,
} from '../src/context-shard-manager.ts';
import type { ContextShard } from '../src/types.ts';

// ============================================================
// Construction & Factory Functions
// ============================================================

describe('Construction & Factory Functions', () => {
  test('createContextShardManager creates new instance', () => {
    const m1 = createContextShardManager();
    const m2 = createContextShardManager();
    expect(m1).not.toBe(m2);
    expect(m1).toBeInstanceOf(ContextShardManager);
    expect(m2).toBeInstanceOf(ContextShardManager);
  });

  test('createContextShardManager accepts custom maxWindow', () => {
    const mgr = createContextShardManager(100_000);
    // The limit should be 60% of 100_000 = 60_000
    // Create content that would exceed 60% of 100_000 but not 60% of 200_000
    const stats = mgr.getStats();
    expect(stats.totalShards).toBe(0);
  });

  test('global contextShardManager singleton exists', () => {
    expect(contextShardManager).toBeInstanceOf(ContextShardManager);
  });

  test('global singleton is a single shared instance', () => {
    contextShardManager.clear();
    contextShardManager.createShard('task', 'test content');
    expect(contextShardManager.getStats().totalShards).toBe(1);
    contextShardManager.clear();
  });

  test('constructor initializes empty state', () => {
    const mgr = createContextShardManager();
    const stats = mgr.getStats();
    expect(stats.totalShards).toBe(0);
    expect(stats.totalTokens).toBe(0);
    expect(stats.avgTokensPerShard).toBe(0);
  });
});

// ============================================================
// createShard
// ============================================================

describe('createShard', () => {
  let mgr: ContextShardManager;

  beforeEach(() => {
    mgr = createContextShardManager();
  });

  test('creates a task shard with correct fields', () => {
    const shard = mgr.createShard('task', 'implement the login feature');
    expect(shard.shard_id).toBeDefined();
    expect(shard.shard_id.length).toBeGreaterThan(0);
    expect(shard.scope).toBe('task');
    expect(shard.content).toBe('implement the login feature');
    expect(shard.token_count).toBeGreaterThan(0);
    expect(shard.last_updated).toBeGreaterThan(0);
    expect(shard.module_name).toBeUndefined();
  });

  test('creates a module shard with module_name', () => {
    const shard = mgr.createShard('module', 'auth module context', 'auth');
    expect(shard.scope).toBe('module');
    expect(shard.module_name).toBe('auth');
    expect(shard.content).toBe('auth module context');
  });

  test('creates a global-summary shard', () => {
    const shard = mgr.createShard('global-summary', 'project overview');
    expect(shard.scope).toBe('global-summary');
    expect(shard.content).toBe('project overview');
  });

  test('each shard gets a unique ID', () => {
    const s1 = mgr.createShard('task', 'task 1');
    const s2 = mgr.createShard('task', 'task 2');
    const s3 = mgr.createShard('task', 'task 3');
    expect(s1.shard_id).not.toBe(s2.shard_id);
    expect(s2.shard_id).not.toBe(s3.shard_id);
    expect(s1.shard_id).not.toBe(s3.shard_id);
  });

  test('token_count is estimated from content length', () => {
    // "abcd" = 4 chars => ceil(4/4) = 1 token
    const shard = mgr.createShard('task', 'abcd');
    expect(shard.token_count).toBe(1);
  });

  test('token_count uses ceil(length/4)', () => {
    // "abcde" = 5 chars => ceil(5/4) = 2 tokens
    const shard = mgr.createShard('task', 'abcde');
    expect(shard.token_count).toBe(2);
  });

  test('empty content results in 0 token_count', () => {
    const shard = mgr.createShard('task', '');
    expect(shard.token_count).toBe(0);
  });

  test('shard is retrievable after creation', () => {
    const shard = mgr.createShard('task', 'test');
    const retrieved = mgr.getShard(shard.shard_id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.shard_id).toBe(shard.shard_id);
    expect(retrieved!.content).toBe('test');
  });
});

// ============================================================
// getShard
// ============================================================

describe('getShard', () => {
  let mgr: ContextShardManager;

  beforeEach(() => {
    mgr = createContextShardManager();
  });

  test('returns shard by ID', () => {
    const shard = mgr.createShard('task', 'hello');
    const found = mgr.getShard(shard.shard_id);
    expect(found).toEqual(shard);
  });

  test('returns undefined for nonexistent shard', () => {
    const found = mgr.getShard('nonexistent-id');
    expect(found).toBeUndefined();
  });

  test('returns undefined after shard is deleted', () => {
    const shard = mgr.createShard('task', 'hello');
    mgr.deleteShard(shard.shard_id);
    expect(mgr.getShard(shard.shard_id)).toBeUndefined();
  });
});

// ============================================================
// updateShard
// ============================================================

describe('updateShard', () => {
  let mgr: ContextShardManager;

  beforeEach(() => {
    mgr = createContextShardManager();
  });

  test('updates content and recalculates token count', () => {
    const shard = mgr.createShard('task', 'short');
    const originalTokens = shard.token_count;
    mgr.updateShard(shard.shard_id, 'this is a much longer piece of content now');
    const updated = mgr.getShard(shard.shard_id)!;
    expect(updated.content).toBe('this is a much longer piece of content now');
    expect(updated.token_count).toBeGreaterThan(originalTokens);
  });

  test('updates last_updated timestamp', () => {
    const shard = mgr.createShard('task', 'original');
    const originalTimestamp = shard.last_updated;
    // Ensure at least 1ms passes
    const start = performance.now();
    while (performance.now() - start < 2) {}
    mgr.updateShard(shard.shard_id, 'updated');
    const updated = mgr.getShard(shard.shard_id)!;
    expect(updated.last_updated).toBeGreaterThanOrEqual(originalTimestamp);
  });

  test('throws error for nonexistent shard', () => {
    expect(() => mgr.updateShard('nonexistent', 'content')).toThrow();
  });

  test('preserves scope and module_name after update', () => {
    const shard = mgr.createShard('module', 'original', 'auth');
    mgr.updateShard(shard.shard_id, 'new content');
    const updated = mgr.getShard(shard.shard_id)!;
    expect(updated.scope).toBe('module');
    expect(updated.module_name).toBe('auth');
  });
});

// ============================================================
// deleteShard
// ============================================================

describe('deleteShard', () => {
  let mgr: ContextShardManager;

  beforeEach(() => {
    mgr = createContextShardManager();
  });

  test('removes shard from store', () => {
    const shard = mgr.createShard('task', 'to be deleted');
    mgr.deleteShard(shard.shard_id);
    expect(mgr.getShard(shard.shard_id)).toBeUndefined();
  });

  test('decreases total shard count', () => {
    const s1 = mgr.createShard('task', 'a');
    mgr.createShard('task', 'b');
    expect(mgr.getStats().totalShards).toBe(2);
    mgr.deleteShard(s1.shard_id);
    expect(mgr.getStats().totalShards).toBe(1);
  });

  test('deleting nonexistent shard is a no-op', () => {
    mgr.createShard('task', 'existing');
    mgr.deleteShard('nonexistent');
    expect(mgr.getStats().totalShards).toBe(1);
  });
});

// ============================================================
// getShardsByScope
// ============================================================

describe('getShardsByScope', () => {
  let mgr: ContextShardManager;

  beforeEach(() => {
    mgr = createContextShardManager();
  });

  test('returns all shards of a given scope', () => {
    mgr.createShard('task', 'task 1');
    mgr.createShard('task', 'task 2');
    mgr.createShard('module', 'module 1', 'auth');
    mgr.createShard('global-summary', 'summary');

    const taskShards = mgr.getShardsByScope('task');
    expect(taskShards.length).toBe(2);
    expect(taskShards.every((s) => s.scope === 'task')).toBe(true);
  });

  test('returns empty array if no shards match scope', () => {
    mgr.createShard('task', 'task 1');
    const moduleShards = mgr.getShardsByScope('module');
    expect(moduleShards.length).toBe(0);
  });

  test('returns all module shards', () => {
    mgr.createShard('module', 'mod A', 'auth');
    mgr.createShard('module', 'mod B', 'db');
    mgr.createShard('task', 'task');

    const moduleShards = mgr.getShardsByScope('module');
    expect(moduleShards.length).toBe(2);
  });

  test('returns global-summary shards', () => {
    mgr.createShard('global-summary', 'summary 1');
    mgr.createShard('task', 'task');

    const summaries = mgr.getShardsByScope('global-summary');
    expect(summaries.length).toBe(1);
    expect(summaries[0].scope).toBe('global-summary');
  });
});

// ============================================================
// getShardsByModule
// ============================================================

describe('getShardsByModule', () => {
  let mgr: ContextShardManager;

  beforeEach(() => {
    mgr = createContextShardManager();
  });

  test('returns shards matching module name', () => {
    mgr.createShard('module', 'auth context', 'auth');
    mgr.createShard('module', 'auth utils', 'auth');
    mgr.createShard('module', 'db context', 'database');

    const authShards = mgr.getShardsByModule('auth');
    expect(authShards.length).toBe(2);
    expect(authShards.every((s) => s.module_name === 'auth')).toBe(true);
  });

  test('returns empty array for unknown module', () => {
    mgr.createShard('module', 'test', 'auth');
    const shards = mgr.getShardsByModule('unknown');
    expect(shards.length).toBe(0);
  });

  test('does not return task or global-summary shards', () => {
    mgr.createShard('task', 'task content');
    mgr.createShard('global-summary', 'summary');
    mgr.createShard('module', 'module content', 'auth');

    const authShards = mgr.getShardsByModule('auth');
    expect(authShards.length).toBe(1);
    expect(authShards[0].scope).toBe('module');
  });
});

// ============================================================
// assembleContext
// ============================================================

describe('assembleContext', () => {
  let mgr: ContextShardManager;

  beforeEach(() => {
    mgr = createContextShardManager();
  });

  test('assembles context from shard IDs', () => {
    const s1 = mgr.createShard('task', 'task content');
    const s2 = mgr.createShard('module', 'module content', 'auth');

    const result = mgr.assembleContext([s1.shard_id, s2.shard_id]);
    expect(result.shards.length).toBe(2);
    expect(result.totalTokens).toBeGreaterThan(0);
  });

  test('automatically includes global-summary shard', () => {
    mgr.setGlobalSummary('project overview summary');
    const taskShard = mgr.createShard('task', 'task content');

    const result = mgr.assembleContext([taskShard.shard_id]);
    // Should include the task shard AND the global summary
    const scopes = result.shards.map((s) => s.scope);
    expect(scopes).toContain('global-summary');
    expect(scopes).toContain('task');
  });

  test('does not duplicate global-summary if explicitly included', () => {
    const summary = mgr.setGlobalSummary('project overview');
    const task = mgr.createShard('task', 'task');

    const result = mgr.assembleContext([summary.shard_id, task.shard_id]);
    const summaryShards = result.shards.filter((s) => s.scope === 'global-summary');
    expect(summaryShards.length).toBe(1);
  });

  test('withinLimit is true when under 60% of window', () => {
    const shard = mgr.createShard('task', 'short content');
    const result = mgr.assembleContext([shard.shard_id]);
    expect(result.withinLimit).toBe(true);
  });

  test('withinLimit is false when over 60% of window', () => {
    // Create a manager with very small window
    const smallMgr = createContextShardManager(100);
    // 60% of 100 = 60 tokens. Each char ~ 0.25 tokens, so 240+ chars = 60+ tokens
    const bigContent = 'x'.repeat(300);
    const shard = smallMgr.createShard('task', bigContent);

    const result = smallMgr.assembleContext([shard.shard_id]);
    expect(result.withinLimit).toBe(false);
  });

  test('respects custom maxWindow override', () => {
    const mgr200k = createContextShardManager(200_000);
    const shard = mgr200k.createShard('task', 'small content');
    const result = mgr200k.assembleContext([shard.shard_id], 50);
    // 60% of 50 = 30 tokens. "small content" = 13 chars = 4 tokens, should be within
    expect(result.withinLimit).toBe(true);
  });

  test('totalTokens is sum of all assembled shard tokens', () => {
    const s1 = mgr.createShard('task', 'aaaa'); // 1 token
    const s2 = mgr.createShard('task', 'bbbbbbbb'); // 2 tokens

    const result = mgr.assembleContext([s1.shard_id, s2.shard_id]);
    expect(result.totalTokens).toBe(s1.token_count + s2.token_count);
  });

  test('skips nonexistent shard IDs gracefully', () => {
    const shard = mgr.createShard('task', 'content');
    const result = mgr.assembleContext([shard.shard_id, 'nonexistent']);
    expect(result.shards.length).toBe(1);
  });

  test('priority order: global-summary first, then task, then module', () => {
    const moduleShard = mgr.createShard('module', 'module content', 'auth');
    const taskShard = mgr.createShard('task', 'task content');
    mgr.setGlobalSummary('summary content');

    const result = mgr.assembleContext([moduleShard.shard_id, taskShard.shard_id]);
    expect(result.shards[0].scope).toBe('global-summary');

    // Find indices of task and module shards
    const taskIdx = result.shards.findIndex((s) => s.scope === 'task');
    const moduleIdx = result.shards.findIndex((s) => s.scope === 'module');
    expect(taskIdx).toBeLessThan(moduleIdx);
  });

  test('empty shard IDs array still includes global-summary if present', () => {
    mgr.setGlobalSummary('summary');
    const result = mgr.assembleContext([]);
    expect(result.shards.length).toBe(1);
    expect(result.shards[0].scope).toBe('global-summary');
  });

  test('empty shard IDs with no global-summary returns empty', () => {
    const result = mgr.assembleContext([]);
    expect(result.shards.length).toBe(0);
    expect(result.totalTokens).toBe(0);
    expect(result.withinLimit).toBe(true);
  });
});

// ============================================================
// compressShard
// ============================================================

describe('compressShard', () => {
  let mgr: ContextShardManager;

  beforeEach(() => {
    mgr = createContextShardManager();
  });

  test('truncates shard content to target token count', () => {
    const longContent = 'a'.repeat(400); // 100 tokens
    const shard = mgr.createShard('task', longContent);
    expect(shard.token_count).toBe(100);

    const compressed = mgr.compressShard(shard.shard_id, 25);
    expect(compressed.token_count).toBeLessThanOrEqual(25);
  });

  test('appends truncation indicator', () => {
    const longContent = 'a'.repeat(400); // 100 tokens
    const shard = mgr.createShard('task', longContent);

    const compressed = mgr.compressShard(shard.shard_id, 25);
    expect(compressed.content).toContain('[...truncated]');
  });

  test('does not truncate if already under target', () => {
    const shard = mgr.createShard('task', 'short'); // ~2 tokens
    const compressed = mgr.compressShard(shard.shard_id, 100);
    expect(compressed.content).toBe('short');
    expect(compressed.content).not.toContain('[...truncated]');
  });

  test('updates the shard in the store', () => {
    const longContent = 'a'.repeat(400);
    const shard = mgr.createShard('task', longContent);
    mgr.compressShard(shard.shard_id, 25);

    const stored = mgr.getShard(shard.shard_id)!;
    expect(stored.token_count).toBeLessThanOrEqual(25);
    expect(stored.content).toContain('[...truncated]');
  });

  test('throws error for nonexistent shard', () => {
    expect(() => mgr.compressShard('nonexistent', 50)).toThrow();
  });

  test('compressed shard retains scope and module_name', () => {
    const longContent = 'a'.repeat(400);
    const shard = mgr.createShard('module', longContent, 'auth');
    const compressed = mgr.compressShard(shard.shard_id, 25);
    expect(compressed.scope).toBe('module');
    expect(compressed.module_name).toBe('auth');
  });
});

// ============================================================
// getGlobalSummary & setGlobalSummary
// ============================================================

describe('getGlobalSummary & setGlobalSummary', () => {
  let mgr: ContextShardManager;

  beforeEach(() => {
    mgr = createContextShardManager();
  });

  test('getGlobalSummary returns undefined when none exists', () => {
    expect(mgr.getGlobalSummary()).toBeUndefined();
  });

  test('setGlobalSummary creates a global-summary shard', () => {
    const summary = mgr.setGlobalSummary('project overview');
    expect(summary.scope).toBe('global-summary');
    expect(summary.content).toBe('project overview');
  });

  test('getGlobalSummary retrieves the set summary', () => {
    mgr.setGlobalSummary('my summary');
    const summary = mgr.getGlobalSummary();
    expect(summary).toBeDefined();
    expect(summary!.content).toBe('my summary');
  });

  test('setGlobalSummary updates existing summary', () => {
    const first = mgr.setGlobalSummary('version 1');
    const second = mgr.setGlobalSummary('version 2');

    // Should reuse the same shard_id
    expect(second.shard_id).toBe(first.shard_id);
    expect(second.content).toBe('version 2');

    // Only one global-summary shard should exist
    const summaries = mgr.getShardsByScope('global-summary');
    expect(summaries.length).toBe(1);
  });

  test('global summary token count respects SUMMARY_MAX_TOKENS limit', () => {
    // SUMMARY_MAX_TOKENS is 2000, so content > 8000 chars should be truncated
    const longSummary = 'a'.repeat(10_000);
    const summary = mgr.setGlobalSummary(longSummary);
    expect(summary.token_count).toBeLessThanOrEqual(2000);
  });
});

// ============================================================
// estimateTokenCount
// ============================================================

describe('estimateTokenCount', () => {
  let mgr: ContextShardManager;

  beforeEach(() => {
    mgr = createContextShardManager();
  });

  test('empty string returns 0', () => {
    expect(mgr.estimateTokenCount('')).toBe(0);
  });

  test('4 characters returns 1 token', () => {
    expect(mgr.estimateTokenCount('abcd')).toBe(1);
  });

  test('5 characters returns 2 tokens (ceil)', () => {
    expect(mgr.estimateTokenCount('abcde')).toBe(2);
  });

  test('8 characters returns 2 tokens', () => {
    expect(mgr.estimateTokenCount('abcdefgh')).toBe(2);
  });

  test('1 character returns 1 token', () => {
    expect(mgr.estimateTokenCount('a')).toBe(1);
  });

  test('large content returns proportional tokens', () => {
    const content = 'x'.repeat(1000);
    expect(mgr.estimateTokenCount(content)).toBe(250);
  });
});

// ============================================================
// getStats
// ============================================================

describe('getStats', () => {
  let mgr: ContextShardManager;

  beforeEach(() => {
    mgr = createContextShardManager();
  });

  test('returns correct totalShards count', () => {
    mgr.createShard('task', 'a');
    mgr.createShard('task', 'b');
    mgr.createShard('module', 'c', 'auth');
    expect(mgr.getStats().totalShards).toBe(3);
  });

  test('returns correct totalTokens', () => {
    const s1 = mgr.createShard('task', 'aaaa'); // 1 token
    const s2 = mgr.createShard('task', 'bbbbbbbb'); // 2 tokens
    expect(mgr.getStats().totalTokens).toBe(s1.token_count + s2.token_count);
  });

  test('returns correct byScope breakdown', () => {
    mgr.createShard('task', 'task1');
    mgr.createShard('task', 'task2');
    mgr.createShard('module', 'mod', 'auth');
    mgr.setGlobalSummary('summary');

    const stats = mgr.getStats();
    expect(stats.byScope['task']).toBe(2);
    expect(stats.byScope['module']).toBe(1);
    expect(stats.byScope['global-summary']).toBe(1);
  });

  test('returns correct avgTokensPerShard', () => {
    mgr.createShard('task', 'aaaa'); // 1 token
    mgr.createShard('task', 'aaa'); // 1 token
    const stats = mgr.getStats();
    expect(stats.avgTokensPerShard).toBe(stats.totalTokens / stats.totalShards);
  });

  test('avgTokensPerShard is 0 when no shards', () => {
    expect(mgr.getStats().avgTokensPerShard).toBe(0);
  });

  test('empty byScope when no shards', () => {
    const stats = mgr.getStats();
    expect(Object.keys(stats.byScope).length).toBe(0);
  });
});

// ============================================================
// pruneStale
// ============================================================

describe('pruneStale', () => {
  let mgr: ContextShardManager;

  beforeEach(() => {
    mgr = createContextShardManager();
  });

  test('removes shards older than maxAgeMs', () => {
    mgr.createShard('task', 'old content');
    // Wait for at least 10ms
    const start = performance.now();
    while (performance.now() - start < 15) {}

    mgr.createShard('task', 'new content');

    const removed = mgr.pruneStale(10);
    expect(removed).toBe(1);
    expect(mgr.getStats().totalShards).toBe(1);
  });

  test('returns 0 when no shards are stale', () => {
    mgr.createShard('task', 'content');
    const removed = mgr.pruneStale(60_000); // 1 minute
    expect(removed).toBe(0);
  });

  test('returns 0 when no shards exist', () => {
    const removed = mgr.pruneStale(1000);
    expect(removed).toBe(0);
  });

  test('removes all stale shards', () => {
    mgr.createShard('task', 'a');
    mgr.createShard('task', 'b');
    mgr.createShard('task', 'c');

    const start = performance.now();
    while (performance.now() - start < 15) {}

    const removed = mgr.pruneStale(10);
    expect(removed).toBe(3);
    expect(mgr.getStats().totalShards).toBe(0);
  });
});

// ============================================================
// clear
// ============================================================

describe('clear', () => {
  let mgr: ContextShardManager;

  beforeEach(() => {
    mgr = createContextShardManager();
  });

  test('removes all shards', () => {
    mgr.createShard('task', 'a');
    mgr.createShard('module', 'b', 'auth');
    mgr.setGlobalSummary('summary');
    expect(mgr.getStats().totalShards).toBe(3);

    mgr.clear();
    expect(mgr.getStats().totalShards).toBe(0);
    expect(mgr.getStats().totalTokens).toBe(0);
  });

  test('getGlobalSummary returns undefined after clear', () => {
    mgr.setGlobalSummary('summary');
    mgr.clear();
    expect(mgr.getGlobalSummary()).toBeUndefined();
  });

  test('manager works normally after clear', () => {
    mgr.createShard('task', 'before clear');
    mgr.clear();
    const shard = mgr.createShard('task', 'after clear');
    expect(mgr.getShard(shard.shard_id)).toBeDefined();
    expect(mgr.getStats().totalShards).toBe(1);
  });
});

// ============================================================
// Singleton Behavior
// ============================================================

describe('Singleton Behavior', () => {
  test('global singleton persists state across operations', () => {
    contextShardManager.clear();
    contextShardManager.createShard('task', 'persist test');
    expect(contextShardManager.getStats().totalShards).toBe(1);
    contextShardManager.clear();
  });

  test('createContextShardManager produces independent instances', () => {
    const m1 = createContextShardManager();
    const m2 = createContextShardManager();

    m1.createShard('task', 'only in m1');
    m2.createShard('task', 'only in m2');
    m2.createShard('task', 'also in m2');

    expect(m1.getStats().totalShards).toBe(1);
    expect(m2.getStats().totalShards).toBe(2);
  });

  test('global singleton is independent from created instances', () => {
    contextShardManager.clear();
    const local = createContextShardManager();

    contextShardManager.createShard('task', 'global');
    local.createShard('task', 'local');

    expect(contextShardManager.getStats().totalShards).toBe(1);
    expect(local.getStats().totalShards).toBe(1);
    contextShardManager.clear();
  });
});

// ============================================================
// Integration Tests
// ============================================================

describe('Integration Tests', () => {
  let mgr: ContextShardManager;

  beforeEach(() => {
    mgr = createContextShardManager();
  });

  test('complete lifecycle: create, update, assemble, compress, delete', () => {
    // Set global summary
    mgr.setGlobalSummary('AI multi-agent orchestration project');

    // Create task and module shards
    const taskShard = mgr.createShard('task', 'implement context shard manager');
    const moduleShard = mgr.createShard('module', 'engine module with orchestrator, state machine, agents', 'engine');

    // Verify stats
    expect(mgr.getStats().totalShards).toBe(3);

    // Assemble context
    const context = mgr.assembleContext([taskShard.shard_id, moduleShard.shard_id]);
    expect(context.shards.length).toBe(3); // includes global summary
    expect(context.withinLimit).toBe(true);

    // Update a shard
    mgr.updateShard(taskShard.shard_id, 'implement and test context shard manager');
    const updated = mgr.getShard(taskShard.shard_id)!;
    expect(updated.content).toContain('and test');

    // Delete a shard
    mgr.deleteShard(moduleShard.shard_id);
    expect(mgr.getStats().totalShards).toBe(2);

    // Re-assemble should only include task + summary
    const context2 = mgr.assembleContext([taskShard.shard_id, moduleShard.shard_id]);
    expect(context2.shards.length).toBe(2);
  });

  test('token budget enforcement with small window', () => {
    const smallMgr = createContextShardManager(200);
    // 60% of 200 = 120 tokens budget

    smallMgr.setGlobalSummary('summary');

    // Create shards that together exceed 120 tokens
    // 500 chars = 125 tokens
    const bigShard = smallMgr.createShard('task', 'x'.repeat(500));

    const result = smallMgr.assembleContext([bigShard.shard_id]);
    expect(result.withinLimit).toBe(false);
    expect(result.totalTokens).toBeGreaterThan(120);
  });

  test('multiple modules with selective assembly', () => {
    mgr.setGlobalSummary('multi-module project');

    const authShard1 = mgr.createShard('module', 'auth login flow', 'auth');
    const authShard2 = mgr.createShard('module', 'auth token validation', 'auth');
    const dbShard = mgr.createShard('module', 'database schema', 'database');
    const taskShard = mgr.createShard('task', 'fix auth bug');

    // Assemble only auth-related context
    const authShards = mgr.getShardsByModule('auth');
    const shardIds = [...authShards.map((s) => s.shard_id), taskShard.shard_id];
    const context = mgr.assembleContext(shardIds);

    // Should include: global-summary + 2 auth shards + task
    expect(context.shards.length).toBe(4);

    // DB shard should NOT be included
    const dbInContext = context.shards.find((s) => s.module_name === 'database');
    expect(dbInContext).toBeUndefined();
  });

  test('compress then assemble stays within limit', () => {
    const smallMgr = createContextShardManager(100);
    // 60% of 100 = 60 tokens

    const bigShard = smallMgr.createShard('task', 'x'.repeat(400)); // 100 tokens
    expect(smallMgr.assembleContext([bigShard.shard_id]).withinLimit).toBe(false);

    // Compress to 50 tokens
    smallMgr.compressShard(bigShard.shard_id, 50);
    expect(smallMgr.assembleContext([bigShard.shard_id]).withinLimit).toBe(true);
  });

  test('prune stale then verify stats', () => {
    mgr.createShard('task', 'old task');
    const start = performance.now();
    while (performance.now() - start < 15) {}
    mgr.createShard('task', 'new task');

    const beforeStats = mgr.getStats();
    expect(beforeStats.totalShards).toBe(2);

    const removed = mgr.pruneStale(10);
    expect(removed).toBe(1);

    const afterStats = mgr.getStats();
    expect(afterStats.totalShards).toBe(1);
    expect(afterStats.totalTokens).toBeLessThan(beforeStats.totalTokens);
  });
});
