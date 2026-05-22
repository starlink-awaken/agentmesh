/**
 * EdgeAgent - 边缘Agent基类
 *
 * 基于CAMPHOR论文的5类子Agent设计
 *
 * @author PAI
 */

import type { EdgeAgentConfig, EdgeAgentType, EdgeTask, EdgeResult } from './types.js';

/**
 * 边缘Agent基类
 */
export class EdgeAgent {
  public readonly config: EdgeAgentConfig;
  public readonly type: EdgeAgentType;

  private toolRegistry: Map<string, Function> = new Map();

  constructor(config: EdgeAgentConfig) {
    this.config = config;
    this.type = config.type;
  }

  /**
   * 注册工具
   */
  registerTool(name: string, handler: Function): void {
    this.toolRegistry.set(name, handler);
  }

  /**
   * 执行任务
   */
  async execute(task: EdgeTask): Promise<EdgeResult> {
    const startTime = Date.now();

    try {
      // 构建Prompt
      const prompt = this.buildPrompt(task);

      // 调用LLM生成函数调用
      const toolCalls = await this.generateToolCalls(prompt);

      // 执行函数调用
      const results = await this.executeTools(toolCalls);

      // 合成结果
      const output = this.synthesizeOutput(results);

      return {
        taskId: task.id,
        success: true,
        output,
        agentUsed: this.type,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        taskId: task.id,
        success: false,
        output: null,
        agentUsed: this.type,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 构建Prompt
   */
  protected buildPrompt(task: EdgeTask): string {
    return `
你是 ${this.config.name}，${this.config.description}

任务类型: ${task.type}
任务输入: ${task.input}

可用工具:
${this.config.tools.map(t => `- ${t}`).join('\n')}

请根据任务选择合适的工具并生成调用。
`;
  }

  /**
   * 生成工具调用（模拟）
   */
  protected async generateToolCalls(prompt: string): Promise<string[]> {
    // 在实际实现中，这里会调用LLM
    // 返回模拟的工具调用列表
    return this.config.tools.slice(0, 1);
  }

  /**
   * 执行工具调用
   */
  protected async executeTools(toolCalls: string[]): Promise<unknown[]> {
    const results: unknown[] = [];

    for (const toolName of toolCalls) {
      const handler = this.toolRegistry.get(toolName);
      if (handler) {
        results.push(await handler());
      }
    }

    return results;
  }

  /**
   * 合成输出
   */
  protected synthesizeOutput(results: unknown[]): unknown {
    if (results.length === 0) return null;
    if (results.length === 1) return results[0];
    return results;
  }

  /**
   * 获取Agent信息
   */
  getInfo(): { type: EdgeAgentType; name: string; tools: string[] } {
    return {
      type: this.type,
      name: this.config.name,
      tools: this.config.tools,
    };
  }
}

// 工厂函数：创建特定类型的Agent
export function createEdgeAgent(type: EdgeAgentType): EdgeAgent {
  const configs: Record<EdgeAgentType, EdgeAgentConfig> = {
    reasoning: {
      type: 'reasoning',
      name: '高阶推理Agent',
      description: '理解和规划用户的查询过程，通过确定调用其他子Agent的顺序来解决查询任务',
      tools: ['plan', 'delegate', 'synthesize'],
    },
    personal_context: {
      type: 'personal_context',
      name: '个人上下文Agent',
      description: '生成函数调用，搜索相关的个人上下文，帮助解决用户提出的实体歧义和不明确的查询',
      tools: ['get_contacts', 'get_calendar', 'get_messages'],
    },
    device_info: {
      type: 'device_info',
      name: '设备信息Agent',
      description: '生成函数调用，检索设备信息，包括当前位置、时间和屏幕实体等',
      tools: ['get_location', 'get_time', 'get_screen'],
    },
    user_perception: {
      type: 'user_perception',
      name: '用户感知Agent',
      description: '生成函数调用，获取设备上最近的用户活动数据',
      tools: ['get_activities', 'get_history', 'get_preferences'],
    },
    external_knowledge: {
      type: 'external_knowledge',
      name: '外部知识Agent',
      description: '生成函数调用，从外部查找和获取信息',
      tools: ['web_search', 'wiki_search', 'calculator'],
    },
    task_completion: {
      type: 'task_completion',
      name: '任务完成Agent',
      description: '生成函数调用，表示用户对任务完成的意图',
      tools: ['send_message', 'create_event', 'make_call'],
    },
  };

  return new EdgeAgent(configs[type]);
}
