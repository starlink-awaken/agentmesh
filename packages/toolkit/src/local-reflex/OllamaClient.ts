/**
 * OllamaClient - 本地模型客户端
 *
 * 连接本地 Ollama 服务，处理本地小模型调用
 * 源自 Local Reflex 架构 - 端云协同基础
 */
import type { OllamaConfig, LLMRequest, LLMResponse } from './types.js';

export class OllamaClient {
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: Partial<OllamaConfig> = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.defaultModel = config.model || 'qwen2.5:7b';
  }

  /**
   * 生成文本
   */
  async generate(prompt: string, options?: Partial<OllamaConfig>): Promise<LLMResponse> {
    const request: LLMRequest = {
      model: options?.model || this.defaultModel,
      prompt,
      options: {
        temperature: options?.temperature ?? 0.7,
        top_p: options?.topP,
        top_k: options?.topK,
        num_ctx: options?.numCtx,
      },
      stream: false,
    };

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<LLMResponse>;
  }

  /**
   * 聊天
   */
  async chat(messages: Array<{ role: string; content: string }>, options?: Partial<OllamaConfig>): Promise<LLMResponse> {
    const request = {
      model: options?.model || this.defaultModel,
      messages,
      options: {
        temperature: options?.temperature ?? 0.7,
        top_p: options?.topP,
        top_k: options?.topK,
        num_ctx: options?.numCtx,
      },
      stream: false,
    };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      model: string;
      message?: { content: string };
      done: boolean;
      total_duration?: number;
    };
    return {
      model: data.model,
      response: data.message?.content || '',
      done: data.done,
      total_duration: data.total_duration,
    };
  }

  /**
   * 列出可用模型
   */
  async listModels(): Promise<{ models: Array<{ name: string; size: number; modified_at: string }> }> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status}`);
    }
    return response.json() as Promise<{ models: Array<{ name: string; size: number; modified_at: string }> }>;
  }

  /**
   * 检查服务是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 获取默认模型
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }
}

/**
 * 创建 Ollama 客户端
 */
export function createOllamaClient(config?: Partial<OllamaConfig>): OllamaClient {
  return new OllamaClient(config);
}
