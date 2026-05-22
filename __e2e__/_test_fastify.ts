import Fastify from 'fastify';
import { apiRoutes } from '../packages/gateway/src/routes/api.js';
import { sseRoutes } from '../packages/gateway/src/routes/sse.js';
import { loadConfig } from '../packages/gateway/src/core/config.js';
import { GatewayContainer, setGateway } from '../packages/gateway/src/core/gateway.js';

console.log('All imports OK');

// Test fastify
const fastify = Fastify({ logger: false });
await fastify.register(apiRoutes, { prefix: '/v1' });
await fastify.register(sseRoutes, { prefix: '/v1' });
await fastify.ready();
console.log('Fastify + routes registered');

// Test health endpoint
const resp = await fastify.inject({ method: 'GET', url: '/v1/health' });
console.log('Health:', resp.statusCode);

// Test SSE endpoint
const sseResp = await fastify.inject({ method: 'GET', url: '/v1/ws-info' });
console.log('SSE ws-info:', sseResp.statusCode);

// Test config
const cfg = loadConfig();
console.log('Config:', cfg.host, cfg.port);

// Test GatewayContainer
const gw = new GatewayContainer(cfg);
setGateway(gw);
console.log('Gateway created');
await gw.dispose();
console.log('Gateway disposed');

await fastify.close();
console.log('ALL E2E TESTS PASSED');
