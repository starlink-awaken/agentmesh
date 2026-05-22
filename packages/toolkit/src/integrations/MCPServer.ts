/**
 * MCPServer - MCP Server 集成
 *
 * 使 agent-toolkit 可以被 Cursor/Claude Code 等外部 AI 工具调用
 * 提供标准的 MCP 协议接口，支持工具注册、执行和生命周期管理
 *
 * @author PAI
 * @version 1.0.0
 */

import * as http from 'http';
import { memoryTools, reasoningTools, createMemoryToolHandler, createReasoningToolHandler } from './mcp-tools.js';
import type { MemoryStore } from '../memory/MemoryStore.js';
import type { ReasoningBank } from '../memory/ReasoningBank.js';

/**
 * MCP Server 配置
 */
export interface MCPServerConfig {
  name: string;
  version: string;
  port?: number;
}

/**
 * MCP Tool 定义
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown) => Promise<unknown>;
}

/**
 * MCP Server 信息
 */
export interface MCPServerInfo {
  name: string;
  version: string;
  tools: string[];
  protocolVersion?: string;
}

/**
 * MCP Server 类
 *
 * 提供 MCP 协议服务，使 agent-toolkit 可被外部 AI 工具调用
 *
 * @example
 * ```typescript
 * const server = new MCPServer({
 *   name: 'agent-toolkit',
 *   version: '1.0.0',
 *   port: 3000,
 * });
 *
 * // 注册记忆工具
 * const memoryStore = new MemoryStore();
 * server.registerMemoryTools(memoryStore);
 *
 * // 启动服务器
 * await server.start();
 * ```
 */
export class MCPServer {
  private config: MCPServerConfig;
  private tools: Map<string, MCPTool> = new Map();
  private server?: http.Server;
  private running: boolean = false;
  private port: number;

  /**
   * 创建 MCP Server
   */
  constructor(config: MCPServerConfig) {
    this.config = config;
    this.port = config.port || 3000;
  }

  /**
   * 获取服务器名称
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * 获取服务器版本
   */
  getVersion(): string {
    return this.config.version;
  }

  /**
   * 获取服务器端口
   */
  getPort(): number {
    return this.port;
  }

  /**
   * 检查服务器是否运行中
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * 注册工具
   */
  registerTool(tool: MCPTool): void {
    if (!tool.name || !tool.handler) {
      throw new Error('Tool must have name and handler');
    }

    this.tools.set(tool.name, {
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || {},
      handler: tool.handler,
    });
  }

  /**
   * 获取所有已注册的工具
   */
  getTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 根据名称获取工具
   */
  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  /**
   * 执行工具
   */
  async executeTool(name: string, args: unknown): Promise<unknown> {
    const tool = this.tools.get(name);

    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    try {
      return await tool.handler(args);
    } catch (error) {
      throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 导出工具列表（MCP 协议格式）
   */
  exportTools(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * 注册记忆相关工具
   *
   * 将 MemoryStore 的功能暴露为 MCP 工具
   */
  registerMemoryTools(memoryStore: MemoryStore): void {
    // 注册 memory_search
    this.registerTool({
      name: memoryTools.memory_search.name,
      description: memoryTools.memory_search.description,
      inputSchema: memoryTools.memory_search.inputSchema,
      handler: createMemoryToolHandler('memory_search', memoryStore),
    });

    // 注册 memory_store
    this.registerTool({
      name: memoryTools.memory_store.name,
      description: memoryTools.memory_store.description,
      inputSchema: memoryTools.memory_store.inputSchema,
      handler: createMemoryToolHandler('memory_store', memoryStore),
    });

    // 注册 memory_delete
    this.registerTool({
      name: memoryTools.memory_delete.name,
      description: memoryTools.memory_delete.description,
      inputSchema: memoryTools.memory_delete.inputSchema,
      handler: createMemoryToolHandler('memory_delete', memoryStore),
    });

    // 注册 memory_update
    this.registerTool({
      name: memoryTools.memory_update.name,
      description: memoryTools.memory_update.description,
      inputSchema: memoryTools.memory_update.inputSchema,
      handler: createMemoryToolHandler('memory_update', memoryStore),
    });

    // 注册 memory_stats
    this.registerTool({
      name: memoryTools.memory_stats.name,
      description: memoryTools.memory_stats.description,
      inputSchema: memoryTools.memory_stats.inputSchema,
      handler: createMemoryToolHandler('memory_stats', memoryStore),
    });

    // 注册 memory_get_by_session
    this.registerTool({
      name: memoryTools.memory_get_by_session.name,
      description: memoryTools.memory_get_by_session.description,
      inputSchema: memoryTools.memory_get_by_session.inputSchema,
      handler: createMemoryToolHandler('memory_get_by_session', memoryStore),
    });
  }

  /**
   * 注册推理相关工具
   *
   * 将 ReasoningBank 的功能暴露为 MCP 工具
   */
  registerReasoningTools(reasoningBank: ReasoningBank): void {
    // 注册 reasoning_search
    this.registerTool({
      name: reasoningTools.reasoning_search.name,
      description: reasoningTools.reasoning_search.description,
      inputSchema: reasoningTools.reasoning_search.inputSchema,
      handler: createReasoningToolHandler('reasoning_search', reasoningBank),
    });

    // 注册 reasoning_learn
    this.registerTool({
      name: reasoningTools.reasoning_learn.name,
      description: reasoningTools.reasoning_learn.description,
      inputSchema: reasoningTools.reasoning_learn.inputSchema,
      handler: createReasoningToolHandler('reasoning_learn', reasoningBank),
    });

    // 注册 reasoning_stats
    this.registerTool({
      name: reasoningTools.reasoning_stats.name,
      description: reasoningTools.reasoning_stats.description,
      inputSchema: reasoningTools.reasoning_stats.inputSchema,
      handler: createReasoningToolHandler('reasoning_stats', reasoningBank),
    });

    // 注册 reasoning_get_all
    this.registerTool({
      name: reasoningTools.reasoning_get_all.name,
      description: reasoningTools.reasoning_get_all.description,
      inputSchema: reasoningTools.reasoning_get_all.inputSchema,
      handler: createReasoningToolHandler('reasoning_get_all', reasoningBank),
    });

    // 注册 reasoning_clear
    this.registerTool({
      name: reasoningTools.reasoning_clear.name,
      description: reasoningTools.reasoning_clear.description,
      inputSchema: reasoningTools.reasoning_clear.inputSchema,
      handler: createReasoningToolHandler('reasoning_clear', reasoningBank),
    });
  }

  /**
   * 获取服务器信息
   */
  getServerInfo(): MCPServerInfo {
    return {
      name: this.config.name,
      version: this.config.version,
      tools: Array.from(this.tools.keys()),
      protocolVersion: '2024-11-05',
    };
  }

  /**
   * 启动 MCP 服务器
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    return new Promise((resolve, reject) => {
      const requestHandler = (req: http.IncomingMessage, res: http.ServerResponse) => {
        // 设置 CORS 头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // 处理 OPTIONS 预检请求
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // 路由处理
        const url = req.url || '';

        if (url === '/health') {
          // 健康检查
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', name: this.config.name, version: this.config.version }));
          return;
        }

        if (url === '/tools') {
          // 获取工具列表
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.exportTools()));
          return;
        }

        if (url === '/info') {
          // 获取服务器信息
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.getServerInfo()));
          return;
        }

        if (url === '/execute' && req.method === 'POST') {
          // 执行工具
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const { tool, args } = JSON.parse(body);

              if (!tool) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing tool name' }));
                return;
              }

              const result = await this.executeTool(tool, args || {});
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, result }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              }));
            }
          });
          return;
        }

        // 404
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      };

      this.server = http.createServer(requestHandler);

      this.server.on('error', (error: Error) => {
        this.running = false;
        reject(error);
      });

      this.server.listen(this.port, () => {
        this.running = true;
        console.log(`[MCPServer] ${this.config.name} v${this.config.version} started on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * 停止 MCP 服务器
   */
  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.running = false;
          this.server = undefined;
          console.log(`[MCPServer] ${this.config.name} stopped`);
          resolve();
        });
      } else {
        this.running = false;
        resolve();
      }
    });
  }
}

export default MCPServer;
