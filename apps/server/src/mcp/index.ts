/**
 * Agent Mesh — MCP Server
 *
 * 11 个 MCP tools，连接 model-orchestrator 实现
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { LocalModelDiscoverer, ModelRegistry, ModelScheduler } from '@agentmesh/model-orchestrator';

// ── 依赖注入 ──

export interface MCPServerDeps {
  discoverer?: LocalModelDiscoverer;
  registry?: ModelRegistry;
  scheduler?: ModelScheduler;
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
    description: '提交新任务（需连接 gateway TaskManager）',
    inputSchema: { type: 'object', properties: { type: { type: 'string' }, payload: { type: 'object' } }, required: ['type', 'payload'] },
  },
  {
    name: 'tasks_status',
    description: '查询任务状态（需连接 gateway TaskManager）',
    inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] },
  },
  {
    name: 'tasks_list',
    description: '列出所有任务（需连接 gateway TaskManager）',
    inputSchema: { type: 'object', properties: { status: { type: 'string' } } },
  },
  {
    name: 'skills_list',
    description: '列出可用技能（需连接 toolkit SkillLoader）',
    inputSchema: { type: 'object', properties: { category: { type: 'string' } } },
  },
  {
    name: 'skills_search',
    description: '搜索匹配任务的技能（需连接 toolkit SkillRouter）',
    inputSchema: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] },
  },
  {
    name: 'skills_execute',
    description: '执行指定技能（需连接 toolkit SkillController）',
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
      if (!discoverer) return jsonResult({ info: 'Model discovery not connected' });
      try {
        const models = await discoverer.discoverAll();
        const location = (args.location as string) || 'all';
        const filtered = location === 'all' ? models : models.filter(m => m.location === location);
        return jsonResult({ total: filtered.length, models: filtered });
      } catch (err: any) {
        return jsonResult({ error: err.message });
      }
    }

    case 'models_chat': {
      const scheduler = deps?.scheduler;
      const registry = deps?.registry;
      if (!scheduler || !registry) return jsonResult({ info: 'Model scheduler not connected' });
      try {
        const model = args.model as string;
        const messages = args.messages as any[];
        const selection = await scheduler.selectModel(
          { task: messages?.[0]?.content || '', requiredCapabilities: ['chat'] },
          { priority: model ? [model] : [] },
        );
        if (!selection) return jsonResult({ error: 'No available model found' });
        const result = await registry.chat(selection.model.id, messages);
        return jsonResult({ model: selection.model.id, content: result?.content || '' });
      } catch (err: any) {
        return jsonResult({ error: err.message });
      }
    }

    case 'models_health': {
      const discoverer = deps?.discoverer;
      if (!discoverer) return jsonResult({ status: 'no_discovery' });
      try {
        const alive = await discoverer.anyAlive();
        return jsonResult({ local_models_alive: alive, timestamp: Date.now() });
      } catch (err: any) {
        return jsonResult({ error: err.message });
      }
    }

    // ── 任务（TODO: 连接 gateway TaskManager）──
    case 'tasks_submit':
      return jsonResult({ taskId: crypto.randomUUID(), status: 'pending', info: 'TaskManager not yet connected' });
    case 'tasks_status':
      return jsonResult({ taskId: args.taskId, status: 'unknown', info: 'TaskManager not yet connected' });
    case 'tasks_list':
      return jsonResult({ tasks: [], info: 'TaskManager not yet connected' });

    // ── 技能（TODO: 连接 toolkit SkillLoader）──
    case 'skills_list':
      return jsonResult({ skills: [], info: 'SkillLoader not yet connected' });
    case 'skills_search':
      return jsonResult({ matches: [], info: 'SkillRouter not yet connected' });
    case 'skills_execute':
      return jsonResult({ skillId: args.skillId, result: '[placeholder]', info: 'SkillController not yet connected' });

    // ── 系统 ──
    case 'system_health':
      return jsonResult({
        status: 'ok',
        version: '2.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      });
    case 'system_metrics':
      return jsonResult({
        metric: args.metric || 'all',
        requests: { total: 0 },
        info: 'MetricsCollector not yet connected',
      });

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function jsonResult(data: unknown): { content: { type: 'text'; text: string }[] } {
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
