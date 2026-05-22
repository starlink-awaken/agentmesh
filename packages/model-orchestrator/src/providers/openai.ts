import type { ModelDescriptor } from '@agentmesh/core-types';
import type { ModelProvider } from './base.js';
import { httpPost, checkedJson, healthCheck, parseOpenAIResponse } from './base.js';
import type { ChatOptions, ChatResult, StreamChunk } from '../types.js';

export class OpenAIProvider implements ModelProvider {
  readonly name = 'openai';
  readonly type = 'openai';
  private baseUrl: string;
  private authHeader: string;

  constructor(apiKey: string, baseUrl = 'https://api.openai.com/v1') {
    this.baseUrl = baseUrl;
    this.authHeader = `Bearer ${apiKey}`;
  }

  async discover(): Promise<ModelDescriptor[]> {
    const url = `${this.baseUrl}/models`;
    if (!(await healthCheck(url, { Authorization: this.authHeader }, 5000))) return [];
    const body = await (await fetch(url, { headers: { Authorization: this.authHeader } })).json() as { data: { id: string; owned_by: string }[] };
    return body.data.map(m => ({
      id: `openai/${m.id}`,
      name: m.id,
      provider: 'openai' as const,
      location: 'cloud' as const,
      capabilities: ['chat' as const, 'completion' as const, 'streaming' as const],
      contextWindow: m.id.includes('gpt-4') ? 128000 : 32000,
      isAvailable: true,
      costPer1KTokens: this.costFor(m.id),
      metadata: { ownedBy: m.owned_by },
    }));
  }

  async health(): Promise<boolean> {
    return healthCheck(`${this.baseUrl}/models`, { Authorization: this.authHeader }, 5000);
  }

  async chat(model: string, messages: unknown[], options?: ChatOptions): Promise<ChatResult> {
    const res = await httpPost(
      `${this.baseUrl}/chat/completions`,
      { model: model.replace('openai/', ''), messages, temperature: options?.temperature, max_tokens: options?.maxTokens },
      this.authHeader,
    );
    const body = await checkedJson<any>(res, 'OpenAI chat');
    return parseOpenAIResponse(body, model);
  }

  async *stream(model: string, messages: unknown[], options?: ChatOptions): AsyncIterable<StreamChunk> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: this.authHeader },
      body: JSON.stringify({ model: model.replace('openai/', ''), messages, stream: true, temperature: options?.temperature }),
      signal: options?.signal,
    });
    if (!res.ok) throw new Error(`OpenAI stream failed: ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') { yield { id: '', model, content: '', finishReason: 'stop' }; return; }
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content || '';
          yield { id: json.id || '', model: json.model || model, content, finishReason: json.choices?.[0]?.finish_reason || null };
        } catch { /* skip malformed chunks */ }
      }
    }
  }

  private costFor(modelId: string): { input: number; output: number } {
    if (modelId.includes('gpt-4o')) return { input: 0.0025, output: 0.01 };
    if (modelId.includes('gpt-4')) return { input: 0.03, output: 0.06 };
    if (modelId.includes('gpt-3.5')) return { input: 0.0005, output: 0.0015 };
    return { input: 0, output: 0 };
  }
}
