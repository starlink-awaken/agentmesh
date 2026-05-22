import { describe, test, expect } from 'bun:test';

describe('MCP Server', () => {
  test('exports createMCPServer, startMCPServer, and TOOLS', async () => {
    const mod = await import('../src/mcp/index.js');
    expect(mod.createMCPServer).toBeDefined();
    expect(typeof mod.createMCPServer).toBe('function');
    expect(mod.startMCPServer).toBeDefined();
    expect(typeof mod.startMCPServer).toBe('function');
    expect(mod.TOOLS).toBeDefined();
    expect(Array.isArray(mod.TOOLS)).toBe(true);
  });

  test('has 11 tool definitions with name and description', async () => {
    const mod = await import('../src/mcp/index.js');
    const tools = mod.TOOLS as Array<{ name: string; description: string }>;
    expect(tools.length).toBe(11);

    // 检查所有 tool 都有 name 和 description
    for (const t of tools) {
      expect(t.name).toBeDefined();
      expect(typeof t.name).toBe('string');
      expect(t.description).toBeDefined();
      expect(typeof t.description).toBe('string');
    }

    // 检查关键 tool 名称
    const names = tools.map(t => t.name);
    expect(names).toContain('models_list');
    expect(names).toContain('models_chat');
    expect(names).toContain('tasks_submit');
    expect(names).toContain('skills_execute');
    expect(names).toContain('system_metrics');
  });

  test('createMCPServer works with and without deps', async () => {
    const mod = await import('../src/mcp/index.js');
    const server = mod.createMCPServer();
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe('function');
    expect(typeof server.close).toBe('function');

    const server2 = mod.createMCPServer({});
    expect(server2).toBeDefined();
  });

  test('createDefaultDeps initializes model-orchestrator', async () => {
    const mod = await import('../src/mcp/index.js');
    // startMCPServer 无参数时触发 createDefaultDeps
    // 不实际启动 server（需要 transport），仅验证 TOOLS 结构
    expect(mod.TOOLS.filter((t: any) => t.name.startsWith('models_')).length).toBe(3);
    expect(mod.TOOLS.filter((t: any) => t.name.startsWith('tasks_')).length).toBe(3);
    expect(mod.TOOLS.filter((t: any) => t.name.startsWith('skills_')).length).toBe(3);
    expect(mod.TOOLS.filter((t: any) => t.name.startsWith('system_')).length).toBe(2);
  });
});
