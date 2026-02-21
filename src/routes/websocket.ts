import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import type { AgentMessage } from '../types/index.js';
import { taskManager } from '../core/task-manager.js';
import { agentRegistry } from '../core/agent-registry.js';

interface SSEClient {
  id: string;
  reply: any;
}

export async function websocketRoutes(fastify: FastifyInstance) {
  const clients: Map<string, SSEClient> = new Map();

  // SSE 端点 - 用于实时任务更新
  fastify.get<{ Querystring: { taskId?: string; spaceId?: string } }>(
    '/events',
    async (request, reply) => {
      const { taskId, spaceId } = request.query;

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      const clientId = uuidv4();

      clients.set(clientId, {
        id: clientId,
        reply
      });

      // 发送初始连接消息
      reply.raw.write(`data: ${JSON.stringify({ type: 'connected', client_id: clientId })}\n\n`);

      // 订阅任务事件
      if (taskId) {
        const task = taskManager.getTask(taskId);
        if (task) {
          reply.raw.write(`data: ${JSON.stringify({ type: 'task_status', task })}\n\n`);
        }
      }

      // 发送欢迎消息
      reply.raw.write(`data: ${JSON.stringify({ type: 'welcome', agents: agentRegistry.getAgents() })}\n\n`);

      // 心跳
      const heartbeat = setInterval(() => {
        reply.raw.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
      }, 30000);

      request.raw.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(clientId);
      });
    }
  );

  // WebSocket 模拟端点 - 返回 SSE 连接信息
  fastify.get('/ws-info', async (_request, reply) => {
    reply.send({
      message: 'Use /events for Server-Sent Events streaming',
      endpoints: {
        events: '/events?taskId=<task_id>&spaceId=<space_id>',
        description: 'Subscribe to real-time task updates and agent responses'
      },
      example: 'curl -N http://localhost:3000/events?taskId=<task_id>'
    });
  });

  // 广播消息到所有客户端
  fastify.post<{ Body: { type: string; data: any } }>(
    '/broadcast',
    async (request, reply) => {
      const { type, data } = request.body || {};

      const message = JSON.stringify({ type, data, timestamp: Date.now() });

      for (const client of clients.values()) {
        try {
          client.reply.raw.write(`data: ${message}\n\n`);
        } catch (e) {
          // 客户端可能已断开
        }
      }

      reply.send({ delivered: clients.size });
    }
  );
}
