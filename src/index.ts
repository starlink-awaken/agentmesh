import Fastify from 'fastify';
import cors from '@fastify/cors';
import { apiRoutes } from './routes/api.js';
import { websocketRoutes } from './routes/websocket.js';
import { eventBus } from './core/event-bus.js';
import { router } from './core/router.js';
import { agentRegistry } from './core/agent-registry.js';
import { vectorStore } from './core/vector-store.js';
import { loadConfig, getRoutingRules, getDefaultAgent } from './core/config.js';

async function main() {
  const config = loadConfig();

  // 初始化 Fastify
  const fastify = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  // 注册 CORS
  await fastify.register(cors, {
    origin: true
  });

  // 注册路由
  await fastify.register(apiRoutes);
  await fastify.register(websocketRoutes);

  // 初始化组件
  const rules = getRoutingRules();
  const defaultAgent = getDefaultAgent();
  router.configure(rules, defaultAgent);

  // 初始化 Agent Registry
  agentRegistry.initialize();

  // 注册所有 Agent 到 Router
  agentRegistry.getAgents().forEach(agent => {
    router.registerAgent(agent);
  });

  // 初始化向量存储（异步）
  vectorStore.initialize().catch(err => {
    console.warn('[VectorStore] Init failed:', err);
  });

  // 启动服务器
  try {
    await fastify.listen({
      port: config.port,
      host: config.host
    });

    console.log(`
╔═══════════════════════════════════════════════════╗
║           Agent Gateway Server                   ║
╠═══════════════════════════════════════════════════╣
║  HTTP Server: http://${config.host}:${config.port}              ║
║  WebSocket:  ws://${config.host}:${config.port}/ws             ║
║  SSE:        http://${config.host}:${config.port}/events       ║
║  Health:     http://${config.host}:${config.port}/health       ║
║  Tasks:      http://${config.host}:${config.port}/tasks        ║
║  Spaces:     http://${config.host}:${config.port}/spaces       ║
║  Agents:     http://${config.host}:${config.port}/agents       ║
╚═══════════════════════════════════════════════════╝
    `);

    // 订阅事件日志
    eventBus.getEventTypes().forEach(eventType => {
      eventBus.subscribe(eventType, (event) => {
        console.log(`[Event] ${event.type}:`, {
          id: event.data.id,
          correlation_id: event.data.correlation_id
        });
      });
    });
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

main();
