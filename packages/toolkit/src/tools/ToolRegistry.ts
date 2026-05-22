/**
 * ToolRegistry - 工具注册中心
 * 管理代理工具的注册、发现、调用
 */
import type {
  AgentTool,
  ToolResult,
  ToolContext,
  ToolRegistryStats,
  ParameterDefinition,
} from './types.js';

export class ToolRegistry {
  private tools: Map<string, AgentTool> = new Map();
  private categories: Map<string, Set<string>> = new Map();
  private usageStats: Map<string, number> = new Map();

  constructor() {}

  /**
   * 注册工具
   */
  register(tool: AgentTool): void {
    if (this.tools.has(tool.id)) {
      console.warn(`Tool ${tool.id} already registered, overwriting...`);
    }
    this.tools.set(tool.id, tool);

    // 索引分类
    if (!this.categories.has(tool.category)) {
      this.categories.set(tool.category, new Set());
    }
    this.categories.get(tool.category)!.add(tool.id);
  }

  /**
   * 批量注册工具
   */
  registerMany(tools: AgentTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 注销工具
   */
  unregister(toolId: string): boolean {
    const tool = this.tools.get(toolId);
    if (!tool) return false;

    this.tools.delete(toolId);
    this.categories.get(tool.category)?.delete(toolId);
    return true;
  }

  /**
   * 获取工具
   */
  get(toolId: string): AgentTool | undefined {
    return this.tools.get(toolId);
  }

  /**
   * 按分类获取工具
   */
  getByCategory(category: string): AgentTool[] {
    const toolIds = this.categories.get(category);
    if (!toolIds) return [];
    return Array.from(toolIds).map(id => this.tools.get(id)!).filter(Boolean);
  }

  /**
   * 搜索工具
   */
  search(query: string): AgentTool[] {
    const lowerQuery = query.toLowerCase();
    const results: Array<{ tool: AgentTool; score: number }> = [];

    for (const tool of this.tools.values()) {
      let score = 0;

      // 名称匹配
      if (tool.name.toLowerCase().includes(lowerQuery)) {
        score += 10;
      }

      // 描述匹配
      if (tool.description.toLowerCase().includes(lowerQuery)) {
        score += 5;
      }

      // 标签匹配
      if (tool.tags) {
        for (const tag of tool.tags) {
          if (tag.toLowerCase().includes(lowerQuery)) {
            score += 3;
          }
        }
      }

      // 分类匹配
      if (tool.category.toLowerCase().includes(lowerQuery)) {
        score += 2;
      }

      if (score > 0) {
        results.push({ tool, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.map(r => r.tool);
  }

  /**
   * 执行工具
   */
  async execute(
    toolId: string,
    params: unknown,
    context?: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return {
        success: false,
        error: `Tool ${toolId} not found`,
      };
    }

    // 参数验证
    const validation = this.validateParams(params, tool.parameters);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid params: ${validation.errors.join(', ')}`,
      };
    }

    try {
      // 记录使用统计
      this.usageStats.set(toolId, (this.usageStats.get(toolId) || 0) + 1);

      // 执行工具
      const result = await tool.handler(params, context);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 获取所有工具
   */
  getAll(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取统计信息
   */
  getStats(): ToolRegistryStats {
    const categoryCount: Record<string, number> = {};
    for (const [category, toolIds] of this.categories) {
      categoryCount[category] = toolIds.size;
    }

    const mostUsed = Array.from(this.usageStats.entries())
      .map(([toolId, count]) => ({ toolId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalTools: this.tools.size,
      categories: categoryCount,
      mostUsed,
    };
  }

  /**
   * 参数验证
   */
  private validateParams(
    params: unknown,
    paramDef: ParameterDefinition
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!params || typeof params !== 'object') {
      if (paramDef.required && paramDef.required.length > 0) {
        errors.push('Parameters are required');
      }
      return { valid: errors.length === 0, errors };
    }

    const paramsObj = params as Record<string, unknown>;

    // 检查必需参数
    if (paramDef.required) {
      for (const required of paramDef.required) {
        if (!(required in paramsObj)) {
          errors.push(`Missing required parameter: ${required}`);
        }
      }
    }

    // 检查参数类型
    for (const [key, value] of Object.entries(paramsObj)) {
      const prop = paramDef.properties[key];
      if (prop) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (prop.type !== actualType && value !== undefined) {
          errors.push(`Invalid type for ${key}: expected ${prop.type}, got ${actualType}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

/**
 * 工具构建器 - 简化工具创建
 */
export class ToolBuilder {
  private tool: Partial<AgentTool>;

  constructor(id: string, name: string, description: string) {
    this.tool = {
      id,
      name,
      description,
      tags: [],
    };
  }

  category(category: string): this {
    this.tool.category = category;
    return this;
  }

  version(version: string): this {
    this.tool.version = version;
    return this;
  }

  parameters(params: ParameterDefinition): this {
    this.tool.parameters = params;
    return this;
  }

  handler(handler: AgentTool['handler']): this {
    this.tool.handler = handler;
    return this;
  }

  tags(tags: string[]): this {
    this.tool.tags = tags;
    return this;
  }

  build(): AgentTool {
    if (!this.tool.category || !this.tool.parameters || !this.tool.handler) {
      throw new Error('Tool is missing required fields');
    }
    return this.tool as AgentTool;
  }
}
