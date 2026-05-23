/**
 * Skills Bridge — Response Schema Contract Tests
 *
 * Verifies that the skills bridge endpoints (skills_list, skills_search,
 * skills_execute) return the expected JSON response shapes.
 *
 * Schema-only contracts: checks property presence and types.
 */
import { describe, test, expect } from 'bun:test';
import type { MCPServerDeps } from '../../src/mcp/index.js';

// ── Helpers ──

function createMockDeps(overrides: Partial<MCPServerDeps> = {}): MCPServerDeps {
  return {
    skillLoader: {
      getAll: () => [
        { id: 's1', name: 'Code Review', category: 'development' },
        { id: 's2', name: 'Data Analysis', category: 'data' },
      ],
      search: (_task: string) => [{ id: 's1', name: 'Code Review', score: 0.9 }],
    } as any,
    skillController: {
      execute: () => Promise.resolve({ success: true, output: 'Skill executed' }),
    } as any,
    ...overrides,
  };
}

async function callTool(
  name: string,
  args: Record<string, unknown> = {},
  deps?: MCPServerDeps,
): Promise<Record<string, unknown>> {
  const mod = await import('../../src/mcp/index.js');
  const content = await mod.handleToolCall(name, args, deps);
  return JSON.parse(content.content[0].text) as Record<string, unknown>;
}

// ── Contract Tests ──

describe('skills bridge — response schema contract', () => {
  test('skills_list response has total (number) and skills (array) properties', async () => {
    const deps = createMockDeps();
    const result = await callTool('skills_list', {}, deps);

    expect(result).toHaveProperty('total');
    expect(typeof result.total).toBe('number');
    expect(result).toHaveProperty('skills');
    expect(Array.isArray(result.skills)).toBe(true);
  });

  test('skills_list each skill entry has id, name, and category of correct types', async () => {
    const deps = createMockDeps();
    const result = await callTool('skills_list', {}, deps);
    const skills = result.skills as Array<Record<string, unknown>>;

    for (const skill of skills) {
      expect(skill).toHaveProperty('id');
      expect(typeof skill.id).toBe('string');
      expect(skill).toHaveProperty('name');
      expect(typeof skill.name).toBe('string');
      expect(skill).toHaveProperty('category');
      expect(typeof skill.category).toBe('string');
    }
  });

  test('skills_search response has matches (array), task (string) properties', async () => {
    const deps = createMockDeps();
    const result = await callTool('skills_search', { task: 'review code' }, deps);

    expect(result).toHaveProperty('matches');
    expect(Array.isArray(result.matches)).toBe(true);
    expect(result).toHaveProperty('task');
    expect(typeof result.task).toBe('string');
  });

  test('skills_search matches each have id, name, and score of correct types', async () => {
    const deps = createMockDeps();
    const result = await callTool('skills_search', { task: 'review code' }, deps);
    const matches = result.matches as Array<Record<string, unknown>>;

    for (const match of matches) {
      expect(match).toHaveProperty('id');
      expect(typeof match.id).toBe('string');
      expect(match).toHaveProperty('name');
      expect(typeof match.name).toBe('string');
      expect(match).toHaveProperty('score');
      expect(typeof match.score).toBe('number');
    }
  });

  test('skills_execute response has skillId (string) and result (object) properties', async () => {
    const deps = createMockDeps();
    const result = await callTool(
      'skills_execute',
      { skillId: 's1', input: { file: 'test.ts' } },
      deps,
    );

    expect(result).toHaveProperty('skillId');
    expect(typeof result.skillId).toBe('string');
    expect(result).toHaveProperty('result');
    expect(typeof result.result).toBe('object');
    expect(result.result).not.toBeNull();
  });

  test('skills_execute result has success (boolean) property', async () => {
    const deps = createMockDeps();
    const result = await callTool(
      'skills_execute',
      { skillId: 's1', input: { file: 'test.ts' } },
      deps,
    );
    const res = result.result as Record<string, unknown>;

    expect(res).toHaveProperty('success');
    expect(typeof res.success).toBe('boolean');
  });

  test('skills_list returns info (string) when skillLoader not connected', async () => {
    const result = await callTool('skills_list', {});

    expect(result).toHaveProperty('info');
    expect(typeof result.info).toBe('string');
  });

  test('skills_execute returns info (string) when skillController not connected', async () => {
    const result = await callTool('skills_execute', { skillId: 's1', input: {} });

    expect(result).toHaveProperty('info');
    expect(typeof result.info).toBe('string');
  });
});
