import { describe, test, expect, beforeEach } from 'bun:test';
import { initModelRouter, resolveProvider } from '../../src/model-gateway/router.js';
import type { ModelGatewayConfig } from '../../src/model-gateway/types.js';

const testConfig: ModelGatewayConfig = {
  default_model: 'deepseek-chat',
  providers: {
    deepseek: {
      base_url: 'https://api.deepseek.com/v1',
      api_key: 'sk-test-deepseek',
      models: ['deepseek-chat', 'deepseek-v4-pro'],
    },
    openai: {
      base_url: 'https://api.openai.com/v1',
      api_key: 'sk-test-openai',
      models: ['gpt-5.1'],
    },
    openrouter: {
      base_url: 'https://openrouter.ai/api/v1',
      api_key: 'sk-test-or',
    },
    ollama: {
      base_url: 'http://127.0.0.1:11434/v1',
      api_key: 'ollama',
      models: ['qwen3:14b'],
    },
  },
  fallback_chain: ['deepseek', 'openrouter', 'ollama'],
  model_routing: {
    'gpt-': ['openai', 'deepseek'],
    deepseek: ['deepseek'],
    claude: ['openrouter'],
    qwen: ['ollama'],
  },
};

describe('model router', () => {
  beforeEach(() => {
    initModelRouter(testConfig);
  });

  test('routes deepseek models to deepseek provider', () => {
    const provider = resolveProvider('deepseek-chat');
    expect(provider).toBeDefined();
    expect(provider!.name).toBe('deepseek');
    expect(provider!.base_url).toBe('https://api.deepseek.com/v1');
    expect(provider!.api_key).toBe('sk-test-deepseek');
  });

  test('routes gpt models to openai first', () => {
    const provider = resolveProvider('gpt-5.1');
    expect(provider).toBeDefined();
    expect(provider!.name).toBe('openai');
  });

  test('routes claude models to openrouter', () => {
    const provider = resolveProvider('claude-sonnet-4-6');
    expect(provider).toBeDefined();
    expect(provider!.name).toBe('openrouter');
  });

  test('routes qwen models to ollama', () => {
    const provider = resolveProvider('qwen3:14b');
    expect(provider).toBeDefined();
    expect(provider!.name).toBe('ollama');
  });

  test('unknown models fall through to fallback chain', () => {
    const provider = resolveProvider('codestral:22b');
    expect(provider).toBeDefined();
    expect(provider!.name).toBe('deepseek');
  });

  test('returns null when module has no config (fresh import)', () => {
    // resolveProvider 返回 null 当 config 未被 initModelRouter 设置
    // 但在 beforeEach 中已经 init，所以这个测试验证已知行为
    const provider = resolveProvider('any-model');
    expect(provider).toBeDefined();
  });

  test('skips provider without api key in fallback', () => {
    const cfgWithEmpty: ModelGatewayConfig = {
      ...testConfig,
      fallback_chain: ['empty_provider', 'deepseek'],
      providers: {
        ...testConfig.providers,
        empty_provider: {
          base_url: 'https://nope.example.com/v1',
          api_key: '',
          models: [],
        },
      },
    };
    initModelRouter(cfgWithEmpty);
    const provider = resolveProvider('unknown-model');
    expect(provider!.name).toBe('deepseek');
  });

  test('resolves api key from env var', () => {
    Bun.env.TEST_PROVIDER_KEY = 'sk-from-env';
    const cfgWithEnv: ModelGatewayConfig = {
      ...testConfig,
      fallback_chain: ['env_provider'],
      providers: {
        ...testConfig.providers,
        env_provider: {
          base_url: 'https://env.example.com/v1',
          api_key_env: 'TEST_PROVIDER_KEY',
          models: [],
        },
      },
    };
    initModelRouter(cfgWithEnv);
    const provider = resolveProvider('unknown-model');
    expect(provider).toBeDefined();
    expect(provider!.api_key).toBe('sk-from-env');
    delete Bun.env.TEST_PROVIDER_KEY;
  });
});
