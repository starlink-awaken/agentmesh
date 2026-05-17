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

  const url = `${base_url.replace(/\/$/, '')}/chat/completions`;

  if (!circuitBreakerRegistry.canRequest(providerName)) {
    throw new Error(`Circuit breaker open for ${providerName}`);
  }

  try {
    const resp = await withRetry(providerName, async () => {
      const r = await fetch(url, {
        method: 'POST', headers, body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      return r;
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

export async function callResponsesApi(
  provider: ResolvedProvider,
  body: Record<string, any>
): Promise<Response> {
  const messages = convertInputToMessages(body.input || []);
  if (body.instructions) {
    messages.unshift({ role: 'system', content: body.instructions });
  }

  // 转换 tools 定义（Codex 的 tool schema → OpenAI format）
  const tools = convertToolSchemas(body.tools);

  const chatResp = await callChatCompletions(provider, {
    model: body.model,
    messages,
    stream: body.stream,
    tools,
    tool_choice: body.tool_choice,
  });

  // 非流式：直接转换响应
  if (!body.stream) {
    const ccData = (await chatResp.json()) as Record<string, any>;
    return new Response(JSON.stringify(convertChatToResponses(ccData)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 流式：解析 SSE → 转换 → 重新打包 SSE
  const transformed = transformSSEStream(chatResp.body!);
  return new Response(transformed, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}

function convertInputToMessages(
  input: Array<Record<string, any>>
): Array<{ role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string }> {
  const messages: Array<any> = [];

  for (const item of input) {
    switch (item.type || item.role) {
      // 标准消息类型
      case 'message':
        messages.push({ role: item.role || 'user', content: extractTextContent(item.content) });
        break;

      case 'function_call': {
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: item.call_id,
            type: 'function',
            function: {
              name: item.name,
              arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments),
            },
          }],
        });
        break;
      }

      case 'function_call_output':
        messages.push({
          role: 'tool',
          tool_call_id: item.call_id,
          content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output),
        });
        break;

      case 'system':
        messages.push({ role: 'system', content: extractTextContent(item.content) });
        break;
      case 'user':
        messages.push({ role: 'user', content: extractTextContent(item.content) });
        break;
      case 'assistant':
        messages.push({ role: 'assistant', content: extractTextContent(item.content) });
        break;

      default:
        if (item.role) {
          messages.push({ role: item.role, content: extractTextContent(item.content) });
        }
    }
  }

  return messages;
}

function convertChatToResponses(ccData: Record<string, any>): Record<string, any> {
  const choice = ccData.choices?.[0];
  if (!choice) {
    return { id: ccData.id, object: 'response', model: ccData.model, output: [], usage: ccData.usage };
  }

  const output: any[] = [];

  if (choice.message?.content) {
    output.push({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: choice.message.content }],
    });
  }

  if (choice.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      output.push({
        type: 'function_call',
        call_id: tc.id,
        name: tc.function?.name,
        arguments: tc.function?.arguments,
      });
    }
  }

  // finish_reason = 'tool_calls' 表示等待 tool 结果（Codex 需要此信息）
  const status = choice.finish_reason === 'tool_calls' ? 'requires_action' : 'completed';

  return {
    id: ccData.id,
    object: 'response',
    model: ccData.model,
    status,
    output,
    usage: ccData.usage,
  };
}

const EVENT_DELTA = 'response.output_text.delta';
const EVENT_TOOL_DELTA = 'response.function_call_arguments.delta';
const EVENT_COMPLETED = 'response.completed';
const sseEncoder = new TextEncoder();

function transformSSEStream(upstreamBody: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  let buffer = '';
  let responseId = '';
  let modelName = '';
  let contentBuffer = '';
  const toolCallAccum: Record<string, any> = {};

  return new ReadableStream({
    async start(controller) {
      const reader = upstreamBody.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          let newlineIdx: number;
          while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIdx);
            buffer = buffer.slice(newlineIdx + 1);

            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              const finalEvt = buildResponseEvent(responseId, modelName, contentBuffer, toolCallAccum, true);
              controller.enqueue(sseEncoder.encode(finalEvt));
              controller.enqueue(sseEncoder.encode('data: [DONE]\n\n'));
              continue;
            }

            try {
              const chunk = JSON.parse(data);
              responseId = chunk.id || responseId;
              modelName = chunk.model || modelName;
              const delta = chunk.choices?.[0]?.delta;
              if (!delta) continue;

              if (delta.content) {
                contentBuffer += delta.content;
                const evt = `data: ${JSON.stringify({
                  type: EVENT_DELTA,
                  delta: delta.content,
                })}\n\n`;
                controller.enqueue(sseEncoder.encode(evt));
              }

              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  if (!toolCallAccum[tc.index!]) {
                    toolCallAccum[tc.index!] = {
                      id: tc.id || '',
                      type: 'function',
                      function: { name: tc.function?.name || '', arguments: '' },
                    };
                  }
                  if (tc.function?.arguments) {
                    toolCallAccum[tc.index!].function.arguments += tc.function.arguments;
                  }
                  if (tc.id) toolCallAccum[tc.index!].id = tc.id;
                  if (tc.function?.name) toolCallAccum[tc.index!].function.name = tc.function.name;
                }

                // 发送 tool_call delta 事件
                const tcEvt = `data: ${JSON.stringify({
                  type: EVENT_TOOL_DELTA,
                  tool_calls: Object.values(toolCallAccum),
                })}\n\n`;
                controller.enqueue(sseEncoder.encode(tcEvt));
              }
            } catch {
              // 非 JSON 行直接透传
              controller.enqueue(sseEncoder.encode(line + '\n'));
            }
          }
        }
      } catch (err: any) {
        controller.error(err);
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}

function buildResponseEvent(
  id: string, model: string, content: string,
  toolCalls: Record<string, any>, isFinal: boolean
): string {
  const output: any[] = [];
  if (content) {
    output.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: content }] });
  }
  for (const tc of Object.values(toolCalls)) {
    output.push({
      type: 'function_call',
      call_id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    });
  }

  return `data: ${JSON.stringify({
    type: isFinal ? EVENT_COMPLETED : EVENT_DELTA,
    response: isFinal ? { id, model, object: 'response', status: 'completed', output } : undefined,
    delta: isFinal ? undefined : content,
  })}\n\n`;
}

function convertToolSchemas(tools: any[] | undefined): any[] | undefined {
  if (!tools || !Array.isArray(tools)) return undefined;
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters || t.input_schema,
    },
  }));
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
