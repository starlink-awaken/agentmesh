import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { resolveProvider, getConfig, remapModel } from './router.js';
import { callChatCompletions, callResponsesApi } from './providers.js';
import { getQuotaSummary, probeQuota } from './quota.js';
import { circuitBreakerRegistry } from './circuit-breaker.js';
import { checkAllProviders } from './health.js';
import { getMetrics, recordRequest } from './metrics.js';
import { checkRateLimit } from './rate-limit.js';

// 模型编排单例（懒加载，与 api.ts 保持同步）
import { initFromConfig } from '@agentmesh/model-orchestrator';
let _modelOrch: ReturnType<typeof initFromConfig> | null = null;
function getModelOrch() {
  if (!_modelOrch) { _modelOrch = initFromConfig(); }
  return _modelOrch;
}

/** 重置模型编排单例（用于测试隔离） */
export function resetModelOrch(): void {
  _modelOrch = null;
}

/**
 * model-gateway routes — 旧模型网关路由。
 * 即将被 model-orchestrator 取代，新功能请见 packages/model-orchestrator/。
 * /v1/chat/completions 已通过 @agentmesh/model-orchestrator 调度器路由。
 * /v1/models 已通过 @agentmesh/model-orchestrator 聚合发现。
 */

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

  // 可用模型列表（通过 model-orchestrator 聚合发现，回退到静态配置）
  fastify.get('/v1/models', async (_req: FastifyRequest, reply: FastifyReply) => {
    const cfg = getConfig();
    try {
      const { registry } = getModelOrch();
      await registry.refresh();
      const models = registry.getAll();
      if (models.length > 0) {
        return reply.send({
          object: 'list',
          data: models.map(m => ({
            id: m.id,
            object: 'model',
            owned_by: m.provider,
            created: Math.floor(Date.now() / 1000),
            capabilities: m.capabilities,
            context_window: m.contextWindow,
          })),
        });
      }
    } catch { /* fall through to static config */ }

    // 回退到静态配置（用于测试环境或无 API key 场景）
    if (!cfg) return reply.code(503).send({ error: { message: 'No model data available' } });
    const models: Array<{ id: string; object: string; owned_by: string }> = [];
    for (const [providerName, providerCfg] of Object.entries(cfg.providers)) {
      const providerModels = providerCfg.models || [providerName];
      for (const model of providerModels) {
        models.push({ id: model, object: 'model', owned_by: providerName });
      }
    }
    reply.send({ object: 'list', data: models });
  });

  // POST /v1/chat/completions — 标准 OpenAI 兼容端点（通过 model-orchestrator 调度）
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
    const reqStart = Date.now();

    try {
      const { registry } = getModelOrch();
      await registry.refresh();

      let targetModel: string;
      let providerName: string;

      // 用户指定了模型名 → 精确匹配或回退到旧路由
      if (originalModel) {
        const m = registry.get(originalModel) || registry.getAll().find(m => m.id.includes(originalModel));
        if (m) {
          targetModel = m.id;
          providerName = m.provider;
        } else {
          // 回退到旧 model-gateway 路由（深度求索等 gateway.yaml 中配置的 Provider）
          const provider = resolveProvider(originalModel);
          if (!provider) {
            return reply.code(503).send({
              error: { message: `No available provider for '${originalModel}'. Check API keys and model config.` },
            });
          }
          const model = remapModel(originalModel, provider.name);
          const upstreamResp = await callChatCompletions(provider, {
            model, messages: body.messages, stream: false,
            temperature: body.temperature, max_tokens: body.max_tokens,
            tools: body.tools, tool_choice: body.tool_choice,
          });
          logReq(originalModel, provider.name, model, reqStart, upstreamResp.status, false);
          const data = await upstreamResp.json();
          return reply.code(upstreamResp.status).send(data);
        }
      } else {
        // 未指定模型 → 调度器自动选择
        const selection = await getModelOrch().scheduler.selectModel({
          task: body.messages[0]?.content || '',
          requiredCapabilities: ['chat'],
        });
        if (!selection) throw new Error('No available model');
        targetModel = selection.model.id;
        providerName = selection.providerName;
      }

      console.log(`[ModelOrch] ${originalModel} → ${targetModel} (${body.stream ? 'stream' : 'sync'})`);

      if (body.stream) {
        const stream = registry.chatStream(targetModel, body.messages, { temperature: body.temperature });
        logReq(originalModel, providerName, targetModel, reqStart, 200, true);
        reply.hijack();
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        const sessStart = Math.floor(Date.now() / 1000);
        let chunkIndex = 0;
        for await (const chunk of stream) {
          const openaiChunk = {
            id: chunk.id || `chatcmpl-${sessStart}`,
            object: 'chat.completion.chunk',
            created: sessStart,
            model: targetModel,
            choices: [{ delta: { content: chunk.content || '' }, index: 0, finish_reason: chunk.finishReason || null }],
          };
          reply.raw.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
          chunkIndex++;
        }
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
      } else {
        const result = await registry.chat(targetModel, body.messages, { temperature: body.temperature });
        logReq(originalModel, providerName, targetModel, reqStart, 200, false);
        reply.send({
          id: result?.id || `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: targetModel,
          choices: [{ message: { role: 'assistant', content: result?.content || '' }, index: 0, finish_reason: result?.finishReason || 'stop' }],
          usage: result?.usage || undefined,
        });
      }
    } catch (err) {
      logReq(originalModel, 'unknown', originalModel, reqStart, 502, !!body.stream, (err as Error).message);
      console.error(`[ModelOrch] Error:`, (err as Error).message);
      reply.code(502).send({
        error: { message: `Model orchestration error: ${(err as Error).message}` },
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
    console.log(`[ModelGW:Responses] ${originalModel} → ${provider.name}/${model}`);

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
      console.error(`[ModelGW:Responses] Error:`, (err as Error).message);
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
