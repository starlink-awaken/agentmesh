/**
 * Error Format Consistency — Contract Tests
 *
 * Verifies that all bridge endpoints follow a consistent error/fallback schema:
 * - Successful responses: contain result fields
 * - Missing dependency fallbacks: { info: string }
 * - Operation failures: { error: string }
 *
 * Also verifies system_health and system_metrics response shapes.
 */
import { describe, test, expect } from 'bun:test';
import type { MCPServerDeps } from '../../src/mcp/index.js';

// ── Helpers ──

function createMockDeps(overrides: Partial<MCPServerDeps> = {}): MCPServerDeps {
  return {
    discoverer: {
      discoverAll: () => Promise.resolve([]),
      anyAlive: () => Promise.resolve(true),
      refresh: () => {},
    } as any,
    registry: {
      chat: () =>
        Promise.resolve({
          id: 'resp-1',
          model: 'gpt-4',
          content: 'Hello',
          finishReason: 'stop',
        }),
      getAll: () => [],
      refresh: () => {},
    } as any,
    scheduler: {
      selectModel: () =>
        Promise.resolve({
          model: { id: 'gpt-4', provider: 'openai', capabilities: ['chat'] } as any,
          providerName: 'openai',
          confidence: 0.95,
          reasoning: 'Best available model',
        }),
    } as any,
    taskManager: {
      createTask: () => Promise.resolve({ id: 'task-mock-001', status: 'pending' }),
      getTask: () => undefined,
      getAllTasks: () => [],
    } as any,
    skillLoader: {
      getAll: () => [],
      search: () => [],
    } as any,
    skillController: {
      execute: () => Promise.resolve({ success: true }),
    } as any,
    metricsCollector: {
      snapshot: () => ({
        counters: { requests: 100 },
        gauges: { memory_mb: 512 },
        timers: {
          avg_latency: {
            count: 10,
            min: 50,
            max: 500,
            avg: 250,
            p50: 200,
            p95: 450,
            p99: 490,
          },
        },
        histograms: {},
        timestamp: 1234567890,
      }),
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

describe('error format consistency — contract', () => {
  test('models_list returns { error: string } when discoverAll throws', async () => {
    const deps = createMockDeps({
      discoverer: { discoverAll: () => Promise.reject(new Error('Discovery failed')) } as any,
    });
    const result = await callTool('models_list', {}, deps);

    expect(result).toHaveProperty('error');
    expect(typeof result.error).toBe('string');
    expect(result.error).toBe('Discovery failed');
  });

  test('models_chat returns { error: string } when registry.chat throws', async () => {
    const deps = createMockDeps({
      registry: { chat: () => Promise.reject(new Error('API error')) } as any,
    });
    const result = await callTool('models_chat', {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    }, deps);

    expect(result).toHaveProperty('error');
    expect(typeof result.error).toBe('string');
    expect(result.error).toBe('API error');
  });

  test('skills_list returns { error: string } when getAll throws', async () => {
    const deps = createMockDeps({
      skillLoader: { getAll: () => { throw new Error('Loader crash'); } } as any,
    });
    const result = await callTool('skills_list', {}, deps);

    expect(result).toHaveProperty('error');
    expect(typeof result.error).toBe('string');
    expect(result.error).toBe('Loader crash');
  });

  test('skills_execute returns { error: string } when execute throws', async () => {
    const deps = createMockDeps({
      skillController: { execute: () => Promise.reject(new Error('Execution denied')) } as any,
    });
    const result = await callTool(
      'skills_execute',
      { skillId: 's1', input: {} },
      deps,
    );

    expect(result).toHaveProperty('error');
    expect(typeof result.error).toBe('string');
    expect(result.error).toBe('Execution denied');
  });

  test('tasks_submit returns { error: string } when createTask throws', async () => {
    const deps = createMockDeps({
      taskManager: { createTask: () => Promise.reject(new Error('Store unavailable')) } as any,
    });
    const result = await callTool('tasks_submit', { type: 'request', payload: {} }, deps);

    expect(result).toHaveProperty('error');
    expect(typeof result.error).toBe('string');
    expect(result.error).toBe('Store unavailable');
  });

  test('system_metrics returns { error: string } when snapshot throws', async () => {
    const deps = createMockDeps({
      metricsCollector: { snapshot: () => { throw new Error('Collector down'); } } as any,
    });
    const result = await callTool('system_metrics', {}, deps);

    expect(result).toHaveProperty('error');
    expect(typeof result.error).toBe('string');
    expect(result.error).toBe('Collector down');
  });
});

describe('fallback info pattern — missing deps return { info: string }', () => {
  test('tasks_submit returns info when taskManager not connected', async () => {
    const result = await callTool('tasks_submit', { type: 'request', payload: {} });

    expect(result).toHaveProperty('info');
    expect(typeof result.info).toBe('string');
  });

  test('skills_search returns info when skillLoader not connected', async () => {
    const result = await callTool('skills_search', { task: 'test' });

    expect(result).toHaveProperty('info');
    expect(typeof result.info).toBe('string');
  });

  test('system_metrics returns info when metricsCollector not connected', async () => {
    const result = await callTool('system_metrics', {});

    expect(result).toHaveProperty('info');
    expect(typeof result.info).toBe('string');
  });
});

describe('system_health — response schema contract', () => {
  test('system_health response has status, version, uptime, memory properties', async () => {
    const result = await callTool('system_health', {});

    expect(result).toHaveProperty('status');
    expect(typeof result.status).toBe('string');
    expect(result).toHaveProperty('version');
    expect(typeof result.version).toBe('string');
    expect(result).toHaveProperty('uptime');
    expect(typeof result.uptime).toBe('number');
    expect(result).toHaveProperty('memory');
    expect(typeof result.memory).toBe('object');
    expect(result.memory).not.toBeNull();
  });
});

describe('system_metrics — response schema contract', () => {
  test('system_metrics full response has counters, gauges, timers, histograms, timestamp', async () => {
    const deps = createMockDeps();
    const result = await callTool('system_metrics', {}, deps);

    expect(result).toHaveProperty('counters');
    expect(typeof result.counters).toBe('object');
    expect(result).toHaveProperty('gauges');
    expect(typeof result.gauges).toBe('object');
    expect(result).toHaveProperty('timers');
    expect(typeof result.timers).toBe('object');
    expect(result).toHaveProperty('histograms');
    expect(typeof result.histograms).toBe('object');
    expect(result).toHaveProperty('timestamp');
    expect(typeof result.timestamp).toBe('number');
  });

  test('system_metrics filters to counters only when metric=counter', async () => {
    const deps = createMockDeps();
    const result = await callTool('system_metrics', { metric: 'counter' }, deps);

    expect(result).toHaveProperty('counters');
    expect(result).not.toHaveProperty('gauges');
    expect(result).not.toHaveProperty('timers');
  });
});
