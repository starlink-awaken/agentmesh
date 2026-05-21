import type { ChatCompletionRequest, ResolvedProvider } from './types.js';
import { circuitBreakerRegistry } from './circuit-breaker.js';
import { withRetry, isRetryable } from './retry.js';

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
  if (providerName === 'openrouter') {
    headers['HTTP-Referer'] = 'http://127.0.0.1:3000';
    headers['X-Title'] = 'Agent Mesh Gateway';
  }

  const url = `${base_url.replace(/\/+$/, '')}/chat/completions`;

  if (!circuitBreakerRegistry.canRequest(providerName)) {
    throw new Error(`Circuit breaker open for ${providerName}`);
  }

  try {
    const resp = await withRetry(providerName, async () => {
      return fetch(url, {
        method: 'POST', headers, body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    }, (attempt, status, delayMs) => {
      console.warn(`[Retry] ${providerName} attempt ${attempt} after ${status} — retrying in ${delayMs}ms`);
    });

    if (!resp.ok && isRetryable(resp.status)) {
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
