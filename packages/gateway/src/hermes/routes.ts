import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { resolveProvider, remapModel, getConfig } from '../model-gateway/router.js';
import { callChatCompletions } from '../model-gateway/providers.js';
import { logger } from '../core/logger.js';

interface HermesTask {
  id: string;
  prompt: string;
  model?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  createdAt: number;
}

const MAX_TASKS = 200;
const tasks = new Map<string, HermesTask>();

export function getHermesTasks(): HermesTask[] {
  return Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
}

function pruneOldTasks(): void {
  if (tasks.size <= MAX_TASKS) return;
  const sorted = Array.from(tasks.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
  for (const [id] of sorted.slice(0, tasks.size - MAX_TASKS)) {
    tasks.delete(id);
  }
}

export async function hermesRoutes(fastify: FastifyInstance) {
  // Hermes webhook — 接收来自手机/IM 的任务
  fastify.post('/hermes/task', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, any> || {};
    const prompt = body.prompt || body.message || body.text || '';

    if (!prompt) {
      return reply.code(400).send({ error: { code: 'MISSING_PROMPT', message: 'prompt or message is required' } });
    }

    const taskId = body.id || uuidv4();
    const model = body.model || 'deepseek-chat';

    const task: HermesTask = {
      id: taskId,
      prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
      model,
      status: 'pending',
      createdAt: Date.now(),
    };
    tasks.set(taskId, task);
    pruneOldTasks();
    logger.info(`[Hermes] Task received: ${taskId}`, { prompt: task.prompt.slice(0, 100) });

    // 异步执行，不阻塞 webhook 响应
    executeHermesTask(task).catch(err => {
      logger.error(`[Hermes] Task ${taskId} failed: ${err.message}`);
      task.status = 'failed';
      task.error = err.message;
    });

    reply.code(202).send({
      task_id: taskId,
      status: 'pending',
      message: 'Task accepted, check /hermes/task/:id for result',
    });
  });

  // 查询任务状态
  fastify.get('/hermes/task/:taskId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { taskId } = request.params as { taskId: string };
    const task = tasks.get(taskId);
    if (!task) return reply.code(404).send({ error: { code: 'TASK_NOT_FOUND', message: 'Task not found' } });
    reply.send({
      task_id: task.id,
      status: task.status,
      result: task.result,
      error: task.error,
      created_at: new Date(task.createdAt).toISOString(),
    });
  });

  // 列出所有 Hermes 任务
  fastify.get('/hermes/tasks', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.send(getHermesTasks().map(t => ({
      task_id: t.id,
      status: t.status,
      prompt: t.prompt.slice(0, 100),
      created_at: new Date(t.createdAt).toISOString(),
    })));
  });

  // Hermes 状态 — 供 Hermes 健康检查
  fastify.get('/hermes/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const cfg = getConfig();
    const running = tasks.size;
    const completed = Array.from(tasks.values()).filter(t => t.status === 'completed').length;
    reply.send({
      status: 'ok',
      gateway: cfg ? 'configured' : 'not configured',
      active_tasks: running,
      completed_tasks: completed,
      timestamp: Date.now(),
    });
  });
}

async function executeHermesTask(task: HermesTask) {
  task.status = 'running';
  const start = Date.now();

  try {
    const provider = resolveProvider(task.model || 'deepseek-chat');
    if (!provider) throw new Error('No available provider');

    const model = remapModel(task.model || 'deepseek-chat', provider.name);
    const resp = await callChatCompletions(provider, {
      model,
      messages: [{ role: 'user', content: task.prompt }],
      max_tokens: 4000,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`${provider.name}: ${errText.slice(0, 200)}`);
    }

    const data = await resp.json() as Record<string, any>;
    const content = data.choices?.[0]?.message?.content || '(empty response)';
    task.result = content;
    task.status = 'completed';
    logger.info(`[Hermes] Task ${task.id} completed in ${Date.now() - start}ms`);
  } catch (err: any) {
    task.status = 'failed';
    task.error = err.message;
    logger.error(`[Hermes] Task ${task.id} failed: ${err.message}`);
  }

}
