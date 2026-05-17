import Fastify from 'fastify';
import cors from '@fastify/cors';
import { apiRoutes } from './routes/api.js';
import { websocketRoutes } from './routes/websocket.js';
import { modelGatewayRoutes } from './model-gateway/routes.js';
import { initModelRouter } from './model-gateway/router.js';
import { eventBus } from './core/event-bus.js';
import { router } from './core/router.js';
import { agentRegistry } from './core/agent-registry.js';
import { vectorStore } from './core/vector-store.js';
import { loadConfig, getRoutingRules, getDefaultAgent } from './core/config.js';
import { circuitBreakerRegistry } from './model-gateway/circuit-breaker.js';
import { configureRetry } from './model-gateway/retry.js';
import { initRateLimiter } from './model-gateway/rate-limit.js';

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
  await fastify.register(modelGatewayRoutes);
  const { hermesRoutes } = await import('./hermes/routes.js');
  await fastify.register(hermesRoutes);

  // 初始化模型网关
  const modelsConfig = (config as any).models;
  if (modelsConfig) {
    // 配置熔断器
    const cbDefaults = modelsConfig.defaults?.circuit_breaker;
    if (cbDefaults) {
      for (const [name] of Object.entries(modelsConfig.providers || {})) {
        circuitBreakerRegistry.configure(name, cbDefaults);
      }
    }

    // 配置重试
    const retryDefaults = modelsConfig.defaults?.retry;
    if (retryDefaults) {
      configureRetry(retryDefaults);
    }

    // 初始化限流器
    initRateLimiter();

    initModelRouter(modelsConfig);
    console.log(`[ModelGW] Initialized: ${Object.keys(modelsConfig.providers || {}).length} providers, fallback: ${modelsConfig.fallback_chain?.join(' → ')}`);

    // 配额预热（异步，不阻塞启动）
    import('./model-gateway/quota.js').then(m => m.probeQuota()).catch(() => {});
    console.log('[ModelGW] Quota pre-warming started (background)');
  }

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
║           Agent Mesh Gateway                      ║
╠═══════════════════════════════════════════════════╣
║  HTTP:       http://${config.host}:${config.port}                  ║
║  WebSocket:  ws://${config.host}:${config.port}/ws                 ║
║  Health:     http://${config.host}:${config.port}/health           ║
║  Tasks:      http://${config.host}:${config.port}/tasks            ║
║  Spaces:     http://${config.host}:${config.port}/spaces           ║
║  Agents:     http://${config.host}:${config.port}/agents           ║
╠═══════════════════════════════════════════════════╣
║  Model GW:   http://${config.host}:${config.port}/v1/chat/completions ║
║  Models:     http://${config.host}:${config.port}/v1/models        ║
║  Quota:      http://${config.host}:${config.port}/model-gateway/quota ║
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
