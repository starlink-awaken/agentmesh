/**
 * OllamaProvider - Ollama 本地 LLM Provider 实现
 *
 * 调用本地 Ollama 服务，支持流式输出
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
  Usage,
} from './types.js';
import { LLMError } from './types.js';

/**
 * Ollama Provider
 */
export class OllamaProvider extends LLMClient {
  readonly providerType = 'ollama' as const;

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: false, // Ollama 当前不支持函数调用
    embedding: true,
    jsonMode: false, // Ollama 不直接支持 JSON 模式，但可以通过 prompt 实现
    maxContextLength: undefined, // 取决于本地模型配置
    supportedModels: [], // 动态获取
  };

  private baseUrl: string;

  constructor(config: LLMConfig) {
    super(config);
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
  }

  /**
   * 聊天完成（非流式）
   */
  async chat(options: ChatOptions): Promise<ChatCompletion> {
    this.validateMessages(options.messages);

    const mergedConfig = this.mergeOptions(options);
    const requestBody = this.buildRequestBody(mergedConfig, options.messages, false);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.getTimeout()),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new LLMError(
          `Ollama API error: ${response.status} ${errorText}`,
          'API_ERROR',
          response.status
        );
      }

      const data = await response.json() as {
        model: string;
        message: { content: string; role: string };
        done: boolean;
        total_duration?: number;
        prompt_eval_count?: number;
        eval_count?: number;
      };

      const usage: Usage = {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      };

      return {
        model: data.model,
        content: data.message?.content || '',
        finishReason: data.done ? 'stop' : 'length',
        usage,
        raw: data,
      };
    } catch (error) {
      if (error instanceof LLMError) throw error;
      throw new LLMError(
        `Ollama request failed: ${(error as Error).message}`,
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
    const requestBody = this.buildRequestBody(mergedConfig, options.messages, true);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.getTimeout()),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new LLMError(
          `Ollama API error: ${response.status} ${errorText}`,
          'API_ERROR',
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
            if (!line.trim()) continue;

            try {
              const chunk = JSON.parse(line) as {
                message?: { content: string; role: string };
                done: boolean;
                total_duration?: number;
              };

              const content = chunk.message?.content || '';

              if (options.onChunk) {
                await options.onChunk({
                  content,
                  done: chunk.done,
                  raw: chunk,
                  delta: content,
                });
              }

              yield this.createStreamChunk(content, chunk.done, content);

              if (chunk.done) {
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
    } catch (error) {
      if (error instanceof LLMError) throw error;
      throw new LLMError(
        `Ollama stream failed: ${(error as Error).message}`,
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
    const input = Array.isArray(request.input) ? request.input : [request.input];
    const model = request.model || this.config.model;

    const embeddings: number[][] = [];

    for (const text of input) {
      try {
        const response = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: text }),
          signal: AbortSignal.timeout(this.getTimeout()),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new LLMError(
            `Ollama embed error: ${response.status} ${errorText}`,
            'EMBED_ERROR',
            response.status
          );
        }

        const data = await response.json() as { embedding: number[] };
        embeddings.push(data.embedding);
      } catch (error) {
        if (error instanceof LLMError) throw error;
        throw new LLMError(
          `Ollama embed failed: ${(error as Error).message}`,
          'EMBED_FAILED',
          undefined,
          error as Error
        );
      }
    }

    return {
      model,
      embeddings,
    };
  }

  /**
   * 获取可用模型列表
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new LLMError('Failed to list models', 'LIST_FAILED', response.status);
      }

      const data = await response.json() as { models: Array<{ name: string }> };
      return data.models?.map((m) => m.name) || [];
    } catch (error) {
      if (error instanceof LLMError) throw error;
      throw new LLMError(
        `Failed to list models: ${(error as Error).message}`,
        'LIST_FAILED',
        undefined,
        error as Error
      );
    }
  }

  /**
   * Ping 检查
   */
  protected async ping(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new LLMError('Ollama service unavailable', 'UNAVAILABLE', response.status);
    }
  }

  /**
   * 检查服务是否可用
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
   * 设置基础 URL
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
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
    let systemPrompt = '';
    const chatMessages: Array<{ role: string; content: string }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt += (systemPrompt ? '\n\n' : '') + msg.content;
      } else {
        chatMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const body: Record<string, unknown> = {
      model: config.model,
      messages: chatMessages,
      stream,
      options: {},
    };

    // 添加可选参数
    if (systemPrompt) body.system = systemPrompt;
    if (config.temperature !== undefined) body.options = { ...(body.options as object), temperature: config.temperature };
    if (config.topP !== undefined) body.options = { ...(body.options as object), top_p: config.topP };
    if (config.topK !== undefined) body.options = { ...(body.options as object), top_k: config.topK };
    if (config.maxTokens !== undefined) body.options = { ...(body.options as object), num_predict: config.maxTokens };
    if (config.stop) body.options = { ...(body.options as object), stop: config.stop };

    return body;
  }
}

/**
 * 创建 Ollama Provider
 */
export function createOllamaProvider(config: LLMConfig): OllamaProvider {
  return new OllamaProvider(config);
}
