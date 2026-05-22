/**
 * Honeycomb LLM Integration - Core Type Definitions
 *
 * 本模块定义了 LLM 集成层的所有核心类型接口。
 * 所有 LLM 提供者（Claude、OpenAI、本地模型）必须实现这些接口。
 *
 * 设计原则：
 * - 零运行时依赖：仅使用原生 Web API
 * - 类型安全：完整的 TypeScript 类型定义
 * - 可扩展：支持自定义 Provider
 * - 可测试：支持模拟模式
 */

// ============================================================
// Provider 接口
// ============================================================

/**
 * LLM Provider 统一接口
 * 所有 LLM 提供者必须实现此接口
 */
export interface LLMProvider {
  /** Provider 名称 */
  readonly name: string;

  /** Provider 类型 */
  readonly type: 'claude' | 'openai' | 'custom';

  /**
   * 同步调用（非流式）
   * @param prompt - 完整的提示词（包含系统提示和用户消息）
   * @param options - 调用选项
   * @returns 完成结果
   */
  complete(
    prompt: string,
    options?: CompletionOptions
  ): Promise<CompletionResult>;

  /**
   * 流式调用
   * @param prompt - 完整的提示词
   * @param options - 调用选项
   * @returns 异步可迭代的完成块
   */
  stream(
    prompt: string,
    options?: CompletionOptions
  ): AsyncIterable<CompletionChunk>;

  /**
   * 批量调用
   * @param requests - 请求列表
   * @returns 结果列表
   */
  batch(
    requests: CompletionRequest[]
  ): Promise<CompletionResult[]>;

  /**
   * 估算 Token 数量
   * @param text - 输入文本
   * @returns 估算的 Token 数量
   */
  estimateTokens(text: string): number;

  /**
   * 检查 Provider 是否可用
   * @returns 是否可用
   */
  isAvailable(): Promise<boolean>;

  /**
   * 获取 Provider 配置信息
   */
  getConfig(): ProviderConfig;
}

// ============================================================
// 完成选项和结果
// ============================================================

/**
 * LLM 完成选项
 */
export interface CompletionOptions {
  /** 模型名称 */
  model?: string;

  /** 最大生成 Token 数 */
  maxTokens?: number;

  /** 温度参数 (0-1) */
  temperature?: number;

  /** Top-p 采样参数 */
  topP?: number;

  /** Top-k 采样参数 */
  topK?: number;

  /** 停止序列 */
  stopSequences?: string[];

  /** 可用工具列表（用于 tool use） */
  tools?: Tool[];

  /** 系统提示词 */
  systemPrompt?: string;

  /** API Key（可选，优先使用配置中的） */
  apiKey?: string;

  /** 基础 URL（用于自定义 endpoint） */
  baseUrl?: string;

  /** 超时时间（毫秒） */
  timeout?: number;

  /** 是否启用流式响应 */
  stream?: boolean;

  /** 是否跳过缓存 */
  skipCache?: boolean;

  /** 自定义请求头 */
  headers?: Record<string, string>;

  /** 元数据（用于追踪） */
  metadata?: {
    traceId?: string;
    agentName?: string;
    projectId?: string;
    phase?: string;
  };
}

/**
 * LLM 完成结果
 */
export interface CompletionResult {
  /** 生成的内容 */
  content: string;

  /** 输入 Token 数量 */
  inputTokens: number;

  /** 输出 Token 数量 */
  outputTokens: number;

  /** 总 Token 数量 */
  totalTokens: number;

  /** 使用的模型 */
  model: string;

  /** 完成原因 */
  finishReason: 'stop' | 'length' | 'tool_use' | 'error';

  /** 是否来自缓存 */
  cached?: boolean;

  /** 请求 ID（用于追踪） */
  requestId?: string;

  /** 工具调用（如果有） */
  toolCalls?: ToolCall[];

  /** 使用时长（毫秒） */
  duration?: number;

  /** 时间戳 */
  timestamp: number;

  /** Provider 名称 */
  provider: string;
}

/**
 * 完成请求（用于批处理）
 */
export interface CompletionRequest {
  /** 请求 ID（用于关联请求和响应） */
  id: string;

  /** 提示词 */
  prompt: string;

  /** 选项 */
  options?: CompletionOptions;
}

/**
 * 完成块（流式响应）
 */
export interface CompletionChunk {
  /** 内容片段 */
  delta: string;

  /** 是否是最后一块 */
  done: boolean;

  /** 累计 Token 数量 */
  inputTokens?: number;
  outputTokens?: number;

  /** 工具调用片段（如果有） */
  toolCallChunk?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
}

// ============================================================
// 工具定义
// ============================================================

/**
 * 工具定义（用于 tool use）
 */
export interface Tool {
  /** 工具名称 */
  name: string;

  /** 工具描述 */
  description: string;

  /** 输入模式（JSON Schema） */
  inputSchema: Record<string, unknown>;
}

/**
 * 工具调用
 */
export interface ToolCall {
  /** 工具名称 */
  name: string;

  /** 输入参数 */
  input: Record<string, unknown>;

  /** 工具调用 ID */
  id: string;
}

// ============================================================
// Provider 配置
// ============================================================

/**
 * Provider 配置
 */
export interface ProviderConfig {
  /** Provider 名称 */
  name: string;

  /** Provider 类型 */
  type: 'claude' | 'openai' | 'custom';

  /** API Key */
  apiKey?: string;

  /** 基础 URL */
  baseUrl?: string;

  /** 默认模型 */
  defaultModel: string;

  /** 支持的模型列表 */
  supportedModels: string[];

  /** 最大 Token 数 */
  maxTokens: number;

  /** 是否支持流式响应 */
  supportsStreaming: boolean;

  /** 是否支持工具调用 */
  supportsTools: boolean;

  /** 是否支持批处理 */
  supportsBatch: boolean;

  /** 请求超时（毫秒） */
  timeout: number;

  /** 最大重试次数 */
  maxRetries: number;
}

// ============================================================
// LLM 配置
// ============================================================

/**
 * LLM 配置
 */
export interface LLMConfig {
  /** 默认 Provider */
  provider: 'claude' | 'openai' | 'simulation';

  /** 默认模型 */
  defaultModel?: string;

  /** Claude 配置 */
  claude?: ClaudeConfig;

  /** OpenAI 配置 */
  openai?: OpenAIConfig;

  /** 批处理配置 */
  batch?: BatchConfig;

  /** 缓存配置 */
  cache?: CacheConfig;

  /** 速率限制配置 */
  rateLimit?: RateLimitConfig;

  /** 自定义 Providers */
  customProviders?: Record<string, ProviderConfig>;
}

/**
 * Claude 配置
 */
export interface ClaudeConfig {
  /** API Key */
  apiKey: string;

  /** 基础 URL（可选） */
  baseUrl?: string;

  /** 默认模型 */
  model?: string;

  /** 超时时间（毫秒） */
  timeout?: number;

  /** 最大重试次数 */
  maxRetries?: number;
}

/**
 * OpenAI 配置
 */
export interface OpenAIConfig {
  /** API Key */
  apiKey: string;

  /** 基础 URL（可选） */
  baseUrl?: string;

  /** 默认模型 */
  model?: string;

  /** 超时时间（毫秒） */
  timeout?: number;

  /** 最大重试次数 */
  maxRetries?: number;
}

// ============================================================
// 性能组件配置
// ============================================================

/**
 * 批处理配置
 */
export interface BatchConfig {
  /** 是否启用批处理 */
  enabled?: boolean;

  /** 最大批次大小 */
  maxBatchSize?: number;

  /** 最大等待时间（毫秒） */
  maxWaitTime?: number;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  /** 是否启用缓存 */
  enabled?: boolean;

  /** 最大缓存条目数 */
  maxSize?: number;

  /** 过期时间（毫秒） */
  ttl?: number;
}

/**
 * 缓存统计
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

/**
 * 速率限制配置
 */
export interface RateLimitConfig {
  /** 是否启用速率限制 */
  enabled?: boolean;

  /** 每分钟最大请求数 */
  requestsPerMinute?: number;
}

// ============================================================
// Token 统计
// ============================================================

/**
 * Token 使用情况
 */
export interface TokenUsage {
  input: number;
  output: number;
}

/**
 * Token 报告
 */
export interface TokenReport {
  byProvider: Record<string, TokenUsage>;
  total: TokenUsage;
}

// ============================================================
// 错误类型
// ============================================================

/**
 * LLM API 错误
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code?: string,
    public statusCode?: number,
    public retryable?: boolean
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * 速率限制错误
 */
export class RateLimitError extends LLMError {
  constructor(
    provider: string,
    public retryAfter?: number
  ) {
    super('Rate limit exceeded', provider, 'rate_limit', 429, true);
    this.name = 'RateLimitError';
  }
}

/**
 * 认证错误
 */
export class AuthenticationError extends LLMError {
  constructor(provider: string) {
    super('Authentication failed', provider, 'authentication', 401, false);
    this.name = 'AuthenticationError';
  }
}

/**
 * 令牌预算错误
 */
export class TokenBudgetError extends Error {
  constructor(
    public budget: number,
    public used: number
  ) {
    super(`Token budget exceeded: ${used}/${budget}`);
    this.name = 'TokenBudgetError';
  }
}

// ============================================================
// 流式响应类型
// ============================================================

/**
 * 流式回调函数
 */
export type StreamCallback = (chunk: CompletionChunk) => void;

/**
 * 流式选项
 */
export interface StreamOptions extends CompletionOptions {
  /** 流式回调 */
  onChunk?: StreamCallback;

  /** 完成回调 */
  onComplete?: (result: CompletionResult) => void;

  /** 错误回调 */
  onError?: (error: Error) => void;
}

// ============================================================
// 模拟类型
// ============================================================

/**
 * 模拟 Provider 配置
 */
export interface SimulationConfig {
  /** 延迟（毫秒） */
  latency?: number;

  /** 错误率 (0-1) */
  errorRate?: number;

  /** 固定输出（用于测试） */
  fixedOutput?: string;
}

/**
 * 模拟结果
 */
export interface SimulationResult {
  output: string;
  tokens: number;
  latency: number;
}
