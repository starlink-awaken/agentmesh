/**
 * Honeycomb LLM Integration - Claude Provider
 *
 * Claude API Provider 使用原生 fetch 实现，零依赖。
 * 支持 Claude 3.5 Sonnet、Haiku 和 Opus 模型。
 *
 * API 文档: https://docs.anthropic.com/claude/reference/messages_post
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
  ClaudeConfig,
  Tool,
  ToolCall,
} from './types.js';
import { LLMError, RateLimitError, AuthenticationError } from './types.js';

// ============================================================
// Claude API 类型定义
// ============================================================

/**
 * Claude API 请求体
 */
interface ClaudeAPIRequest {
  model: string;
  max_tokens: number;
  messages: Array<{ role: string; content: string }>;
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  stream?: boolean;
}

/**
 * Claude API 响应
 */
interface ClaudeAPIResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  model: string;
  stop_reason: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Claude API 错误响应
 */
interface ClaudeAPIErrorResponse {
  error: {
    type: string;
    message: string;
  };
}

// ============================================================
// Claude Provider
// ============================================================

/**
 * Claude API Provider
 * 使用原生 fetch 实现，零依赖
 */
export class ClaudeProvider implements LLMProvider {
  readonly name = 'claude';
  readonly type = 'claude' as const;

  private config: Required<ClaudeConfig>;
  private logger: any;
  private baseUrl = 'https://api.anthropic.com/v1/messages';

  // 默认模型配置
  private readonly MODEL_CONFIGS = {
    'claude-3-5-sonnet-20241022': {
      maxTokens: 200000,
      supportsTools: true,
      defaultMaxTokens: 8192,
    },
    'claude-3-5-sonnet-20250114': {
      maxTokens: 200000,
      supportsTools: true,
      defaultMaxTokens: 8192,
    },
    'claude-3-5-haiku-20241022': {
      maxTokens: 200000,
      supportsTools: true,
      defaultMaxTokens: 8192,
    },
    'claude-3-opus-20240229': {
      maxTokens: 200000,
      supportsTools: true,
      defaultMaxTokens: 4096,
    },
    'claude-3-sonnet-20240229': {
      maxTokens: 200000,
      supportsTools: true,
      defaultMaxTokens: 4096,
    },
    'claude-3-haiku-20240307': {
      maxTokens: 200000,
      supportsTools: true,
      defaultMaxTokens: 4096,
    },
  };

  private readonly DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

  constructor(config: ClaudeConfig, logger: any) {
    this.config = {
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl || 'https://api.anthropic.com/v1/messages',
      model: config.model || this.DEFAULT_MODEL,
      timeout: config.timeout || 60000,
      maxRetries: config.maxRetries || 3,
    };
    this.logger = logger;

    if (!this.config.apiKey) {
      this.logger.warn('Claude API key not provided, provider will fail when used');
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
      throw new Error('Claude API key is required');
    }

    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    // 构建 API 请求体
    const body = this.buildRequestBody(prompt, options, model);

    this.logger.debug('Claude API request', {
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

    this.logger.debug('Claude API response', {
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
      throw new Error('Claude API key is required');
    }

    const body = this.buildRequestBody(prompt, options, model);
    (body as any).stream = true;

    const response = await fetch(this.config.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
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
              const parsed = JSON.parse(data);
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
    // Claude API 不支持原生批处理，使用并发请求
    return Promise.all(
      requests.map(req => this.complete(req.prompt, req.options))
    );
  }

  /**
   * 估算 Token 数量
   */
  estimateTokens(text: string): number {
    // 粗略估算：
    // - 英文约 4 字符/token
    // - 中文约 2 字符/token
    // - 代码约 3 字符/token
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
      // 使用一个最小请求测试可用性
      const response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }],
        }),
        signal: AbortSignal.timeout(5000),
      });

      // 401 表示 key 无效但服务可用
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
      maxTokens: 200000,
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
  ): ClaudeAPIRequest {
    const modelConfig = this.MODEL_CONFIGS[model as keyof typeof this.MODEL_CONFIGS];

    const body: ClaudeAPIRequest = {
      model,
      max_tokens: options?.maxTokens || modelConfig?.defaultMaxTokens || 8192,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    if (options?.systemPrompt) {
      body.system = options.systemPrompt;
    }

    if (options?.temperature !== undefined) {
      body.temperature = Math.min(1, Math.max(0, options.temperature));
    }

    if (options?.topP !== undefined) {
      body.top_p = Math.min(1, Math.max(0, options.topP));
    }

    if (options?.topK !== undefined) {
      body.top_k = options.topK;
    }

    if (options?.stopSequences) {
      body.stop_sequences = options.stopSequences;
    }

    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      }));
    }

    return body;
  }

  /**
   * 执行 fetch 请求
   */
  private async fetchAPI(
    body: ClaudeAPIRequest,
    apiKey: string,
    customHeaders?: Record<string, string>
  ): Promise<Response> {
    return fetch(this.config.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
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
          this.logger.warn('Claude API request failed, retrying...', {
            attempt: attempt + 1,
            status: response.status,
            delay,
          });
          await this.sleep(delay);
          continue;
        }

        // 不可重试或重试次数用尽
        throw await this.createErrorFromResponse(response);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // 网络错误可重试
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
    let errorMessage = `Claude API error ${response.status}: ${response.statusText}`;

    try {
      const errorBody = await response.json() as ClaudeAPIErrorResponse;
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
    const errorBody = await response.json().catch(() => ({ error: { message: response.statusText } })) as ClaudeAPIErrorResponse;
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
    const data = await response.json() as ClaudeAPIResponse;

    // 检查 API 错误（error 字段在响应体中，不是类型定义的一部分）
    const responseData = data as unknown as { error?: { message: string } };
    if (responseData.error) {
      throw new Error(`Claude API error: ${responseData.error.message}`);
    }

    // 提取文本内容
    let content = '';
    const contentBlocks = data.content || [];
    const toolCalls: ToolCall[] = [];

    for (const block of contentBlocks) {
      if (block.type === 'text') {
        content += block.text || '';
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id || '',
          name: block.name || '',
          input: (block.input as Record<string, unknown>) || {},
        });
      }
    }

    return {
      content,
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      model,
      finishReason: this.mapStopReason(data.stop_reason),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      provider: this.name,
      timestamp: Date.now(),
    };
  }

  /**
   * 解析流式响应块
   */
  private parseStreamChunk(data: any): CompletionChunk {
    if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
      return {
        delta: data.delta.text || '',
        done: false,
      };
    }

    if (data.type === 'message_stop') {
      return {
        delta: '',
        done: true,
      };
    }

    return {
      delta: '',
      done: false,
    };
  }

  /**
   * 映射停止原因
   */
  private mapStopReason(reason: string): 'stop' | 'length' | 'tool_use' | 'error' {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
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
    // 指数退避：1s, 2s, 4s, 8s...
    return Math.min(1000 * Math.pow(2, attempt), 16000);
  }

  /**
   * 休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ClaudeProvider 已通过 export class 导出，无需重复导出
