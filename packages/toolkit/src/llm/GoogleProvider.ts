/**
 * GoogleProvider - Google AI (Gemini) LLM Provider 实现
 *
 * 实现 Google AI API 调用，支持 Gemini Pro/Flash 系列模型
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
  FunctionDefinition,
  JSONSchema,
} from './types.js';
import { LLMError } from './types.js';

/**
 * Google AI API 响应类型
 */
interface GoogleChatResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string;
        functionCall?: {
          name: string;
          args: Record<string, unknown>;
        };
      }>;
    };
    finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER' | null;
    safetyRatings?: Array<{
      category: string;
      probability: 'NEGLIGIBLE' | 'LOW' | 'MEDIUM' | 'HIGH';
    }>;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  modelVersion?: string;
}

/**
 * Google AI 嵌入向量响应类型
 */
interface GoogleEmbedResponse {
  embedding?: {
    values: number[];
  };
  embeddings?: Array<{
    values: number[];
  }>;
}

/**
 * Google AI 流式响应块类型
 */
interface GoogleStreamChunk {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string;
        functionCall?: {
          name: string;
          args: Record<string, unknown>;
        };
      }>;
    };
    finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER' | null;
  }>;
}

/**
 * Google Provider
 */
export class GoogleProvider extends LLMClient {
  readonly providerType = 'google' as const;

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    embedding: true,
    jsonMode: true,
    maxContextLength: 1000000, // Gemini 1.5 Pro 支持 1M 上下文
    supportedModels: [
      'gemini-1.5-pro',
      'gemini-1.5-pro-001',
      'gemini-1.5-flash',
      'gemini-1.5-flash-001',
      'gemini-2.0-flash-exp',
      'gemini-2.0-flash-thinking-exp',
      'gemini-1.0-pro',
      'gemini-1.0-pro-001',
      'gemini-1.0-pro-vision',
      'gemini-1.0-ultra',
      'gemini-1.0-ultra-001',
    ],
  };

  private defaultBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';

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
      throw new LLMError('Google AI API key is required', 'MISSING_API_KEY');
    }

    const requestBody = this.buildRequestBody(mergedConfig, options.messages);

    try {
      const response = await fetch(
        `${baseUrl}/models/${mergedConfig.model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getHeaders(),
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(this.getTimeout()),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: { message?: string; code?: number } };
        throw new LLMError(
          error.error?.message || `Google AI API error: ${response.status}`,
          error.error?.code?.toString(),
          response.status
        );
      }

      const data = await response.json() as GoogleChatResponse;

      if (!data.candidates || data.candidates.length === 0) {
        throw new LLMError('No candidates returned from Google AI API', 'NO_CANDIDATES');
      }

      const candidate = data.candidates[0];
      const textContent = candidate.content.parts
        .filter(part => part.text)
        .map(part => part.text)
        .join('');

      const toolCalls = candidate.content.parts
        .filter(part => part.functionCall)
        .map(part => ({
          id: `call_${Math.random().toString(36).substring(2, 15)}`,
          function: {
            name: part.functionCall!.name,
            arguments: JSON.stringify(part.functionCall!.args),
          },
        }));

      const usage: Usage | undefined = data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      } : undefined;

      const finishReason = this.mapFinishReason(candidate.finishReason);

      return {
        model: mergedConfig.model,
        content: textContent,
        finishReason,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage,
        id: this.generateId(),
        created: Math.floor(Date.now() / 1000),
        raw: data,
      };
    } catch (error: unknown) {
      if (error instanceof LLMError) throw error;
      throw new LLMError(
        `Google AI request failed: ${(error as Error).message}`,
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
      throw new LLMError('Google AI API key is required', 'MISSING_API_KEY');
    }

    const baseRequest = this.buildRequestBody(mergedConfig, options.messages);
    const requestBody = {
      ...baseRequest,
      generationConfig: {
        ...(baseRequest.generationConfig as object),
      },
    };

    try {
      const response = await fetch(
        `${baseUrl}/models/${mergedConfig.model}:streamGenerateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getHeaders(),
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(this.getTimeout()),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: { message?: string; code?: number } };
        throw new LLMError(
          error.error?.message || `Google AI API error: ${response.status}`,
          error.error?.code?.toString(),
          response.status
        );
      }

      if (!response.body) {
        throw new LLMError('No response body', 'NO_RESPONSE');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const chunk = JSON.parse(trimmed) as GoogleStreamChunk;

              if (!chunk.candidates || chunk.candidates.length === 0) continue;

              const candidate = chunk.candidates[0];
              const textContent = candidate.content.parts
                .filter(part => part.text)
                .map(part => part.text)
                .join('');

              const toolCalls = candidate.content.parts
                .filter(part => part.functionCall)
                .map(part => ({
                  id: `call_${Math.random().toString(36).substring(2, 15)}`,
                  function: {
                    name: part.functionCall!.name,
                    arguments: JSON.stringify(part.functionCall!.args),
                  },
                }));

              accumulatedContent += textContent;
              const done = candidate.finishReason !== null;

              const streamChunk: StreamChunk = {
                content: textContent, // 返回增量内容，而不是累积内容
                done,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                raw: chunk,
                delta: textContent,
              };

              if (options.onChunk) {
                await options.onChunk(streamChunk);
              }

              yield streamChunk;

              if (done) {
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
        `Google AI stream failed: ${(error as Error).message}`,
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
    const model = request.model || 'text-embedding-004';

    if (!apiKey) {
      throw new LLMError('Google AI API key is required', 'MISSING_API_KEY');
    }

    const isBatch = Array.isArray(request.input);
    const endpoint = isBatch ? 'batchEmbedContents' : 'embedContent';
    const input = isBatch ? request.input : request.input;

    try {
      const response = await fetch(
        `${baseUrl}/models/${model}:${endpoint}?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getHeaders(),
          },
          body: JSON.stringify({
            model: `models/${model}`,
            ...(isBatch
              ? { requests: (input as string[]).map(text => ({ content: { parts: [{ text }] } })) }
              : { content: { parts: [{ text: input as string }] } }),
          }),
          signal: AbortSignal.timeout(this.getTimeout()),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: { message?: string; code?: number } };
        throw new LLMError(
          error.error?.message || `Google AI API error: ${response.status}`,
          error.error?.code?.toString(),
          response.status
        );
      }

      const data = await response.json() as GoogleEmbedResponse;

      let embeddings: number[][] = [];
      if (isBatch && data.embeddings) {
        embeddings = data.embeddings.map(e => e.values);
      } else if (data.embedding) {
        embeddings = [data.embedding.values];
      } else {
        throw new LLMError('No embedding data returned', 'NO_EMBEDDING_DATA');
      }

      return {
        model,
        embeddings,
      };
    } catch (error: unknown) {
      if (error instanceof LLMError) throw error;
      throw new LLMError(
        `Google AI embed failed: ${(error as Error).message}`,
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
      throw new LLMError('Google AI API key is required', 'MISSING_API_KEY');
    }

    const response = await fetch(
      `${baseUrl}/models/gemini-1.5-pro?key=${apiKey}`,
      {
        method: 'GET',
        headers: {
          ...this.getHeaders(),
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      throw new LLMError('Google AI API unavailable', 'UNAVAILABLE', response.status);
    }
  }

  /**
   * 构建请求体
   */
  private buildRequestBody(config: LLMConfig, messages: ChatMessage[]): Record<string, unknown> {
    const contents = this.convertMessagesToContents(messages);
    const generationConfig: Record<string, unknown> = {};

    // 添加生成配置参数
    if (config.temperature !== undefined) generationConfig.temperature = config.temperature;
    if (config.maxTokens !== undefined) generationConfig.maxOutputTokens = config.maxTokens;
    if (config.topP !== undefined) generationConfig.topP = config.topP;
    if (config.topK !== undefined) generationConfig.topK = config.topK;
    if (config.stop && config.stop.length > 0) generationConfig.stopSequences = config.stop;

    const body: Record<string, unknown> = {
      contents,
      generationConfig,
    };

    // 系统指令（第一条 system 消息）
    const systemMessage = messages.find(msg => msg.role === 'system');
    if (systemMessage) {
      body.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    // 函数调用（工具）
    if (config.tools && config.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: config.tools.map(tool => this.convertFunctionDefinition(tool)),
        },
      ];
    }

    // JSON 模式
    if (config.responseFormat === 'json_object' || config.responseFormat === 'json_schema') {
      generationConfig.responseMimeType = 'application/json';
      if (config.responseFormat === 'json_schema' && config.jsonSchema) {
        generationConfig.responseSchema = config.jsonSchema;
      }
    }

    return body;
  }

  /**
   * 转换消息到 Google AI 内容格式
   */
  private convertMessagesToContents(messages: ChatMessage[]): Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string } | { functionCall: { name: string; args: Record<string, unknown> } }>;
  }> {
    const contents: Array<{
      role: 'user' | 'model';
      parts: Array<{ text: string } | { functionCall: { name: string; args: Record<string, unknown> } }>;
    }> = [];

    // 跳过 system 消息，它会被放在 systemInstruction 中
    const filteredMessages = messages.filter(msg => msg.role !== 'system');

    for (const message of filteredMessages) {
      let role: 'user' | 'model';
      switch (message.role) {
        case 'user':
        case 'tool':
          role = 'user';
          break;
        case 'assistant':
          role = 'model';
          break;
        default:
          continue;
      }

      const parts: Array<{ text: string } | { functionCall: { name: string; args: Record<string, unknown> } }> = [];

      // 文本内容
      if (message.content) {
        parts.push({ text: message.content });
      }

      // 函数调用（tool calls）
      if (message.toolCalls && message.toolCalls.length > 0) {
        for (const toolCall of message.toolCalls) {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            parts.push({
              functionCall: {
                name: toolCall.function.name,
                args,
              },
            });
          } catch {
            // 忽略解析错误
          }
        }
      }

      // 函数调用结果（tool 角色）
      if (message.role === 'tool' && message.toolCallId && message.name) {
        try {
          const args = JSON.parse(message.content);
          parts.push({
            functionCall: {
              name: message.name,
              args,
            },
          });
        } catch {
          // 如果内容不是 JSON，则作为文本处理
          parts.push({ text: message.content });
        }
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    return contents;
  }

  /**
   * 转换函数定义到 Google AI 格式
   */
  private convertFunctionDefinition(fn: FunctionDefinition): Record<string, unknown> {
    const result: Record<string, unknown> = {
      name: fn.name,
    };

    if (fn.description) {
      result.description = fn.description;
    }

    if (fn.parameters) {
      result.parameters = this.convertJsonSchema(fn.parameters);
    }

    return result;
  }

  /**
   * 转换 JSON Schema 到 Google AI 格式
   */
  private convertJsonSchema(schema: JSONSchema): Record<string, unknown> {
    const result: Record<string, unknown> = {
      type: schema.type?.toUpperCase() || 'OBJECT',
    };

    if (schema.properties) {
      result.properties = Object.fromEntries(
        Object.entries(schema.properties).map(([key, value]) => [
          key,
          this.convertJsonSchema(value),
        ])
      );
    }

    if (schema.required && schema.required.length > 0) {
      result.required = schema.required;
    }

    if (schema.description) {
      result.description = schema.description;
    }

    if (schema.items) {
      result.items = this.convertJsonSchema(schema.items);
    }

    if (schema.enum) {
      result.enum = schema.enum;
    }

    if (schema.minimum !== undefined) {
      result.minimum = schema.minimum;
    }

    if (schema.maximum !== undefined) {
      result.maximum = schema.maximum;
    }

    if (schema.minLength !== undefined) {
      result.minLength = schema.minLength;
    }

    if (schema.maxLength !== undefined) {
      result.maxLength = schema.maxLength;
    }

    if (schema.pattern) {
      result.pattern = schema.pattern;
    }

    if (schema.anyOf) {
      result.anyOf = schema.anyOf.map(s => this.convertJsonSchema(s));
    }

    if (schema.oneOf) {
      result.oneOf = schema.oneOf.map(s => this.convertJsonSchema(s));
    }

    if (schema.additionalProperties !== undefined) {
      result.additionalProperties = schema.additionalProperties;
    }

    return result;
  }

  /**
   * 映射完成原因
   */
  private mapFinishReason(
    reason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER' | null
  ): ChatCompletion['finishReason'] {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
        return 'content_filter';
      case 'RECITATION':
        return 'content_filter';
      case 'OTHER':
        return null;
      default:
        return null;
    }
  }
}

/**
 * 创建 Google Provider
 */
export function createGoogleProvider(config: LLMConfig): GoogleProvider {
  return new GoogleProvider(config);
}