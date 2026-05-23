/**
 * ISC-2: 端到端测试 — SSE Streaming 链路
 *
 * 验证 SSE（Server-Sent Events）端点是否正确注册和响应。
 *
 * Note: GET /v1/events uses reply.hijack() which doesn't work with
 * fastify.inject() (simulated HTTP). Only normal REST endpoints are
 * tested via inject(). SSE streaming endpoints should be tested with
 * a real HTTP server in integration environments.
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import Fastify from 'fastify';
import { sseRoutes } from '../packages/gateway/src/routes/sse.js';

describe('E2E: SSE Streaming Link', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    fastify = Fastify({ logger: false });
    await fastify.register(sseRoutes, { prefix: '/v1' });
    await fastify.ready();
  });

  // REST endpoints that work with inject()

  test('GET /v1/ws-info returns SSE connection information', async () => {
    const resp = await fastify.inject({ method: 'GET', url: '/v1/ws-info' });

    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('endpoints');
    expect(body.endpoints).toHaveProperty('events');
    expect(body).toHaveProperty('example');
  });

  test('POST /v1/broadcast accepts and processes broadcast request', async () => {
    const resp = await fastify.inject({
      method: 'POST',
      url: '/v1/broadcast',
      payload: { type: 'test_event', data: { message: 'hello' } },
    });

    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body).toHaveProperty('delivered');
    expect(typeof body.delivered).toBe('number');
    // If no SSE clients are connected, delivered should be 0
    expect(body.delivered).toBe(0);
  });

  test('POST /v1/broadcast accepts minimal payload', async () => {
    const resp = await fastify.inject({
      method: 'POST',
      url: '/v1/broadcast',
      payload: { type: 'ping', data: {} },
    });

    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body).toHaveProperty('delivered');
    expect(body.delivered).toBe(0);
  });

  // ws-info endpoint returns consistent structure

  test('GET /v1/ws-info is idempotent', async () => {
    const resp1 = await fastify.inject({ method: 'GET', url: '/v1/ws-info' });
    const resp2 = await fastify.inject({ method: 'GET', url: '/v1/ws-info' });

    expect(resp1.statusCode).toBe(200);
    expect(resp2.statusCode).toBe(200);
    const b1 = JSON.parse(resp1.body);
    const b2 = JSON.parse(resp2.body);
    expect(b1.message).toBe(b2.message);
  });

  // Note: GET /v1/events (SSE streaming) uses reply.hijack() and
  // cannot be tested via fastify.inject() which relies on simulated
  // HTTP request/response lifecycle. For proper SSE testing, use
  // a real HTTP server or integration test environment.
});
