import type { ChatCompletionRequest, ResolvedProvider } from './types.js';
import { circuitBreakerRegistry } from './circuit-breaker.js';
import { withRetry, isRetryable } from './retry.js';

// 所有目标 Provider 都兼容 OpenAI API 格式，统一客户端即可
export async function callChatCompletions(
  provider: ResolvedProvider,
  request: ChatCompletionRequest
): Promise<Response> {
  const { base_url, api_key, name: providerName } = provider;
  const { model, messages, stream, temperature, max_tokens, tools, tool_choice } = request;

  const body: Record<string, any> = { model, messages };
  if (stream !== undefined) body.stream = stream;
  if (temperature !== undefined) body.temperature = temperature;
  if (max_tokens !== undefined) body.max_tokens = max_tokens;
  if (tools) body.tools = tools;
  if (tool_choice) body.tool_choice = tool_choice;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${api_key}`,
  };

  // OpenRouter 需要额外的头部
  if (providerName === 'openrouter') {
    headers['HTTP-Referer'] = 'http://127.0.0.1:3000';
    headers['X-Title'] = 'Agent Mesh Gateway';
  }

  const url = `${base_url.replace(/\/$/, '')}/chat/completions`;

  // 熔断器检查
  if (!circuitBreakerRegistry.canRequest(providerName)) {
    throw new Error(`Circuit breaker open for ${providerName}`);
  }

  try {
    const resp = await withRetry(providerName, async () => {
      const r = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      return r;
    }, (attempt: number, status: number, delayMs: number) => {
      console.warn(`[Retry] ${providerName} attempt ${attempt} after ${status} — retrying in ${delayMs}ms`);
    });

    if (!resp.ok && isRetryable(resp.status)) {
      // Retry logic already handled in withRetry, but if we get here after max retries:
      circuitBreakerRegistry.recordFailure(providerName);
    } else if (resp.ok) {
      circuitBreakerRegistry.recordSuccess(providerName);
    } else {
      circuitBreakerRegistry.recordFailure(providerName);
    }

    return resp;
  } catch (err) {
    circuitBreakerRegistry.recordFailure(providerName);
    throw err;
  }
}

export async function callResponsesApi(
  provider: ResolvedProvider,
  body: Record<string, any>
): Promise<Response> {
  // Responses API → Chat Completions 转换
  const messages = convertResponsesInputToMessages(body.input || []);
  if (body.instructions) {
    messages.unshift({ role: 'system', content: body.instructions });
  }

  return callChatCompletions(provider, {
    model: body.model,
    messages,
    stream: body.stream,
    tools: body.tools,
  });
}

function convertResponsesInputToMessages(
  input: Array<Record<string, any>>
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];

  for (const item of input) {
    if (item.role === 'system') {
      messages.push({ role: 'system', content: extractTextContent(item.content) });
    } else if (item.role === 'user') {
      messages.push({ role: 'user', content: extractTextContent(item.content) });
    } else if (item.role === 'assistant') {
      messages.push({ role: 'assistant', content: extractTextContent(item.content) });
    } else if (item.type === 'message') {
      const role = item.role || 'user';
      messages.push({ role, content: extractTextContent(item.content) });
    }
  }

  return messages;
}

function extractTextContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p: any) => p.type === 'input_text' || p.type === 'output_text')
      .map((p: any) => p.text || '')
      .join('\n');
  }
  return String(content || '');
}

export function buildStreamingResponse(upstreamResp: Response): Response {
  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
