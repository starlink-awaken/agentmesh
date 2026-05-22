/**
 * LLMClient - LLM 统一客户端接口
 *
 * 定义 LLM Provider 的抽象基类，统一接口支持多 Provider
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  LLMConfig,
  ChatMessage,
  ChatCompletion,
  StreamChunk,
  EmbedRequest,
  EmbedResponse,
  ChatOptions,
  StreamOptions,
  ProviderCapabilities,
  ProviderType,
} from './types.js';

/**
 * LLM 客户端接口
 * 所有 Provider 实现必须实现此接口
 */
export interface ILLMClient {
  /** Provider 类型 */
  readonly providerType: ProviderType;
  /** 能力描述 */
  readonly capabilities: ProviderCapabilities;

  /**
   * 聊天完成（非流式）
   */
  chat(options: ChatOptions): Promise<ChatCompletion>;

  /**
   * 流式聊天完成
   */
  stream(options: StreamOptions): AsyncGenerator<StreamChunk, void, unknown>;

  /**
   * 嵌入向量
   */
  embed(request: EmbedRequest): Promise<EmbedResponse>;

  /**
   * 获取当前模型
   */
  getModel(): string;

  /**
   * 设置模型
   */
  setModel(model: string): void;

  /**
   * 检查 Provider 是否可用
   */
  isAvailable(): Promise<boolean>;
}

/**
 * LLM 客户端抽象基类
 * 提供通用实现，子类只需实现特定方法
 */
export abstract class LLMClient implements ILLMClient {
  /** Provider 类型 */
  abstract readonly providerType: ProviderType;
  /** 能力描述 */
  abstract readonly capabilities: ProviderCapabilities;

  /** 当前配置 */
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = { ...config };
  }

  /**
   * 聊天完成（非流式）
   */
  abstract chat(options: ChatOptions): Promise<ChatCompletion>;

  /**
   * 流式聊天完成
   */
  abstract stream(options: StreamOptions): AsyncGenerator<StreamChunk, void, unknown>;

  /**
   * 嵌入向量
   */
  abstract embed(request: EmbedRequest): Promise<EmbedResponse>;

  /**
   * 获取当前模型
   */
  getModel(): string {
    return this.config.model;
  }

  /**
   * 设置模型
   */
  setModel(model: string): void {
    this.config.model = model;
  }

  /**
   * 检查 Provider 是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ping 检查（子类可重写）
   */
  protected async ping(): Promise<void> {
    // 默认实现为空，子类可重写
  }

  /**
   * 获取 API Key
   */
  protected getApiKey(): string | undefined {
    return this.config.apiKey;
  }

  /**
   * 获取基础 URL
   */
  protected getBaseUrl(): string | undefined {
    return this.config.baseUrl;
  }

  /**
   * 获取请求头
   */
  protected getHeaders(): Record<string, string> {
    return this.config.headers || {};
  }

  /**
   * 获取超时配置
   */
  protected getTimeout(): number {
    return this.config.timeout || 60000;
  }

  /**
   * 创建 ChatCompletion 结果
   */
  protected createChatCompletion(
    content: string,
    finishReason: ChatCompletion['finishReason'] = 'stop',
    toolCalls?: ChatCompletion['toolCalls'],
    usage?: ChatCompletion['usage']
  ): ChatCompletion {
    return {
      model: this.config.model,
      content,
      finishReason,
      toolCalls,
      usage,
      id: this.generateId(),
      created: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * 创建 StreamChunk
   */
  protected createStreamChunk(
    content: string,
    done: boolean = false,
    delta?: string
  ): StreamChunk {
    return {
      content,
      done,
      delta: delta || content,
    };
  }

  /**
   * 生成请求 ID
   */
  protected generateId(): string {
    return `chatcmpl-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * 验证消息列表
   */
  protected validateMessages(messages: ChatMessage[]): void {
    if (!messages || messages.length === 0) {
      throw new Error('Messages cannot be empty');
    }

    // 检查最后一条消息是否是 user 角色
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user' && lastMessage.role !== 'tool') {
      throw new Error('Last message must be from user or tool');
    }
  }

  /**
   * 合并配置选项
   */
  protected mergeOptions(options: Partial<ChatOptions>): LLMConfig {
    return {
      ...this.config,
      temperature: options.temperature ?? this.config.temperature,
      maxTokens: options.maxTokens ?? this.config.maxTokens,
      topP: options.topP ?? this.config.topP,
      stop: options.stop ?? this.config.stop,
      tools: options.tools ?? this.config.tools,
      toolChoice: options.toolChoice ?? this.config.toolChoice,
      responseFormat: options.responseFormat ?? this.config.responseFormat,
      jsonSchema: options.jsonSchema ?? this.config.jsonSchema,
    };
  }
}

/**
 * 检查 Provider 是否支持特定功能
 */
export function hasCapability(
  client: ILLMClient,
  capability: keyof ProviderCapabilities
): boolean {
  return client.capabilities[capability] === true;
}
