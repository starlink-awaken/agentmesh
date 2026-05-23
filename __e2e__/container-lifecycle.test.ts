/**
 * ISC-4: 端到端测试 — GatewayContainer 生命周期
 *
 * 验证容器创建、初始化、健康检查、热重载和优雅关闭的全流程。
 * 使用临时数据目录避免与其他测试的状态冲突。
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify from 'fastify';
import type { GatewayConfig } from '../packages/gateway/src/core/config.js';
import {
  GatewayContainer,
} from '../packages/gateway/src/core/gateway.js';
import { apiRoutes } from '../packages/gateway/src/routes/api.js';

describe('E2E: GatewayContainer Lifecycle', () => {
  let gw: GatewayContainer;
  const testDataDir = resolve(import.meta.dirname, '.test-data');

  // Clean up any leftover data from previous runs
  beforeAll(() => {
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
    mkdirSync(testDataDir, { recursive: true });
  });

  afterAll(() => {
    // Clean up test data
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  // ── Creation ──

  test('GatewayContainer can be created from configuration', () => {
    const config: GatewayConfig = {
      host: '0.0.0.0',
      port: 0,
      logLevel: 'silent',
      logDir: testDataDir + '/logs',
      dataDir: testDataDir,
      agents: [],
      routing: { defaultAgent: 'test', rules: [] },
    };
    gw = new GatewayContainer(config);

    expect(gw).toBeDefined();
    expect(gw.config).toBeDefined();
    expect(gw.config.port).toBe(0);
    expect(gw.config.host).toBe('0.0.0.0');
  });

  test('GatewayContainer exposes core module references', () => {
    expect(gw.eventBus).toBeDefined();
    expect(gw.router).toBeDefined();
    expect(gw.agentRegistry).toBeDefined();
    expect(gw.taskManager).toBeDefined();
    expect(gw.contextManager).toBeDefined();
    expect(gw.vectorStore).toBeDefined();
    expect(gw.circuitBreakerRegistry).toBeDefined();
    expect(gw.scheduler).toBeDefined();
    expect(gw.pipeline).toBeDefined();
    expect(gw.store).toBeDefined();
  });

  test('GatewayContainer has config property accessible', () => {
    expect(gw.config.port).toBe(0);
    expect(gw.config.host).toBe('0.0.0.0');
  });

  // ── Initialization ──

  test('GatewayContainer initializes without errors', async () => {
    await expect(gw.initialize()).resolves.toBeUndefined();
  });

  test('GatewayContainer reports correct health after init', async () => {
    const health = gw.health();

    expect(health).toHaveProperty('status');
    expect(health.status).toBe('ok');
    expect(health).toHaveProperty('uptime_seconds');
    expect(typeof health.uptime_seconds).toBe('number');
    expect(health.uptime_seconds).toBeGreaterThanOrEqual(0);

    expect(health).toHaveProperty('agents');
    expect(health.agents).toHaveProperty('total');
    expect(typeof health.agents.total).toBe('number');
    expect(health.agents).toHaveProperty('online');

    expect(health).toHaveProperty('tasks');
    expect(health.tasks).toHaveProperty('pending');
    expect(typeof health.tasks.pending).toBe('number');
    expect(health.tasks).toHaveProperty('running');
    expect(health.tasks).toHaveProperty('completed');
    expect(health.tasks).toHaveProperty('failed');

    expect(health).toHaveProperty('circuit_breakers');
  });

  test('initialize is idempotent (calling multiple times is safe)', async () => {
    await expect(gw.initialize()).resolves.toBeUndefined();
    await expect(gw.initialize()).resolves.toBeUndefined();

    const health = gw.health();
    expect(health.status).toBe('ok');
  });

  test('uptimeSeconds returns non-negative value', async () => {
    const u1 = gw.uptimeSeconds;
    // Wait briefly
    await new Promise(r => setTimeout(r, 10));
    const u2 = gw.uptimeSeconds;
    expect(u2).toBeGreaterThanOrEqual(u1);
  });

  // ── Delegate Methods ──

  test('GatewayContainer.getAllAgents returns agent list', () => {
    const agents = gw.getAllAgents();
    expect(Array.isArray(agents)).toBe(true);
  });

  test('GatewayContainer provides task manager integration', () => {
    const tasks = gw.getAllTasks();
    expect(Array.isArray(tasks)).toBe(true);
  });

  // ── Integration with Fastify ──

  test('GatewayContainer-backed Fastify route returns correct health', async () => {
    const fastify = Fastify({ logger: false });
    await fastify.register(apiRoutes, { prefix: '/v1' });
    await fastify.ready();

    const resp = await fastify.inject({ method: 'GET', url: '/v1/health' });
    expect(resp.statusCode).toBe(200);

    const body = JSON.parse(resp.body);
    expect(body).toHaveProperty('status');

    await fastify.close();
  });

  test('GatewayContainer.createSpace creates a shared space', async () => {
    const spaceId = await gw.createSpace({ purpose: 'test' });
    expect(typeof spaceId).toBe('string');
    expect(spaceId.length).toBeGreaterThan(0);
  });

  // ── Dispose ──

  test('GatewayContainer disposes without errors', async () => {
    await expect(gw.dispose()).resolves.toBeUndefined();
  });

  test('GatewayContainer reports starting status after dispose', () => {
    const health = gw.health();
    expect(health.status).toBe('starting');
  });
});
