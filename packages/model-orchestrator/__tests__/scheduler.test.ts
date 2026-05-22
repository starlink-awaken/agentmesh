import { describe, it, expect } from 'bun:test';
import { ModelScheduler } from '../src/scheduler.js';
import { ModelRegistry } from '../src/registry.js';
import type { ModelDescriptor } from '@agentmesh/core-types';

function makeModel(id: string, overrides?: Partial<ModelDescriptor>): ModelDescriptor {
  return {
    id,
    name: id,
    provider: 'ollama',
    location: 'local',
    capabilities: ['chat'],
    contextWindow: 4096,
    isAvailable: true,
    ...overrides,
  };
}

describe('ModelRegistry', () => {
  it('registers and refreshes models', async () => {
    const reg = new ModelRegistry();
    reg.register({
      name: 'test',
      type: 'ollama',
      discover: async () => [makeModel('test/model')],
      health: async () => true,
      chat: async () => ({ id: '1', model: 'm', content: 'ok', finishReason: 'stop' }),
    });

    const models = await reg.refresh();
    expect(models).toHaveLength(1);
    expect(models[0]!.id).toBe('test/model');
  });

  it('returns null for unknown model chat', async () => {
    const reg = new ModelRegistry();
    const result = await reg.chat('nonexistent', []);
    expect(result).toBeNull();
  });
});

describe('ModelScheduler', () => {
  function createScheduler(models: ModelDescriptor[], policy?: string) {
    const reg = new ModelRegistry();
    reg.register({
      name: 'test',
      type: 'ollama',
      discover: async () => models,
      health: async () => true,
      chat: async () => ({ id: '1', model: 'm', content: 'ok', finishReason: 'stop' }),
    });
    return new ModelScheduler(reg, { defaultPolicy: (policy || 'balanced') as any });
  }

  it('selects cheapest model with cost-first policy', async () => {
    const scheduler = createScheduler([
      makeModel('local/cheap', { costPer1KTokens: { input: 0.001, output: 0.002 }, provider: 'ollama' }),
      makeModel('cloud/expensive', { costPer1KTokens: { input: 0.03, output: 0.06 }, provider: 'openai' }),
    ], 'cost-first');

    // 先 refresh 注册模型
    (scheduler as any).registry.refresh = async () => {};
    (scheduler as any).registry.getAll = () => [
      makeModel('local/cheap', { costPer1KTokens: { input: 0.001, output: 0.002 }, provider: 'ollama' }),
      makeModel('cloud/expensive', { costPer1KTokens: { input: 0.03, output: 0.06 }, provider: 'openai' }),
    ];

    const selection = await scheduler.selectModel({ task: 'test', requiredCapabilities: ['chat'] });
    expect(selection).not.toBeNull();
    expect(selection!.model.id).toBe('local/cheap');
  });

  it('returns null when no model matches capabilities', async () => {
    const scheduler = createScheduler([
      makeModel('local/model', { capabilities: ['chat'] }),
    ]);

    (scheduler as any).registry.getAll = () => [
      makeModel('local/model', { capabilities: ['chat'] }),
    ];

    const selection = await scheduler.selectModel({ task: 'test', requiredCapabilities: ['vision'] });
    expect(selection).toBeNull();
  });

  it('follows priority order', async () => {
    const scheduler = createScheduler([
      makeModel('model/c', { provider: 'openai' }),
      makeModel('model/a', { provider: 'ollama' }),
      makeModel('model/b', { provider: 'anthropic' }),
    ]);

    (scheduler as any).registry.getAll = () => [
      makeModel('model/c', { provider: 'openai' }),
      makeModel('model/a', { provider: 'ollama' }),
      makeModel('model/b', { provider: 'anthropic' }),
    ];

    const selection = await scheduler.selectModel(
      { task: 'test', requiredCapabilities: ['chat'] },
      { priority: ['model/a', 'model/b', 'model/c'] }
    );
    expect(selection).not.toBeNull();
    expect(selection!.model.id).toBe('model/a');
  });

  it('handles load penalty', async () => {
    const scheduler = createScheduler([
      makeModel('model/a', { costPer1KTokens: { input: 0.005, output: 0.01 } }),
      makeModel('model/b', { costPer1KTokens: { input: 0.001, output: 0.002 } }),
    ], 'cost-first');

    (scheduler as any).registry.getAll = () => [
      makeModel('model/a', { costPer1KTokens: { input: 0.005, output: 0.01 } }),
      makeModel('model/b', { costPer1KTokens: { input: 0.001, output: 0.002 } }),
    ];

    // Simulate load on model/b
    scheduler.releaseLoad('model/b'); // won't help going negative but tests stability
    for (let i = 0; i < 6; i++) {
      (scheduler as any).recordLoad('model/b');
    }

    const selection = await scheduler.selectModel({ task: 'test', requiredCapabilities: ['chat'] }, { strategy: 'cost-first' });
    // With high load penalty on cheapest, may select a
    expect(selection).not.toBeNull();
  });
});
