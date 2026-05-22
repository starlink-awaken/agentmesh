/**
 * ToolRegistry Tests - 工具注册中心测试
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { ToolRegistry, ToolBuilder } from '../src/tools/ToolRegistry';
import type { AgentTool } from '../src/tools/types';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  const createMockTool = (overrides: Partial<AgentTool> = {}): AgentTool => ({
    id: 'test-tool',
    name: 'Test Tool',
    description: 'A test tool',
    category: 'test',
    version: '1.0.0',
    handler: async () => ({ success: true, data: 'result' }),
    tags: ['test'],
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    ...overrides,
  });

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register', () => {
    it('should register a tool', () => {
      const tool = createMockTool({ id: 'tool-1', name: 'Tool 1' });
      registry.register(tool);
      expect(registry.get('tool-1')).toBeDefined();
    });

    it('should warn when overwriting tool', () => {
      const tool1 = createMockTool({ id: 'tool-1', name: 'Tool 1' });
      const tool2 = createMockTool({ id: 'tool-1', name: 'Tool 1 Updated' });
      registry.register(tool1);
      // Should not throw
      registry.register(tool2);
    });

    it('should index tool by category', () => {
      const tool = createMockTool({ id: 'tool-1', category: 'testing' });
      registry.register(tool);
      expect(registry.getByCategory('testing')).toHaveLength(1);
    });
  });

  describe('registerMany', () => {
    it('should register multiple tools', () => {
      const tools = [
        createMockTool({ id: 'tool-1' }),
        createMockTool({ id: 'tool-2' }),
        createMockTool({ id: 'tool-3' }),
      ];
      registry.registerMany(tools);
      expect(registry.getAll()).toHaveLength(3);
    });
  });

  describe('unregister', () => {
    it('should unregister existing tool', () => {
      const tool = createMockTool({ id: 'tool-1' });
      registry.register(tool);
      expect(registry.unregister('tool-1')).toBe(true);
      expect(registry.get('tool-1')).toBeUndefined();
    });

    it('should return false for non-existent tool', () => {
      expect(registry.unregister('non-existent')).toBe(false);
    });
  });

  describe('get', () => {
    it('should get registered tool', () => {
      const tool = createMockTool({ id: 'tool-1', name: 'My Tool' });
      registry.register(tool);
      expect(registry.get('tool-1')?.name).toBe('My Tool');
    });

    it('should return undefined for non-existent tool', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });
  });

  describe('getByCategory', () => {
    it('should get tools by category', () => {
      registry.register(createMockTool({ id: 'tool-1', category: 'testing' }));
      registry.register(createMockTool({ id: 'tool-2', category: 'testing' }));
      registry.register(createMockTool({ id: 'tool-3', category: 'other' }));
      expect(registry.getByCategory('testing')).toHaveLength(2);
    });

    it('should return empty array for unknown category', () => {
      expect(registry.getByCategory('unknown')).toHaveLength(0);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      registry.register(createMockTool({ id: 'search-tool', name: 'Search Helper', description: 'Helps search', tags: ['search', 'helper'] }));
      registry.register(createMockTool({ id: 'calc-tool', name: 'Calculator', description: 'Does math', tags: ['math'] }));
    });

    it('should search by name', () => {
      const results = registry.search('search');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Search Helper');
    });

    it('should search by description', () => {
      const results = registry.search('math');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should search by tags', () => {
      const results = registry.search('helper');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty for no matches', () => {
      const results = registry.search('xyz123');
      expect(results).toHaveLength(0);
    });
  });

  describe('execute', () => {
    it('should execute registered tool', async () => {
      const tool = createMockTool({
        id: 'exec-tool',
        handler: async () => ({ success: true, data: 'executed' }),
      });
      registry.register(tool);
      const result = await registry.execute('exec-tool', {});
      expect(result.success).toBe(true);
    });

    it('should return error for non-existent tool', async () => {
      const result = await registry.execute('non-existent', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should validate required parameters', async () => {
      const tool = createMockTool({
        id: 'validated-tool',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
          required: ['name'],
        },
      });
      registry.register(tool);
      const result = await registry.execute('validated-tool', { age: 25 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should validate parameter types', async () => {
      const tool = createMockTool({
        id: 'typed-tool',
        parameters: {
          type: 'object',
          properties: {
            count: { type: 'number' },
          },
          required: [],
        },
      });
      registry.register(tool);
      const result = await registry.execute('typed-tool', { count: 'not a number' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid type');
    });

    it('should track usage stats', async () => {
      const tool = createMockTool({ id: 'stats-tool' });
      registry.register(tool);
      await registry.execute('stats-tool', {});
      const stats = registry.getStats();
      expect(stats.mostUsed[0]?.count).toBe(1);
    });

    it('should handle tool execution errors', async () => {
      const tool = createMockTool({
        id: 'error-tool',
        handler: async () => {
          throw new Error('Tool execution failed');
        },
      });
      registry.register(tool);
      const result = await registry.execute('error-tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('failed');
    });
  });

  describe('getAll', () => {
    it('should return all registered tools', () => {
      registry.register(createMockTool({ id: 'tool-1' }));
      registry.register(createMockTool({ id: 'tool-2' }));
      expect(registry.getAll()).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      registry.register(createMockTool({ id: 'tool-1', category: 'cat1' }));
      registry.register(createMockTool({ id: 'tool-2', category: 'cat2' }));
      registry.register(createMockTool({ id: 'tool-3', category: 'cat1' }));
      const stats = registry.getStats();
      expect(stats.totalTools).toBe(3);
      expect(stats.categories['cat1']).toBe(2);
      expect(stats.categories['cat2']).toBe(1);
    });
  });
});

describe('ToolBuilder', () => {
  it('should create tool with basic properties', () => {
    const builder = new ToolBuilder('my-tool', 'My Tool', 'Description')
      .category('test')
      .parameters({ type: 'object', properties: {}, required: [] })
      .handler(async () => ({ success: true }));
    const tool = builder.build();
    expect(tool.id).toBe('my-tool');
    expect(tool.name).toBe('My Tool');
    expect(tool.description).toBe('Description');
  });

  it('should chain configuration methods', () => {
    const tool = new ToolBuilder('chained', 'Chained', 'Desc')
      .category('test')
      .version('2.0.0')
      .tags(['awesome'])
      .parameters({
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      })
      .handler(async () => ({ success: true }))
      .build();

    expect(tool.category).toBe('test');
    expect(tool.version).toBe('2.0.0');
    expect(tool.tags).toContain('awesome');
    expect(tool.parameters.required).toContain('name');
    expect(tool.handler).toBeDefined();
  });

  it('should set handler', () => {
    const handler = async () => ({ success: true, data: 'test' });
    const tool = new ToolBuilder('handler-tool', 'Handler', 'Desc')
      .category('test')
      .parameters({
        type: 'object',
        properties: { input: { type: 'string' } },
        required: [],
      })
      .handler(handler)
      .build();
    expect(tool.handler).toBe(handler);
  });
});
