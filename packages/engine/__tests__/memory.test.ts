/**
 * Honeycomb v2 - Memory System Tests
 *
 * Tests for the three-layer memory system:
 * - WorkingMemory: volatile in-memory store with TTL
 * - ProjectMemory: SQLite-persisted project-scoped knowledge
 * - OrgMemory: SQLite-persisted cross-project experience
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { rmSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WorkingMemory,
  ProjectMemory,
  OrgMemory,
  createWorkingMemory,
  createProjectMemory,
  createOrgMemory,
  workingMemory,
  type ProjectMemoryEntry,
  type OrgMemoryEntry,
} from '../src/memory.js';

describe('Memory System', () => {

  // ============================================================
  // WorkingMemory Tests
  // ============================================================

  describe('WorkingMemory', () => {
    let wm: WorkingMemory;

    beforeEach(() => {
      wm = new WorkingMemory();
    });

    describe('Basic Operations', () => {
      it('should store and retrieve values', () => {
        wm.set('test-key', 'test-value');
        expect(wm.get('test-key')).toBe('test-value');
      });

      it('should store complex objects', () => {
        const obj = { foo: 'bar', num: 42, nested: { value: true } };
        wm.set('obj-key', obj);
        expect(wm.get('obj-key')).toEqual(obj);
      });

      it('should return undefined for non-existent keys', () => {
        expect(wm.get('non-existent')).toBeUndefined();
      });

      it('should overwrite existing values', () => {
        wm.set('key', 'first');
        wm.set('key', 'second');
        expect(wm.get('key')).toBe('second');
      });
    });

    describe('TTL (Time-To-Live) Support', () => {
      it('should respect TTL expiration', async () => {
        wm.set('ttl-key', 'value', 50); // 50ms TTL
        expect(wm.get('ttl-key')).toBe('value');

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 60));
        expect(wm.get('ttl-key')).toBeUndefined();
      });

      it('should not expire entries without TTL', async () => {
        wm.set('no-ttl-key', 'value');
        await new Promise(resolve => setTimeout(resolve, 60));
        expect(wm.get('no-ttl-key')).toBe('value');
      });

      it('should update TTL on set', async () => {
        wm.set('key', 'value1', 50);
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(wm.get('key')).toBe('value1');

        // Update with new TTL
        wm.set('key', 'value2', 100);
        await new Promise(resolve => setTimeout(resolve, 40));
        // Original TTL would have expired, but new TTL is still valid
        expect(wm.get('key')).toBe('value2');
      });
    });

    describe('has() Method', () => {
      it('should return true for existing keys', () => {
        wm.set('exists', 'value');
        expect(wm.has('exists')).toBe(true);
      });

      it('should return false for non-existent keys', () => {
        expect(wm.has('not-exists')).toBe(false);
      });

      it('should return false for expired keys', async () => {
        wm.set('expired', 'value', 50);
        await new Promise(resolve => setTimeout(resolve, 60));
        expect(wm.has('expired')).toBe(false);
      });
    });

    describe('delete() Method', () => {
      it('should delete existing keys', () => {
        wm.set('delete-me', 'value');
        expect(wm.has('delete-me')).toBe(true);
        expect(wm.delete('delete-me')).toBe(true);
        expect(wm.has('delete-me')).toBe(false);
      });

      it('should return false for non-existent keys', () => {
        expect(wm.delete('not-exists')).toBe(false);
      });
    });

    describe('clear() Method', () => {
      it('should clear all entries', () => {
        wm.set('key1', 'value1');
        wm.set('key2', 'value2');
        wm.set('key3', 'value3');

        expect(wm.size).toBe(3);
        wm.clear();
        expect(wm.size).toBe(0);
        expect(wm.get('key1')).toBeUndefined();
      });
    });

    describe('getAll() Method', () => {
      it('should return all non-expired entries', () => {
        wm.set('key1', 'value1');
        wm.set('key2', 'value2');
        wm.set('key3', 'value3');

        const all = wm.getAll();
        expect(all).toEqual({
          key1: 'value1',
          key2: 'value2',
          key3: 'value3',
        });
      });

      it('should not include expired entries', async () => {
        wm.set('permanent', 'value');
        wm.set('temporary', 'value', 50);

        await new Promise(resolve => setTimeout(resolve, 60));
        const all = wm.getAll();
        expect(all).toEqual({ permanent: 'value' });
      });
    });

    describe('size Property', () => {
      it('should return the count of non-expired entries', () => {
        expect(wm.size).toBe(0);
        wm.set('key1', 'value1');
        expect(wm.size).toBe(1);
        wm.set('key2', 'value2');
        expect(wm.size).toBe(2);
      });

      it('should not count expired entries', async () => {
        wm.set('permanent', 'value');
        wm.set('temporary', 'value', 50);

        await new Promise(resolve => setTimeout(resolve, 60));
        expect(wm.size).toBe(1);
      });
    });

    describe('prune() Method', () => {
      it('should remove expired entries and return count', async () => {
        wm.set('perm1', 'value1');
        wm.set('temp1', 'value1', 50);
        wm.set('temp2', 'value2', 50);

        await new Promise(resolve => setTimeout(resolve, 60));
        const pruned = wm.prune();
        expect(pruned).toBe(2);
        expect(wm.size).toBe(1);
      });

      it('should return 0 when no expired entries', () => {
        wm.set('key1', 'value1');
        wm.set('key2', 'value2');
        const pruned = wm.prune();
        expect(pruned).toBe(0);
      });
    });
  });

  describe('WorkingMemory Factory & Singleton', () => {
    it('createWorkingMemory should create a new instance', () => {
      const wm = createWorkingMemory();
      expect(wm).toBeInstanceOf(WorkingMemory);
      expect(wm.size).toBe(0);
    });

    it('workingMemory singleton should be globally accessible', () => {
      workingMemory.set('test', 'value');
      expect(workingMemory.get('test')).toBe('value');
      workingMemory.clear();
    });
  });

  // ============================================================
  // ProjectMemory Tests
  // ============================================================

  describe('ProjectMemory', () => {
    let tempDir: string;
    let dbPath: string;
    let pm: ProjectMemory;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'hc-memory-test-'));
      dbPath = join(tempDir, 'test.db');
      pm = new ProjectMemory(dbPath);
    });

    afterEach(() => {
      try {
        pm.close();
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });

    describe('Basic Operations', () => {
      it('should store and retrieve entries', () => {
        pm.store('proj-1', 'decisions', 'arch-choice', 'Use PostgreSQL', {
          reason: 'ACID compliance',
        });

        const entry = pm.retrieve('proj-1', 'decisions', 'arch-choice');
        expect(entry).not.toBeNull();
        expect(entry?.value).toBe('Use PostgreSQL');
        expect(entry?.metadata).toEqual({ reason: 'ACID compliance' });
      });

      it('should update existing entries', () => {
        pm.store('proj-1', 'decisions', 'arch-choice', 'Use PostgreSQL');
        pm.store('proj-1', 'decisions', 'arch-choice', 'Use MySQL', {
          reason: 'Better replication',
        });

        const entry = pm.retrieve('proj-1', 'decisions', 'arch-choice');
        expect(entry?.value).toBe('Use MySQL');
        expect(entry?.metadata).toEqual({ reason: 'Better replication' });
      });

      it('should return null for non-existent entries', () => {
        const entry = pm.retrieve('non-proj', 'non-cat', 'non-key');
        expect(entry).toBeNull();
      });
    });

    describe('listByCategory()', () => {
      it('should return all entries in a category', () => {
        pm.store('proj-1', 'decisions', 'd1', 'Decision 1');
        pm.store('proj-1', 'decisions', 'd2', 'Decision 2');
        pm.store('proj-1', 'research', 'r1', 'Research 1');

        const decisions = pm.listByCategory('proj-1', 'decisions');
        expect(decisions).toHaveLength(2);
        expect(decisions.map(d => d.key)).toEqual(['d1', 'd2']);
      });

      it('should return empty array for non-existent category', () => {
        const results = pm.listByCategory('proj-1', 'non-existent');
        expect(results).toEqual([]);
      });

      it('should respect project scoping', () => {
        pm.store('proj-1', 'decisions', 'd1', 'Decision 1');
        pm.store('proj-2', 'decisions', 'd1', 'Different Decision 1');

        const proj1Decisions = pm.listByCategory('proj-1', 'decisions');
        const proj2Decisions = pm.listByCategory('proj-2', 'decisions');

        expect(proj1Decisions).toHaveLength(1);
        expect(proj2Decisions).toHaveLength(1);
        expect(proj1Decisions[0].value).not.toEqual(proj2Decisions[0].value);
      });
    });

    describe('search()', () => {
      it('should search across key, value, and category', () => {
        pm.store('proj-1', 'decisions', 'database', 'Use PostgreSQL');
        pm.store('proj-1', 'research', 'db-benchmark', 'PostgreSQL benchmark results');

        const results = pm.search('proj-1', 'postgres');
        expect(results.length).toBeGreaterThan(0);
      });

      it('should return empty array for no matches', () => {
        pm.store('proj-1', 'decisions', 'key', 'value');
        const results = pm.search('proj-1', 'non-existent-query');
        expect(results).toEqual([]);
      });
    });

    describe('delete()', () => {
      it('should delete specific entries', () => {
        pm.store('proj-1', 'decisions', 'd1', 'Decision 1');
        expect(pm.retrieve('proj-1', 'decisions', 'd1')).not.toBeNull();

        const deleted = pm.delete('proj-1', 'decisions', 'd1');
        expect(deleted).toBe(true);
        expect(pm.retrieve('proj-1', 'decisions', 'd1')).toBeNull();
      });

      it('should return false for non-existent entries', () => {
        const deleted = pm.delete('non-proj', 'non-cat', 'non-key');
        expect(deleted).toBe(false);
      });
    });

    describe('deleteByProject()', () => {
      it('should delete all entries for a project', () => {
        pm.store('proj-1', 'decisions', 'd1', 'Decision 1');
        pm.store('proj-1', 'research', 'r1', 'Research 1');
        pm.store('proj-2', 'decisions', 'd1', 'Decision 2');

        const count = pm.deleteByProject('proj-1');
        expect(count).toBe(2);

        expect(pm.retrieve('proj-1', 'decisions', 'd1')).toBeNull();
        expect(pm.retrieve('proj-2', 'decisions', 'd1')).not.toBeNull();
      });

      it('should return 0 for non-existent project', () => {
        const count = pm.deleteByProject('non-existent');
        expect(count).toBe(0);
      });
    });

    describe('Entry Structure', () => {
      it('should include all required fields', () => {
        pm.store('proj-1', 'cat', 'key', 'value', { meta: 'data' });
        const entry = pm.retrieve('proj-1', 'cat', 'key');

        expect(entry).toMatchObject({
          project_id: 'proj-1',
          category: 'cat',
          key: 'key',
          value: 'value',
          metadata: { meta: 'data' },
        });

        expect(entry?.id).toBeTruthy();
        expect(typeof entry?.created_at).toBe('number');
        expect(typeof entry?.updated_at).toBe('number');
      });

      it('should handle malformed metadata gracefully', () => {
        // Insert row with invalid JSON metadata directly
        const db = pm as any;
        db.stmts.upsert.run({
          $id: 'test-id',
          $project_id: 'proj-1',
          $category: 'cat',
          $key: 'key',
          $value: 'value',
          $metadata: 'invalid-json{',
          $created_at: Date.now(),
          $updated_at: Date.now(),
        });

        const entry = pm.retrieve('proj-1', 'cat', 'key');
        expect(entry).not.toBeNull();
        expect(entry?.metadata).toEqual({});
      });
    });

    describe('close()', () => {
      it('should close the database connection', () => {
        const closeTempDir = mkdtempSync(join(tmpdir(), 'hc-close-test-'));
        const closeDbPath = join(closeTempDir, 'test.db');
        try {
          const newPm = new ProjectMemory(closeDbPath);
          expect(() => newPm.close()).not.toThrow();
        } finally {
          rmSync(closeTempDir, { recursive: true, force: true });
        }
      });
    });
  });

  describe('ProjectMemory Factory', () => {
    it('createProjectMemory should create a new instance', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'hc-memory-factory-'));
      const dbPath = join(tempDir, 'test.db');
      try {
        const pm = createProjectMemory(dbPath);
        expect(pm).toBeInstanceOf(ProjectMemory);
        pm.close();
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  // ============================================================
  // OrgMemory Tests
  // ============================================================

  describe('OrgMemory', () => {
    let tempDir: string;
    let dbPath: string;
    let om: OrgMemory;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'hc-org-test-'));
      dbPath = join(tempDir, 'test.db');
      om = new OrgMemory(dbPath);
    });

    afterEach(() => {
      try {
        om.close();
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });

    describe('Basic Operations', () => {
      it('should store and retrieve entries', () => {
        om.store('patterns', 'retry-pattern', 'Exponential backoff', 'proj-1', 0.8, ['reliability']);

        const entry = om.retrieve('patterns', 'retry-pattern');
        expect(entry).not.toBeNull();
        expect(entry?.value).toBe('Exponential backoff');
        expect(entry?.source_project).toBe('proj-1');
        expect(entry?.confidence).toBe(0.8);
        expect(entry?.tags).toEqual(['reliability']);
      });

      it('should update existing entries', () => {
        om.store('patterns', 'retry', 'Backoff v1', 'proj-1', 0.5);
        om.store('patterns', 'retry', 'Backoff v2', 'proj-2', 0.9, ['updated']);

        const entry = om.retrieve('patterns', 'retry');
        expect(entry?.value).toBe('Backoff v2');
        expect(entry?.source_project).toBe('proj-2');
        expect(entry?.confidence).toBe(0.9);
      });

      it('should return null for non-existent entries', () => {
        const entry = om.retrieve('non-cat', 'non-key');
        expect(entry).toBeNull();
      });
    });

    describe('Confidence Clamping', () => {
      it('should clamp confidence to 0-1 range', () => {
        om.store('cat', 'key1', 'value1', 'proj-1', -1);
        om.store('cat', 'key2', 'value2', 'proj-1', 2);
        om.store('cat', 'key3', 'value3', 'proj-1', 0.5);

        expect(om.retrieve('cat', 'key1')?.confidence).toBe(0);
        expect(om.retrieve('cat', 'key2')?.confidence).toBe(1);
        expect(om.retrieve('cat', 'key3')?.confidence).toBe(0.5);
      });

      it('should clamp confidence in updateConfidence', () => {
        om.store('cat', 'key', 'value', 'proj-1', 0.5);

        expect(om.updateConfidence('cat', 'key', -10)).toBe(true);
        expect(om.retrieve('cat', 'key')?.confidence).toBe(0);

        expect(om.updateConfidence('cat', 'key', 100)).toBe(true);
        expect(om.retrieve('cat', 'key')?.confidence).toBe(1);
      });
    });

    describe('listByCategory()', () => {
      it('should return entries ordered by confidence', () => {
        om.store('patterns', 'p1', 'Pattern 1', 'proj-1', 0.5);
        om.store('patterns', 'p2', 'Pattern 2', 'proj-1', 0.9);
        om.store('patterns', 'p3', 'Pattern 3', 'proj-1', 0.7);

        const results = om.listByCategory('patterns');
        expect(results).toHaveLength(3);
        expect(results[0].confidence).toBe(0.9);
        expect(results[1].confidence).toBe(0.7);
        expect(results[2].confidence).toBe(0.5);
      });

      it('should return empty array for non-existent category', () => {
        const results = om.listByCategory('non-existent');
        expect(results).toEqual([]);
      });
    });

    describe('searchByTags()', () => {
      beforeEach(() => {
        om.store('cat', 'key1', 'Value 1', 'proj-1', 0.5, ['tag-a', 'tag-b']);
        om.store('cat', 'key2', 'Value 2', 'proj-1', 0.5, ['tag-c', 'tag-d']);
        om.store('cat', 'key3', 'Value 3', 'proj-1', 0.5, ['tag-a', 'tag-c']);
      });

      it('should search by single tag', () => {
        const results = om.searchByTags(['tag-a']);
        expect(results.length).toBeGreaterThan(0);
        const keys = results.map(r => r.key);
        expect(keys).toContain('key1');
        expect(keys).toContain('key3');
      });

      it('should search by multiple tags (OR logic)', () => {
        const results = om.searchByTags(['tag-b', 'tag-c']);
        const keys = results.map(r => r.key);
        expect(keys).toContain('key1');
        expect(keys).toContain('key2');
        expect(keys).toContain('key3');
      });

      it('should return empty array for empty tags', () => {
        const results = om.searchByTags([]);
        expect(results).toEqual([]);
      });

      it('should return empty array for non-matching tags', () => {
        const results = om.searchByTags(['non-existent']);
        expect(results).toEqual([]);
      });
    });

    describe('getHighConfidence()', () => {
      beforeEach(() => {
        om.store('cat1', 'key1', 'Value 1', 'proj-1', 0.3);
        om.store('cat1', 'key2', 'Value 2', 'proj-1', 0.7);
        om.store('cat2', 'key3', 'Value 3', 'proj-1', 0.9);
        om.store('cat2', 'key4', 'Value 4', 'proj-1', 0.95);
      });

      it('should return entries above confidence threshold', () => {
        const results = om.getHighConfidence(0.8);
        expect(results.length).toBe(2);
        expect(results.every(r => (r.confidence ?? 0) >= 0.8)).toBe(true);
      });

      it('should respect limit parameter', () => {
        const results = om.getHighConfidence(0.5, 2);
        expect(results.length).toBeLessThanOrEqual(2);
      });

      it('should order by confidence descending', () => {
        const results = om.getHighConfidence(0.5);
        const confidences = results.map(r => r.confidence);
        for (let i = 1; i < confidences.length; i++) {
          expect(confidences[i]!).toBeLessThanOrEqual(confidences[i - 1]!);
        }
      });
    });

    describe('updateConfidence()', () => {
      it('should update confidence of existing entry', () => {
        om.store('cat', 'key', 'value', 'proj-1', 0.5);

        // Wait a bit to ensure different timestamp
        const startTime = Date.now();
        while (Date.now() === startTime) {
          // spin until time advances
        }

        const updated = om.updateConfidence('cat', 'key', 0.9);
        expect(updated).toBe(true);

        const entry = om.retrieve('cat', 'key');
        expect(entry?.confidence).toBe(0.9);
        expect(entry?.updated_at).toBeGreaterThanOrEqual(startTime);
      });

      it('should return false for non-existent entry', () => {
        const updated = om.updateConfidence('non-cat', 'non-key', 0.9);
        expect(updated).toBe(false);
      });
    });

    describe('delete()', () => {
      it('should delete specific entries', () => {
        om.store('cat', 'key', 'value', 'proj-1', 0.5);
        expect(om.retrieve('cat', 'key')).not.toBeNull();

        const deleted = om.delete('cat', 'key');
        expect(deleted).toBe(true);
        expect(om.retrieve('cat', 'key')).toBeNull();
      });

      it('should return false for non-existent entries', () => {
        const deleted = om.delete('non-cat', 'non-key');
        expect(deleted).toBe(false);
      });
    });

    describe('Entry Structure', () => {
      it('should include all required fields', () => {
        om.store('cat', 'key', 'value', 'proj-1', 0.75, ['tag1', 'tag2']);
        const entry = om.retrieve('cat', 'key');

        expect(entry).toMatchObject({
          category: 'cat',
          key: 'key',
          value: 'value',
          source_project: 'proj-1',
          confidence: 0.75,
          tags: ['tag1', 'tag2'],
        });

        expect(entry?.id).toBeTruthy();
        expect(typeof entry?.created_at).toBe('number');
        expect(typeof entry?.updated_at).toBe('number');
      });

      it('should handle malformed tags gracefully', () => {
        // Insert row with invalid JSON tags directly
        const db = om as any;
        db.stmts.upsert.run({
          $id: 'test-id',
          $category: 'cat',
          $key: 'key',
          $value: 'value',
          $source_project: 'proj-1',
          $confidence: 0.5,
          $tags: 'invalid-json[',
          $created_at: Date.now(),
          $updated_at: Date.now(),
        });

        const entry = om.retrieve('cat', 'key');
        expect(entry).not.toBeNull();
        expect(entry?.tags).toEqual([]);
      });
    });

    describe('close()', () => {
      it('should close the database connection', () => {
        const closeTempDir = mkdtempSync(join(tmpdir(), 'hc-org-close-test-'));
        const closeDbPath = join(closeTempDir, 'test.db');
        try {
          const newOm = new OrgMemory(closeDbPath);
          expect(() => newOm.close()).not.toThrow();
        } finally {
          rmSync(closeTempDir, { recursive: true, force: true });
        }
      });
    });
  });

  describe('OrgMemory Factory', () => {
    it('createOrgMemory should create a new instance', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'hc-org-factory-'));
      const dbPath = join(tempDir, 'test.db');
      try {
        const om = createOrgMemory(dbPath);
        expect(om).toBeInstanceOf(OrgMemory);
        om.close();
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  // ============================================================
  // Integration Tests
  // ============================================================

  describe('Memory System Integration', () => {
    it('should support typical workflow across memory layers', () => {
      // Working memory for ephemeral state
      const wm = createWorkingMemory();
      wm.set('current-task', 'analyze-requirements');

      // Project memory for project-scoped knowledge
      const tempDir1 = mkdtempSync(join(tmpdir(), 'hc-integration-proj-'));
      const tempDir2 = mkdtempSync(join(tmpdir(), 'hc-integration-org-'));
      const DB1 = join(tempDir1, 'test.db');
      const DB2 = join(tempDir2, 'test.db');

      try {
        const pm = createProjectMemory(DB1);
        const om = createOrgMemory(DB2);

        // Store project decisions
        pm.store('proj-1', 'decisions', 'database', 'PostgreSQL', {
          reason: 'ACID compliance',
        });

        // Store learned patterns
        om.store('patterns', 'retry-success', 'Exponential backoff works best', 'proj-1', 0.9);

        // Retrieve and use knowledge
        const dbDecision = pm.retrieve('proj-1', 'decisions', 'database');
        expect(dbDecision?.value).toBe('PostgreSQL');

        const retryPattern = om.retrieve('patterns', 'retry-success');
        expect(retryPattern?.confidence).toBeGreaterThan(0.8);

        pm.close();
        om.close();
      } finally {
        if (existsSync(DB1)) rmSync(tempDir1, { recursive: true, force: true });
        if (existsSync(DB2)) rmSync(tempDir2, { recursive: true, force: true });
      }
    });
  });
});
