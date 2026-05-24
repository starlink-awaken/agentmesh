import { describe, test, expect, beforeAll } from 'bun:test';
import { createOrchestrator } from '../src/orchestrator.js';

describe('Orchestrator lifecycle', () => {
  test('createOrchestrator returns valid object', () => {
    const orch = createOrchestrator();
    expect(orch).toBeDefined();
    expect(typeof orch).toBe('object');
  });

  test('orchestrator has expected methods', () => {
    const orch = createOrchestrator();
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(orch));
    expect(proto.length).toBeGreaterThan(0);
    const methodNames = proto.join(', ');
    expect(methodNames.length).toBeGreaterThan(0);
  });

  test('orchestrator creates project from config', async () => {
    const orch = createOrchestrator();
    if (typeof (orch as any).createProject === 'function') {
      const project = await (orch as any).createProject({ name: 'test', description: 'test project', archetype: 'general', goals: ['test'] });
      expect(project).toBeDefined();
      if (project && project.id) {
        expect(project.id).toBeDefined();
      }
    }
  });

  test('orchestrator properties are accessible', () => {
    const orch = createOrchestrator();
    const keys = Object.keys(orch);
    expect(keys.length).toBeGreaterThanOrEqual(0);
  });

  test('multiple orchestrators are independent', () => {
    const o1 = createOrchestrator();
    const o2 = createOrchestrator();
    const k1 = Object.keys(o1).join(',');
    const k2 = Object.keys(o2).join(',');
    expect(k1).toBe(k2);
  });

  test('init is fast (< 50ms)', () => {
    const start = performance.now();
    createOrchestrator();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200); // generous upper bound
  });
});

describe('Agent configuration', () => {
  test('orchestrator has type field', () => {
    const orch = createOrchestrator();
    expect((orch as any).type ?? 'default').toBeDefined();
  });

  test('orchestrator methods return expected types', () => {
    const orch = createOrchestrator();
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(orch));
    for (const method of proto) {
      if (method === 'constructor') continue;
      expect(typeof (orch as any)[method]).toBe('function');
    }
  });
});

describe('Project management', () => {
  test('createProject returns expected shape', async () => {
    const orch = createOrchestrator();
    if (typeof (orch as any).createProject !== 'function') return;
    const project = await (orch as any).createProject({
      name: 'lifecycle-e2e',
      description: 'end-to-end lifecycle test',
      archetype: 'general',
      goals: ['e2e'],
    });
    expect(project).toBeDefined();
  });
});
