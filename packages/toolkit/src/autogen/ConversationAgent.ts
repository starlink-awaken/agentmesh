/**
 * ConversationAgent - 对话 Agent 实现
 *
 * AutoGen 风格的多 Agent 对话系统中单个 Agent 的实现
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  ConversationAgentConfig,
  ConversationMessage,
  GenerateReplyOptions,
  GenerateReplyResult,
  ToolCall,
  ToolContext,
  ToolHandler,
  ToolResult,
} from './types.js';

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 对话 Agent 类
 *
 * 实现单个 Agent 的消息生成和工具调用能力
 */
export class ConversationAgent {
  public readonly id: string;
  public readonly name: string;
  public readonly role?: string;
  public readonly systemMessage: string;
  public readonly tools: Map<string, ToolHandler>;
  public readonly model: 'haiku' | 'sonnet' | 'opus';
  public readonly temperature: number;
  public readonly maxTokens: number;

  private _isSpeaking: boolean = false;

  constructor(config: ConversationAgentConfig) {
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.systemMessage = config.systemMessage;
    this.model = config.model || 'sonnet';
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 4096;

    // 初始化工具
    this.tools = new Map();
    if (config.tools) {
      for (const tool of config.tools) {
        if (tool.handler) {
          this.tools.set(tool.name, tool.handler);
        }
      }
    }
  }

  /**
   * 检查 Agent 是否正在发言
   */
  get isSpeaking(): boolean {
    return this._isSpeaking;
  }

  /**
   * 生成回复
   *
   * @param options - 生成选项
   * @returns 回复结果
   */
  async generateReply(options: GenerateReplyOptions): Promise<GenerateReplyResult> {
    this._isSpeaking = true;

    try {
      // 构建消息历史
      const messages = this.buildMessages(options.history);

      // 调用 LLM 生成回复（这里使用模拟实现，实际应该调用外部 LLM）
      const result = await this.callLLM(messages, options);

      return result;
    } finally {
      this._isSpeaking = false;
    }
  }

  /**
   * 构建消息列表
   */
  private buildMessages(history: ConversationMessage[]): object[] {
    const messages: object[] = [];

    // 添加系统消息
    messages.push({
      role: 'system',
      content: this.systemMessage,
    });

    // 添加历史消息
    for (const msg of history) {
      const msgObj: {
        role: string;
        content: string;
        name?: string;
        tool_calls?: object[];
        tool_call_id?: string;
      } = {
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content,
      };

      // 添加工具调用
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        msgObj.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }));
      }

      // 添加工具调用结果
      if (msg.toolCallId && msg.metadata?.toolResult) {
        msgObj.tool_call_id = msg.toolCallId;
      }

      messages.push(msgObj);
    }

    return messages;
  }

  /**
   * 调用 LLM
   *
   * 这里应该替换为实际的 LLM 调用
   * 目前是模拟实现
   */
  private async callLLM(
    messages: object[],
    _options: GenerateReplyOptions
  ): Promise<GenerateReplyResult> {
    // 模拟 LLM 调用
    // 在实际实现中，这里应该调用 Claude、GPT 等 LLM

    // 提取最后一条用户消息
    const lastUserMsg = [...messages].reverse().find(
      (m: any) => m.role === 'user'
    );

    const content = lastUserMsg
      ? `${this.name} 收到消息: ${(lastUserMsg as any).content}`
      : `${this.name} 已准备好回复`;

    // 检查是否需要调用工具
    const toolCalls = this.determineToolCalls(messages as any[]);

    return {
      content,
      toolCalls,
      finishReason: toolCalls && toolCalls.length > 0 ? 'tool_calls' : 'stop',
    };
  }

  /**
   * 确定是否需要调用工具
   */
  private determineToolCalls(messages: any[]): ToolCall[] | undefined {
    // 简单实现：根据消息内容决定是否调用工具
    // 实际实现中应该让 LLM 决定
    return undefined;
  }

  /**
   * 执行工具调用
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const handler = this.tools.get(toolName);

    if (!handler) {
      return {
        success: false,
        error: `Tool ${toolName} not found`,
      };
    }

    try {
      const result = await handler(args, context);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 创建消息
   */
  createMessage(
    content: string,
    type: ConversationMessage['type'] = 'assistant',
    metadata?: Record<string, unknown>
  ): ConversationMessage {
    return {
      id: generateId(),
      type,
      sender: this.name,
      senderId: this.id,
      content,
      timestamp: new Date(),
      metadata,
    };
  }

  /**
   * 获取工具列表
   */
  getToolList(): { name: string; description: string }[] {
    return Array.from(this.tools.keys()).map((name) => ({
      name,
      description: `Tool: ${name}`,
    }));
  }

  /**
   * 验证工具是否存在
   */
  hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }
}

/**
 * 创建对话 Agent 的工厂函数
 */
export function createConversationAgent(
  config: ConversationAgentConfig
): ConversationAgent {
  return new ConversationAgent(config);
}
