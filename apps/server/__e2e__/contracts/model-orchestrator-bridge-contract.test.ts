/**
 * Model-Orchestrator Bridge — Response Schema Contract Tests
 *
 * Verifies that the model-orchestrator bridge endpoints (models_list, models_chat,
 * models_health) return the expected JSON response shapes.
 *
 * These are schema-only contracts — they check property presence and types,
 * not specific values or behavior.
 */
import { describe, test, expect } from 'bun:test';
import type { MCPServerDeps } from '../../src/mcp/index.js';

// ── Helpers ──

function createMockDeps(overrides: Partial<MCPServerDeps> = {}): MCPServerDeps {
  return {
    discoverer: {
      discoverAll: () =>
        Promise.resolve([
          { id: 'gpt-4', location: 'cloud', provider: 'openai' },
          { id: 'llama3', location: 'local', provider: 'ollama' },
        ]),
      anyAlive: () => Promise.resolve(true),
      refresh: () => {},
    } as any,
    registry: {
      chat: () =>
        Promise.resolve({
          id: 'resp-1',
          model: 'gpt-4',
          content: 'Hello from mock',
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

describe('model-orchestrator bridge — response schema contract', () => {
  test('models_list response has total (number) and models (array) properties', async () => {
    const deps = createMockDeps();
    const result = await callTool('models_list', {}, deps);

    expect(result).toHaveProperty('total');
    expect(typeof result.total).toBe('number');
    expect(result).toHaveProperty('models');
    expect(Array.isArray(result.models)).toBe(true);
  });

  test('models_list each model entry has id and location properties of correct types', async () => {
    const deps = createMockDeps();
    const result = await callTool('models_list', { location: 'local' }, deps);
    const models = result.models as Array<Record<string, unknown>>;

    for (const model of models) {
      expect(model).toHaveProperty('id');
      expect(typeof model.id).toBe('string');
      expect(model).toHaveProperty('location');
      expect(typeof model.location).toBe('string');
    }
  });

  test('models_chat response has model (string) and content (string) properties', async () => {
    const deps = createMockDeps();
    const result = await callTool(
      'models_chat',
      { model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }] },
      deps,
    );

    expect(result).toHaveProperty('model');
    expect(typeof result.model).toBe('string');
    expect(result).toHaveProperty('content');
    expect(typeof result.content).toBe('string');
  });

  test('models_health response has local_models_alive (boolean) and timestamp (number)', async () => {
    const deps = createMockDeps();
    const result = await callTool('models_health', {}, deps);

    expect(result).toHaveProperty('local_models_alive');
    expect(typeof result.local_models_alive).toBe('boolean');
    expect(result).toHaveProperty('timestamp');
    expect(typeof result.timestamp).toBe('number');
  });

  test('models_list returns info (string) when discoverer not connected', async () => {
    const result = await callTool('models_list', {});

    expect(result).toHaveProperty('info');
    expect(typeof result.info).toBe('string');
  });

  test('models_chat returns info (string) when scheduler not connected', async () => {
    const result = await callTool('models_chat', {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result).toHaveProperty('info');
    expect(typeof result.info).toBe('string');
  });
});
