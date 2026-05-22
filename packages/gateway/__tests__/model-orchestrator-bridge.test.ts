import { describe, test, expect } from 'bun:test';
import Fastify from 'fastify';
import { apiRoutes } from '../src/routes/api.js';

describe('model-orchestrator bridge routes', () => {
  let fastify: ReturnType<typeof Fastify>;

  test('GET /model-orchestrator/models returns model list', async () => {
    fastify = Fastify({ logger: false });
    await fastify.register(apiRoutes, { prefix: '/v1' });
    await fastify.ready();

    const resp = await fastify.inject({ method: 'GET', url: '/v1/model-orchestrator/models' });
    // 可能返回 502（模型发现失败）或 200（成功）
    expect([200, 502]).toContain(resp.statusCode);
    if (resp.statusCode === 200) {
      const body = JSON.parse(resp.body);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('models');
      expect(Array.isArray(body.models)).toBe(true);
    }

    await fastify.close();
  });

  test('POST /model-orchestrator/chat validates messages', async () => {
    fastify = Fastify({ logger: false });
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

  test('GET /skills returns skill list', async () => {
    fastify = Fastify({ logger: false });
    await fastify.register(apiRoutes, { prefix: '/v1' });
    await fastify.ready();

    const resp = await fastify.inject({ method: 'GET', url: '/v1/skills' });
    expect([200, 502]).toContain(resp.statusCode);
    if (resp.statusCode === 200) {
      const body = JSON.parse(resp.body);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('skills');
    }

    await fastify.close();
  });
});
