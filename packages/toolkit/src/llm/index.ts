/**
 * LLM Module - LLM Provider 统一入口
 *
 * 提供 LLM Provider 抽象层，支持 OpenAI、Anthropic、Ollama 等多 Provider
 *
 * @author PAI
 * @version 1.0.0
 */

import type { LLMConfig, ProviderType, ChatMessage, ProviderCapabilities, StreamChunk } from './types.js';
import type { ILLMClient } from './LLMClient.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { OllamaProvider } from './OllamaProvider.js';
import { GoogleProvider } from './GoogleProvider.js';
import { LLMError } from './types.js';

// 类型导出（使用别名避免与 autogen 模块冲突）
export type {
  ProviderType,
  MessageRole,
  LLMConfig,
  JSONSchema,
  FunctionDefinition,
  ChatMessage,
  ToolCall as LLMFunctionCall,
  ChatCompletion,
  StreamChunk,
  Usage,
  EmbedRequest,
  EmbedResponse,
  ChatOptions,
  StreamOptions,
  ProviderCapabilities,
} from './types.js';

export { LLMError } from './types.js';

// 客户端接口和类
export type { ILLMClient } from './LLMClient.js';
export { LLMClient, hasCapability } from './LLMClient.js';

// OpenAI Provider
export { OpenAIProvider, createOpenAIProvider } from './OpenAIProvider.js';

// Anthropic Provider
export { AnthropicProvider, createAnthropicProvider } from './AnthropicProvider.js';

// Ollama Provider
export { OllamaProvider, createOllamaProvider } from './OllamaProvider.js';

// Google Provider
export { GoogleProvider, createGoogleProvider } from './GoogleProvider.js';

/**
 * LLM Provider 工厂函数配置
 */
export interface CreateLLMClientConfig extends LLMConfig {
  /** Provider 类型 */
  provider: ProviderType;
}

/**
 * 创建 LLM 客户端
 *
 * @example
 * ```typescript
 * // OpenAI
 * const openai = createLLMClient({
 *   provider: 'openai',
 *   model: 'gpt-4o',
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 *
 * // Anthropic
 * const anthropic = createLLMClient({
 *   provider: 'anthropic',
 *   model: 'claude-sonnet-4-5-20251901',
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 * });
 *
 * // Ollama (本地)
 * const ollama = createLLMClient({
 *   provider: 'ollama',
 *   model: 'qwen2.5:7b',
 *   baseUrl: 'http://localhost:11434',
 * });
 * ```
 */
export function createLLMClient(config: CreateLLMClientConfig): ILLMClient {
  const { provider, ...llmConfig } = config;

  switch (provider) {
    case 'openai':
      return new OpenAIProvider(llmConfig);
    case 'anthropic':
      return new AnthropicProvider(llmConfig);
    case 'ollama':
      return new OllamaProvider(llmConfig);
    case 'google':
      return new GoogleProvider(llmConfig);
    default:
      throw new LLMError(`Unknown provider: ${provider}`, 'UNKNOWN_PROVIDER');
  }
}

/**
 * 根据 Provider 类型获取默认模型
 */
export function getDefaultModel(provider: ProviderType): string {
  const defaults: Record<ProviderType, string> = {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-5-20251901',
    google: 'gemini-1.5-pro',
    ollama: 'llama2',
  };
  return defaults[provider];
}

/**
 * 获取 Provider 支持的功能
 */
export function getProviderCapabilities(provider: ProviderType): ProviderCapabilities | null {
  const providers: Record<ProviderType, ProviderCapabilities> = {
    openai: {
      streaming: true,
      functionCalling: true,
      embedding: true,
      jsonMode: true,
      maxContextLength: 128000,
    },
    anthropic: {
      streaming: true,
      functionCalling: true,
      embedding: false,
      jsonMode: true,
      maxContextLength: 200000,
    },
    google: {
      streaming: true,
      functionCalling: true,
      embedding: true,
      jsonMode: true,
      maxContextLength: 1000000,
    },
    ollama: {
      streaming: true,
      functionCalling: false,
      embedding: true,
      jsonMode: false,
    },
  };
  return providers[provider] || null;
}

/**
 * 便捷函数：快速创建聊天完成
 */
export async function chat(
  provider: ProviderType,
  messages: ChatMessage[],
  options?: Partial<LLMConfig>
): Promise<ReturnType<ILLMClient['chat']>> {
  const client = createLLMClient({
    provider,
    model: getDefaultModel(provider),
    ...options,
  });

  return client.chat({ messages });
}

/**
 * 便捷函数：快速创建流式聊天
 */
export function stream(
  provider: ProviderType,
  messages: ChatMessage[],
  options?: Partial<LLMConfig>
): AsyncGenerator<StreamChunk, void, unknown> {
  const client = createLLMClient({
    provider,
    model: getDefaultModel(provider),
    ...options,
  });

  return client.stream({ messages });
}
