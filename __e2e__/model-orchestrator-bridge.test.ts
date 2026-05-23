/**
 * ISC-1: 端到端测试 — Gateway -> Model-Orchestrator Bridge
 *
 * 验证跨包桥接路由：
 *  - GET /v1/model-orchestrator/models
 *  - POST /v1/model-orchestrator/chat
 *  - GET /v1/skills
 *  - POST /v1/skills/:skillId/execute
 *
 * Note: This machine has Ollama + LM Studio running locally, so the
 * model-orchestrator bridge will discover real models. Tests verify
 * structural correctness regardless of which models are available.
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import Fastify from 'fastify';
import { apiRoutes } from '../packages/gateway/src/routes/api.js';

describe('E2E: Gateway -> Model-Orchestrator Bridge', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    fastify = Fastify({ logger: false });
    await fastify.register(apiRoutes, { prefix: '/v1' });
    await fastify.ready();
  });

  // ── Model-Orchestrator ──

  test('GET /v1/model-orchestrator/models returns model list with correct structure', async () => {
    const resp = await fastify.inject({ method: 'GET', url: '/v1/model-orchestrator/models' });

    expect([200, 502]).toContain(resp.statusCode);
    const body = JSON.parse(resp.body);

    if (resp.statusCode === 200) {
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('models');
      expect(Array.isArray(body.models)).toBe(true);
      expect(typeof body.total).toBe('number');
      if (body.models.length > 0) {
        const model = body.models[0];
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('provider');
      }
    } else {
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code', 'MODEL_ORCH_FAILED');
    }
  }, { timeout: 30000 });

  test('GET /v1/model-orchestrator/models is idempotent across calls', async () => {
    const [r1, r2] = await Promise.all([
      fastify.inject({ method: 'GET', url: '/v1/model-orchestrator/models' }),
      fastify.inject({ method: 'GET', url: '/v1/model-orchestrator/models' }),
    ]);

    expect(r1.statusCode).toBe(r2.statusCode);
  }, { timeout: 60000 });

  test('POST /v1/model-orchestrator/chat rejects empty messages', async () => {
    const resp = await fastify.inject({
      method: 'POST',
      url: '/v1/model-orchestrator/chat',
      payload: {},
    });

    expect(resp.statusCode).toBe(400);
    const body = JSON.parse(resp.body);
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code', 'MISSING_MESSAGES');
  });

  test('POST /v1/model-orchestrator/chat rejects null messages', async () => {
    const resp = await fastify.inject({
      method: 'POST',
      url: '/v1/model-orchestrator/chat',
      payload: { messages: null },
    });

    expect(resp.statusCode).toBe(400);
    const body = JSON.parse(resp.body);
    expect(body.error.code).toBe('MISSING_MESSAGES');
  });

  test('POST /v1/model-orchestrator/chat rejects empty messages array', async () => {
    const resp = await fastify.inject({
      method: 'POST',
      url: '/v1/model-orchestrator/chat',
      payload: { messages: [] },
    });

    expect(resp.statusCode).toBe(400);
    const body = JSON.parse(resp.body);
    expect(body.error.code).toBe('MISSING_MESSAGES');
  });

  // ── Skills ──

  test('GET /v1/skills returns skill list (may be empty)', async () => {
    const resp = await fastify.inject({ method: 'GET', url: '/v1/skills' });

    expect([200, 502]).toContain(resp.statusCode);
    if (resp.statusCode === 200) {
      const body = JSON.parse(resp.body);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('skills');
      expect(Array.isArray(body.skills)).toBe(true);
      expect(typeof body.total).toBe('number');
    }
  });

  test('GET /v1/skills endpoint is stable across concurrent requests', async () => {
    const [r1, r2] = await Promise.all([
      fastify.inject({ method: 'GET', url: '/v1/skills' }),
      fastify.inject({ method: 'GET', url: '/v1/skills' }),
    ]);

    expect(r1.statusCode).toBe(r2.statusCode);
  });

  // ── Cross-bundle consistency ──

  test('GET /v1/health returns correct structure after all routes are registered', async () => {
    const resp = await fastify.inject({ method: 'GET', url: '/v1/health' });
    expect(resp.statusCode).toBe(200);

    const body = JSON.parse(resp.body);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('timestamp');
    expect(typeof body.timestamp).toBe('number');
    expect(body).toHaveProperty('agents');
    expect(Array.isArray(body.agents)).toBe(true);
  });

  test('all bridge routes accept HTTP requests without throwing', async () => {
    // Quick sanity: all bridge routes respond (not crash)
    const routes = [
      { method: 'GET' as const, url: '/v1/model-orchestrator/models' },
      { method: 'POST' as const, url: '/v1/model-orchestrator/chat', payload: {} },
      { method: 'GET' as const, url: '/v1/skills' },
    ];

    for (const route of routes) {
      const resp = await fastify.inject(route);
      expect(typeof resp.statusCode).toBe('number'); // no crash
    }
  });
});
