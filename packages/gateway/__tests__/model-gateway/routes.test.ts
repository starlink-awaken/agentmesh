import { describe, test, expect, beforeAll } from 'bun:test';
import Fastify from 'fastify';
import { modelGatewayRoutes, resetModelOrch } from '../../src/model-gateway/routes.js';
import { initModelRouter } from '../../src/model-gateway/router.js';
import type { ModelGatewayConfig } from '../../src/model-gateway/types.js';

const testConfig: ModelGatewayConfig = {
  default_model: 'deepseek-chat',
  providers: {
    deepseek: {
      base_url: 'https://api.deepseek.com/v1',
      api_key: 'sk-test',
      models: ['deepseek-chat', 'deepseek-v4-pro'],
    },
    ollama: {
      base_url: 'http://127.0.0.1:11434/v1',
      api_key: 'ollama',
      models: ['qwen3:14b'],
    },
  },
  fallback_chain: ['deepseek', 'ollama'],
  model_routing: {
    deepseek: ['deepseek'],
    qwen: ['ollama'],
  },
};

describe('model gateway routes', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    initModelRouter(testConfig);
    fastify = Fastify({ logger: false });
    await fastify.register(modelGatewayRoutes);
    await fastify.ready();
  });

  test('GET /v1/models returns model list', async () => {
    const resp = await fastify.inject({ method: 'GET', url: '/v1/models' });
    expect(resp.statusCode).toBe(200);

    const body = JSON.parse(resp.body);
    expect(body.object).toBe('list');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);

    // 现在返回的是 model-orchestrator 真实发现的模型
    // （测试环境通过 initModelRouter 注册的静态配置作为回退）
    const modelIds = body.data.map((m: any) => m.id);
    expect(modelIds.some((id: string) => id.includes('ollama/') || id.includes('deepseek') || id.includes('qwen'))).toBe(true);
  });

  // 这些端点依赖 codexbar（外部进程，15s+），单元测试 skip，集成测试单独运行
  test.skip('GET /v1/model-gateway/health returns status', async () => {
    const resp = await fastify.inject({ method: 'GET', url: '/v1/model-gateway/health' });
    expect([200, 500]).toContain(resp.statusCode);
  });

  test.skip('GET /v1/model-gateway/quota returns quota data', async () => {
    const resp = await fastify.inject({ method: 'GET', url: '/v1/model-gateway/quota' });
    expect([200, 500]).toContain(resp.statusCode);
  });

  test('POST /v1/chat/completions requires messages', async () => {
    const resp = await fastify.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { model: 'test' },
    });
    expect(resp.statusCode).toBe(400);
    const body = JSON.parse(resp.body);
    expect(body.error).toBeDefined();
  });

  test('POST /v1/responses requires input', async () => {
    const resp = await fastify.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: { model: 'test' },
    });
    expect(resp.statusCode).toBe(400);
  });

  test('POST /v1/chat/completions resolves provider and attempts call', async () => {
    const resp = await fastify.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    });
    // Any status that isn't a crash (500) is acceptable in test env
    expect([200, 401, 502, 503]).toContain(resp.statusCode);
  });
});
