import { describe, test, expect, beforeEach } from 'bun:test';
import { ContextManager } from '../../src/core/context-manager.js';

describe('context manager', () => {
  let cm: ContextManager;

  beforeEach(() => {
    cm = new ContextManager();
  });

  test('creates shared space with id', async () => {
    const spaceId = await cm.createSharedSpace({ name: 'test' });
    expect(spaceId).toBeDefined();
    expect(typeof spaceId).toBe('string');
    expect(spaceId.length).toBeGreaterThan(0);
  });

  test('retrieves created shared space', async () => {
    const spaceId = await cm.createSharedSpace({ name: 'test' });
    const space = await cm.getSharedSpace(spaceId);
    expect(space).toBeDefined();
    expect(space!.shared_space_id).toBe(spaceId);
  });

  test('returns null for non-existent space', async () => {
    const space = await cm.getSharedSpace('non-existent-id');
    expect(space).toBeNull();
  });

  test('different calls create different space ids', async () => {
    const id1 = await cm.createSharedSpace({});
    const id2 = await cm.createSharedSpace({});
    expect(id1).not.toBe(id2);
  });

  test('space stores metadata', async () => {
    const metadata = { project: 'test', version: 1 };
    const spaceId = await cm.createSharedSpace(metadata);
    const space = await cm.getSharedSpace(spaceId);
    expect(space!.metadata).toEqual(metadata);
  });
});
