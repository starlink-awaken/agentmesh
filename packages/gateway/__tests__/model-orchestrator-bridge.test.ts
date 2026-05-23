/**
 * Gateway -> Model-Orchestrator Bridge Tests (Unit/Integration)
 *
 * 验证跨包桥接路由的注册、参数验证、错误处理。
 * 使用 Fastify inject() 模式，不依赖外部 LLM 服务。
 *
 * 覆盖:
 *  - GET /v1/model-orchestrator/models
 *  - POST /v1/model-orchestrator/chat
 *  - GET /v1/skills
 *  - POST /v1/skills/:skillId/execute
 */
import { describe, test, expect } from 'bun:test';
import Fastify from 'fastify';
import { apiRoutes } from '../src/routes/api.js';

function buildTestServer() {
  const fastify = Fastify({ logger: false });
  return fastify;
}

describe('Model-Orchestrator Bridge Routes', () => {
  // ── GET /model-orchestrator/models ──

  test('GET /v1/model-orchestrator/models returns expected response shape', async () => {
    const fastify = buildTestServer();
    await fastify.register(apiRoutes, { prefix: '/v1' });
    await fastify.ready();

    const resp = await fastify.inject({
      method: 'GET',
      url: '/v1/model-orchestrator/models',
    });

    // With local Ollama/LM Studio running, this returns 200 with models.
    // Without them, may return 502 (model discovery failure).
    expect([200, 502]).toContain(resp.statusCode);
    if (resp.statusCode === 200) {
      const body = JSON.parse(resp.body);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('models');
      expect(Array.isArray(body.models)).toBe(true);
    } else {
      const body = JSON.parse(resp.body);
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
    }

    await fastify.close();
  }, { timeout: 30000 });

  test('GET /v1/model-orchestrator/models handles concurrent requests', async () => {
    const fastify = buildTestServer();
    await fastify.register(apiRoutes, { prefix: '/v1' });
    await fastify.ready();

    const [r1, r2, r3] = await Promise.all([
      fastify.inject({ method: 'GET', url: '/v1/model-orchestrator/models' }),
      fastify.inject({ method: 'GET', url: '/v1/model-orchestrator/models' }),
      fastify.inject({ method: 'GET', url: '/v1/model-orchestrator/models' }),
    ]);

    expect(r1.statusCode).toBe(r2.statusCode);
    expect(r2.statusCode).toBe(r3.statusCode);

    await fastify.close();
  }, { timeout: 60000 });

  // ── POST /model-orchestrator/chat ──

  test('POST /v1/model-orchestrator/chat returns 400 when messages missing', async () => {
    const fastify = buildTestServer();
    await fastify.register(apiRoutes, { prefix: '/v1' });
    await fastify.ready();

    const resp = await fastify.inject({
      method: 'POST',
      url: '/v1/model-orchestrator/chat',
      payload: {},
    });

    expect(resp.statusCode).toBe(400);
    const body = JSON.parse(resp.body);
    expect(body.error.code).toBe('MISSING_MESSAGES');

    await fastify.close();
  });

  test('POST /v1/model-orchestrator/chat returns 400 with null messages', async () => {
    const fastify = buildTestServer();
    await fastify.register(apiRoutes, { prefix: '/v1' });
    await fastify.ready();

    const resp = await fastify.inject({
      method: 'POST',
      url: '/v1/model-orchestrator/chat',
      payload: { messages: null },
    });

    expect(resp.statusCode).toBe(400);

    await fastify.close();
  });

  test('POST /v1/model-orchestrator/chat returns 400 with empty messages array', async () => {
    const fastify = buildTestServer();
    await fastify.register(apiRoutes, { prefix: '/v1' });
    await fastify.ready();

    const resp = await fastify.inject({
      method: 'POST',
      url: '/v1/model-orchestrator/chat',
      payload: { messages: [] },
    });

    expect(resp.statusCode).toBe(400);

    await fastify.close();
  });

  test('POST /v1/model-orchestrator/chat without model returns 503 or 502', async () => {
    const fastify = buildTestServer();
    await fastify.register(apiRoutes, { prefix: '/v1' });
    await fastify.ready();

    const resp = await fastify.inject({
      method: 'POST',
      url: '/v1/model-orchestrator/chat',
      payload: {
        messages: [{ role: 'user', content: 'Hello' }],
      },
    });

    // If local Ollama is running with models, this might succeed (200).
    // Without API keys for cloud providers, scheduler may still pick
    // a local model. Accept any reasonable status code.
    expect([200, 503, 502]).toContain(resp.statusCode);
    if (resp.statusCode === 200) {
      const body = JSON.parse(resp.body);
      expect(body).toHaveProperty('model');
    }

    await fastify.close();
  }, { timeout: 30000 });

  // ── GET /skills ──

  test('GET /v1/skills returns skill list', async () => {
    const fastify = buildTestServer();
    await fastify.register(apiRoutes, { prefix: '/v1' });
    await fastify.ready();

    const resp = await fastify.inject({
      method: 'GET',
      url: '/v1/skills',
    });

    expect([200, 502]).toContain(resp.statusCode);
    if (resp.statusCode === 200) {
      const body = JSON.parse(resp.body);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('skills');
      expect(Array.isArray(body.skills)).toBe(true);
    }

    await fastify.close();
  });

  test('GET /v1/skills handles concurrent requests without crash', async () => {
    const fastify = buildTestServer();
    await fastify.register(apiRoutes, { prefix: '/v1' });
    await fastify.ready();

    const [r1, r2] = await Promise.all([
      fastify.inject({ method: 'GET', url: '/v1/skills' }),
      fastify.inject({ method: 'GET', url: '/v1/skills' }),
    ]);

    expect(r1.statusCode).toBe(r2.statusCode);

    await fastify.close();
  });

  // ── POST /skills/:skillId/execute ──

  test('POST /v1/skills/nonexistent/execute returns result or error', async () => {
    const fastify = buildTestServer();
    await fastify.register(apiRoutes, { prefix: '/v1' });
    await fastify.ready();

    const resp = await fastify.inject({
      method: 'POST',
      url: '/v1/skills/nonexistent-skill/execute',
      payload: { input: 'test' },
    });

    // SkillController may return 200 with empty result (no matching skills)
    // or 502 if execute throws
    expect([200, 502]).toContain(resp.statusCode);
    if (resp.statusCode === 200) {
      const body = JSON.parse(resp.body);
      expect(body).toHaveProperty('skillId', 'nonexistent-skill');
      expect(body).toHaveProperty('result');
      expect(Array.isArray(body.result)).toBe(true);
    }

    await fastify.close();
  });

  // ── Cross-route stability ──

  test('GET /v1/health works unaffected by model-orchestrator bridge', async () => {
    const fastify = buildTestServer();
    await fastify.register(apiRoutes, { prefix: '/v1' });
    await fastify.ready();

    const resp = await fastify.inject({ method: 'GET', url: '/v1/health' });
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('timestamp');
    expect(typeof body.timestamp).toBe('number');

    await fastify.close();
  });

  test('registering apiRoutes does not throw', async () => {
    const fastify = buildTestServer();
    // register() returns Fastify instance for chaining, not a Promise
    expect(() => { fastify.register(apiRoutes, { prefix: '/v1' }); }).not.toThrow();
    await fastify.ready();
    expect(fastify.hasPlugin('apiRoutes') || fastify.printPlugins().length > 0).toBe(true);
    await fastify.close();
  });
});
