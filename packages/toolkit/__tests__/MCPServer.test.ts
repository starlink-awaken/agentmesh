/**
 * MCPServer Tests
 *
 * 测试 MCP Server 集成能力，使 agent-toolkit 可以被 Cursor/Claude Code 等外部 AI 工具调用
 *
 * @author PAI
 * @version 1.0.0
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MCPServer, type MCPServerConfig, type MCPTool } from '../src/integrations/MCPServer.js';
import { MemoryStore } from '../src/memory/MemoryStore.js';
import { ReasoningBank } from '../src/memory/ReasoningBank.js';

describe('MCPServer', () => {
  let server: MCPServer;
  const defaultConfig: MCPServerConfig = {
    name: 'test-agent-toolkit',
    version: '1.0.0',
  };

  beforeEach(() => {
    server = new MCPServer(defaultConfig);
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('构造函数', () => {
    it('should create MCPServer instance with minimal config', () => {
      expect(server).toBeDefined();
      expect(server.getName()).toBe('test-agent-toolkit');
      expect(server.getVersion()).toBe('1.0.0');
    });

    it('should create MCPServer instance with port config', () => {
      const config: MCPServerConfig = {
        name: 'port-test-server',
        version: '2.0.0',
        port: 3456,
      };

      const portServer = new MCPServer(config);
      expect(portServer).toBeDefined();
      expect(portServer.getPort()).toBe(3456);
    });

    it('should use default port 3000 if not specified', () => {
      expect(server.getPort()).toBe(3000);
    });
  });

  describe('工具注册', () => {
    it('should register a custom tool', () => {
      const tool: MCPTool = {
        name: 'custom_tool',
        description: 'A custom test tool',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Input text' },
          },
          required: ['input'],
        },
        handler: async (args: unknown) => {
          const typedArgs = args as { input: string };
          return { result: `Processed: ${typedArgs.input}` };
        },
      };

      server.registerTool(tool);
      const tools = server.getTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('custom_tool');
    });

    it('should register multiple tools', () => {
      const tool1: MCPTool = {
        name: 'tool_one',
        description: 'First tool',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({ success: true }),
      };

      const tool2: MCPTool = {
        name: 'tool_two',
        description: 'Second tool',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({ success: true }),
      };

      server.registerTool(tool1);
      server.registerTool(tool2);
      const tools = server.getTools();

      expect(tools).toHaveLength(2);
    });

    it('should get tool by name', () => {
      const tool: MCPTool = {
        name: 'get_by_name_test',
        description: 'Test tool',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({ success: true }),
      };

      server.registerTool(tool);
      const retrieved = server.getTool('get_by_name_test');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('get_by_name_test');
    });

    it('should return undefined for non-existent tool', () => {
      const tool = server.getTool('non_existent_tool');
      expect(tool).toBeUndefined();
    });

    it('should execute tool handler', async () => {
      const tool: MCPTool = {
        name: 'executable_tool',
        description: 'An executable tool',
        inputSchema: {
          type: 'object',
          properties: {
            value: { type: 'number' },
          },
        },
        handler: async (args: unknown) => {
          const typedArgs = args as { value: number };
          return { doubled: typedArgs.value * 2 };
        },
      };

      server.registerTool(tool);
      const result = await server.executeTool('executable_tool', { value: 5 });

      expect(result).toEqual({ doubled: 10 });
    });

    it('should throw error when executing non-existent tool', async () => {
      await expect(server.executeTool('non_existent', {})).rejects.toThrow();
    });
  });

  describe('记忆工具', () => {
    it('should register memory tools with MemoryStore', () => {
      const memoryStore = new MemoryStore();
      server.registerMemoryTools(memoryStore);

      const tools = server.getTools();
      const toolNames = tools.map(t => t.name);

      expect(toolNames).toContain('memory_search');
      expect(toolNames).toContain('memory_store');
    });

    it('should execute memory_search tool', async () => {
      const memoryStore = new MemoryStore();
      server.registerMemoryTools(memoryStore);

      // 先存储一些数据
      await memoryStore.store({
        content: 'Test memory content',
        metadata: {
          sessionId: 'test-session',
          timestamp: Date.now(),
          importance: 0.8,
          tags: ['test'],
        },
      });

      const result = await server.executeTool('memory_search', {
        query: 'Test memory',
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should execute memory_store tool', async () => {
      const memoryStore = new MemoryStore();
      server.registerMemoryTools(memoryStore);

      const result = await server.executeTool('memory_store', {
        content: 'New memory entry',
        tags: ['important', 'test'],
        sessionId: 'test-session',
        importance: 0.9,
      });

      expect(result).toBeDefined();
      expect((result as { id: string }).id).toBeDefined();
    });
  });

  describe('推理工具', () => {
    it('should register reasoning tools with ReasoningBank', () => {
      const reasoningBank = new ReasoningBank();
      server.registerReasoningTools(reasoningBank);

      const tools = server.getTools();
      const toolNames = tools.map(t => t.name);

      expect(toolNames).toContain('reasoning_search');
      expect(toolNames).toContain('reasoning_learn');
    });

    it('should execute reasoning_search tool', async () => {
      const reasoningBank = new ReasoningBank();
      server.registerReasoningTools(reasoningBank);

      const result = await server.executeTool('reasoning_search', {
        query: 'test query',
        limit: 5,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should execute reasoning_learn tool', async () => {
      const reasoningBank = new ReasoningBank();
      server.registerReasoningTools(reasoningBank);

      const result = await server.executeTool('reasoning_learn', {
        taskId: 'test-task-1',
        input: 'Test task input',
        output: 'Test task output',
        success: true,
        trajectory: ['step 1', 'step 2', 'step 3'],
        duration: 1000,
      });

      expect(result).toBeDefined();
      expect((result as { id: string }).id).toBeDefined();
    });
  });

  describe('服务器生命周期', () => {
    it('should start server', async () => {
      await server.start();
      expect(server.isRunning()).toBe(true);
    });

    it('should stop server', async () => {
      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('should handle multiple start calls gracefully', async () => {
      await server.start();
      await server.start(); // 应该不报错
      expect(server.isRunning()).toBe(true);
    });

    it('should handle stop when not running', async () => {
      await server.stop(); // 应该不报错
      expect(server.isRunning()).toBe(false);
    });
  });

  describe('工具列表导出', () => {
    it('should export tools in MCP format', () => {
      const tool: MCPTool = {
        name: 'export_test',
        description: 'Tool for export test',
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string' },
            param2: { type: 'number' },
          },
          required: ['param1'],
        },
        handler: async () => ({ success: true }),
      };

      server.registerTool(tool);
      const exported = server.exportTools();

      expect(exported).toHaveLength(1);
      expect(exported[0].name).toBe('export_test');
      expect(exported[0].description).toBe('Tool for export test');
      expect(exported[0].inputSchema).toBeDefined();
    });
  });

  describe('getServerInfo', () => {
    it('should return server info', () => {
      const info = server.getServerInfo();

      expect(info.name).toBe('test-agent-toolkit');
      expect(info.version).toBe('1.0.0');
      expect(info.tools).toEqual([]);
    });

    it('should include registered tools in info', () => {
      const tool: MCPTool = {
        name: 'info_test_tool',
        description: 'Tool for info test',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({ success: true }),
      };

      server.registerTool(tool);
      const info = server.getServerInfo();

      expect(info.tools).toHaveLength(1);
      expect(info.tools[0]).toBe('info_test_tool');
    });
  });
});

describe('MCPTool 接口', () => {
  it('should accept valid MCPTool', () => {
    const tool: MCPTool = {
      name: 'valid_tool',
      description: 'A valid tool',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
      handler: async (args: unknown) => {
        return { result: args };
      },
    };

    expect(tool.name).toBe('valid_tool');
    expect(tool.description).toBe('A valid tool');
    expect(typeof tool.handler).toBe('function');
  });
});

describe('MCPServerConfig 接口', () => {
  it('should accept minimal config', () => {
    const config: MCPServerConfig = {
      name: 'minimal-server',
      version: '1.0.0',
    };

    expect(config.name).toBe('minimal-server');
    expect(config.version).toBe('1.0.0');
    expect(config.port).toBeUndefined();
  });

  it('should accept full config', () => {
    const config: MCPServerConfig = {
      name: 'full-server',
      version: '2.0.0',
      port: 8080,
    };

    expect(config.port).toBe(8080);
  });
});
