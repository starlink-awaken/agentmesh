/**
 * ModelProvider — 统一 Provider 抽象接口 + 共享工具
 */
import type { ModelDescriptor } from '@agentmesh/core-types';
import type { ChatOptions, ChatResult, StreamChunk } from '../types.js';

export interface ModelProvider {
  readonly name: string;
  readonly type: string;
  discover(): Promise<ModelDescriptor[]>;
  health(): Promise<boolean>;
  chat(model: string, messages: unknown[], options?: ChatOptions): Promise<ChatResult>;
  stream?(model: string, messages: unknown[], options?: ChatOptions): AsyncIterable<StreamChunk>;
}

// ── 共享 HTTP 工具 ──

/** 带超时和认证头的 GET 请求 */
export async function httpGet(url: string, headers?: Record<string, string>, timeoutMs = 5000): Promise<Response> {
  const res = await fetch(url, {
    headers: { ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res;
}

/** 带超时的 POST 请求 */
export async function httpPost(url: string, body: unknown, authHeader?: string, timeoutMs = 60000): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res;
}

/** 健康检查通用函数 */
export async function healthCheck(url: string, headers?: Record<string, string>, timeoutMs = 3000): Promise<boolean> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch { return false; }
}

/** 安全的 JSON 解析 + 状态检查 */
export async function checkedJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

/** 解析 OpenAI 兼容的 chat completions 响应 */
export function parseOpenAIResponse(body: any, model: string): ChatResult {
  return {
    id: body.id || `ai-${Date.now()}`,
    model: body.model || model,
    content: body.choices?.[0]?.message?.content || '',
    finishReason: body.choices?.[0]?.finish_reason || 'stop',
    usage: body.usage ? {
      promptTokens: body.usage.prompt_tokens || 0,
      completionTokens: body.usage.completion_tokens || 0,
      totalTokens: body.usage.total_tokens || 0,
    } : undefined,
  };
}

/** 解析 Anthropic messages 响应 */
export function parseAnthropicResponse(body: any, model: string): ChatResult {
  const content = body.content?.find((c: any) => c.type === 'text')?.text || '';
  return {
    id: body.id || `anthropic-${Date.now()}`,
    model: body.model || model,
    content,
    finishReason: body.stop_reason || 'stop',
    usage: body.usage ? {
      promptTokens: body.usage.input_tokens || 0,
      completionTokens: body.usage.output_tokens || 0,
      totalTokens: (body.usage.input_tokens || 0) + (body.usage.output_tokens || 0),
    } : undefined,
  };
}

/** 解析 Ollama chat 响应 */
export function parseOllamaResponse(body: any, model: string): ChatResult {
  return {
    id: `ollama-${Date.now()}`,
    model,
    content: body.message?.content || '',
    finishReason: body.done ? 'stop' : 'unknown',
  };
}
