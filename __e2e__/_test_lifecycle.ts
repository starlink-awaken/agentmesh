import { loadConfig } from '../packages/gateway/src/core/config.js';
import { GatewayContainer, setGateway, getGateway } from '../packages/gateway/src/core/gateway.js';
import Fastify from 'fastify';
import { sseRoutes } from '../packages/gateway/src/routes/sse.js';

const cfg = loadConfig();
const gw = new GatewayContainer(cfg);
setGateway(gw);
console.log('GatewayContainer created');

// Test SSE routes
const fastify = Fastify({ logger: false });
await fastify.register(sseRoutes, { prefix: '/v1' });
await fastify.ready();
console.log('SSE routes registered');

const resp = await fastify.inject({ method: 'GET', url: '/v1/ws-info' });
console.log('SSE response:', resp.statusCode);

await fastify.close();
await gw.dispose();
console.log('Disposed');
console.log('LIFECYCLE TEST OK');
