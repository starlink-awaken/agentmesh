/**
 * OpenAIProvider - OpenAI LLM Provider 实现
 *
 * 实现 OpenAI API 调用，支持 GPT-4, GPT-3.5, o1 系列
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
 * OpenAI Provider
 */
export class OpenAIProvider extends LLMClient {
  readonly providerType = 'openai' as const;

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    embedding: true,
    jsonMode: true,
    maxContextLength: 128000, // GPT-4 Turbo
    supportedModels: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o1',
      'o1-mini',
      'o1-preview',
      'o3-mini',
      'o3-mini-high',
    ],
  };

  private defaultBaseUrl = 'https://api.openai.com/v1';

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
      throw new LLMError('OpenAI API key is required', 'MISSING_API_KEY');
    }

    const requestBody = this.buildRequestBody(mergedConfig, options.messages);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...this.getHeaders(),
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.getTimeout()),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string } };
        throw new LLMError(
          error.error?.message || `OpenAI API error: ${response.status}`,
          error.error?.code,
          response.status
        );
      }

      const data = await response.json() as {
        id: string;
        model: string;
        choices: Array<{
          message: { content: string; tool_calls?: ToolCall[] };
          finish_reason: string;
        }>;
        usage: Usage;
      };

      const choice = data.choices[0];
      return {
        model: data.model,
        content: choice.message.content || '',
        finishReason: choice.finish_reason as ChatCompletion['finishReason'],
        toolCalls: choice.message.tool_calls,
        usage: data.usage,
        id: data.id,
        created: Math.floor(Date.now() / 1000),
        raw: data,
      };
    } catch (error: unknown) {
      if (error instanceof LLMError) throw error;
      throw new LLMError(
        `OpenAI request failed: ${(error as Error).message}`,
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
      throw new LLMError('OpenAI API key is required', 'MISSING_API_KEY');
    }

    const requestBody = {
      ...this.buildRequestBody(mergedConfig, options.messages),
      stream: true,
    };

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...this.getHeaders(),
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.getTimeout()),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string } };
        throw new LLMError(
          error.error?.message || `OpenAI API error: ${response.status}`,
          error.error?.code,
          response.status
        );
      }

      if (!response.body) {
        throw new LLMError('No response body', 'NO_RESPONSE');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
            if (data === '[DONE]') {
              yield this.createStreamChunk('', true);
              return;
            }

            try {
              const chunk = JSON.parse(data) as {
                choices: Array<{
                  delta: { content?: string; tool_calls?: ToolCall[] };
                  finish_reason?: string;
                }>;
              };

              const choice = chunk.choices[0];
              if (!choice) continue;

              const content = choice.delta.content || '';
              const toolCalls = choice.delta.tool_calls;

              if (options.onChunk) {
                await options.onChunk({
                  content,
                  done: !!choice.finish_reason,
                  toolCalls,
                  raw: chunk,
                  delta: content,
                });
              }

              yield this.createStreamChunk(content, !!choice.finish_reason, content);

              if (choice.finish_reason) {
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
        `OpenAI stream failed: ${(error as Error).message}`,
        'STREAM_FAILED',
        undefined,
        error as Error
      );
    }
  }

  /**
   * 嵌入向量
   */
  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const apiKey = this.getApiKey();
    const baseUrl = this.getBaseUrl() || this.defaultBaseUrl;
    const model = request.model || 'text-embedding-3-small';

    if (!apiKey) {
      throw new LLMError('OpenAI API key is required', 'MISSING_API_KEY');
    }

    try {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...this.getHeaders(),
        },
        body: JSON.stringify({
          model,
          input: request.input,
        }),
        signal: AbortSignal.timeout(this.getTimeout()),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string } };
        throw new LLMError(
          error.error?.message || `OpenAI API error: ${response.status}`,
          error.error?.code,
          response.status
        );
      }

      const data = await response.json() as {
        model: string;
        data: Array<{ embedding: number[] }>;
        usage: Usage;
      };

      return {
        model: data.model,
        embeddings: data.data.map((d) => d.embedding),
        usage: data.usage,
      };
    } catch (error: unknown) {
      if (error instanceof LLMError) throw error;
      throw new LLMError(
        `OpenAI embed failed: ${(error as Error).message}`,
        'EMBED_FAILED',
        undefined,
        error as Error
      );
    }
  }

  /**
   * Ping 检查
   */
  protected async ping(): Promise<void> {
    const apiKey = this.getApiKey();
    const baseUrl = this.getBaseUrl() || this.defaultBaseUrl;

    if (!apiKey) {
      throw new LLMError('OpenAI API key is required', 'MISSING_API_KEY');
    }

    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new LLMError('OpenAI API unavailable', 'UNAVAILABLE', response.status);
    }
  }

  /**
   * 构建请求体
   */
  private buildRequestBody(config: LLMConfig, messages: ChatMessage[]): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: config.model,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        ...(msg.toolCalls && { tool_calls: msg.toolCalls }),
        ...(msg.toolCallId && { tool_call_id: msg.toolCallId }),
        ...(msg.name && { name: msg.name }),
      })),
    };

    // 添加可选参数
    if (config.temperature !== undefined) body.temperature = config.temperature;
    if (config.maxTokens !== undefined) body.max_tokens = config.maxTokens;
    if (config.topP !== undefined) body.top_p = config.topP;
    if (config.stop) body.stop = config.stop;
    if (config.frequencyPenalty !== undefined) body.frequency_penalty = config.frequencyPenalty;
    if (config.presencePenalty !== undefined) body.presence_penalty = config.presencePenalty;

    // 函数调用
    if (config.tools && config.tools.length > 0) {
      body.tools = config.tools.map((fn) => ({
        type: 'function',
        function: {
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters,
        },
      }));
    }

    if (config.toolChoice) {
      body.tool_choice = config.toolChoice;
    }

    // JSON 模式
    if (config.responseFormat === 'json_object' || config.responseFormat === 'json_schema') {
      body.response_format = { type: config.responseFormat };
      if (config.responseFormat === 'json_schema' && config.jsonSchema) {
        (body.response_format as Record<string, unknown>).json_schema = {
          schema: config.jsonSchema,
        };
      }
    }

    return body;
  }
}

/**
 * 创建 OpenAI Provider
 */
export function createOpenAIProvider(config: LLMConfig): OpenAIProvider {
  return new OpenAIProvider(config);
}
