/**
 * Local Reflex Types - 本地反射系统类型定义
 *
 * 源自 Advanced RAG + Local Reflex 架构
 * 端云协同：本地小模型处理高频任务，云端大模型处理复杂决策
 */

/**
 * JSON Schema 类型（简化版）
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
}

/**
 * Ollama 配置
 */
export interface OllamaConfig {
  baseUrl?: string;
  model: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  numCtx?: number;
  numGpu?: number;
  repeatPenalty?: number;
}

/**
 * LLM 请求
 */
export interface LLMRequest {
  model: string;
  prompt: string;
  system?: string;
  template?: string;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_ctx?: number;
    num_predict?: number;
    stop?: string[];
  };
  stream?: boolean;
}

/**
 * LLM 响应
 */
export interface LLMResponse {
  model: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * 结构化输出配置
 */
export interface StructuredOutputConfig {
  schema: JSONSchema;
  strict?: boolean;
  description?: string;
}

/**
 * Prompt 压缩配置
 */
export interface CompressionConfig {
  ratio?: number;        // 压缩比率 0.1-0.9
  keepKeywords?: boolean;
  keepNumbers?: boolean;
}

/**
 * 空闲任务配置
 */
export interface IdleTask {
  id: string;
  name: string;
  schedule: 'hourly' | 'daily' | 'weekly';
  enabled: boolean;
  handler: () => Promise<void>;
}

/**
 * 工具调用请求
 */
export interface ToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * 工具调用响应
 */
export interface ToolCallResponse {
  output: unknown;
  error?: string;
  duration: number;
}
