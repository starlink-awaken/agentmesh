/**
 * Agent Mesh — MCP Server
 *
 * 11 个 MCP tools，对接 model-orchestrator / gateway / toolkit 真实实现
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { LocalModelDiscoverer, ModelRegistry, ModelScheduler } from '@agentmesh/model-orchestrator';
import type { TaskManager } from '@agentmesh/gateway';
import type { SkillLoader, SkillController } from '@agentmesh/toolkit';

// ── 依赖注入 ──

export interface MCPServerDeps {
  discoverer?: LocalModelDiscoverer;
  registry?: ModelRegistry;
  scheduler?: ModelScheduler;
  taskManager?: TaskManager;
  skillLoader?: SkillLoader;
  skillController?: SkillController;
}

// ── Tool 定义 ──

const TOOLS = [
  {
    name: 'models_list',
    description: '列出所有可用模型（本地 + 云端）',
    inputSchema: { type: 'object', properties: { location: { type: 'string', enum: ['local', 'cloud', 'all'] } } },
  },
  {
    name: 'models_chat',
    description: '调用模型聊天',
    inputSchema: { type: 'object', properties: { model: { type: 'string' }, messages: { type: 'array' }, temperature: { type: 'number' } }, required: ['model', 'messages'] },
  },
  {
    name: 'models_health',
    description: '检查模型健康状态',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'tasks_submit',
    description: '提交新任务',
    inputSchema: { type: 'object', properties: { type: { type: 'string' }, payload: { type: 'object' }, priority: { type: 'number' } }, required: ['type', 'payload'] },
  },
  {
    name: 'tasks_status',
    description: '查询任务状态',
    inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] },
  },
  {
    name: 'tasks_list',
    description: '列出所有任务',
    inputSchema: { type: 'object', properties: { status: { type: 'string' } } },
  },
  {
    name: 'skills_list',
    description: '列出可用技能',
    inputSchema: { type: 'object', properties: { category: { type: 'string' } } },
  },
  {
    name: 'skills_search',
    description: '搜索匹配任务的技能',
    inputSchema: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] },
  },
  {
    name: 'skills_execute',
    description: '执行指定技能',
    inputSchema: { type: 'object', properties: { skillId: { type: 'string' }, input: { type: 'object' } }, required: ['skillId', 'input'] },
  },
  {
    name: 'system_health',
    description: '系统健康状态',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'system_metrics',
    description: '系统性能指标',
    inputSchema: { type: 'object', properties: { metric: { type: 'string' } } },
  },
];

// ── Server 创建 ──

export function createMCPServer(deps?: MCPServerDeps): Server {
  const server = new Server(
    { name: 'agentmesh-mcp', version: '2.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(name, args || {}, deps);
  });

  return server;
}

// ── Tool 处理 ──

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  deps?: MCPServerDeps,
): Promise<{ content: { type: 'text'; text: string }[] }> {
  switch (name) {
    // ── 模型 ──
    case 'models_list': {
      const discoverer = deps?.discoverer;
      if (!discoverer) return json({ info: 'Model discovery not connected' });
      try {
        const models = await discoverer.discoverAll();
        const location = (args.location as string) || 'all';
        return json({ total: models.length, models: location === 'all' ? models : models.filter(m => m.location === location) });
      } catch (err: any) { return json({ error: err.message }); }
    }

    case 'models_chat': {
      const scheduler = deps?.scheduler;
      const registry = deps?.registry;
      if (!scheduler || !registry) return json({ info: 'Model scheduler not connected' });
      try {
        const model = args.model as string;
        const messages = args.messages as any[];
        const selection = model ? { model: { id: model } as any, providerName: '', confidence: 1, reasoning: '' }
          : await scheduler.selectModel({ task: messages?.[0]?.content || '', requiredCapabilities: ['chat'] });
        if (!selection) return json({ error: 'No available model' });
        const result = await registry.chat(selection.model.id, messages);
        return json({ model: selection.model.id, content: result?.content || '' });
      } catch (err: any) { return json({ error: err.message }); }
    }

    case 'models_health': {
      const discoverer = deps?.discoverer;
      if (!discoverer) return json({ status: 'no_discovery' });
      try {
        return json({ local_models_alive: await discoverer.anyAlive(), timestamp: Date.now() });
      } catch (err: any) { return json({ error: err.message }); }
    }

    // ── 任务 ──
    case 'tasks_submit': {
      const tm = deps?.taskManager;
      if (!tm) return json({ taskId: crypto.randomUUID(), status: 'pending', info: 'TaskManager not connected' });
      try {
        const task = await tm.createTask({ type: 'request', source: 'mcp', payload: args.payload || {}, id: crypto.randomUUID() } as any);
        return json({ taskId: task.id, status: task.status });
      } catch (err: any) { return json({ error: err.message }); }
    }

    case 'tasks_status': {
      const tm = deps?.taskManager;
      if (!tm) return json({ taskId: args.taskId, status: 'unknown', info: 'TaskManager not connected' });
      try {
        const task = tm.getTask(args.taskId as string);
        return task ? json({ taskId: task.id, status: task.status, createdAt: task.createdAt })
          : json({ taskId: args.taskId, status: 'not_found' });
      } catch (err: any) { return json({ error: err.message }); }
    }

    case 'tasks_list': {
      const tm = deps?.taskManager;
      if (!tm) return json({ tasks: [], info: 'TaskManager not connected' });
      try {
        const status = args.status as string;
        const tasks = tm.getAllTasks();
        return json({ total: tasks.length, tasks: status ? tasks.filter((t: any) => t.status === status) : tasks });
      } catch (err: any) { return json({ error: err.message }); }
    }

    // ── 技能 ──
    case 'skills_list': {
      const loader = deps?.skillLoader;
      if (!loader) return json({ skills: [], info: 'SkillLoader not connected' });
      try {
        const skills = loader.getAll();
        const category = args.category as string;
        return json({ total: skills.length, skills: category ? skills.filter((s: any) => s.category === category) : skills });
      } catch (err: any) { return json({ error: err.message }); }
    }

    case 'skills_search': {
      const loader = deps?.skillLoader;
      if (!loader) return json({ matches: [], info: 'SkillLoader not connected' });
      try {
        const task = args.task as string;
        const results = loader.search(task);
        return json({ matches: results, task });
      } catch (err: any) { return json({ error: err.message }); }
    }

    case 'skills_execute': {
      const controller = deps?.skillController;
      if (!controller) return json({ skillId: args.skillId, result: '[placeholder]', info: 'SkillController not connected' });
      try {
        // SkillController.execute returns the result
        const result = await (controller as any).execute(args.skillId as string, args.input || {});
        return json({ skillId: args.skillId, result });
      } catch (err: any) { return json({ error: err.message }); }
    }

    // ── 系统 ──
    case 'system_health':
      return json({ status: 'ok', version: '2.0.0', uptime: process.uptime(), memory: process.memoryUsage() });

    case 'system_metrics':
      return json({ metric: args.metric || 'all', requests: { total: 0 }, info: 'MetricsCollector not yet connected' });

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function json(data: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

// ── 启动入口 ──

export async function startMCPServer(deps?: MCPServerDeps): Promise<void> {
  const server = createMCPServer(deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1]!.replace(/^.*[\\/]/, ''))) {
  startMCPServer().catch(console.error);
}
