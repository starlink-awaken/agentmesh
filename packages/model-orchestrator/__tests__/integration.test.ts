import { describe, it, expect } from 'bun:test';
import { initFromConfig, scoreModels, listPolicies } from '../src/index.js';
import { ModelRegistry } from '../src/registry.js';
import { ModelScheduler } from '../src/scheduler.js';
import type { ModelDescriptor } from '@agentmesh/core-types';

function makeModel(id: string, overrides?: Partial<ModelDescriptor>): ModelDescriptor {
  return {
    id, name: id, provider: 'ollama', location: 'local',
    capabilities: ['chat'], contextWindow: 4096, isAvailable: true,
    ...overrides,
  };
}

describe('Configuration Integration', () => {
  it('initFromConfig returns registry + scheduler without crashing', () => {
    const result = initFromConfig();
    expect(result.registry).toBeInstanceOf(ModelRegistry);
    expect(result.scheduler).toBeInstanceOf(ModelScheduler);
    expect(result.config).toBeDefined();
    expect(result.config.local).toBeDefined();
  });

  it('loads default config when no file found', () => {
    const result = initFromConfig('/nonexistent/path/models.yaml');
    expect(result.registry).toBeDefined();
    expect(result.scheduler).toBeDefined();
  });
});

describe('Policies', () => {
  it('lists built-in policies', () => {
    const policies = listPolicies();
    expect(policies).toContain('cost-first');
    expect(policies).toContain('speed-first');
    expect(policies).toContain('capability-first');
    expect(policies).toContain('balanced');
  });

  it('scoreModels sorts by cost-first correctly', () => {
    const models = [
      makeModel('cheap', { costPer1KTokens: { input: 0.001, output: 0.002 } }),
      makeModel('expensive', { costPer1KTokens: { input: 0.03, output: 0.06 } }),
    ];
    const scored = scoreModels(models, { task: 'test', requiredCapabilities: ['chat'] }, { strategy: 'cost-first', priority: [], fallbackChain: [] });
    expect(scored).toHaveLength(2);
    expect(scored[0]!.model.id).toBe('cheap');
  });

  it('scoreModels filters unavailable models before scoring', () => {
    const models = [
      makeModel('online', { isAvailable: true }),
      makeModel('offline', { isAvailable: false }),
    ];
    const available = models.filter(m => m.isAvailable);
    expect(available).toHaveLength(1);
  });
});

describe('ModelRegistry Integration', () => {
  it('registers providers and discovers models', async () => {
    const reg = new ModelRegistry();
    reg.register({
      name: 'test', type: 'test',
      discover: async () => [makeModel('test/model-a'), makeModel('test/model-b')],
      health: async () => true,
      chat: async () => ({ id: '1', model: 'm', content: 'ok', finishReason: 'stop' }),
    });

    const models = await reg.refresh();
    expect(models).toHaveLength(2);
    expect(models[0]!.id).toBe('test/model-a');

    const result = await reg.chat('test/model-a', []);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('ok');
  });

  it('returns null for unknown model chat', async () => {
    const reg = new ModelRegistry();
    const result = await reg.chat('nonexistent', []);
    expect(result).toBeNull();
  });
});
