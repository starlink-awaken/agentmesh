import Fastify from 'fastify';
import cors from '@fastify/cors';
import { apiRoutes } from './routes/api.js';
import { sseRoutes } from './routes/sse.js';
import { modelGatewayRoutes } from './model-gateway/routes.js';
import { initModelRouter } from './model-gateway/router.js';
import { GatewayContainer, setGateway } from './core/gateway.js';
import { loadConfig } from './core/config.js';
import { circuitBreakerRegistry } from './model-gateway/circuit-breaker.js';
import { configureRetry } from './model-gateway/retry.js';
import { initRateLimiter } from './model-gateway/rate-limit.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

async function main() {
  const config = loadConfig();

  // 创建 DI 容器
  const gateway = new GatewayContainer(config);
  setGateway(gateway);

  // 初始化 Fastify
  const fastify = Fastify({
    logger: { level: config.logLevel }
  });

  // 桥接 Pino → 核心 Logger
  gateway.setPinoLogger(fastify.log);

  // 全局错误处理
  fastify.setErrorHandler((error: any, _request, reply) => {
    fastify.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'Internal server error',
      },
    });
  });

  // 注册 CORS
  await fastify.register(cors, { origin: true });

  // 注册路由
  const { dashboardRoutes } = await import('./routes/dashboard.js');
  await fastify.register(dashboardRoutes);
  await fastify.register(apiRoutes, { prefix: '/v1' });
  await fastify.register(sseRoutes, { prefix: '/v1' });
  await fastify.register(modelGatewayRoutes);
  const { hermesRoutes } = await import('./hermes/routes.js');
  await fastify.register(hermesRoutes, { prefix: '/v1' });

  // 初始化模型网关
  const modelsConfig = config.models;
  if (modelsConfig) {
    const cbRaw = modelsConfig.defaults?.circuit_breaker;
    if (cbRaw) {
      const cbConfig = {
        failureThreshold: cbRaw.failure_threshold,
        resetTimeoutMs: cbRaw.reset_timeout_ms,
        halfOpenMaxRequests: cbRaw.half_open_max_requests,
      };
      for (const [name] of Object.entries(modelsConfig.providers || {})) {
        circuitBreakerRegistry.configure(name, cbConfig);
      }
    }

    const retryRaw = modelsConfig.defaults?.retry;
    if (retryRaw) {
      configureRetry({
        maxRetries: retryRaw.max_retries,
        baseDelayMs: retryRaw.base_delay_ms,
        maxDelayMs: retryRaw.max_delay_ms,
        retryableStatuses: retryRaw.retryable_statuses,
      });
    }

    initRateLimiter(modelsConfig.defaults?.rate_limit);
    initModelRouter(modelsConfig);
    console.log(`[ModelGW] Initialized: ${Object.keys(modelsConfig.providers || {}).length} providers, fallback: ${modelsConfig.fallback_chain?.join(' → ')}`);

    import('./model-gateway/quota.js').then(m => m.probeQuota()).catch(() => {});
    console.log('[ModelGW] Quota pre-warming started (background)');
  }

  // 初始化 DI 容器（路由规则 + Agent 注册 + VectorStore 预热）
  await gateway.initialize();

  // 启动配置文件热重载监听
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const configPath = resolve(__dirname, '..', 'config', 'gateway.yaml');
  gateway.startConfigWatcher(configPath);

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
║  API v1:    http://${config.host}:${config.port}/v1/              ║
║  Health:    http://${config.host}:${config.port}/v1/health        ║
║  Tasks:     http://${config.host}:${config.port}/v1/tasks          ║
║  Spaces:    http://${config.host}:${config.port}/v1/spaces         ║
║  Agents:    http://${config.host}:${config.port}/v1/agents         ║
║  Events:    http://${config.host}:${config.port}/v1/events         ║
╠═══════════════════════════════════════════════════╣
║  Chat:      http://${config.host}:${config.port}/v1/chat/completions ║
║  Models:    http://${config.host}:${config.port}/v1/models         ║
║  Quota:     http://${config.host}:${config.port}/v1/model-gateway/quota ║
╠═══════════════════════════════════════════════════╣
║  Hot Reload: watching config/gateway.yaml          ║
╚═══════════════════════════════════════════════════╝
    `);

    // 订阅事件日志
    gateway.eventBus.getEventTypes().forEach(eventType => {
      gateway.onEvent(eventType, (event) => {
        console.log(`[Event] ${event.type}:`, {
          id: event.data.id,
          correlation_id: event.data.correlation_id
        });
      });
    });

    // 优雅停机
    const shutdown = async (signal: string) => {
      console.log(`\n[Gateway] Received ${signal}, shutting down gracefully...`);
      gateway.stopConfigWatcher();
      await fastify.close();
      await gateway.dispose();
      console.log('[Gateway] Shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

main();
