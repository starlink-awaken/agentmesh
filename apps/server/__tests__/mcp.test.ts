/**
 * MCP Server Tool Handlers — Full Coverage
 *
 * Covers all 11 tools with success paths, missing-deps fallbacks, and error paths.
 */

import { describe, test, expect, mock } from 'bun:test';
import type { MCPServerDeps } from '../src/mcp/index.js';

// ── Helpers ──

/**
 * Create a mock MCPServerDeps object with default stub implementations.
 * Override any property via the overrides parameter.
 */
function createMockDeps(overrides: Partial<MCPServerDeps> = {}): MCPServerDeps {
  return {
    discoverer: {
      discoverAll: () => Promise.resolve([]),
      anyAlive: () => Promise.resolve(false),
      refresh: () => {},
    } as any,
    registry: {
      chat: () => Promise.resolve({ id: 'resp-1', model: 'gpt-4', content: 'Hello from mock', finishReason: 'stop' }),
      getAll: () => [],
      refresh: () => {},
    } as any,
    scheduler: {
      selectModel: () => Promise.resolve({
        model: { id: 'gpt-4', provider: 'openai', capabilities: ['chat'] } as any,
        providerName: 'openai',
        confidence: 0.95,
        reasoning: 'Best available model',
      }),
    } as any,
    taskManager: {
      createTask: () => Promise.resolve({ id: 'task-mock-001', status: 'pending' }),
      getTask: (taskId: string) =>
        taskId === 'task-existing'
          ? { id: 'task-existing', status: 'completed', createdAt: 1000 }
          : undefined,
      getAllTasks: () => [
        { id: 't1', status: 'completed', createdAt: 1000 },
        { id: 't2', status: 'running', createdAt: 2000 },
      ],
    } as any,
    skillLoader: {
      getAll: () => [
        { id: 's1', name: 'Code Review', category: 'development' },
        { id: 's2', name: 'Data Analysis', category: 'data' },
      ],
      search: (_task: string) => [
        { id: 's1', name: 'Code Review', score: 0.9 },
      ],
    } as any,
    skillController: {
      execute: () => Promise.resolve({ success: true, output: 'Skill executed' }),
    } as any,
    metricsCollector: {
      snapshot: () => ({
        counters: { requests: 100 },
        gauges: { memory_mb: 512 },
        timers: { avg_latency: { count: 10, min: 50, max: 500, avg: 250, p50: 200, p95: 450, p99: 490 } },
        histograms: {},
        timestamp: 1234567890,
      }),
    } as any,
    ...overrides,
  };
}

/**
 * Call a tool handler by name and return both raw content text and parsed JSON.
 */
async function callTool(
  name: string,
  args: Record<string, unknown> = {},
  deps?: MCPServerDeps,
): Promise<{ text: string; parsed: any; content: { type: 'text'; text: string }[] }> {
  const mod = await import('../src/mcp/index.js');
  const content = await mod.handleToolCall(name, args, deps);
  const text = content.content[0].text;
  return { text, parsed: JSON.parse(text), content: content.content };
}

// ── models_list ──

describe('handleToolCall — models_list', () => {
  test('returns all models when discoverer connected', async () => {
    const deps = createMockDeps({
      discoverer: {
        discoverAll: () => Promise.resolve([
          { id: 'gpt-4', location: 'cloud', provider: 'openai' },
          { id: 'llama3', location: 'local', provider: 'ollama' },
        ]),
      } as any,
    });
    const { parsed } = await callTool('models_list', {}, deps);
    expect(parsed.total).toBe(2);
    expect(parsed.models).toHaveLength(2);
    expect(parsed.models[0].id).toBe('gpt-4');
    expect(parsed.models[1].id).toBe('llama3');
  });

  test('returns info fallback when discoverer not connected', async () => {
    const { parsed } = await callTool('models_list', {});
    expect(parsed.info).toBe('Model discovery not connected');
  });

  test('returns error when discoverer.discoverAll throws', async () => {
    const deps = createMockDeps({
      discoverer: { discoverAll: () => Promise.reject(new Error('Connection timeout')) } as any,
    });
    const { parsed } = await callTool('models_list', {}, deps);
    expect(parsed.error).toContain('Connection timeout');
  });

  test('filters models by location', async () => {
    const deps = createMockDeps({
      discoverer: {
        discoverAll: () => Promise.resolve([
          { id: 'gpt-4', location: 'cloud' },
          { id: 'llama3', location: 'local' },
        ]),
      } as any,
    });
    const { parsed } = await callTool('models_list', { location: 'local' }, deps);
    expect(parsed.total).toBe(1);
    expect(parsed.models[0].id).toBe('llama3');
  });
});

// ── models_chat ──

describe('handleToolCall — models_chat', () => {
  const chatMessages = [{ role: 'user', content: 'Hello' }];

  test('returns chat response when model is specified', async () => {
    const deps = createMockDeps();
    const { parsed } = await callTool('models_chat', { model: 'gpt-4', messages: chatMessages }, deps);
    expect(parsed.model).toBe('gpt-4');
    expect(parsed.content).toBe('Hello from mock');
  });

  test('uses scheduler selection when model not specified', async () => {
    const selectModel = mock(() => Promise.resolve({
      model: { id: 'gpt-4', provider: 'openai', capabilities: ['chat'] } as any,
      providerName: 'openai',
      confidence: 0.95,
      reasoning: 'Best available model',
    }));
    const deps = createMockDeps({
      scheduler: { selectModel } as any,
    });
    const { parsed } = await callTool('models_chat', { messages: chatMessages }, deps);
    expect(parsed.model).toBe('gpt-4');
    expect(parsed.content).toBe('Hello from mock');
    expect(selectModel).toHaveBeenCalledTimes(1);
  });

  test('returns info fallback when scheduler not connected', async () => {
    const { parsed } = await callTool('models_chat', { model: 'gpt-4', messages: chatMessages });
    expect(parsed.info).toBe('Model scheduler not connected');
  });

  test('returns error when scheduler returns no available model', async () => {
    const deps = createMockDeps({
      scheduler: { selectModel: () => Promise.resolve(null) } as any,
      registry: { chat: () => Promise.resolve(null) } as any,
    });
    const { parsed } = await callTool('models_chat', { messages: chatMessages }, deps);
    expect(parsed.error).toBe('No available model');
  });

  test('returns error when registry.chat throws', async () => {
    const deps = createMockDeps({
      registry: { chat: () => Promise.reject(new Error('API rate limit exceeded')) } as any,
    });
    const { parsed } = await callTool('models_chat', { model: 'gpt-4', messages: chatMessages }, deps);
    expect(parsed.error).toBe('API rate limit exceeded');
  });
});

// ── models_health ──

describe('handleToolCall — models_health', () => {
  test('returns alive status from discoverer', async () => {
    const deps = createMockDeps({
      discoverer: { anyAlive: () => Promise.resolve(true) } as any,
    });
    const { parsed } = await callTool('models_health', {}, deps);
    expect(parsed.local_models_alive).toBe(true);
    expect(typeof parsed.timestamp).toBe('number');
  });

  test('returns no_discovery when discoverer not connected', async () => {
    const { parsed } = await callTool('models_health', {});
    expect(parsed.status).toBe('no_discovery');
  });

  test('returns error when anyAlive throws', async () => {
    const deps = createMockDeps({
      discoverer: { anyAlive: () => Promise.reject(new Error('Discovery error')) } as any,
    });
    const { parsed } = await callTool('models_health', {}, deps);
    expect(parsed.error).toBe('Discovery error');
  });
});

// ── tasks_submit ──

describe('handleToolCall — tasks_submit', () => {
  test('submits task and returns taskId with status', async () => {
    const deps = createMockDeps();
    const { parsed } = await callTool('tasks_submit', { type: 'request', payload: { query: 'test' } }, deps);
    expect(parsed.taskId).toBeDefined();
    expect(parsed.status).toBe('pending');
  });

  test('returns fallback when taskManager not connected', async () => {
    const { parsed } = await callTool('tasks_submit', { type: 'request', payload: {} });
    expect(parsed.taskId).toBeDefined();
    expect(parsed.status).toBe('pending');
    expect(parsed.info).toBe('TaskManager not connected');
  });

  test('returns error when createTask throws', async () => {
    const deps = createMockDeps({
      taskManager: { createTask: () => Promise.reject(new Error('Store unavailable')) } as any,
    });
    const { parsed } = await callTool('tasks_submit', { type: 'request', payload: {} }, deps);
    expect(parsed.error).toBe('Store unavailable');
  });
});

// ── tasks_status ──

describe('handleToolCall — tasks_status', () => {
  test('returns task status when task exists', async () => {
    const deps = createMockDeps();
    const { parsed } = await callTool('tasks_status', { taskId: 'task-existing' }, deps);
    expect(parsed.taskId).toBe('task-existing');
    expect(parsed.status).toBe('completed');
    expect(parsed.createdAt).toBe(1000);
  });

  test('returns not_found when task does not exist', async () => {
    const deps = createMockDeps();
    const { parsed } = await callTool('tasks_status', { taskId: 'nonexistent' }, deps);
    expect(parsed.taskId).toBe('nonexistent');
    expect(parsed.status).toBe('not_found');
  });

  test('returns fallback when taskManager not connected', async () => {
    const { parsed } = await callTool('tasks_status', { taskId: 'task-1' });
    expect(parsed.taskId).toBe('task-1');
    expect(parsed.status).toBe('unknown');
    expect(parsed.info).toBe('TaskManager not connected');
  });

  test('returns error when getTask throws', async () => {
    const deps = createMockDeps({
      taskManager: { getTask: () => { throw new Error('Internal error'); } } as any,
    });
    const { parsed } = await callTool('tasks_status', { taskId: 'task-1' }, deps);
    expect(parsed.error).toBe('Internal error');
  });
});

// ── tasks_list ──

describe('handleToolCall — tasks_list', () => {
  test('returns all tasks when no status filter', async () => {
    const deps = createMockDeps();
    const { parsed } = await callTool('tasks_list', {}, deps);
    expect(parsed.total).toBe(2);
    expect(parsed.tasks).toHaveLength(2);
  });

  test('filters tasks by status', async () => {
    const deps = createMockDeps();
    const { parsed } = await callTool('tasks_list', { status: 'completed' }, deps);
    expect(parsed.total).toBe(1);
    expect(parsed.tasks[0].status).toBe('completed');
  });

  test('returns fallback when taskManager not connected', async () => {
    const { parsed } = await callTool('tasks_list', {});
    expect(parsed.tasks).toEqual([]);
    expect(parsed.info).toBe('TaskManager not connected');
  });

  test('returns error when getAllTasks throws', async () => {
    const deps = createMockDeps({
      taskManager: { getAllTasks: () => { throw new Error('Load failed'); } } as any,
    });
    const { parsed } = await callTool('tasks_list', {}, deps);
    expect(parsed.error).toBe('Load failed');
  });
});

// ── skills_list ──

describe('handleToolCall — skills_list', () => {
  test('returns all skills', async () => {
    const deps = createMockDeps();
    const { parsed } = await callTool('skills_list', {}, deps);
    expect(parsed.total).toBe(2);
    expect(parsed.skills).toHaveLength(2);
  });

  test('filters skills by category', async () => {
    const deps = createMockDeps();
    const { parsed } = await callTool('skills_list', { category: 'development' }, deps);
    expect(parsed.total).toBe(1);
    expect(parsed.skills[0].id).toBe('s1');
  });

  test('returns fallback when skillLoader not connected', async () => {
    const { parsed } = await callTool('skills_list', {});
    expect(parsed.skills).toEqual([]);
    expect(parsed.info).toBe('SkillLoader not connected');
  });

  test('returns error when getAll throws', async () => {
    const deps = createMockDeps({
      skillLoader: { getAll: () => { throw new Error('Loader error'); } } as any,
    });
    const { parsed } = await callTool('skills_list', {}, deps);
    expect(parsed.error).toBe('Loader error');
  });
});

// ── skills_search ──

describe('handleToolCall — skills_search', () => {
  test('returns matching skills for a task', async () => {
    const deps = createMockDeps();
    const { parsed } = await callTool('skills_search', { task: 'review code' }, deps);
    expect(parsed.matches).toHaveLength(1);
    expect(parsed.matches[0].id).toBe('s1');
    expect(parsed.task).toBe('review code');
  });

  test('returns fallback when skillLoader not connected', async () => {
    const { parsed } = await callTool('skills_search', { task: 'test' });
    expect(parsed.matches).toEqual([]);
    expect(parsed.info).toBe('SkillLoader not connected');
  });

  test('returns error when search throws', async () => {
    const deps = createMockDeps({
      skillLoader: { search: () => { throw new Error('Search failed'); } } as any,
    });
    const { parsed } = await callTool('skills_search', { task: 'test' }, deps);
    expect(parsed.error).toBe('Search failed');
  });
});

// ── skills_execute ──

describe('handleToolCall — skills_execute', () => {
  test('executes skill and returns result', async () => {
    const deps = createMockDeps();
    const { parsed } = await callTool('skills_execute', { skillId: 's1', input: { file: 'test.ts' } }, deps);
    expect(parsed.skillId).toBe('s1');
    expect(parsed.result.success).toBe(true);
  });

  test('returns fallback when skillController not connected', async () => {
    const { parsed } = await callTool('skills_execute', { skillId: 's1', input: {} });
    expect(parsed.skillId).toBe('s1');
    expect(parsed.info).toBe('SkillController not connected');
  });

  test('returns error when execute throws', async () => {
    const deps = createMockDeps({
      skillController: { execute: () => Promise.reject(new Error('Execution denied')) } as any,
    });
    const { parsed } = await callTool('skills_execute', { skillId: 's1', input: {} }, deps);
    expect(parsed.error).toBe('Execution denied');
  });
});

// ── system_health ──

describe('handleToolCall — system_health', () => {
  test('returns system health status, version, uptime, and memory usage', async () => {
    const { parsed } = await callTool('system_health', {});
    expect(parsed.status).toBe('ok');
    expect(parsed.version).toBe('2.0.0');
    expect(typeof parsed.uptime).toBe('number');
    expect(parsed.memory).toBeDefined();
    expect(typeof parsed.memory.heapUsed).toBe('number');
  });
});

// ── system_metrics ──

describe('handleToolCall — system_metrics', () => {
  test('returns full metrics snapshot when no metric filter', async () => {
    const deps = createMockDeps();
    const { parsed } = await callTool('system_metrics', {}, deps);
    expect(parsed.counters).toBeDefined();
    expect(parsed.gauges).toBeDefined();
    expect(parsed.timers).toBeDefined();
    expect(parsed.counters.requests).toBe(100);
  });

  test('filters counters when metric=counter', async () => {
    const deps = createMockDeps();
    const { parsed } = await callTool('system_metrics', { metric: 'counter' }, deps);
    expect(parsed.counters).toBeDefined();
    expect(parsed.gauges).toBeUndefined();
    expect(parsed.timers).toBeUndefined();
  });

  test('filters timers when metric=latency', async () => {
    const deps = createMockDeps();
    const { parsed } = await callTool('system_metrics', { metric: 'latency' }, deps);
    expect(parsed.timers).toBeDefined();
    expect(parsed.counters).toBeUndefined();
  });

  test('filters gauges when metric=memory', async () => {
    const deps = createMockDeps();
    const { parsed } = await callTool('system_metrics', { metric: 'memory' }, deps);
    expect(parsed.gauges).toBeDefined();
    expect(parsed.counters).toBeUndefined();
  });

  test('returns empty object for unknown metric filter', async () => {
    const deps = createMockDeps();
    const { parsed } = await callTool('system_metrics', { metric: 'unknown' }, deps);
    expect(parsed.counters).toBeUndefined();
    expect(parsed.timers).toBeUndefined();
    expect(parsed.gauges).toBeUndefined();
  });

  test('returns info when metricsCollector not connected', async () => {
    const { parsed } = await callTool('system_metrics', {});
    expect(parsed.info).toBe('MetricsCollector not connected');
  });

  test('returns error when snapshot throws', async () => {
    const deps = createMockDeps({
      metricsCollector: { snapshot: () => { throw new Error('Snapshot failed'); } } as any,
    });
    const { parsed } = await callTool('system_metrics', {}, deps);
    expect(parsed.error).toBe('Snapshot failed');
  });
});

// ── Invalid Tool ──

describe('handleToolCall — unknown tool', () => {
  test('throws when tool name is not recognized', async () => {
    const mod = await import('../src/mcp/index.js');
    await expect(mod.handleToolCall('nonexistent_tool', {})).rejects.toThrow('Unknown tool: nonexistent_tool');
  });
});
