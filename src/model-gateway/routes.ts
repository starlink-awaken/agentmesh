import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { resolveProvider, getConfig, remapModel } from './router.js';
import { callChatCompletions, callResponsesApi } from './providers.js';
import { getQuotaSummary, probeQuota } from './quota.js';
import { circuitBreakerRegistry } from './circuit-breaker.js';
import { checkAllProviders } from './health.js';
import { getMetrics, recordRequest } from './metrics.js';
import { checkRateLimit } from './rate-limit.js';
import { logger } from '../core/logger.js';

function logReq(originalModel: string, providerName: string, actualModel: string, reqStart: number, status: number, streaming: boolean, error?: string) {
  recordRequest({
    timestamp: Date.now(), model: originalModel,
    provider: providerName, actualModel, latencyMs: Date.now() - reqStart,
    status, streaming, error,
  });
}

export async function modelGatewayRoutes(fastify: FastifyInstance) {
  // 健康检查 + 配额总览
  fastify.get('/v1/model-gateway/health', async (_req: FastifyRequest, _reply: FastifyReply) => {
    const quota = await probeQuota();
    return {
      status: 'ok',
      timestamp: Date.now(),
      providers_available: Array.from(quota.entries())
        .filter(([_, info]) => info.available)
        .map(([name, info]) => ({ name, summary: info.summary })),
      providers_unavailable: Array.from(quota.entries())
        .filter(([_, info]) => !info.available)
        .map(([name, info]) => ({ name, summary: info.summary })),
    };
  });

  // 配额详情
  fastify.get('/v1/model-gateway/quota', async (_req: FastifyRequest, reply: FastifyReply) => {
    await probeQuota();
    reply.send(getQuotaSummary());
  });

  // 可用模型列表
  fastify.get('/v1/models', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { getConfig } = await import('./router.js');
    const cfg = getConfig();
    const models: Array<{ id: string; object: string; owned_by: string }> = [];

    if (cfg) {
      for (const [providerName, providerCfg] of Object.entries(cfg.providers)) {
        const providerModels = providerCfg.models || [providerName];
        for (const model of providerModels) {
          models.push({ id: model, object: 'model', owned_by: providerName });
        }
      }
    }

    reply.send({ object: 'list', data: models });
  });

  // POST /v1/chat/completions — 标准 OpenAI 兼容端点
  fastify.post('/v1/chat/completions', async (request: FastifyRequest, reply: FastifyReply) => {
    const ip = request.ip || '127.0.0.1';
    const rl = checkRateLimit('/v1/chat/completions', ip);
    if (!rl.allowed) {
      return reply.code(429).header('Retry-After', String(rl.resetSeconds)).header('X-RateLimit-Limit', rl.limit).header('X-RateLimit-Remaining', '0').send({ error: { message: 'Rate limit exceeded' } });
    }

    const body = request.body as Record<string, any>;
    if (!body || !body.messages) {
      return reply.code(400).send({ error: { message: 'messages is required' } });
    }

    const originalModel = body.model || 'deepseek-chat';
    const provider = resolveProvider(originalModel);

    if (!provider) {
      return reply.code(503).send({
        error: { message: 'No available provider. Check API keys and quota.' },
      });
    }

    const model = remapModel(originalModel, provider.name);
    const reqStart = Date.now();
    logger.info('model_gateway_request', { originalModel, provider: provider.name, model, stream: !!body.stream });

    try {
      const upstreamResp = await callChatCompletions(provider, {
        model,
        messages: body.messages,
        stream: body.stream,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
        tools: body.tools,
        tool_choice: body.tool_choice,
      });

      if (!upstreamResp.ok) {
        const errText = await upstreamResp.text();
        logReq(originalModel, provider.name, model, reqStart, upstreamResp.status, !!body.stream, errText.slice(0, 200));
        logger.error('model_gateway_upstream_error', { provider: provider.name, status: upstreamResp.status, error: errText.slice(0, 200) });
        return reply.code(upstreamResp.status).send({
          error: { message: `${provider.name}: ${errText.slice(0, 500)}` },
        });
      }

      if (body.stream) {
        logReq(originalModel, provider.name, model, reqStart, 200, true);
        return reply.headers({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        }).send(upstreamResp.body);
      }

      const data = await upstreamResp.json();
      logReq(originalModel, provider.name, model, reqStart, 200, false);
      reply.send(data);
    } catch (err) {
      logReq(originalModel, provider.name, model, reqStart, 502, !!body.stream, (err as Error).message);
      logger.error('model_gateway_call_error', { provider: provider.name, error: (err as Error).message });
      reply.code(502).send({
        error: { message: `Provider error: ${(err as Error).message}` },
      });
    }
  });

  // POST /v1/responses — Codex Desktop Responses API 适配
  fastify.post('/v1/responses', async (request: FastifyRequest, reply: FastifyReply) => {
    const ip = request.ip || '127.0.0.1';
    const rl = checkRateLimit('/v1/responses', ip);
    if (!rl.allowed) {
      return reply.code(429).header('Retry-After', String(rl.resetSeconds)).send({ error: { message: 'Rate limit exceeded' } });
    }

    const body = request.body as Record<string, any>;
    if (!body || !body.input) {
      return reply.code(400).send({ error: { message: 'input is required' } });
    }

    const originalModel = body.model || 'deepseek-chat';
    const provider = resolveProvider(originalModel);

    if (!provider) {
      return reply.code(503).send({
        error: { message: 'No available provider. Check API keys and quota.' },
      });
    }

    const model = remapModel(originalModel, provider.name);
    body.model = model;
    logger.info('model_gateway_responses_request', { originalModel, provider: provider.name, model });

    const reqStart = Date.now();
    try {
      const upstreamResp = await callResponsesApi(provider, body);

      if (!upstreamResp.ok) {
        const errText = await upstreamResp.text();
        logReq(originalModel, provider.name, model, reqStart, upstreamResp.status, !!body.stream, errText.slice(0, 200));
        return reply.code(upstreamResp.status).send({
          error: { message: `${provider.name}: ${errText.slice(0, 500)}` },
        });
      }

      logReq(originalModel, provider.name, model, reqStart, 200, !!body.stream);

      if (body.stream) {
        return reply.headers({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        }).send(upstreamResp.body);
      }

      const data = await upstreamResp.json();
      reply.send(data);
    } catch (err) {
      logReq(originalModel, provider.name, model, reqStart, 502, !!body.stream, (err as Error).message);
      logger.error('model_gateway_responses_error', { error: (err as Error).message });
      reply.code(502).send({
        error: { message: `Provider error: ${(err as Error).message}` },
      });
    }
  });

  // 运行时统计
  fastify.get('/v1/model-gateway/stats', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.send(getMetrics());
  });

  // Provider 健康检查 + 熔断器状态
  fastify.get('/v1/model-gateway/health/:provider', async (request: FastifyRequest, reply: FastifyReply) => {
    const { provider } = request.params as { provider: string };
    const cfg = getConfig();
    if (!cfg || !cfg.providers[provider]) {
      return reply.code(404).send({ error: { message: `Provider '${provider}' not found` } });
    }
    const results = await checkAllProviders(cfg);
    const result = results.find(r => r.provider === provider);
    if (!result) {
      return reply.code(404).send({ error: { message: `Health check not available for '${provider}'` } });
    }
    reply.send({ ...result, circuit_breaker: circuitBreakerRegistry.getStatus() });
  });

  // 全部 Provider 健康检查
  fastify.get('/v1/model-gateway/health/all', async (_request: FastifyRequest, reply: FastifyReply) => {
    const cfg = getConfig();
    if (!cfg) return reply.code(503).send({ error: { message: 'Model gateway not configured' } });
    const results = await checkAllProviders(cfg);
    reply.send({
      providers: results,
      circuit_breaker: circuitBreakerRegistry.getStatus(),
    });
  });
}
