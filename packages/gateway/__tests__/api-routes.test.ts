import { describe, test, expect, beforeAll, beforeEach, jest } from 'bun:test';
import Fastify from 'fastify';
import { apiRoutes } from '../src/routes/api.js';

describe('apiRoutes module', () => {
  test('exports apiRoutes function', () => {
    expect(typeof apiRoutes).toBe('function');
  });
});

describe('health endpoint', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    fastify = Fastify({ logger: false });
    await fastify.register(apiRoutes);
    await fastify.ready();
  });

  test('GET /health returns 200 with expected structure', async () => {
    const resp = await fastify.inject({ method: 'GET', url: '/health' });
    expect(resp.statusCode).toBe(200);

    const body = JSON.parse(resp.body);
    expect(body).toHaveProperty('timestamp');
    expect(typeof body.timestamp).toBe('number');
    // When no gateway is configured, should return 'starting' status
    expect(body.status).toBe('starting');
    expect(body).toHaveProperty('agents');
    expect(Array.isArray(body.agents)).toBe(true);
  });

  test('GET /health/detailed returns 200', async () => {
    const resp = await fastify.inject({ method: 'GET', url: '/health/detailed' });
    expect(resp.statusCode).toBe(200);

    const body = JSON.parse(resp.body);
    // Without a configured gateway, should still return a status
    expect(body).toHaveProperty('status');
  });
});

describe('task endpoints', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    fastify = Fastify({ logger: false });
    await fastify.register(apiRoutes);
    await fastify.ready();
  });

  test('GET /tasks returns 200 with array', async () => {
    const resp = await fastify.inject({ method: 'GET', url: '/tasks' });
    expect(resp.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(resp.body))).toBe(true);
  });

  test('GET /tasks/:id returns 404 for unknown task', async () => {
    const resp = await fastify.inject({ method: 'GET', url: '/tasks/nonexistent-task-id' });
    expect(resp.statusCode).toBe(404);

    const body = JSON.parse(resp.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('TASK_NOT_FOUND');
  });

  test('POST /tasks/:id/cancel returns 404 for unknown task', async () => {
    const resp = await fastify.inject({ method: 'POST', url: '/tasks/nonexistent-task-id/cancel' });
    expect(resp.statusCode).toBe(404);

    const body = JSON.parse(resp.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('CANCEL_FAILED');
  });
});

describe('agent endpoints', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    fastify = Fastify({ logger: false });
    await fastify.register(apiRoutes);
    await fastify.ready();
  });

  test('GET /agents returns 200 with array', async () => {
    const resp = await fastify.inject({ method: 'GET', url: '/agents' });
    expect(resp.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(resp.body))).toBe(true);
  });

  test('POST /agents registers an agent', async () => {
    const resp = await fastify.inject({
      method: 'POST',
      url: '/agents',
      payload: { id: 'test-agent', name: 'Test Agent', capabilities: ['test'] },
    });
    expect(resp.statusCode).toBe(201);

    const body = JSON.parse(resp.body);
    expect(body.id).toBe('test-agent');
    expect(body.status).toBe('registered');
  });
});

describe('shared space endpoints', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    fastify = Fastify({ logger: false });
    await fastify.register(apiRoutes);
    await fastify.ready();
  });

  test('GET /spaces/:id returns 404 for unknown space', async () => {
    const resp = await fastify.inject({ method: 'GET', url: '/spaces/unknown-space-id' });
    expect(resp.statusCode).toBe(404);

    const body = JSON.parse(resp.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('SPACE_NOT_FOUND');
  });
});

describe('scheduler endpoint error handling', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    fastify = Fastify({ logger: false });
    await fastify.register(apiRoutes);
    await fastify.ready();
  });

  test('POST /scheduler returns 400 when required fields are missing', async () => {
    const resp = await fastify.inject({
      method: 'POST',
      url: '/scheduler',
      payload: { name: 'test' }, // missing cron and task
    });
    expect(resp.statusCode).toBe(400);

    const body = JSON.parse(resp.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('MISSING_FIELDS');
  });
});

describe('pipeline endpoint error handling', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    fastify = Fastify({ logger: false });
    await fastify.register(apiRoutes);
    await fastify.ready();
  });

  test('POST /pipeline returns 400 when steps or input missing', async () => {
    const resp = await fastify.inject({
      method: 'POST',
      url: '/pipeline',
      payload: { steps: [] }, // missing input
    });
    expect(resp.statusCode).toBe(400);

    const body = JSON.parse(resp.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('MISSING_FIELDS');
  });
});
