/**
 * AnthropicProvider - Anthropic LLM Provider 实现
 *
 * 实现 Claude API 调用，支持 Claude 3.5, Claude 3 Opus
 *
 * @author PAI
 * @version 1.0.0
 */

import { LLMClient } from './LLMClient.js';
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
  ToolCall,
  Usage,
} from './types.js';
import { LLMError } from './types.js';

/**
 * Anthropic Provider
 */
export class AnthropicProvider extends LLMClient {
  readonly providerType = 'anthropic' as const;

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    embedding: false, // Anthropic 当前不支持 embedding
    jsonMode: true,
    maxContextLength: 200000, // Claude 3.5
    supportedModels: [
      'claude-opus-4-5-20251901',
      'claude-opus-4-5',
      'claude-sonnet-4-20251901',
      'claude-sonnet-4-5-20251901',
      'claude-sonnet-4-5',
      'claude-sonnet-4',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-sonnet-20240620',
      'claude-3-5-haiku-20241022',
      'claude-3-5-haiku-20240620',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ],
  };

  private defaultBaseUrl = 'https://api.anthropic.com/v1';

  constructor(config: LLMConfig) {
    super(config);
  }

  /**
   * 聊天完成（非流式）
   */
  async chat(options: ChatOptions): Promise<ChatCompletion> {
    this.validateMessages(options.messages);

    const mergedConfig = this.mergeOptions(options);
    const apiKey = this.getApiKey();
    const baseUrl = this.getBaseUrl() || this.defaultBaseUrl;

    if (!apiKey) {
      throw new LLMError('Anthropic API key is required', 'MISSING_API_KEY');
    }

    const requestBody = this.buildRequestBody(mergedConfig, options.messages, false);

    try {
      const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          ...this.getHeaders(),
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.getTimeout()),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: { message?: string; type?: string } };
        throw new LLMError(
          error.error?.message || `Anthropic API error: ${response.status}`,
          error.error?.type,
          response.status
        );
      }

      const data = await response.json() as {
        id: string;
        model: string;
        content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
        stop_reason: string;
        usage: { input_tokens: number; output_tokens: number };
      };

      // 处理内容块
      let content = '';
      const toolCalls: ToolCall[] = [];

      for (const block of data.content) {
        if (block.type === 'text') {
          content += block.text || '';
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id || `call_${Math.random().toString(36).substring(7)}`,
            function: {
              name: block.name || '',
              arguments: JSON.stringify(block.input || {}),
            },
          });
        }
      }

      const usage: Usage = {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      };

      return {
        model: data.model,
        content,
        finishReason: this.mapStopReason(data.stop_reason),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage,
        id: data.id,
        created: Math.floor(Date.now() / 1000),
        raw: data,
      };
    } catch (error: unknown) {
      if (error instanceof LLMError) throw error;
      throw new LLMError(
        `Anthropic request failed: ${(error as Error).message}`,
        'REQUEST_FAILED',
        undefined,
        error as Error
      );
    }
  }

  /**
   * 流式聊天完成
   */
  async *stream(options: StreamOptions): AsyncGenerator<StreamChunk, void, unknown> {
    this.validateMessages(options.messages);

    const mergedConfig = this.mergeOptions(options);
    const apiKey = this.getApiKey();
    const baseUrl = this.getBaseUrl() || this.defaultBaseUrl;

    if (!apiKey) {
      throw new LLMError('Anthropic API key is required', 'MISSING_API_KEY');
    }

    const requestBody = this.buildRequestBody(mergedConfig, options.messages, true);

    try {
      const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          ...this.getHeaders(),
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.getTimeout()),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: { message?: string; type?: string } };
        throw new LLMError(
          error.error?.message || `Anthropic API error: ${response.status}`,
          error.error?.type,
          response.status
        );
      }

      if (!response.body) {
        throw new LLMError('No response body', 'NO_RESPONSE');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Anthropic 流式使用 server-sent events
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);

            try {
              const event = JSON.parse(data) as {
                type: string;
                delta?: { text?: string; type?: string; id?: string; name?: string; input?: unknown };
                usage?: { output_tokens: number };
                message?: { stop_reason?: string };
              };

              if (event.type === 'content_block_delta') {
                const content = event.delta?.text || '';

                if (options.onChunk) {
                  await options.onChunk({
                    content,
                    done: false,
                    raw: event,
                    delta: content,
                  });
                }

                yield this.createStreamChunk(content, false, content);
              } else if (event.type === 'message_stop') {
                yield this.createStreamChunk('', true);
                return;
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error: unknown) {
      if (error instanceof LLMError) throw error;
      throw new LLMError(
        `Anthropic stream failed: ${(error as Error).message}`,
        'STREAM_FAILED',
        undefined,
        error as Error
      );
    }
  }

  /**
   * 嵌入向量 - Anthropic 不支持
   */
  async embed(_request: EmbedRequest): Promise<EmbedResponse> {
    throw new LLMError(
      'Anthropic does not support embedding',
      'NOT_SUPPORTED'
    );
  }

  /**
   * Ping 检查
   */
  protected async ping(): Promise<void> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new LLMError('Anthropic API key is required', 'MISSING_API_KEY');
    }

    // Anthropic 没有专门的 ping 端点，使用消息 API 测试
    try {
      await this.chat({
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 1,
      });
    } catch (error: unknown) {
      if ((error as LLMError).status === 400) {
        // 400 表示 API 可用，只是我们的消息格式问题
        return;
      }
      throw error;
    }
  }

  /**
   * 构建请求体
   */
  private buildRequestBody(
    config: LLMConfig,
    messages: ChatMessage[],
    stream: boolean
  ): Record<string, unknown> {
    // 分离 system 消息
    const systemMessages: string[] = [];
    const filteredMessages: ChatMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessages.push(msg.content);
      } else {
        filteredMessages.push(msg);
      }
    }

    const body: Record<string, unknown> = {
      model: config.model,
      messages: filteredMessages.map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' : msg.role,
        content: msg.content,
        ...(msg.toolCallId && { tool_call_id: msg.toolCallId }),
        ...(msg.name && { name: msg.name }),
      })),
      stream,
    };

    // 添加可选参数
    if (config.temperature !== undefined) body.temperature = config.temperature;
    if (config.maxTokens !== undefined) body.max_tokens = config.maxTokens;
    if (config.topP !== undefined) body.top_p = config.topP;
    if (config.stop) body.stop_sequences = config.stop;

    // System 消息
    if (systemMessages.length > 0) {
      body.system = systemMessages.join('\n\n');
    }

    // 函数调用（Claude 使用 tools）
    if (config.tools && config.tools.length > 0) {
      body.tools = config.tools.map((fn) => ({
        name: fn.name,
        description: fn.description || '',
        input_schema: fn.parameters || { type: 'object', properties: {} },
      }));
    }

    // JSON 模式 - Anthropic 使用 beta header，这里简化处理
    if (config.responseFormat === 'json_object') {
      // 添加提示让模型输出 JSON
      body.system = (body.system as string || '') + '\n\nPlease respond in JSON format.';
    }

    return body;
  }

  /**
   * 映射停止原因
   */
  private mapStopReason(reason: string): ChatCompletion['finishReason'] {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }
}

/**
 * 创建 Anthropic Provider
 */
export function createAnthropicProvider(config: LLMConfig): AnthropicProvider {
  return new AnthropicProvider(config);
}
