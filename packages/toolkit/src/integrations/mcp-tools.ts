/**
 * MCP Tools - MCP 工具定义
 *
 * 定义供 MCP Server 使用的标准工具
 *
 * @author PAI
 * @version 1.0.0
 */

import type { MCPTool } from './MCPServer.js';

/**
 * 记忆工具定义
 */
export const memoryTools = {
  /**
   * 从记忆系统检索相关内容
   */
  memory_search: {
    name: 'memory_search',
    description: '从记忆系统检索相关内容。根据查询关键词搜索记忆存储，返回最相关的记忆条目。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string' as const,
          description: '搜索查询关键词',
        },
        limit: {
          type: 'number' as const,
          description: '返回结果数量限制，默认 10',
          default: 10,
        },
        threshold: {
          type: 'number' as const,
          description: '相似度阈值，0-1 之间',
          default: 0.0,
        },
        sessionId: {
          type: 'string' as const,
          description: '指定会话 ID 进行过滤（可选）',
        },
        tags: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: '按标签过滤（可选）',
        },
      },
      required: ['query'],
    },
  },

  /**
   * 存储内容到记忆系统
   */
  memory_store: {
    name: 'memory_store',
    description: '存储新内容到记忆系统。可指定内容、标签、会话 ID 和重要性评分。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string' as const,
          description: '要存储的记忆内容',
        },
        tags: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: '记忆标签',
          default: [],
        },
        sessionId: {
          type: 'string' as const,
          description: '会话 ID',
          default: 'default',
        },
        importance: {
          type: 'number' as const,
          description: '重要性评分，0-1 之间',
          default: 0.5,
        },
        source: {
          type: 'string' as const,
          description: '记忆来源',
          default: 'mcp-tool',
        },
      },
      required: ['content'],
    },
  },

  /**
   * 删除记忆
   */
  memory_delete: {
    name: 'memory_delete',
    description: '根据 ID 删除指定的记忆条目。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string' as const,
          description: '要删除的记忆 ID',
        },
      },
      required: ['id'],
    },
  },

  /**
   * 更新记忆
   */
  memory_update: {
    name: 'memory_update',
    description: '更新指定记忆的内容或元数据。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string' as const,
          description: '要更新的记忆 ID',
        },
        content: {
          type: 'string' as const,
          description: '新的记忆内容',
        },
        tags: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: '新的标签',
        },
        importance: {
          type: 'number' as const,
          description: '新的重要性评分',
        },
      },
      required: ['id'],
    },
  },

  /**
   * 获取记忆统计信息
   */
  memory_stats: {
    name: 'memory_stats',
    description: '获取记忆系统的统计信息，包括总条目数、会话数、平均重要性等。',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },

  /**
   * 获取会话记忆
   */
  memory_get_by_session: {
    name: 'memory_get_by_session',
    description: '获取指定会话的所有记忆。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionId: {
          type: 'string' as const,
          description: '会话 ID',
        },
      },
      required: ['sessionId'],
    },
  },
};

/**
 * 推理工具定义
 */
export const reasoningTools = {
  /**
   * 从推理记忆库检索相关经验
   */
  reasoning_search: {
    name: 'reasoning_search',
    description: '从推理记忆库检索相关经验。根据查询搜索成功和失败的经验记录，返回最相关的策略和教训。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string' as const,
          description: '搜索查询',
        },
        limit: {
          type: 'number' as const,
          description: '返回结果数量限制，默认 5',
          default: 5,
        },
      },
      required: ['query'],
    },
  },

  /**
   * 学习新经验并存储到推理记忆库
   */
  reasoning_learn: {
    name: 'reasoning_learn',
    description: '从任务执行结果学习，提炼策略或分析失败原因，并存储到推理记忆库。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        taskId: {
          type: 'string' as const,
          description: '任务 ID',
        },
        input: {
          type: 'string' as const,
          description: '任务输入',
        },
        output: {
          type: 'string' as const,
          description: '任务输出',
        },
        success: {
          type: 'boolean' as const,
          description: '任务是否成功',
        },
        trajectory: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: '执行步骤轨迹',
        },
        duration: {
          type: 'number' as const,
          description: '执行时长（毫秒）',
        },
        error: {
          type: 'string' as const,
          description: '错误信息（如有）',
        },
      },
      required: ['taskId', 'input', 'success', 'trajectory'],
    },
  },

  /**
   * 获取推理记忆库统计信息
   */
  reasoning_stats: {
    name: 'reasoning_stats',
    description: '获取推理记忆库的统计信息，包括成功/失败记忆数量、平均精炼层级等。',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },

  /**
   * 获取所有推理记忆
   */
  reasoning_get_all: {
    name: 'reasoning_get_all',
    description: '获取推理记忆库中的所有记忆。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number' as const,
          description: '返回数量限制',
          default: 100,
        },
      },
    },
  },

  /**
   * 清除推理记忆库
   */
  reasoning_clear: {
    name: 'reasoning_clear',
    description: '清除推理记忆库中的所有记忆。谨慎使用。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        confirm: {
          type: 'boolean' as const,
          description: '确认清除',
        },
      },
      required: ['confirm'],
    },
  },
};

/**
 * 创建记忆工具的便捷函数
 */
export function createMemoryToolHandler(
  toolName: string,
  memoryStore: unknown
): (args: unknown) => Promise<unknown> {
  return async (args: unknown) => {
    const store = memoryStore as {
      retrieve(query: { query: string; limit?: number; threshold?: number; filters?: unknown }): Promise<unknown[]>;
      store(entry: { content: string; metadata: unknown }): Promise<{ id: string }>;
      delete(id: string): Promise<boolean>;
      update(id: string, updates: unknown): Promise<unknown>;
      getStats(): Promise<unknown>;
      getBySession(sessionId: string): Promise<unknown[]>;
    };

    const typedArgs = args as Record<string, unknown>;

    switch (toolName) {
      case 'memory_search': {
        const query = typedArgs.query as string;
        const limit = (typedArgs.limit as number) || 10;
        const threshold = (typedArgs.threshold as number) || 0.0;
        const filters: Record<string, unknown> = {};

        if (typedArgs.sessionId) filters.sessionId = typedArgs.sessionId;
        if (typedArgs.tags) filters.tags = typedArgs.tags;

        const results = await store.retrieve({ query, limit, threshold, filters });
        return results;
      }

      case 'memory_store': {
        const content = typedArgs.content as string;
        const tags = (typedArgs.tags as string[]) || [];
        const sessionId = (typedArgs.sessionId as string) || 'default';
        const importance = (typedArgs.importance as number) || 0.5;
        const source = (typedArgs.source as string) || 'mcp-tool';

        const result = await store.store({
          content,
          metadata: {
            sessionId,
            timestamp: Date.now(),
            importance,
            tags,
            source,
          },
        });
        return result;
      }

      case 'memory_delete': {
        const id = typedArgs.id as string;
        const success = await store.delete(id);
        return { success, id };
      }

      case 'memory_update': {
        const id = typedArgs.id as string;
        const updates: Record<string, unknown> = {};
        if (typedArgs.content) updates.content = typedArgs.content;
        if (typedArgs.tags) updates.metadata = { tags: typedArgs.tags };
        if (typedArgs.importance !== undefined) {
          updates.metadata = { ...(updates.metadata as object), importance: typedArgs.importance };
        }
        const result = await store.update(id, updates);
        return result;
      }

      case 'memory_stats': {
        return store.getStats();
      }

      case 'memory_get_by_session': {
        const sessionId = typedArgs.sessionId as string;
        return store.getBySession(sessionId);
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  };
}

/**
 * 创建推理工具的便捷函数
 */
export function createReasoningToolHandler(
  toolName: string,
  reasoningBank: unknown
): (args: unknown) => Promise<unknown> {
  return async (args: unknown) => {
    const bank = reasoningBank as {
      retrieve(query: string, limit?: number): Promise<unknown[]>;
      learn(result: unknown): Promise<{ id: string }>;
      getStats(): Promise<unknown>;
      getAll(): Promise<unknown[]>;
      clear(): void;
    };

    const typedArgs = args as Record<string, unknown>;

    switch (toolName) {
      case 'reasoning_search': {
        const query = typedArgs.query as string;
        const limit = (typedArgs.limit as number) || 5;
        const results = await bank.retrieve(query, limit);
        return results;
      }

      case 'reasoning_learn': {
        const result = {
          taskId: typedArgs.taskId as string,
          input: typedArgs.input as unknown,
          output: typedArgs.output as unknown,
          success: typedArgs.success as boolean,
          trajectory: typedArgs.trajectory as string[],
          duration: typedArgs.duration as number,
          error: typedArgs.error as string | undefined,
        };
        const memory = await bank.learn(result);
        return memory;
      }

      case 'reasoning_stats': {
        return bank.getStats();
      }

      case 'reasoning_get_all': {
        const limit = (typedArgs.limit as number) || 100;
        const all = await bank.getAll();
        return all.slice(0, limit);
      }

      case 'reasoning_clear': {
        const confirm = typedArgs.confirm as boolean;
        if (confirm) {
          bank.clear();
          return { success: true, message: 'Reasoning bank cleared' };
        }
        return { success: false, message: 'Confirmation required' };
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  };
}

/**
 * 导出所有工具定义
 */
export const allTools = {
  ...memoryTools,
  ...reasoningTools,
};
