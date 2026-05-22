import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import type { AgentMessage, Agent } from '../types/index.js';
import { taskManager } from '../core/task-manager.js';
import { router } from '../core/router.js';
import { contextManager } from '../core/context-manager.js';
import { vectorStore } from '../core/vector-store.js';
import { circuitBreakerRegistry } from '../model-gateway/circuit-breaker.js';
import { getGateway } from '../core/gateway.js';
import { initFromConfig } from '@agentmesh/model-orchestrator';
import { SkillLoader, SkillController } from '@agentmesh/toolkit';
import { HoneycombOrchestrator } from '@agentmesh/engine';
import type { ProjectConfig } from '@agentmesh/engine';

// 启动时缓存编排实例（避免每次请求都重复初始化）
let _modelOrch: ReturnType<typeof initFromConfig> | null = null;
function getModelOrch() {
  if (!_modelOrch) { _modelOrch = initFromConfig(); }
  return _modelOrch;
}

// Engine Orchestrator 懒加载单例
let _engineOrch: HoneycombOrchestrator | null = null;
function getEngineOrch(): HoneycombOrchestrator {
  if (!_engineOrch) {
    _engineOrch = new HoneycombOrchestrator({
      log_level: 'warn',
    });
  }
  return _engineOrch;
}

/**
 * 将 Gateway 任务转发到 Engine Orchestrator 创建项目。
 * 非阻塞：失败仅记录日志，不影响 Gateway 主流程。
 */
async function forwardToEngineOrchestrator(
  task: { id: string; request: AgentMessage },
  body: Partial<AgentMessage>,
): Promise<void> {
  const taskDescription =
    (body.payload?.task as string | undefined) ||
    (body.payload as Record<string, unknown>)?.task as string | undefined ||
    'Task from gateway';

  const projectConfig: ProjectConfig = {
    name: `gateway-task-${task.id.slice(0, 8)}`,
    description: taskDescription,
    archetype: 'software-dev',
    goals: [taskDescription],
    constraints: body.payload?.options ? [JSON.stringify(body.payload.options)] : undefined,
  };

  const orch = getEngineOrch();
  orch.createProject(projectConfig);
}

export async function apiRoutes(fastify: FastifyInstance) {
  // 健康检查
  fastify.get('/health', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const gw = getGateway();
    if (gw) return { timestamp: Date.now(), ...gw.health() };

    return {
      status: 'starting' as const,
      timestamp: Date.now(),
      agents: router.getAllAgents().map(a => ({ id: a.id, name: a.name, status: a.status })),
    };
  });

  // 详细健康检查
  fastify.get('/health/detailed', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const gw = getGateway();
    if (!gw) return { status: 'starting' as const, timestamp: Date.now() };

    const health = gw.health();
    return {
      ...health,
      circuit_breakers: circuitBreakerRegistry.getStatus(),
      vector_store_available: vectorStore.isAvailable(),
      config: {
        port: gw.config.port,
        log_level: gw.config.logLevel,
        default_agent: gw.config.routing.defaultAgent,
        model_providers: gw.config.models ? Object.keys(gw.config.models.providers || {}) : [],
      },
    };
  });

  // 提交任务
  fastify.post<{ Body: Partial<AgentMessage> }>(
    '/tasks',
    async (request: FastifyRequest<{ Body: Partial<AgentMessage> }>, reply: FastifyReply) => {
      const body = request.body || {};

      const message: AgentMessage = {
        id: uuidv4(),
        type: 'request',
        source: body.source || 'api',
        target: 'gateway',
        correlation_id: body.correlation_id || uuidv4(),
        timestamp: Date.now(),
        payload: body.payload
      };

      try {
        const task = await taskManager.processTask(message);

        // 同时转发任务到 Engine Orchestrator
        forwardToEngineOrchestrator(task, body).catch((err: unknown) => {
          console.warn('[EngineBridge] Engine orchestrator forward failed (non-fatal):', err instanceof Error ? err.message : String(err));
        });

        reply.code(202).send({
          task_id: task.id,
          status: task.status,
          message: 'Task submitted successfully'
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        reply.code(500).send({
          error: {
            code: 'TASK_FAILED',
            message: errorMessage
          }
        });
      }
    }
  );

  // 获取任务状态
  fastify.get<{ Params: { taskId: string } }>(
    '/tasks/:taskId',
    async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
      const { taskId } = request.params;
      const task = taskManager.getTask(taskId);

      if (!task) {
        reply.code(404).send({
          error: {
            code: 'TASK_NOT_FOUND',
            message: `Task ${taskId} not found`
          }
        });
        return;
      }

      reply.send({
        id: task.id,
        status: task.status,
        assigned_agents: task.assignedAgents,
        result: task.result,
        error: task.error,
        created_at: task.createdAt,
        updated_at: task.updatedAt
      });
    }
  );

  // 获取所有任务
  fastify.get('/tasks', async (_request: FastifyRequest, reply: FastifyReply) => {
    const tasks = taskManager.getAllTasks();
    reply.send(tasks.map(t => ({
      id: t.id,
      status: t.status,
      assigned_agents: t.assignedAgents,
      created_at: t.createdAt,
      updated_at: t.updatedAt,
    })));
  });

  // 取消任务
  fastify.post<{ Params: { taskId: string } }>(
    '/tasks/:taskId/cancel',
    async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
      const { taskId } = request.params;
      const ok = taskManager.cancelTask(taskId);
      if (!ok) {
        reply.code(404).send({
          error: { code: 'CANCEL_FAILED', message: 'Task not found or already completed' }
        });
        return;
      }
      reply.send({ task_id: taskId, status: 'cancelled' });
    }
  );

  // 定时任务调度
  fastify.post('/scheduler', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name, cron, task } = (request.body || {}) as any;
    if (!name || !cron || !task) {
      return reply.code(400).send({ error: { code: 'MISSING_FIELDS', message: 'name, cron, and task are required' } });
    }
    const { scheduler } = await import('../core/scheduler.js');
    const id = scheduler.add(name, cron, { id: '', type: 'request', source: 'api', target: 'gateway', correlation_id: '', timestamp: Date.now(), payload: { task } });
    reply.code(201).send({ schedule_id: id, name, cron });
  });

  fastify.get('/scheduler', async (_req: FastifyRequest, reply: FastifyReply) => {
    const { scheduler } = await import('../core/scheduler.js');
    reply.send(scheduler.list().map(j => ({ id: j.id, name: j.name, cron: j.cron, enabled: j.enabled, last_run: j.lastRun, next_run: j.nextRun })));
  });

  fastify.delete('/scheduler/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { scheduler } = await import('../core/scheduler.js');
    if (!scheduler.remove(id)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Schedule not found' } });
    reply.send({ status: 'removed' });
  });

  // Agent 协作流水线
  fastify.post('/pipeline', async (request: FastifyRequest, reply: FastifyReply) => {
    const { steps, input } = (request.body || {}) as any;
    if (!steps?.length || !input) {
      return reply.code(400).send({ error: { code: 'MISSING_FIELDS', message: 'steps (array) and input (string) are required' } });
    }
    const { agentPipeline } = await import('../core/pipeline.js');
    const result = await agentPipeline.execute(steps, input);
    reply.send(result);
  });

  // 创建共享空间
  fastify.post<{ Body: { metadata?: Record<string, unknown> } }>(
    '/spaces',
    async (request: FastifyRequest<{ Body: { metadata?: Record<string, unknown> } }>, reply: FastifyReply) => {
      const { metadata } = request.body || {};
      const spaceId = await contextManager.createSharedSpace(metadata);
      reply.code(201).send({ space_id: spaceId });
    }
  );

  // 获取共享空间
  fastify.get<{ Params: { spaceId: string } }>(
    '/spaces/:spaceId',
    async (request: FastifyRequest<{ Params: { spaceId: string } }>, reply: FastifyReply) => {
      const { spaceId } = request.params;
      const context = await contextManager.getSharedSpace(spaceId);

      if (!context) {
        reply.code(404).send({
          error: {
            code: 'SPACE_NOT_FOUND',
            message: `Shared space ${spaceId} not found`
          }
        });
        return;
      }

      reply.send({
        shared_space_id: context.shared_space_id,
        message_count: context.messages.length,
        artifact_count: context.artifacts.size,
        metadata: context.metadata,
        created_at: context.createdAt,
        updated_at: context.updatedAt
      });
    }
  );

  // 获取 Agent 列表
  fastify.get('/agents', async (_request: FastifyRequest, reply: FastifyReply) => {
    const agents = router.getAllAgents();
    reply.send(agents);
  });

  // 注册 Agent
  fastify.post<{ Body: Partial<Agent> }>(
    '/agents',
    async (request: FastifyRequest<{ Body: Partial<Agent> }>, reply: FastifyReply) => {
      const body = request.body || {};
      router.registerAgent({
        id: body.id || 'unknown',
        name: body.name || 'Unknown',
        type: body.type || 'process',
        capabilities: body.capabilities || [],
        status: 'online',
        endpoint: body.endpoint,
        lastSeen: Date.now()
      });
      reply.code(201).send({ id: body.id, status: 'registered' });
    }
  );

  // ── 模型编排路由 ──
  fastify.get('/model-orchestrator/models', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { registry } = getModelOrch();
      await registry.refresh();
      reply.send({ total: registry.getAll().length, models: registry.getAll() });
    } catch (err) {
      reply.code(502).send({ error: { code: 'MODEL_ORCH_FAILED', message: String(err) } });
    }
  });

  fastify.post('/model-orchestrator/chat', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { registry, scheduler } = getModelOrch();
      await registry.refresh();
      const { model, messages } = (request.body || {}) as any;
      if (!messages?.length) return reply.code(400).send({ error: { code: 'MISSING_MESSAGES' } });
      let selection: { model: NonNullable<ReturnType<typeof registry.get>>; providerName: string } | null;
      if (model) {
        const m = registry.get(model) || registry.getAll()[0];
        if (!m) return reply.code(503).send({ error: { code: 'NO_MODEL_AVAILABLE' } });
        selection = { model: m, providerName: '' };
      } else {
        selection = await scheduler.selectModel({ task: messages[0]?.content || '', requiredCapabilities: ['chat'] });
      }
      if (!selection) return reply.code(503).send({ error: { code: 'NO_MODEL_AVAILABLE' } });
      const result = await registry.chat(selection.model.id, messages);
      reply.send({ model: selection.model.id, content: result?.content });
    } catch (err) {
      reply.code(502).send({ error: { code: 'CHAT_FAILED', message: String(err) } });
    }
  });

  // ── 技能路由 ──
  fastify.get('/skills', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const loader = new SkillLoader();
      reply.send({ total: loader.getAll().length, skills: loader.getAll() });
    } catch (err) {
      reply.code(502).send({ error: { code: 'SKILLS_FAILED', message: String(err) } });
    }
  });

  fastify.post('/skills/:skillId/execute', async (request: FastifyRequest, reply: FastifyReply) => {
    const { skillId } = request.params as { skillId: string };
    try {
      const controller = new SkillController({});
      const result = await (controller as any).execute({ task: skillId, input: JSON.stringify(request.body || {}), sessionId: '' });
      reply.send({ skillId, result });
    } catch (err) {
      reply.code(502).send({ error: { code: 'SKILL_EXEC_FAILED', message: String(err) } });
    }
  });
}
