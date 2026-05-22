/**
 * Honeycomb LLM Integration - OpenAI Provider
 *
 * OpenAI API Provider 使用原生 fetch 实现，零依赖。
 * 支持 GPT-4o、GPT-4-turbo、GPT-3.5-turbo 等模型。
 *
 * API 文档: https://platform.openai.com/docs/api-reference/chat/create
 *
 * 设计原则：
 * - 零依赖：仅使用原生 Web API
 * - 完整功能：支持流式、工具调用、重试
 * - 类型安全：完整的 TypeScript 类型
 * - 可观测：详细的日志和指标
 */

import type {
  LLMProvider,
  CompletionOptions,
  CompletionResult,
  CompletionChunk,
  CompletionRequest,
  ProviderConfig,
  OpenAIConfig,
  Tool,
  ToolCall,
} from './types.js';
import { LLMError, RateLimitError, AuthenticationError } from './types.js';

// ============================================================
// OpenAI API 类型定义
// ============================================================

/**
 * OpenAI API 请求体
 */
interface OpenAIAPIRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[] | string;
  tools?: Array<{
    type: string;
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  }>;
  tool_choice?: 'auto' | 'none' | { type: string; function: { name: string } };
  stream?: boolean;
}

/**
 * OpenAI API 响应
 */
interface OpenAIAPIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI API 流式响应块
 */
interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

/**
 * OpenAI API 错误响应
 */
interface OpenAIAPIErrorResponse {
  error: {
    message: string;
    type?: string;
    param?: string;
    code?: string;
  };
}

// ============================================================
// OpenAI Provider
// ============================================================

/**
 * OpenAI API Provider
 * 使用原生 fetch 实现，零依赖
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly type = 'openai' as const;

  private config: Required<OpenAIConfig>;
  private logger: any;
  private baseUrl = 'https://api.openai.com/v1/chat/completions';

  // 默认模型配置
  private readonly MODEL_CONFIGS = {
    'gpt-4o': {
      maxTokens: 128000,
      supportsTools: true,
      defaultMaxTokens: 4096,
    },
    'gpt-4o-mini': {
      maxTokens: 128000,
      supportsTools: true,
      defaultMaxTokens: 4096,
    },
    'gpt-4-turbo': {
      maxTokens: 128000,
      supportsTools: true,
      defaultMaxTokens: 4096,
    },
    'gpt-4': {
      maxTokens: 8192,
      supportsTools: true,
      defaultMaxTokens: 4096,
    },
    'gpt-3.5-turbo': {
      maxTokens: 16385,
      supportsTools: true,
      defaultMaxTokens: 4096,
    },
  };

  private readonly DEFAULT_MODEL = 'gpt-4o';

  constructor(config: OpenAIConfig, logger: any) {
    this.config = {
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl || 'https://api.openai.com/v1/chat/completions',
      model: config.model || this.DEFAULT_MODEL,
      timeout: config.timeout || 60000,
      maxRetries: config.maxRetries || 3,
    };
    this.logger = logger;

    if (!this.config.apiKey) {
      this.logger.warn('OpenAI API key not provided, provider will fail when used');
    }
  }

  /**
   * 同步调用（非流式）
   */
  async complete(
    prompt: string,
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const model = options?.model || this.config.model || this.DEFAULT_MODEL;
    const apiKey = options?.apiKey || this.config.apiKey;

    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    // 构建 API 请求体
    const body = this.buildRequestBody(prompt, options, model);

    this.logger.debug('OpenAI API request', {
      requestId,
      model,
      promptLength: prompt.length,
      hasSystemPrompt: !!options?.systemPrompt,
      hasTools: !!options?.tools?.length,
    });

    // 执行请求（带重试）
    const response = await this.executeWithRetry(
      () => this.fetchAPI(body, apiKey, options?.headers),
      options?.timeout || this.config.timeout
    );

    // 解析响应
    const result = await this.parseResponse(response, model);

    result.requestId = requestId;
    result.provider = this.name;
    result.duration = Date.now() - startTime;
    result.timestamp = Date.now();

    this.logger.debug('OpenAI API response', {
      requestId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
      finishReason: result.finishReason,
      duration: result.duration,
    });

    return result;
  }

  /**
   * 流式调用
   */
  async *stream(
    prompt: string,
    options?: CompletionOptions
  ): AsyncIterable<CompletionChunk> {
    const model = options?.model || this.config.model || this.DEFAULT_MODEL;
    const apiKey = options?.apiKey || this.config.apiKey;

    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    const body = this.buildRequestBody(prompt, options, model);
    body.stream = true;

    const response = await fetch(this.config.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(options?.headers || {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options?.timeout || this.config.timeout),
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

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
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();

            if (data === '[DONE]') {
              yield { delta: '', done: true };
              return;
            }

            try {
              const parsed: OpenAIStreamChunk = JSON.parse(data);
              yield this.parseStreamChunk(parsed);
            } catch (err) {
              this.logger.debug('Failed to parse SSE data', { data, error: err });
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 批量调用
   */
  async batch(requests: CompletionRequest[]): Promise<CompletionResult[]> {
    // OpenAI API 不支持原生批处理，使用并发请求
    return Promise.all(
      requests.map(req => this.complete(req.prompt, req.options))
    );
  }

  /**
   * 估算 Token 数量
   */
  estimateTokens(text: string): number {
    // OpenAI 使用 tiktoken，这里用粗略估算
    // 英文约 4 字符/token，中文约 2 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 2 + otherChars / 4);
  }

  /**
   * 检查 Provider 是否可用
   */
  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) {
      return false;
    }

    try {
      const response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(5000),
      });

      return response.ok || response.status === 401;
    } catch {
      return false;
    }
  }

  /**
   * 获取 Provider 配置
   */
  getConfig(): ProviderConfig {
    return {
      name: this.name,
      type: this.type,
      apiKey: this.config.apiKey ? '***' : undefined,
      baseUrl: this.config.baseUrl,
      defaultModel: this.config.model || this.DEFAULT_MODEL,
      supportedModels: Object.keys(this.MODEL_CONFIGS),
      maxTokens: 128000,
      supportsStreaming: true,
      supportsTools: true,
      supportsBatch: false,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 构建 API 请求体
   */
  private buildRequestBody(
    prompt: string,
    options: CompletionOptions | undefined,
    model: string
  ): OpenAIAPIRequest {
    const modelConfig = this.MODEL_CONFIGS[model as keyof typeof this.MODEL_CONFIGS];

    const messages: Array<{ role: string; content: string }> = [];

    // 添加系统提示词（如果有）
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    // 添加用户消息
    messages.push({ role: 'user', content: prompt });

    const body: OpenAIAPIRequest = {
      model,
      messages,
      max_tokens: options?.maxTokens || modelConfig?.defaultMaxTokens || 4096,
    };

    if (options?.temperature !== undefined) {
      body.temperature = Math.min(2, Math.max(0, options.temperature));
    }

    if (options?.topP !== undefined) {
      body.top_p = Math.min(1, Math.max(0, options.topP));
    }

    if (options?.stopSequences) {
      body.stop = options.stopSequences;
    }

    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
    }

    return body;
  }

  /**
   * 执行 fetch 请求
   */
  private async fetchAPI(
    body: OpenAIAPIRequest,
    apiKey: string,
    customHeaders?: Record<string, string>
  ): Promise<Response> {
    return fetch(this.config.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(customHeaders || {}),
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * 带重试的请求执行
   */
  private async executeWithRetry(
    fn: () => Promise<Response>,
    timeout: number
  ): Promise<Response> {
    const maxRetries = this.config.maxRetries;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fn();

        if (response.ok) {
          return response;
        }

        // 处理错误响应
        await this.handleErrorResponse(response);

        // 检查是否可重试
        if (this.isRetryable(response.status) && attempt < maxRetries) {
          const delay = this.calculateBackoff(attempt);
          this.logger.warn('OpenAI API request failed, retrying...', {
            attempt: attempt + 1,
            status: response.status,
            delay,
          });
          await this.sleep(delay);
          continue;
        }

        throw await this.createErrorFromResponse(response);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (this.isNetworkError(lastError) && attempt < maxRetries) {
          const delay = this.calculateBackoff(attempt);
          this.logger.warn('Network error, retrying...', {
            attempt: attempt + 1,
            delay,
          });
          await this.sleep(delay);
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * 处理错误响应
   */
  private async handleErrorResponse(response: Response): Promise<void> {
    let errorMessage = `OpenAI API error ${response.status}: ${response.statusText}`;

    try {
      const errorBody = await response.json() as OpenAIAPIErrorResponse;
      if (errorBody.error?.message) {
        errorMessage = errorBody.error.message;
      }
    } catch {
      // 忽略解析错误
    }

    switch (response.status) {
      case 401:
        throw new AuthenticationError(this.name);
      case 429:
        const retryAfter = response.headers.get('Retry-After');
        throw new RateLimitError(
          this.name,
          retryAfter ? parseInt(retryAfter) * 1000 : undefined
        );
      case 400:
      case 403:
      case 404:
        throw new LLMError(errorMessage, this.name, undefined, response.status, false);
      default:
        throw new LLMError(errorMessage, this.name, undefined, response.status, this.isRetryable(response.status));
    }
  }

  /**
   * 从响应创建错误
   */
  private async createErrorFromResponse(response: Response): Promise<Error> {
    const errorBody = await response.json().catch(() => ({ error: { message: response.statusText } })) as OpenAIAPIErrorResponse;
    const message = errorBody.error?.message || response.statusText;
    return new LLMError(message, this.name, undefined, response.status, this.isRetryable(response.status));
  }

  /**
   * 解析 API 响应
   */
  private async parseResponse(
    response: Response,
    model: string
  ): Promise<CompletionResult> {
    const data = await response.json() as OpenAIAPIResponse;

    const choice = data.choices[0];
    if (!choice) {
      throw new Error('No choices in response');
    }

    const content = choice.message.content || '';
    const toolCalls: ToolCall[] = [];

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }
    }

    return {
      content,
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
      model,
      finishReason: this.mapFinishReason(choice.finish_reason),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      provider: this.name,
      timestamp: Date.now(),
    };
  }

  /**
   * 解析流式响应块
   */
  private parseStreamChunk(data: OpenAIStreamChunk): CompletionChunk {
    const choice = data.choices[0];
    if (!choice) {
      return { delta: '', done: false };
    }

    if (choice.finish_reason) {
      return {
        delta: '',
        done: true,
      };
    }

    return {
      delta: choice.delta.content || '',
      done: false,
    };
  }

  /**
   * 映射完成原因
   */
  private mapFinishReason(reason: string): 'stop' | 'length' | 'tool_use' | 'error' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_use';
      default:
        return 'error';
    }
  }

  /**
   * 判断是否可重试
   */
  private isRetryable(status: number): boolean {
    return [429, 500, 502, 503, 504].includes(status);
  }

  /**
   * 判断是否是网络错误
   */
  private isNetworkError(err: Error): boolean {
    return (
      err.name === 'TypeError' ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('ENOTFOUND') ||
      err.message.includes('ETIMEDOUT') ||
      err.message.includes('fetch failed')
    );
  }

  /**
   * 计算退避延迟
   */
  private calculateBackoff(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt), 16000);
  }

  /**
   * 休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// OpenAIProvider 已通过 export class 导出，无需重复导出
