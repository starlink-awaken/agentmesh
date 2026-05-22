/**
 * LLM Types - LLM Provider 类型定义
 *
 * 统一接口类型定义，支持多 Provider 抽象层
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * Provider 类型
 */
export type ProviderType = 'openai' | 'anthropic' | 'google' | 'ollama';

/**
 * 消息角色
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * LLM 配置接口
 */
export interface LLMConfig {
  /** 模型名称 */
  model: string;
  /** 温度参数 */
  temperature?: number;
  /** 最大 token 数 */
  maxTokens?: number;
  /** Top P 采样 */
  topP?: number;
  /** Top K 采样 */
  topK?: number;
  /** 频率惩罚 */
  frequencyPenalty?: number;
  /** 存在惩罚 */
  presencePenalty?: number;
  /** 停止序列 */
  stop?: string[];
  /** 是否流式输出 */
  stream?: boolean;
  /** API Key */
  apiKey?: string;
  /** API 基础 URL */
  baseUrl?: string;
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /** 函数调用配置 */
  tools?: FunctionDefinition[];
  /** 函数调用模式 */
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  /** 响应格式 */
  responseFormat?: 'text' | 'json_object' | 'json_schema';
  /** JSON Schema 配置 */
  jsonSchema?: JSONSchema;
  /** 请求超时（毫秒） */
  timeout?: number;
}

/**
 * JSON Schema 定义
 */
export interface JSONSchema {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  description?: string;
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  additionalProperties?: boolean;
}

/**
 * 函数定义
 */
export interface FunctionDefinition {
  /** 函数名称 */
  name: string;
  /** 函数描述 */
  description?: string;
  /** 函数参数 schema */
  parameters?: JSONSchema;
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** 函数调用 */
  toolCalls?: ToolCall[];
  /** 函数调用 ID */
  toolCallId?: string;
  /** 函数名称（tool 角色时使用） */
  name?: string;
}

/**
 * 函数调用
 */
export interface ToolCall {
  /** 调用 ID */
  id: string;
  /** 函数名称 */
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 聊天完成响应
 */
export interface ChatCompletion {
  /** 模型名称 */
  model: string;
  /** 完成内容 */
  content: string;
  /** 完成原因 */
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  /** 函数调用 */
  toolCalls?: ToolCall[];
  /** 使用 token 数 */
  usage?: Usage;
  /** 原始响应 */
  raw?: unknown;
  /** 请求 ID */
  id?: string;
  /** 创建时间戳 */
  created?: number;
}

/**
 * Token 使用统计
 */
export interface Usage {
  /** 输入 token 数 */
  promptTokens: number;
  /** 输出 token 数 */
  completionTokens: number;
  /** 总 token 数 */
  totalTokens: number;
}

/**
 * 流式输出块
 */
export interface StreamChunk {
  /** 内容片段 */
  content: string;
  /** 是否完成 */
  done: boolean;
  /** 函数调用 */
  toolCalls?: ToolCall[];
  /** 原始数据 */
  raw?: unknown;
  /** Delta 内容 */
  delta?: string;
}

/**
 * 嵌入向量请求
 */
export interface EmbedRequest {
  /** 输入文本（单字符串或字符串数组） */
  input: string | string[];
  /** 模型名称 */
  model?: string;
}

/**
 * 嵌入向量响应
 */
export interface EmbedResponse {
  /** 模型名称 */
  model: string;
  /** 嵌入向量数组 */
  embeddings: number[][];
  /** 使用 token 数 */
  usage?: Usage;
}

/**
 * Chat 请求选项
 */
export interface ChatOptions {
  /** 消息列表 */
  messages: ChatMessage[];
  /** 函数工具 */
  tools?: FunctionDefinition[];
  /** 函数调用模式 */
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  /** 温度 */
  temperature?: number;
  /** 最大 token */
  maxTokens?: number;
  /** Top P */
  topP?: number;
  /** 停止序列 */
  stop?: string[];
  /** 响应格式 */
  responseFormat?: 'text' | 'json_object' | 'json_schema';
  /** JSON Schema */
  jsonSchema?: JSONSchema;
}

/**
 * Stream 请求选项
 */
export interface StreamOptions extends ChatOptions {
  /** 流式回调 */
  onChunk?: (chunk: StreamChunk) => void | Promise<void>;
}

/**
 * Provider 能力
 */
export interface ProviderCapabilities {
  /** 是否支持流式输出 */
  streaming: boolean;
  /** 是否支持函数调用 */
  functionCalling: boolean;
  /** 是否支持嵌入向量 */
  embedding: boolean;
  /** 是否支持 JSON 模式 */
  jsonMode: boolean;
  /** 最大上下文长度 */
  maxContextLength?: number;
  /** 支持的模型列表 */
  supportedModels?: string[];
}

/**
 * LLM 错误
 */
export class LLMError extends Error {
  /** 错误代码 */
  code?: string;
  /** HTTP 状态码 */
  status?: number;
  /** 原始错误 */
  originalError?: Error;

  constructor(message: string, code?: string, status?: number, originalError?: Error) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
    this.status = status;
    this.originalError = originalError;
  }
}
