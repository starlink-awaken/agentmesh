import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { resolveProvider, getConfig, remapModel } from './router.js';
import { callChatCompletions, callResponsesApi } from './providers.js';
import { getQuotaSummary, probeQuota } from './quota.js';
import { circuitBreakerRegistry } from './circuit-breaker.js';
import { checkAllProviders } from './health.js';

export async function modelGatewayRoutes(fastify: FastifyInstance) {
  // 健康检查 + 配额总览
  fastify.get('/model-gateway/health', async (_req: FastifyRequest, _reply: FastifyReply) => {
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
  fastify.get('/model-gateway/quota', async (_req: FastifyRequest, reply: FastifyReply) => {
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
    console.log(`[ModelGW] ${originalModel} → ${provider.name}/${model} (${body.stream ? 'stream' : 'sync'})`);

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

      if (!upstreamResp.ok && upstreamResp.status !== 200) {
        const errText = await upstreamResp.text();
        console.error(`[ModelGW] ${provider.name} error ${upstreamResp.status}: ${errText.slice(0, 200)}`);
        return reply.code(upstreamResp.status).send({
          error: { message: `${provider.name}: ${errText.slice(0, 500)}` },
        });
      }

      if (body.stream) {
        return reply.headers({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        }).send(upstreamResp.body);
      }

      const data = await upstreamResp.json();
      reply.send(data);
    } catch (err) {
      console.error(`[ModelGW] Error calling ${provider.name}:`, (err as Error).message);
      reply.code(502).send({
        error: { message: `Provider error: ${(err as Error).message}` },
      });
    }
  });

  // POST /v1/responses — Codex Desktop Responses API 适配
  fastify.post('/v1/responses', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, any>;
    if (!body || !body.input) {
      return reply.code(400).send({ error: { message: 'input is required' } });
    }

    const model = body.model || 'deepseek-chat';
    const provider = resolveProvider(model);

    if (!provider) {
      return reply.code(503).send({
        error: { message: 'No available provider. Check API keys and quota.' },
      });
    }

    console.log(`[ModelGW:Responses] ${model} → ${provider.name}`);

    try {
      const upstreamResp = await callResponsesApi(provider, body);

      if (!upstreamResp.ok) {
        const errText = await upstreamResp.text();
        return reply.code(upstreamResp.status).send({
          error: { message: `${provider.name}: ${errText.slice(0, 500)}` },
        });
      }

      if (body.stream) {
        return reply.headers({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        }).send(upstreamResp.body);
      }

      // 将 Chat Completions 响应转回 Responses API 格式
      const ccData = (await upstreamResp.json()) as Record<string, any>;
      const choice = ccData.choices?.[0];
      const responsesData = {
        id: ccData.id,
        object: 'response',
        model: ccData.model,
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: choice?.message?.content || '',
              },
            ],
          },
        ],
        usage: ccData.usage,
      };

      reply.send(responsesData);
    } catch (err) {
      console.error(`[ModelGW:Responses] Error:`, (err as Error).message);
      reply.code(502).send({
        error: { message: `Provider error: ${(err as Error).message}` },
      });
    }
  });

  // Provider 健康检查 + 熔断器状态
  fastify.get('/model-gateway/health/:provider', async (request: FastifyRequest, reply: FastifyReply) => {
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
  fastify.get('/model-gateway/health/all', async (_request: FastifyRequest, reply: FastifyReply) => {
    const cfg = getConfig();
    if (!cfg) return reply.code(503).send({ error: { message: 'Model gateway not configured' } });
    const results = await checkAllProviders(cfg);
    reply.send({
      providers: results,
      circuit_breaker: circuitBreakerRegistry.getStatus(),
    });
  });
}
